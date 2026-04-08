import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { User, UserRole, Transmission, SystemStats, AuditEntry, SystemNotification, Announcement, DepartmentWeights } from './types';
import LoginCard from './components/LoginCard';
import Dashboard from './components/Dashboard';
import Navbar from './components/Navbar';
import NotFound from './components/NotFound';
import { AuthActionsProvider } from './contexts/AuthActionsContext';
import { MobileSidenavProvider } from './contexts/MobileSidenavContext';
import { RoleSidenavRailProvider, useRoleSidenavRail } from './contexts/RoleSidenavRailContext';
import {
  DEPARTMENT_WEIGHTS_STORAGE_KEY,
  loadDepartmentWeightsFromStorage,
  saveDepartmentWeightsToStorage,
} from './utils/departmentWeightsStorage';
import { DarkModeProvider, useDarkMode } from './contexts/DarkModeContext';
import { GRADING_EDIT_SESSION_KEY } from './utils/gradingEditSession';
import {
  AUDIT_BUCKETS_STORAGE_KEY,
  dedupeBuckets,
  flattenBuckets,
  loadDepartmentBuckets,
  loadLegacyTransmissions,
  migrateLegacyTransmissionsToBuckets,
  saveDepartmentBuckets,
  upsertAudit,
  moveAudit,
  type AuditBuckets,
} from './utils/auditStore';
import { notifyDepartmentSupervisorsOnSubmission } from './utils/notificationUtils';

const VALID_DEPARTMENTS = ['technical', 'sales', 'marketing', 'accounting', 'admin', 'it'];
const deptSlug = (d: string) => (d || 'technical').toLowerCase();
const genId = (len = 8) => Math.random().toString(36).substr(2, len).toUpperCase();
const SESSION_USER_STORAGE_KEY = 'aa2000-session-user';

function DashboardGate({
  user,
  dashboardLayout,
}: {
  user: User | null;
  dashboardLayout: React.ReactNode;
}) {
  const { department: paramDept } = useParams<{ department: string }>();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  const slug = deptSlug(user.department);
  const paramLower = paramDept?.toLowerCase() ?? '';
  if (!paramLower || !VALID_DEPARTMENTS.includes(paramLower)) {
    return <NotFound />;
  }
  if (paramLower !== slug) {
    return <Navigate to={`/dashboard/${slug}`} replace />;
  }
  return <>{dashboardLayout}</>;
}

const INITIAL_REGISTRY = [
  { name: 'employee sales', password: '123', department: 'Sales', role: UserRole.EMPLOYEE, isActive: true },
  { name: 'supervisor sales', password: 'supervisor', department: 'Sales', role: UserRole.SUPERVISOR, isActive: true },
  { name: 'employee technical', password: '123', department: 'Technical', role: UserRole.EMPLOYEE, isActive: true },
  { name: 'supervisor technical', password: 'supervisor', department: 'Technical', role: UserRole.SUPERVISOR, isActive: true },
  { name: 'employee marketing', password: '123', department: 'Marketing', role: UserRole.EMPLOYEE, isActive: true },
  { name: 'supervisor marketing', password: 'supervisor', department: 'Marketing', role: UserRole.SUPERVISOR, isActive: true },
  { name: 'employee IT', password: '123', department: 'IT', role: UserRole.EMPLOYEE, isActive: true },
  { name: 'supervisor IT', password: 'supervisor', department: 'IT', role: UserRole.SUPERVISOR, isActive: true },
  { name: 'employee accounting', password: '123', department: 'Accounting', role: UserRole.EMPLOYEE, isActive: true },
  { name: 'supervisor accounting', password: 'supervisor', department: 'Accounting', role: UserRole.SUPERVISOR, isActive: true },
  { name: 'admin', password: 'admin', department: 'Admin', role: UserRole.ADMIN, isActive: true }
];

const INITIAL_ADMIN_USERS: Record<string, string[]> = {
  'Technical': ['employee technical', 'supervisor technical'],
  'IT': ['employee IT', 'supervisor IT'],
  'Sales': ['employee sales', 'supervisor sales'],
  'Marketing': ['employee marketing', 'supervisor marketing'],
  'Accounting': ['employee accounting', 'supervisor accounting'],
  'Admin': ['admin']
};


const initialPending: Transmission[] = [];
const initialHistory: Transmission[] = [];

const TRANSMISSIONS_STORAGE_KEY = 'aa2000_kpi_transmissions';
const NOTIFICATIONS_STORAGE_KEY = 'aa2000_kpi_notifications';

function loadStoredNotifications(): SystemNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredNotifications(notifications: SystemNotification[]) {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // ignore quota / private mode
  }
}

function saveStoredTransmissions(pending: Transmission[], history: Transmission[]) {
  try {
    localStorage.setItem(TRANSMISSIONS_STORAGE_KEY, JSON.stringify({ pending, history }));
  } catch {
    // ignore quota / private mode
  }
}

/** Reads rail state from context and applies dynamic left-padding to <main> on desktop. */
function RailAwareMain({ children }: { children: React.ReactNode }) {
  const { railOpen } = useRoleSidenavRail();
  return (
    <main
      className={`flex-1 flex flex-col min-h-0 w-full max-w-[1800px] mx-auto transition-[padding] duration-200 ease-out ${
        railOpen ? 'lg:pl-[272px]' : 'lg:pl-[76px]'
      }`}
    >
      {children}
    </main>
  );
}

interface AppInnerProps {
  onUserChange: (userId: string | null) => void;
}

const AppInner: React.FC<AppInnerProps> = ({ onUserChange }) => {
  const { isDark } = useDarkMode();
  const [user, setUser] = useState<User | null>(null);
  const [auditBuckets, setAuditBuckets] = useState<AuditBuckets>(() => {
    // One-time clear: wipe all pre-seeded/stored submission history on first boot after this version
    const CLEARED_FLAG = 'aa2000_kpi_history_cleared_v4';
    if (!localStorage.getItem(CLEARED_FLAG)) {
      localStorage.removeItem('aa2000_kpi_audits_by_department');
      localStorage.removeItem('aa2000_kpi_transmissions');
      localStorage.removeItem('aa2000_kpi_department_weights');
      localStorage.removeItem('aa2000_kpi_department_weights_standard');
      localStorage.setItem(CLEARED_FLAG, '1');
      return {};
    }
    let buckets: AuditBuckets;
    const loaded = loadDepartmentBuckets();
    const hasAnyAudit =
      loaded &&
      Object.keys(loaded).some((k) => {
        const b: any = (loaded as any)[k];
        return Array.isArray(b?.pending) && b.pending.length > 0 || Array.isArray(b?.history) && b.history.length > 0;
      });
    if (hasAnyAudit) {
      buckets = loaded;
    } else {
      const legacy = loadLegacyTransmissions();
      if (legacy && (legacy.pending.length > 0 || legacy.history.length > 0)) {
        buckets = migrateLegacyTransmissionsToBuckets({ pending: legacy.pending, history: legacy.history, registry: INITIAL_REGISTRY });
      } else {
        buckets = migrateLegacyTransmissionsToBuckets({ pending: initialPending, history: initialHistory, registry: INITIAL_REGISTRY });
      }
    }
    return dedupeBuckets(buckets);
  });
  const { pending: pendingTransmissions, history: transmissionHistory } = useMemo(() => flattenBuckets(auditBuckets), [auditBuckets]);
  const [validatedStats, setValidatedStats] = useState<Record<string, SystemStats>>({});
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>(loadStoredNotifications);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [registry, setRegistry] = useState<typeof INITIAL_REGISTRY>(INITIAL_REGISTRY);
  const [adminUsers, setAdminUsers] = useState<Record<string, string[]>>(INITIAL_ADMIN_USERS);

  const DEFAULT_DEPARTMENT_WEIGHTS: DepartmentWeights = {
    Technical: [
      { label: 'Project Execution Quality', weightPct: 40, content: [{ label: 'Zero Back-Job Rate', maxpoints: 20 }, { label: 'First-Time Fix Quality', maxpoints: 10 }, { label: 'Technical Compliance & Standards', maxpoints: 5 }, { label: 'Schedule Adherence', maxpoints: 5 }] },
      { label: 'Client Satisfaction & Turnover', weightPct: 25, content: [{ label: 'Client Satisfaction Score', maxpoints: 15 }, { label: 'Client Retention Rate', maxpoints: 10 }] },
      { label: 'Team Leadership & Accountability', weightPct: 15, content: [{ label: 'Team Coordination', maxpoints: 8 }, { label: 'Accountability & Ownership', maxpoints: 7 }] },
      { label: 'Sales Support & Lead Development', weightPct: 10, content: [{ label: 'Sales Lead Contributions', maxpoints: 5 }, { label: 'Client Referrals', maxpoints: 5 }] },
      { label: 'Administrative Excellence', weightPct: 5, content: [{ label: 'Report Accuracy & Timeliness', maxpoints: 5 }] },
      { label: 'Attendance & Discipline', weightPct: 5, content: [{ label: 'Attendance Rate', maxpoints: 3 }, { label: 'Discipline & Conduct', maxpoints: 2 }] },
    ],
    IT: [
      { label: 'SYSTEM UPTIME & RELIABILITY', weightPct: 35, content: [{ label: 'Uptime Percentage', maxpoints: 20 }, { label: 'Incident Prevention', maxpoints: 15 }] },
      { label: 'Technical Support Quality', weightPct: 25, content: [{ label: 'Ticket Resolution Rate', maxpoints: 15 }, { label: 'User Satisfaction Score', maxpoints: 10 }] },
      { label: 'Security & Compliance', weightPct: 20, content: [{ label: 'Security Audit Score', maxpoints: 12 }, { label: 'Policy Compliance', maxpoints: 8 }] },
      { label: 'Project & Development Delivery', weightPct: 15, content: [{ label: 'On-time Delivery Rate', maxpoints: 10 }, { label: 'Project Quality Score', maxpoints: 5 }] },
      { label: 'Attendance & Discipline', weightPct: 5, content: [{ label: 'Attendance Rate', maxpoints: 3 }, { label: 'Discipline & Conduct', maxpoints: 2 }] },
    ],
    Sales: [
      { label: 'Revenue Score', weightPct: 40, content: [{ label: 'Revenue vs Target', maxpoints: 40 }] },
      { label: 'Accounts Score', weightPct: 20, content: [{ label: 'Accounts Closed', maxpoints: 20 }] },
      { label: 'Activities Score', weightPct: 20, content: [{ label: 'Meetings Conducted', maxpoints: 10 }, { label: 'Calls Made', maxpoints: 10 }] },
      { label: 'Quotation Mgmt', weightPct: 10, content: [{ label: 'On-time Quotations', maxpoints: 5 }, { label: 'Error-free Quotations', maxpoints: 5 }] },
      { label: 'Attendance', weightPct: 5, content: [{ label: 'Attendance Rate', maxpoints: 5 }] },
      { label: 'Additional Responsibility', weightPct: 5, content: [{ label: 'Additional Tasks Completed', maxpoints: 5 }] },
    ],
    Marketing: [
      { label: 'Campaign Execution & Quality', weightPct: 40, content: [{ label: 'Campaign Completion Rate', maxpoints: 22 }, { label: 'Creative Quality Score', maxpoints: 18 }] },
      { label: 'Lead Generation & Sales Support', weightPct: 30, content: [{ label: 'Leads Generated', maxpoints: 20 }, { label: 'Sales Enablement Score', maxpoints: 10 }] },
      { label: 'Digital & Social Media Performance', weightPct: 25, content: [{ label: 'Engagement Rate', maxpoints: 15 }, { label: 'Follower Growth', maxpoints: 10 }] },
      { label: 'Additional Responsibilities', weightPct: 3, content: [{ label: 'Additional Tasks Completed', maxpoints: 3 }] },
      { label: 'Attendance & Discipline', weightPct: 2, content: [{ label: 'Attendance Rate', maxpoints: 2 }] },
    ],
    Accounting: [
      { label: 'Accounting Excellence', weightPct: 40, content: [{ label: 'Financial Report Accuracy', maxpoints: 25 }, { label: 'Audit Compliance Score', maxpoints: 15 }] },
      { label: 'Purchasing Excellence', weightPct: 30, content: [{ label: 'Purchase Order Accuracy', maxpoints: 15 }, { label: 'Vendor Management Score', maxpoints: 15 }] },
      { label: 'Administrative Excellence', weightPct: 25, content: [{ label: 'Administrative Task Completion', maxpoints: 15 }, { label: 'Documentation Quality', maxpoints: 10 }] },
      { label: 'Additional Responsibility', weightPct: 3, content: [{ label: 'Additional Tasks Completed', maxpoints: 3 }] },
      { label: 'Attendance', weightPct: 2, content: [{ label: 'Attendance Rate', maxpoints: 2 }] },
    ],
  };
  /**
   * Detect the old auto-generated default criterion UI pattern:
   * elements = [textboxButton, basicGradingSystem with single {min:0,max:null,score:maxpoints}].
   * These should be stripped so criteria use direct manual score entry instead.
   */
  const isDefaultGeneratedElements = (elements: any[], maxpoints: number): boolean => {
    if (!Array.isArray(elements) || elements.length !== 2) return false;
    const [a, b] = elements;
    if (a?.type !== 'textboxButton') return false;
    if (b?.type !== 'basicGradingSystem') return false;
    const cps = b?.checkpoints;
    if (!Array.isArray(cps) || cps.length !== 1) return false;
    const cp = cps[0];
    return cp?.min === 0 && (cp?.max === null || cp?.max === undefined) && Number(cp?.score) === maxpoints;
  };

  /** Strip old auto-generated basicGradingSystem from stored criteria so all dashboards use direct score entry. */
  const migrateStoredWeights = (weights: DepartmentWeights): DepartmentWeights => {
    const out: DepartmentWeights = {};
    for (const dept of Object.keys(weights)) {
      out[dept] = (weights[dept] || []).map((cat) => ({
        ...cat,
        content: (cat.content || []).map((item) => {
          const elements = (item as any)?.ui?.elements;
          const maxpoints = Math.max(0, Number(item?.maxpoints) || 0);
          if (Array.isArray(elements) && isDefaultGeneratedElements(elements, maxpoints)) {
            return { ...item, ui: { ...((item as any).ui || {}), elements: [] } };
          }
          return item;
        }),
      }));
    }
    return out;
  };

  /** Merge stored weights with defaults, ensuring every dept/category has content */
  const initDepartmentWeights = (): DepartmentWeights => {
    const stored = loadDepartmentWeightsFromStorage();
    if (!stored) return DEFAULT_DEPARTMENT_WEIGHTS;
    // Migrate any stored weights that have old auto-generated basicGradingSystem elements
    const migrated = migrateStoredWeights(stored);
    // Ensure every department and category has content; fill from defaults if missing
    const merged: DepartmentWeights = { ...DEFAULT_DEPARTMENT_WEIGHTS };
    for (const dept of Object.keys(DEFAULT_DEPARTMENT_WEIGHTS)) {
      const storedDept = migrated[dept];
      if (!storedDept || storedDept.length === 0) {
        merged[dept] = DEFAULT_DEPARTMENT_WEIGHTS[dept];
      } else {
        const defaultDept = DEFAULT_DEPARTMENT_WEIGHTS[dept] ?? [];
        merged[dept] = storedDept.map((cat, idx) => {
          const hasContent = Array.isArray(cat.content) && cat.content.length > 0;
          if (hasContent) return cat;
          // Try to find matching category by label first, then by index
          const defaultCat = defaultDept.find(d => d.label === cat.label) ?? defaultDept[idx];
          return { ...cat, content: defaultCat?.content ?? cat.content };
        });
      }
    }
    return merged;
  };
  /** Single source for employee/supervisor grading UI (weights, criteria content, panel definitions). Mutated only from admin: Edit weighted scores → Commit, Load standard, or per-dept Reset (not from unsaved drafts). */
  const [departmentWeights, setDepartmentWeights] = useState<DepartmentWeights>(initDepartmentWeights);

  const navigate = useNavigate();
  const location = useLocation();

  // Restore session user on refresh/reopen.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_USER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<User> | null;
      if (!parsed || typeof parsed !== 'object') return;
      if (
        typeof parsed.id === 'string' &&
        typeof parsed.name === 'string' &&
        typeof parsed.department === 'string' &&
        typeof parsed.role === 'string'
      ) {
        setUser(parsed as User);
        onUserChange(parsed.id);
      }
    } catch {
      // ignore
    }
  }, [onUserChange]);

  // Demo audits removed — submission history starts clean for all employees.

  // Persist bucketed audit store so other tabs see updates (live sync)
  useEffect(() => {
    saveDepartmentBuckets(auditBuckets);
    // Backward-compat during transition: keep legacy key updated for any code path still listening to it.
    saveStoredTransmissions(pendingTransmissions, transmissionHistory);
  }, [auditBuckets, pendingTransmissions, transmissionHistory]);

  // Persist grading program (department weights) so admin edits are reflected everywhere after reload
  useEffect(() => {
    saveDepartmentWeightsToStorage(departmentWeights);
  }, [departmentWeights]);

  // Persist notifications so they survive page refresh and cross tabs/sessions
  useEffect(() => {
    saveStoredNotifications(notifications);
  }, [notifications]);

  // Listen for updates from other tabs (employee submit / supervisor validate in another tab)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUDIT_BUCKETS_STORAGE_KEY && e.newValue != null) {
        try {
          const parsed = JSON.parse(e.newValue) as AuditBuckets;
          if (parsed && typeof parsed === 'object') setAuditBuckets(parsed);
        } catch {
          // ignore
        }
      }
      if (e.key === TRANSMISSIONS_STORAGE_KEY && e.newValue != null) {
        try {
          const parsed = JSON.parse(e.newValue) as { pending: Transmission[]; history: Transmission[] };
          if (Array.isArray(parsed?.pending) && Array.isArray(parsed?.history)) {
            setAuditBuckets(migrateLegacyTransmissionsToBuckets({ pending: parsed.pending, history: parsed.history, registry: INITIAL_REGISTRY }));
          }
        } catch {
          // ignore
        }
      }
      if (e.key === DEPARTMENT_WEIGHTS_STORAGE_KEY && e.newValue != null) {
        try {
          const parsed = JSON.parse(e.newValue) as DepartmentWeights;
          if (parsed && typeof parsed === 'object') setDepartmentWeights(parsed);
        } catch {
          // ignore
        }
      }
      if (e.key === NOTIFICATIONS_STORAGE_KEY && e.newValue != null) {
        try {
          const parsed = JSON.parse(e.newValue) as SystemNotification[];
          if (Array.isArray(parsed)) setNotifications(parsed);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addNotification = useCallback((message: string, targetUserId: string, type: 'INFO' | 'SUCCESS' | 'ALERT' = 'INFO') => {
    setNotifications((prev) => [
      { id: genId(9), targetUserId, message, timestamp: new Date().toISOString(), type },
      ...prev
    ].slice(0, 100));
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addAuditEntry = useCallback((action: string, details: string, type: 'INFO' | 'OK' | 'WARN' = 'INFO', userName?: string) => {
    setAuditLogs((prev) => [
      { id: genId(), timestamp: new Date().toISOString(), user: userName || user?.name || 'SYSTEM', action, details, type },
      ...prev
    ].slice(0, 500));
  }, [user]);

  const handleLogin = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
    onUserChange(loggedInUser.id);
    try {
      localStorage.setItem(SESSION_USER_STORAGE_KEY, JSON.stringify(loggedInUser));
    } catch {
      // ignore
    }
    addNotification(`Welcome, ${loggedInUser.name}.`, loggedInUser.id, 'SUCCESS');
    addAuditEntry('SESSION_INIT', `Role: ${loggedInUser.role}`, 'OK', loggedInUser.name);
    const returnPath = (location.state as { from?: string } | null)?.from || '/dashboard';
    navigate(returnPath, { replace: true });
  }, [onUserChange, addNotification, addAuditEntry, navigate, location.state]);

  const handleLogout = useCallback(() => {
    addAuditEntry('SESSION_TERM', 'Disconnected', 'INFO');
    setUser(null);
    onUserChange(null);
    try {
      localStorage.removeItem(SESSION_USER_STORAGE_KEY);
    } catch {
      // ignore
    }
    navigate('/login');
  }, [onUserChange, addAuditEntry, navigate]);

  const handleTransmit = useCallback((transmission: Transmission) => {
    if (!user) return;
    const dept = (transmission.department || user.department || 'Unknown').trim() || 'Unknown';
    const withDept: Transmission = { ...transmission, department: dept };
    setAuditBuckets((prev) => {
      const next: AuditBuckets = { ...prev };
      const b = next[dept] ?? { pending: [], history: [] };
      next[dept] = { pending: [...(b.pending || [])], history: [...(b.history || [])] };
      upsertAudit(next, dept, 'pending', withDept);
      return next;
    });

    // Notify only supervisors of the same department
    const deptNotifications = notifyDepartmentSupervisorsOnSubmission(
      withDept,
      dept,
      registry,
      user.id
    );
    setNotifications(prev => [...deptNotifications, ...prev].slice(0, 100));

    // Notify the submitting employee that their submission was received
    addNotification(
      `Your submission ${withDept.id} has been received and is pending supervisor review.`,
      user.id,
      'INFO'
    );

    addAuditEntry('DATA_TRANSMIT', `${transmission.id} queued`, 'INFO', transmission.userName);
  }, [user, registry, addAuditEntry, addNotification, setNotifications]);

  /**
   * Two-step grading flow:
   * - Supervisor grades but does NOT finalize (`status` stays pending).
   * - Admin later finalizes by setting `status` to validated/rejected (which moves pending → history).
   */
  const handleSupervisorGrade = useCallback(
    (
      transmissionId: string,
      overrides?: any,
      supervisorRecommendation: 'approved' | 'rejected' = 'approved'
    ) => {
      const transmission = pendingTransmissions.find((t) => t.id === transmissionId);
      if (!transmission || !user) return;

      const statsToUse = overrides ?? {
        responseTime: transmission.responseTime,
        accuracy: transmission.accuracy,
        uptime: transmission.uptime,
      };

      const dept = (transmission.department || user.department || 'Unknown').trim() || 'Unknown';
      const finalTransmission: Transmission = {
        ...transmission,
        ...statsToUse,
        supervisorRecommendation,
        department: dept,
      };

      setAuditBuckets((prev) => {
        const next: AuditBuckets = { ...prev };
        const b = next[dept] ?? { pending: [], history: [] };
        next[dept] = { pending: [...(b.pending || [])], history: [...(b.history || [])] };
        upsertAudit(next, dept, 'pending', finalTransmission);
        return next;
      });

      // Notify the employee their submission has been reviewed
      const employeeId = btoa(transmission.userName);
      const recLabel = supervisorRecommendation === 'approved' ? 'Approved' : 'Changes Requested';
      addNotification(`Your submission ${transmissionId} has been reviewed by your supervisor (${recLabel}). Awaiting admin finalization.`, employeeId, 'INFO');

      // Notify admin that there is a pending report ready for their approval
      const admins = adminUsers['Admin'] || [];
      admins.forEach((adminName: string) => {
        const adminId = btoa(adminName);
        addNotification(
          `You have a pending report to approve. ${transmission.userName} (${dept}) — submission ${transmissionId} has been graded by supervisor (${recLabel}) and is awaiting your final approval.`,
          adminId,
          'ALERT'
        );
      });
    },
    [pendingTransmissions, user, adminUsers, addNotification]
  );

  const handleValidate = useCallback((transmissionId: string, overrides?: SystemStats, status: 'validated' | 'rejected' = 'validated') => {
    const transmission = pendingTransmissions.find((t) => t.id === transmissionId);
    if (transmission && user) {
      const statsToUse = overrides ?? {
        responseTime: transmission.responseTime,
        accuracy: transmission.accuracy,
        uptime: transmission.uptime,
      };
      const dept = (transmission.department || user.department || 'Unknown').trim() || 'Unknown';
      const finalTransmission: Transmission = { ...transmission, ...statsToUse, status, department: dept };
      setAuditBuckets((prev) => {
        const next: AuditBuckets = { ...prev };
        const b = next[dept] ?? { pending: [], history: [] };
        next[dept] = { pending: [...(b.pending || [])], history: [...(b.history || [])] };
        moveAudit(next, dept, 'pending', 'history', finalTransmission);
        // Cap history size per dept to keep localStorage small and UI fast
        next[dept].history = next[dept].history.slice(0, 500);
        return next;
      });
      const employeeId = btoa(transmission.userName);
      if (status === 'validated') {
        setValidatedStats((prev) => ({ ...prev, [transmission.userId]: finalTransmission }));
        addAuditEntry('VERIFY_SUCCESS', `Validated ${transmissionId}`, 'OK');
        addNotification(`Your submission ${transmissionId} has been finalized — Approved! Check your dashboard for your score.`, employeeId, 'SUCCESS');
      } else {
        addAuditEntry('VERIFY_REJECT', `Rejected ${transmissionId}`, 'WARN');
        addNotification(`Your submission ${transmissionId} has been finalized — Needs Changes. See supervisor comments for details.`, employeeId, 'ALERT');
      }
    }
  }, [pendingTransmissions, user, addAuditEntry, addNotification]);

  const handleDeleteSubmission = useCallback((transmission: Transmission) => {
    if (!user) return;
    const dept = transmission.department || user.department || 'Unknown';
    setAuditBuckets((prev) => {
      const next = { ...prev };
      const b = next[dept] ?? { pending: [], history: [] };
      next[dept] = {
        pending: (b.pending || []).filter((t: Transmission) => t.id !== transmission.id),
        history: (b.history || []).filter((t: Transmission) => t.id !== transmission.id),
      };
      return next;
    });
    addAuditEntry('DATA_DELETE', `Submission ${transmission.id} deleted by ${user.name}`, 'WARN', user.name);

    // Notify supervisor(s) of this department
    const deptSupervisors = registry.filter((u: any) => u.department === dept && u.role === UserRole.SUPERVISOR && u.isActive);
    deptSupervisors.forEach((sup: any) => {
      const supId = btoa(sup.name);
      addNotification(`${user.name} deleted submission ${transmission.id}.`, supId, 'ALERT');
    });
    // Notify admin
    const admins = adminUsers['Admin'] || [];
    admins.forEach((adminName: string) => {
      const adminId = btoa(adminName);
      addNotification(`${user.name} (${dept}) deleted submission ${transmission.id}.`, adminId, 'ALERT');
    });
  }, [user, registry, adminUsers, addAuditEntry, addNotification]);

  const handleClearMyLogs = useCallback(() => {
    if (!user) return;
    const dept = user.department || 'Unknown';
    setAuditBuckets((prev) => {
      const next = { ...prev };
      const b = next[dept] ?? { pending: [], history: [] };
      next[dept] = {
        pending: (b.pending || []).filter((t: Transmission) => t.userId !== user.id),
        history: (b.history || []).filter((t: Transmission) => t.userId !== user.id),
      };
      return next;
    });
    addAuditEntry('DATA_DELETE', `All submissions cleared by ${user.name}`, 'WARN', user.name);
  }, [user, addAuditEntry]);

  const handleEditSubmission = useCallback((transmission: Transmission) => {
    if (!user) return;
    const dept = transmission.department || user.department || 'Unknown';
    addAuditEntry('DATA_EDIT', `Submission ${transmission.id} edited by ${user.name}`, 'INFO', user.name);

    // Notify supervisor(s)
    const deptSupervisors = registry.filter((u: any) => u.department === dept && u.role === UserRole.SUPERVISOR && u.isActive);
    deptSupervisors.forEach((sup: any) => {
      const supId = btoa(sup.name);
      addNotification(`${user.name} edited submission ${transmission.id}.`, supId, 'INFO');
    });
    // Notify admin
    const admins = adminUsers['Admin'] || [];
    admins.forEach((adminName: string) => {
      const adminId = btoa(adminName);
      addNotification(`${user.name} (${dept}) edited submission ${transmission.id}.`, adminId, 'INFO');
    });
  }, [user, registry, adminUsers, addAuditEntry, addNotification]);

  const handlePostAnnouncement = useCallback((message: string) => {
    if (!user?.department) return;
    setAnnouncements((prev) => [
      { id: genId(9), department: user.department, senderName: user.name, message, timestamp: new Date().toISOString() },
      ...prev
    ].slice(0, 50));
    addAuditEntry('DEPT_BROADCAST', `Post to ${user.department}`, 'OK');
  }, [user, addAuditEntry]);

  const handleDeleteAnnouncement = useCallback((id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    addAuditEntry('DEPT_BROADCAST_RM', 'Broadcast removed', 'INFO');
  }, [addAuditEntry]);

  const handleDeleteUser = useCallback((userId: string, userName: string) => {
    setRegistry((prev) => prev.filter((u: { name: string }) => u.name !== userName));
    setAdminUsers((prev) => {
      const updated: Record<string, string[]> = {};
      Object.keys(prev).forEach((dept) => {
        updated[dept] = prev[dept].filter((u: string) => u !== userName);
      });
      return updated;
    });
    addAuditEntry('ADMIN_DECOMMISSION', `Removed ${userName}`, 'WARN');
  }, [addAuditEntry]);

  const handleUpdateRegistry = useCallback((newRegistry: typeof INITIAL_REGISTRY) => {
    setRegistry(newRegistry);
  }, []);

  const handleUpdateAdminUsers = useCallback((newAdminUsers: Record<string, string[]>) => {
    setAdminUsers(newAdminUsers);
  }, []);

  const handleClearLocalCache = useCallback(() => {
    // Clears cached runtime data but keeps built-in accounts and seeded audits.
    // - Accounts live in memory (INITIAL_REGISTRY) and are not stored in localStorage.
    // - Seed audits are restored from initialPending/initialHistory.
    try {
      localStorage.removeItem(AUDIT_BUCKETS_STORAGE_KEY);
      localStorage.removeItem(TRANSMISSIONS_STORAGE_KEY);
      localStorage.removeItem(DEPARTMENT_WEIGHTS_STORAGE_KEY);
      localStorage.removeItem(GRADING_EDIT_SESSION_KEY);
      localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
      // Per-user UI prefs
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('aa2000-kpi-ack-')) localStorage.removeItem(k);
        if (k.startsWith('ledger-fab-position-')) localStorage.removeItem(k);
      });
    } catch {
      // ignore (private mode / quota)
    }

    setAuditBuckets(migrateLegacyTransmissionsToBuckets({ pending: initialPending, history: initialHistory, registry: INITIAL_REGISTRY }));
    setDepartmentWeights(DEFAULT_DEPARTMENT_WEIGHTS);
  }, []);

  const handleClearEmployeeAudits = useCallback(() => {
    const roleByName = new Map<string, UserRole>();
    const idByName = new Map<string, string>();
    try {
      registry.forEach((u: any) => {
        roleByName.set(String(u.name), u.role as UserRole);
        if (u && u.name != null && u.id != null) idByName.set(String(u.name), String(u.id));
      });
    } catch {
      // ignore
    }

    const isEmployee = (t: Transmission) => roleByName.get(t.userName) === UserRole.EMPLOYEE;

    setAuditBuckets((prev) => {
      const next: AuditBuckets = {};
      Object.keys(prev).forEach((dept) => {
        const b = prev[dept];
        next[dept] = {
          pending: (b?.pending || []).filter((t) => !isEmployee(t)),
          history: (b?.history || []).filter((t) => !isEmployee(t)),
        };
      });
      return next;
    });

    // Also clear cached validated stats for employees (since their audits are being purged)
    setValidatedStats((prev) => {
      const next = { ...prev };
      registry.forEach((u: any) => {
        if (u?.role === UserRole.EMPLOYEE) {
          const uid = u.id ?? idByName.get(String(u.name));
          if (uid != null) delete (next as any)[uid];
        }
      });
      return next;
    });
  }, [registry]);

  const loggedInHomePath = user
    ? `/dashboard/${deptSlug(user.department)}`
    : '/login';

  const dashboardLayout =
    user == null
      ? null
      : (
          <div
            className={
              user.role === UserRole.ADMIN
                ? 'h-screen w-full relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 flex flex-col'
                : 'h-screen w-full bg-slate-50 dark:bg-slate-900 flex flex-col'
            }
          >
            {user.role === UserRole.ADMIN && (
              <>
                <div className="pointer-events-none absolute -top-24 -right-24 -z-10 h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" aria-hidden />
                <div className="pointer-events-none absolute -bottom-28 -left-28 -z-10 h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-3xl" aria-hidden />
                <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -z-10 h-40 w-[32rem] rounded-full bg-indigo-500/5 blur-3xl" aria-hidden />
              </>
            )}
            <div className="relative z-10 flex flex-col flex-1 min-h-0">
              <AuthActionsProvider value={{ logout: handleLogout }}>
                <RoleSidenavRailProvider>
                <MobileSidenavProvider>
                  <Navbar
                    user={user}
                    onClearLocalCache={handleClearLocalCache}
                    validatedStats={validatedStats[user.id]}
                    registry={registry}
                    onUpdateRegistry={handleUpdateRegistry}
                    notifications={notifications.filter(n => n.targetUserId === user.id)}
                    onDeleteNotification={deleteNotification}
                  />
                  <RailAwareMain>
                    <div className="px-4 sm:px-5 md:px-6 py-4 md:py-6 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
                      <Dashboard
                        user={user}
                        pendingTransmissions={pendingTransmissions}
                        transmissionHistory={transmissionHistory}
                        auditBuckets={auditBuckets}
                        validatedStats={validatedStats}
                        auditLogs={auditLogs}
                        announcements={announcements}
                        registry={registry}
                        adminUsers={adminUsers}
                        departmentWeights={departmentWeights}
                        onUpdateDepartmentWeights={setDepartmentWeights}
                        onTransmit={handleTransmit}
                        onDeleteSubmission={handleDeleteSubmission}
                        onEditSubmission={handleEditSubmission}
                        onClearMyLogs={handleClearMyLogs}
                        onValidate={handleValidate}
                        onSupervisorGrade={handleSupervisorGrade}
                        onPostAnnouncement={handlePostAnnouncement}
                        onDeleteAnnouncement={handleDeleteAnnouncement}
                        onAddAuditEntry={addAuditEntry}
                        onDeleteUser={handleDeleteUser}
                        onUpdateRegistry={handleUpdateRegistry}
                        onUpdateAdminUsers={handleUpdateAdminUsers}
                        onClearEmployeeAudits={handleClearEmployeeAudits}
                        notifications={notifications.filter(n => n.targetUserId === user.id)}
                        onDeleteNotification={deleteNotification}
                      />
                    </div>
                  </RailAwareMain>
                </MobileSidenavProvider>
                </RoleSidenavRailProvider>
              </AuthActionsProvider>
            </div>
          </div>
        );

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={loggedInHomePath} replace />
          ) : (
            <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 flex items-center justify-center p-4">
              <div className="pointer-events-none absolute -top-24 -right-24 h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute -bottom-28 -left-28 h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 h-40 w-[32rem] rounded-full bg-indigo-500/5 blur-3xl" aria-hidden />
              <LoginCard onLogin={handleLogin} onAddAuditEntry={addAuditEntry} registry={registry} />
            </div>
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          user ? (
            <Navigate to={loggedInHomePath} replace />
          ) : (
            <Navigate to="/login" state={{ from: '/dashboard' }} replace />
          )
        }
      />
      <Route
        path="/dashboard/:department"
        element={<DashboardGate user={user} dashboardLayout={dashboardLayout} />}
      />
      <Route
        path="/"
        element={
          user ? (
            <Navigate to={loggedInHomePath} replace />
          ) : (
            <Navigate to="/login" state={{ from: location.pathname === '/' ? '/dashboard' : location.pathname }} replace />
          )
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App: React.FC = () => {
  // Read userId from session storage so DarkModeProvider can scope the key per user,
  // even before AppInner mounts and sets up the user state.
  const [userId, setUserId] = React.useState<string | null>(() => {
    try {
      const raw = localStorage.getItem('aa2000-session-user');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.id ?? null;
      }
    } catch {}
    return null;
  });

  return (
    <DarkModeProvider userId={userId}>
      <AppInner onUserChange={setUserId} />
    </DarkModeProvider>
  );
};

export default App;
