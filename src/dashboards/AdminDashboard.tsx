
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User, AuditEntry, UserRole, Transmission, DepartmentWeights, CategoryWeightItem, CategoryContentItem, SystemStats } from '../types';
import JSZip from 'jszip';
import { createLogDetailPdfBlob, getLogDetailPdfFilename } from '../utils/logDetailToPdf';
import { getAppLogoDataUrl } from '../utils/pdfCommon';
import { buildLogDetailCategoryScores } from '../utils/buildLogDetailCategoryScores';
import { downloadIsoAuditTrailPdf } from '../utils/isoAuditTrailToPdf';
import {
  type IncentiveTier,
  DEFAULT_INCENTIVE_TIERS,
  getIncentiveTiersFromStorage,
  saveIncentiveTiersToStorage,
  INCENTIVE_Tiers_UPDATED_EVENT,
  INCENTIVE_TIERS_STORAGE_KEY,
} from '../utils/incentiveTiers';
import {
  saveDepartmentWeightsStandard,
  loadDepartmentWeightsStandard,
  hasDepartmentWeightsStandardSnapshot,
  DEPARTMENT_WEIGHTS_STANDARD_STORAGE_KEY,
  DEPARTMENT_WEIGHTS_STANDARD_UPDATED_EVENT,
} from '../utils/departmentWeightsStandard';
import {
  getGradeForScore,
  getGradeColorClasses,
} from '../utils/gradingSystem';
import { clearGradingEditSession } from '../utils/gradingEditSession';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import {
  APP_NAV_RAIL_PL_COLLAPSED,
  APP_NAV_RAIL_PL_EXPANDED,
  APP_NAV_SIDENAV_HEIGHT,
  APP_NAV_SIDENAV_TOP,
} from '../constants/navbarLayout';

import {
  Settings,
  Terminal,
  Download,
  CheckCircle2,
  Users,
  X,
  UserPlus,
  ChevronDown,
  Save,
  Scale,
  RotateCcw,
  ShieldCheck,
  Share2,
  ToggleLeft,
  ToggleRight,
  Search,
  Cpu,
  FilterX,
  Filter,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Fingerprint,
  Key,
  UserMinus,
  Edit2,
  Wrench,
  Handshake,
  Users2,
  FileStack,
  FileText,
  ClipboardCheck,
  Trophy,
  Medal,
  CalendarCheck,
  Calculator,
  Activity,
  DollarSign,
  Target,
  Trash2,
  Database,
  Menu,
  ChevronRight,
  ChevronLeft,
  LogOut,
  PhoneCall,
  ListChecks
} from 'lucide-react';
import { useAuthActions } from '../contexts/AuthActionsContext';
import { useMobileSidenav } from '../contexts/MobileSidenavContext';
import { useRoleSidenavRail } from '../contexts/RoleSidenavRailContext';
import { ValidationTabs } from '../components/forms/ValidationTabs';
import { GradingWeightControl } from '../components/forms/GradingWeightControl';
import { AnnualSummaryPanel } from '../components/panels/AnnualSummaryPanel';
import { TechnicalLogDetailAuditReview } from '../components/panels/TechnicalLogDetailAuditReview';
import AttachmentLivePreviewPanel from '../components/panels/AttachmentLivePreviewPanel';
import { getEmployeeCategoryIcon } from '../utils/employeeCategoryIcons';
import { GradingExpiredBadge } from '../components/status/GradingExpiredBadge';
import { isPendingGradingConfigExpired } from '../utils/gradingConfigSignature';
import {
  computeIncentivePctFromFinal,
  getSortedIncentiveTiersDesc,
  getIncentiveTierForScore,
  formatIncentiveTierPayoutDisplay,
  getSupervisorTierRowStyle,
} from '../utils/incentiveTiers';
import {
  getTechnicalWeightedKpiSum,
  getDepartmentCategoryRawScoresForSupervisor,
} from '../utils/technicalWeightedKpi';
import { hydrateAttachmentData, type HydratableAttachment } from '../utils/attachmentStore';
import {
  Shield,
  MessageSquare,
  Eye,
  Clock,
  Paperclip,
  Zap,
  MessageCircle,
  FileSearch,
  Check
} from 'lucide-react';

interface Props {
  user: User;
  auditLogs: AuditEntry[];
  registry: any[];
  adminUsers: Record<string, string[]>;
  pendingTransmissions: Transmission[];
  transmissionHistory: Transmission[];
  departmentWeights: DepartmentWeights;
  onUpdateDepartmentWeights: (weights: DepartmentWeights) => void;
  onAddAuditEntry: (action: string, details: string, type?: 'INFO' | 'OK' | 'WARN', userName?: string) => void;
  onDeleteUser: (userId: string, userName: string) => void;
  onUpdateRegistry: (newRegistry: any[]) => void;
  onUpdateAdminUsers: (newAdminUsers: Record<string, string[]>) => void;
  onClearEmployeeAudits: () => void;
  onValidate: (id: string, overrides?: SystemStats, status?: 'validated' | 'rejected') => void;
}

const INITIAL_DEPARTMENTS = ['Technical', 'IT', 'Sales', 'Marketing', 'Accounting', 'Admin'];

const DEPARTMENT_CHECKLIST_CONTENT: Record<string, Record<string, string[]>> = {
  Technical: {
    'Project Execution Quality': [
      'Zero Back-Job Rate (25 points)',
      'First-Time Fix Quality (12 points)',
      'Technical Compliance & Standards (7 points)',
      'Schedule Adherence (6 points)'
    ],
    'Client Satisfaction & Turnover': [
      'Client Satisfaction Score - CSAT (15 points)',
      'Smooth Turnover Rate (5 points)',
      'Zero Client Complaints/Escalations (5 points)'
    ],
    'Team Leadership & Accountability': [
      'Team Performance Under Supervision (7 points)',
      'Safety Record - Zero Incidents (4 points) - CRITICAL',
      'Accountability & Ownership (4 points)'
    ],
    'Additional Responsibilities': [
      'Extra assignments and coverage (3 points)',
    ],
    'Administrative Excellence': [
      'Report Submission Timeliness (1 point)',
      'Report Accuracy (1 point)'
    ],
    'Attendance & Discipline': [
      'Attendance Reliability (3 points)',
      'Punctuality & Timekeeping (1 point)',
      'Operational Preparedness (1 point)'
    ]
  },
  Accounting: {
    'Accounting Excellence': [
      'Financial reports submitted accurately and on time',
      'Accounts Receivable aging within acceptable limits',
      'Bank reconciliations completed without discrepancies',
      'Ledger entries verified for accuracy',
      'Month-end closing procedures completed on schedule',
      'Compliance with internal accounting standards',
    ],
    'Purchasing Excellence': [
      'Cost savings targets met or exceeded',
      'Vendor performance and quality evaluated',
      'Purchase Orders processed within SLA',
      'Alternative suppliers sourced for better rates',
      'Inventory levels optimized to reduce holding costs',
      'Procurement policies strictly followed',
    ],
    'Purchasing/Admin Excellence': [
      'Procurement and administrative coordination',
      'PO documentation and filing accuracy',
    ],
    'Administrative Excellence': [
      'Front-office and filing tasks completed on time',
      'Internal policy and SLA adherence',
    ],
    'Additional Responsibilities': [],
    'Attendance & Discipline': [],
  },
  Sales: {},
  IT: {},
  Marketing: {},
};

const DEPARTMENT_CATEGORY_ICONS: Record<string, any> = {
  'Project Execution Quality': Wrench,
  'Client Satisfaction & Turnover': Handshake,
  'Team Leadership & Accountability': Users2,
  'Additional Responsibilities': TrendingUp,
  'Administrative Excellence': FileStack,
  'Attendance & Discipline': ShieldCheck,
  'Accounting Excellence': Calculator,
  'Purchasing Excellence': DollarSign,
  'Purchasing/Admin Excellence': FileSearch,
  'Revenue Score': DollarSign,
  'Revenue Achievement': DollarSign,
  'End-User Accounts Closed': UserPlus,
  'Accounts Score': UserPlus,
  'Sales Activities': PhoneCall,
  'Activities Score': PhoneCall,
  'Quotation Management': ListChecks,
  'Quotation Mgmt': ListChecks,
};

const SALES_LABEL_TO_KEY: Record<string, string> = {
  'Revenue Score': 'revenueScore',
  'Revenue Achievement': 'revenueScore',
  'End-User Accounts Closed': 'accountsScore',
  'Accounts Score': 'accountsScore',
  'Sales Activities': 'activitiesScore',
  'Activities Score': 'activitiesScore',
  'Quotation Mgmt': 'quotationScore',
  'Quotation Management': 'quotationScore',
  'Attendance & Discipline': 'attendanceScore',
  'Additional Responsibilities': 'additionalRespScore',
  'Administrative Excellence': 'administrativeExcellenceScore',
  'Attendance': 'attendanceScore',
  'Additional Responsibility': 'additionalRespScore',
};
const DEFAULT_NODE_PASSKEY = "123";
const ADMIN_PROVISION_KEY = "123";

function withDefaultCriterionUi(item: CategoryContentItem): CategoryContentItem {
  const label = String(item?.label ?? 'Criterion');
  const maxpoints = Math.max(0, Number(item?.maxpoints) || 0);
  const hasElements =
    Array.isArray((item as any)?.ui?.elements) && ((item as any).ui.elements as unknown[]).length > 0;
  const definition = String((item as any)?.ui?.definition ?? '');
  if (hasElements) {
    return {
      ...item,
      maxpoints,
      ui: {
        ...(item.ui || {}),
        definition,
      },
    };
  }
  // No explicit grading elements: use direct manual score entry (score = typed value, capped at maxpoints).
  // Do NOT add a basicGradingSystem — that would override the typed number with a checkpoint lookup.
  return {
    ...item,
    maxpoints,
    ui: {
      definition,
      elements: [],
    },
  };
}

function normalizeDepartmentWeightsForUi(weights: DepartmentWeights): DepartmentWeights {
  const next: DepartmentWeights = {};
  for (const dept of Object.keys(weights || {})) {
    const cats = weights[dept] || [];
    next[dept] = cats.map((cat) => ({
      ...cat,
      content: (cat.content || []).map((item) => withDefaultCriterionUi(item as CategoryContentItem)),
    }));
  }
  return next;
}

type AdminTab = 'registry' | 'validation' | 'grading' | 'data' | 'performance' | 'summary';

const AdminDashboard: React.FC<Props> = ({
  user,
  auditLogs,
  registry,
  adminUsers,
  pendingTransmissions,
  transmissionHistory,
  departmentWeights,
  onUpdateDepartmentWeights,
  onAddAuditEntry,
  onDeleteUser,
  onUpdateRegistry,
  onUpdateAdminUsers,
  onClearEmployeeAudits,
  onValidate,
}) => {
  const { logout } = useAuthActions();
  const { setConfig: setMobileNavConfig } = useMobileSidenav();
  const scrollRef = useRef<HTMLDivElement>(null);
  const deptTabsRef = useRef<HTMLDivElement>(null);

  // Navigation State
  const [activeTab, setActiveTab] = useState<AdminTab>('registry');
  const [activeDept, setActiveDept] = useState<string>('Technical');
  const { railOpen, toggleRail } = useRoleSidenavRail();

  useEffect(() => {
    setMobileNavConfig({
      ariaLabel: 'Admin navigation',
      items: [
        { id: 'registry', label: 'Users & Departments', icon: Users },
        { id: 'validation', label: 'Approve Grades', icon: ShieldCheck },
        { id: 'grading', label: 'Grading System Configuration', icon: Scale },
        { id: 'performance', label: 'Performance', icon: Trophy },
        { id: 'data', label: 'Data & Backup', icon: Database },
        { id: 'summary', label: 'Year-End Summary', icon: CalendarCheck },
      ],
      activeId: activeTab,
      onSelect: (id) => setActiveTab(id as AdminTab),
      showSignOut: true,
    });

    return () => setMobileNavConfig(null);
  }, [setMobileNavConfig, activeTab]);

  // Registry Management State
  const [registrySearch, setRegistrySearch] = useState('');
  const [registryStatusFilter, setRegistryStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [validationSearch, setValidationSearch] = useState('');
  const [validationStatusTab, setValidationStatusTab] = useState<'pending' | 'validated' | 'rejected'>('pending');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionRoleOpen, setProvisionRoleOpen] = useState(false);
  const [provisionDeptOpen, setProvisionDeptOpen] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [adminAuthKey, setAdminAuthKey] = useState('');
  const [newEmployeeRole, setNewEmployeeRole] = useState<UserRole>(UserRole.EMPLOYEE);
  const [editingNode, setEditingNode] = useState<{ originalName: string, name: string, role: UserRole } | null>(null);
  const [transferringNode, setTransferringNode] = useState<string | null>(null);
  const [unenrollConfirmName, setUnenrollConfirmName] = useState<string | null>(null);
  const [registryVersion, setRegistryVersion] = useState(0);

  // Grading & Review State
  const [selectedReviewItem, setSelectedReviewItem] = useState<Transmission | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [grading, setGrading] = useState<Record<string, number>>({});
  const [overrideReason, setOverrideReason] = useState('');
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState(0);
  const [previewFile, setPreviewFile] = useState<{ name: string; type?: string; size?: string; data?: string; storageKey?: string } | null>(null);
  const initialGradingRef = useRef<Record<string, number> | null>(null);
  const justificationTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleOpenReview = useCallback((item: Transmission, readOnly: boolean = false) => {
    setSelectedReviewItem(item);
    setIsReadOnly(readOnly);

    const dept = item.department || 'Technical';
    const checklists = DEPARTMENT_CHECKLIST_CONTENT[dept] || {};
    const labels = departmentWeights[dept]?.map((c) => c.label) ?? Object.keys(checklists);

    let next: Record<string, number> = {};
    const snapshot = item.ratings?.logDetailSnapshot;

    if (snapshot?.length) {
      for (const s of snapshot) {
        if (s?.name && typeof s.score === 'number') next[s.name] = s.score;
      }
    } else {
      const raw = getDepartmentCategoryRawScoresForSupervisor(item, departmentWeights, dept as any, checklists);
      labels.forEach((label) => {
        next[label] = raw[label] ?? 0;
      });
    }

    labels.forEach((label) => {
      if (next[label] === undefined) next[label] = 0;
    });

    setGrading(next);
    initialGradingRef.current = { ...next };
    setOverrideReason(item.supervisorComment || '');
    setActiveAttachmentIndex(0);
  }, [departmentWeights]);

  const calculatedReviewScore = useMemo(() => {
    if (!selectedReviewItem) return { final: 0, gradeInfo: getGradeForScore(0), incentivePct: 0 };

    const dept = selectedReviewItem.department || 'Technical';
    const weights = departmentWeights[dept];
    let total = 0;

    if (weights?.length) {
      weights.forEach((c) => {
        const score = grading[c.label] ?? 0;
        total += score * (c.weightPct / 100);
      });
    } else {
      const labels = Object.keys(grading);
      if (labels.length > 0) {
        labels.forEach(l => total += grading[l] / labels.length);
      }
    }

    const final = Math.round(total * 100) / 100;
    const gradeInfo = getGradeForScore(final);
    const incentiveTiers = getIncentiveTiersFromStorage();
    const incentivePct = computeIncentivePctFromFinal(final, incentiveTiers);
    return { final, gradeInfo, incentivePct };
  }, [grading, selectedReviewItem, departmentWeights]);

  // Hydrate preview when index or selected item changes
  useEffect(() => {
    if (!selectedReviewItem?.attachments?.length) {
      setPreviewFile(null);
      return;
    }
    const file = selectedReviewItem.attachments[activeAttachmentIndex];
    if (file) {
      hydrateAttachmentData(file).then(setPreviewFile);
    }
  }, [selectedReviewItem, activeAttachmentIndex]);

  const handleGradingAction = useCallback((type: 'APPROVE' | 'REJECT') => {
    if (!selectedReviewItem || isReadOnly) return;

    const dept = selectedReviewItem.department || 'Technical';
    const weights = departmentWeights[dept] || [];

    const logDetailSnapshot = weights.map((c) => ({
      name: c.label,
      weightPct: c.weightPct,
      score: grading[c.label] ?? 0
    }));

    const ratings = {
      finalScore: calculatedReviewScore.final,
      incentivePct: calculatedReviewScore.incentivePct,
      logDetailSnapshot
    };

    if (type === 'REJECT') {
      onValidate(selectedReviewItem.id, { ratings, supervisorComment: overrideReason } as any, 'rejected');
    } else {
      onValidate(selectedReviewItem.id, { ratings, supervisorComment: overrideReason } as any, 'validated');
    }

    setSelectedReviewItem(null);
    onAddAuditEntry(
      type === 'APPROVE' ? 'KPI_APPROVED' : 'KPI_REJECTED',
      `Admin ${type === 'APPROVE' ? 'approved' : 'requested changes on'} submission ${selectedReviewItem.id}.`,
      type === 'APPROVE' ? 'OK' : 'WARN'
    );
  }, [selectedReviewItem, isReadOnly, grading, calculatedReviewScore, overrideReason, departmentWeights, onValidate, onAddAuditEntry]);

  // UI State
  const [isAtBottom] = useState(true);
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState({ title: '', detail: '' });
  const [backendRoles, setBackendRoles] = useState<string[]>([]);

  const resolveBackendApiBaseUrl = (): string => {
    const envObj = (import.meta as any).env || {};
    const multiApiBase = String(envObj.VITE_API_BASE_URLS || '')
      .split(',')
      .map((s: string) => s.trim())
      .find((s: string) => s.length > 0);
    const raw =
      (envObj.VITE_BACKEND_API_URL as string | undefined) ??
      (envObj.BACKEND_API_URL as string | undefined) ??
      (envObj.VITE_API_BASE_URL as string | undefined) ??
      (multiApiBase as string | undefined) ??
      '';
    return String(raw || '').trim().replace(/\/+$/, '');
  };

  const fetchBackendRoleNames = useCallback(async (baseUrl: string): Promise<string[]> => {
    const candidates = [
      `${baseUrl}/service/kpi/post/get/roles`,
      `${baseUrl}/roles/get/roles`,
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const names = Array.isArray(data)
          ? data
            .map((x: any) => String(x?.r_name ?? '').trim())
            .filter((name: string) => name.length > 0)
          : [];
        if (names.length > 0) return names;
      } catch {
        // try next candidate
      }
    }
    return [];
  }, []);

  useEffect(() => {
    const baseUrl = resolveBackendApiBaseUrl();
    if (!baseUrl) return;

    let cancelled = false;
    const loadRoles = async () => {
      const names = await fetchBackendRoleNames(baseUrl);
      if (!cancelled && names.length > 0) {
        setBackendRoles(names);
      }
      // non-blocking; save endpoint has fallback for r_ID
    };

    loadRoles();
    return () => {
      cancelled = true;
    };
  }, [fetchBackendRoleNames]);

  const syncCriteriaAdminSnapshot = async (dept: string, categories: CategoryWeightItem[]): Promise<boolean> => {
    const baseUrl = resolveBackendApiBaseUrl();
    if (!baseUrl) {
      triggerToast(
        'Saved locally only',
        'Department weights were saved locally. Set VITE_BACKEND_API_URL (or VITE_API_BASE_URL) to enable API sync.'
      );
      return false;
    }

    const latestRoles = await fetchBackendRoleNames(baseUrl);
    if (latestRoles.length > 0) {
      setBackendRoles(latestRoles);
    }
    const effectiveRoles = latestRoles.length > 0 ? latestRoles : backendRoles;

    const rates = categories.slice(0, 6).map((c) => Math.max(0, Number(c.weightPct) || 0));
    const departmentRoleFallbackMap: Record<string, string> = {
      technical: 'TECHNICAL',
      it: 'IT',
      sales: 'SALE',
      marketing: 'MARKETING',
      accounting: 'ACCOUNTING',
    };
    const preferredRoleName =
      departmentRoleFallbackMap[String(dept || '').trim().toLowerCase()] ?? String(dept || '').trim();
    const matchedRoleName =
      effectiveRoles.find((name) => name.toLowerCase() === preferredRoleName.toLowerCase()) ??
      effectiveRoles.find((name) => name.toLowerCase() === String(dept).toLowerCase()) ??
      effectiveRoles.find((name) => name.toLowerCase() === String(user.department || '').toLowerCase()) ??
      effectiveRoles.find((name) => name.toLowerCase() === String(user.role).toLowerCase());

    const payload = {
      c_ID: dept,
      // Backend expects role identifier/value for the department being saved.
      r_ID: matchedRoleName || preferredRoleName || String(user.role || user.id || user.name),
      rate_1: rates[0] ?? 0,
      rate_2: rates[1] ?? 0,
      rate_3: rates[2] ?? 0,
      rate_4: rates[3] ?? 0,
      rate_5: rates[4] ?? 0,
      rate_6: rates[5] ?? 0,
    };

    try {
      const res = await fetch(`${baseUrl}/service/kpi/post/save/criteria_admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.message) message = String(body.message);
        } catch {
          // ignore parse failure
        }
        console.warn('Criteria admin sync failed:', message);
        return false;
      }

      return true;
    } catch (err) {
      console.warn('Criteria admin sync request failed:', err);
      return false;
    }
  };

  // Log Filtering State
  const [logFilterDept, setLogFilterDept] = useState<string>('all');
  const [logFilterUser, setLogFilterUser] = useState<string>('all');
  const [logFilterSeverity, setLogFilterSeverity] = useState<string>('all');

  // Data: destructive actions
  const [dataPurgeOpen, setDataPurgeOpen] = useState(false);
  const [dataPurgePwd, setDataPurgePwd] = useState('');
  const [dataPurgeErr, setDataPurgeErr] = useState<string | null>(null);
  // Requirement: start with auto purge disabled.
  const [dataAutoPurgeEnabled, setDataAutoPurgeEnabled] = useState<boolean>(false);
  const [dataAutoPurgeConfirmOpen, setDataAutoPurgeConfirmOpen] = useState(false);
  const [dataAutoPurgeCountdown, setDataAutoPurgeCountdown] = useState<string>('—');
  const [dataAutoPurgeDue, setDataAutoPurgeDue] = useState(false);
  const [dataBackupRequired, setDataBackupRequired] = useState(false);
  const [dataBackupDone, setDataBackupDone] = useState(false);
  const [dataZipBusy, setDataZipBusy] = useState(false);
  const [dataDeleteCountdownOpen, setDataDeleteCountdownOpen] = useState(false);
  const [dataDeleteSecondsLeft, setDataDeleteSecondsLeft] = useState(10);

  const [dataDeleteHoverTooltipOpen, setDataDeleteHoverTooltipOpen] = useState(false);
  const [dataDeleteHoverTooltipRect, setDataDeleteHoverTooltipRect] = useState<{ left: number; top: number } | null>(null);
  const dataDeleteHoverButtonRef = useRef<HTMLButtonElement | null>(null);

  const computeEndOfYear = (now: Date) => new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  useEffect(() => {
    try { localStorage.setItem('aa2000_kpi_auto_purge_enabled', dataAutoPurgeEnabled ? '1' : '0'); } catch { /* ignore */ }
  }, [dataAutoPurgeEnabled]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = computeEndOfYear(now);
      const ms = end.getTime() - now.getTime();
      if (ms <= 0) {
        setDataAutoPurgeCountdown('00:00:00');
        setDataAutoPurgeDue(true);
        return;
      }
      const totalSec = Math.floor(ms / 1000);
      const days = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setDataAutoPurgeCountdown(days > 0 ? `${days}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`);
      setDataAutoPurgeDue(false);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!dataAutoPurgeEnabled) return;
    if (!dataAutoPurgeDue) return;
    const year = new Date().getFullYear();
    const lastKey = 'aa2000_kpi_auto_purge_last_year';
    const last = (() => { try { return Number(localStorage.getItem(lastKey) || '0') || 0; } catch { return 0; } })();
    if (last >= year) return;
    setDataBackupRequired(true);
    setDataBackupDone(false);
    setDataPurgeOpen(true);
    try { localStorage.setItem(lastKey, String(year)); } catch { /* ignore */ }
  }, [dataAutoPurgeEnabled, dataAutoPurgeDue]);

  const buildEmployeeAuditsZip = async () => {
    setDataZipBusy(true);
    try {
      const zip = new JSZip();
      const roleByName = new Map<string, UserRole>();
      const deptByName = new Map<string, string>();
      registry.forEach((u: any) => {
        roleByName.set(String(u.name), u.role as UserRole);
        deptByName.set(String(u.name), String(u.department || 'Unknown'));
      });
      const logoDataUrl = await getAppLogoDataUrl().catch(() => undefined);

      const isEmployeeTx = (t: Transmission) => roleByName.get(t.userName) === UserRole.EMPLOYEE;
      const statusFolder = (t: Transmission) => (t.status === 'rejected' ? 'rejected' : 'validated');
      const titleForDept = (dept: string) => {
        if (dept === 'Sales') return 'Sales Log Review';
        if (dept === 'Technical') return 'Technical Log Detail';
        if (dept === 'Marketing') return 'Marketing Log Detail';
        if (dept === 'Accounting') return 'Accounting Log Detail';
        return `${dept} Log Detail`;
      };

      const addTx = async (t: Transmission) => {
        const dept = deptByName.get(t.userName) || 'Unknown';
        const status = statusFolder(t);
        const safeUser = String(t.userName || 'employee').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const safeId = String(t.id || 'TX').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const filename = getLogDetailPdfFilename(t, dept) || `${safeUser}_${safeId}.pdf`;
        const folderPath = `${dept}/${status}`;

        const categoryScores = buildLogDetailCategoryScores(t, dept, departmentWeights);

        const pdfBlob = createLogDetailPdfBlob(t, {
          title: titleForDept(dept),
          filename,
          logoDataUrl,
          categoryScores,
          finalScore: t.status === 'validated' && t.ratings?.finalScore != null ? t.ratings.finalScore : undefined,
        });

        zip.folder(folderPath)?.file(filename, pdfBlob);
      };

      // Export employee log history (validated + rejected), matching employee dashboards’ History view.
      for (const t of transmissionHistory.filter(isEmployeeTx)) {
        await addTx(t);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const y = new Date().getFullYear();
      a.href = url;
      a.download = `aa2000_employee_audits_${y}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDataBackupDone(true);
      triggerToast('Backup prepared', 'Employee audits exported as ZIP.');
    } catch (e) {
      console.error(e);
      triggerToast('Export failed', 'Could not generate the ZIP backup.');
      setDataBackupDone(false);
    } finally {
      setDataZipBusy(false);
    }
  };

  const buildDepartmentAuditsZip = async (department: string) => {
    if (!department) return;
    setDataZipBusy(true);
    try {
      const zip = new JSZip();
      const roleByName = new Map<string, UserRole>();
      const deptByName = new Map<string, string>();

      registry.forEach((u: any) => {
        roleByName.set(String(u.name), u.role as UserRole);
        deptByName.set(String(u.name), String(u.department || 'Unknown'));
      });

      const isEmployeeTx = (t: Transmission) => roleByName.get(t.userName) === UserRole.EMPLOYEE;
      const statusFolder = (t: Transmission) => (t.status === 'rejected' ? 'rejected' : 'validated');
      const titleForDept = (dept: string) => {
        if (dept === 'Sales') return 'Sales Log Review';
        if (dept === 'Technical') return 'Technical Log Detail';
        if (dept === 'Marketing') return 'Marketing Log Detail';
        if (dept === 'Accounting') return 'Accounting Log Detail';
        return `${dept} Log Detail`;
      };

      const logoDataUrl = await getAppLogoDataUrl().catch(() => undefined);

      const deptTxs = transmissionHistory.filter(
        (t) =>
          isEmployeeTx(t) &&
          (deptByName.get(t.userName) || 'Unknown') === department &&
          (t.status === 'validated' || t.status === 'rejected')
      );

      if (deptTxs.length === 0) {
        triggerToast('No records', `No validated/rejected audits found for ${department}.`);
        return;
      }

      for (const t of deptTxs) {
        const dept = department;
        const status = statusFolder(t);
        const safeId = String(t.id || 'TX').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const safeUser = String(t.userName || 'employee').replace(/[^a-zA-Z0-9_.-]/g, '_');

        const filename = getLogDetailPdfFilename(t, dept) || `${safeUser}_${safeId}.pdf`;
        const categoryScores = buildLogDetailCategoryScores(t, dept, departmentWeights);

        const pdfBlob = createLogDetailPdfBlob(t, {
          title: titleForDept(dept),
          filename,
          logoDataUrl,
          categoryScores,
          finalScore: t.ratings?.finalScore,
        });

        const folderPath = `${dept}/${status}`;
        zip.folder(folderPath)?.file(filename, pdfBlob);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const y = new Date().getFullYear();
      const safeDept = String(department).replace(/[^a-zA-Z0-9_-]+/g, '_');
      a.href = url;
      a.download = `aa2000_employee_${safeDept}_audits_${y}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      triggerToast('Backup prepared', `${department} employee audits exported as ZIP.`);
    } catch (e) {
      console.error(e);
      triggerToast('Export failed', 'Could not generate the ZIP backup.');
    } finally {
      setDataZipBusy(false);
    }
  };

  useEffect(() => {
    if (!dataDeleteCountdownOpen) return;
    setDataDeleteSecondsLeft(10);
    const id = window.setInterval(() => {
      setDataDeleteSecondsLeft((s) => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [dataDeleteCountdownOpen]);

  useEffect(() => {
    if (!dataDeleteCountdownOpen) return;
    if (dataDeleteSecondsLeft !== 0) return;
    // Execute purge once countdown finishes
    onClearEmployeeAudits();
    onAddAuditEntry('DATA_PURGE', 'Admin purged employee audit submissions (pending + history)', 'WARN', user.name);
    triggerToast('Records cleared', 'All employee audit records have been removed.');
    setDataDeleteCountdownOpen(false);
    setDataPurgePwd('');
    setDataPurgeErr(null);
    setDataBackupRequired(false);
    setDataBackupDone(false);
  }, [dataDeleteCountdownOpen, dataDeleteSecondsLeft, onAddAuditEntry, onClearEmployeeAudits, user.name]);

  // Grading: which department's weight editor modal is open (null = closed). Not restored after full page reload.
  const [gradingEditDept, setGradingEditDept] = useState<string | null>(null);
  const [gradingIconPickerOpen, setGradingIconPickerOpen] = useState<number | null>(null);
  const [gradingEditInitialSnapshot, setGradingEditInitialSnapshot] = useState<CategoryWeightItem[] | null>(null);
  const [gradingExitConfirmOpen, setGradingExitConfirmOpen] = useState(false);
  /** When present, the modal will load this draft instead of current `departmentWeights` (used for commit-only "Reset" actions). */
  const [gradingEditDraftOverride, setGradingEditDraftOverride] = useState<CategoryWeightItem[] | null>(null);
  /** Per-category raw string for weight % input so user can clear and type (key = category index when modal open). */
  const [gradingWeightRaw, setGradingWeightRaw] = useState<Record<number, string>>({});
  const [loadStandardConfirmOpen, setLoadStandardConfirmOpen] = useState(false);
  const [setStandardConfirmOpen, setSetStandardConfirmOpen] = useState(false);
  const [standardSnapshotExists, setStandardSnapshotExists] = useState(() => hasDepartmentWeightsStandardSnapshot());

  /** Keep "Load standard" in sync after reload, other tabs, or a successful Set as standard. */
  useEffect(() => {
    const sync = () => setStandardSnapshotExists(hasDepartmentWeightsStandardSnapshot());
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEPARTMENT_WEIGHTS_STANDARD_STORAGE_KEY || e.key === null) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(DEPARTMENT_WEIGHTS_STANDARD_UPDATED_EVENT, sync);
    sync();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(DEPARTMENT_WEIGHTS_STANDARD_UPDATED_EVENT, sync);
    };
  }, []);

  useLockBodyScroll(
    Boolean(
      isProvisioning ||
      dataDeleteCountdownOpen ||
      dataAutoPurgeConfirmOpen ||
      dataPurgeOpen ||
      gradingEditDept ||
      editingNode ||
      unenrollConfirmName ||
      loadStandardConfirmOpen ||
      setStandardConfirmOpen ||
      selectedReviewItem
    )
  );

  /** Default grading content (audit criteria panels) per department and category label. Used when category has no content. */
  const DEFAULT_CATEGORY_CONTENT: Record<string, Record<string, { label: string; maxpoints: number }[]>> = {
    Technical: {
      'Project Execution Quality': [
        { label: 'Zero Back-Job Rate', maxpoints: 25 },
        { label: 'First-Time Fix Quality', maxpoints: 12 },
        { label: 'Technical Compliance & Standards', maxpoints: 7 },
        { label: 'Schedule Adherence', maxpoints: 6 },
      ],
      'Client Satisfaction & Turnover': [
        { label: 'Client Satisfaction Score - CSAT', maxpoints: 15 },
        { label: 'Smooth Turnover Rate', maxpoints: 5 },
        { label: 'Zero Client Complaints/Escalations', maxpoints: 5 },
      ],
      'Team Leadership & Accountability': [
        { label: 'Team Performance Under Supervision', maxpoints: 7 },
        { label: 'Safety Record - Zero Incidents', maxpoints: 4 },
        { label: 'Accountability & Ownership', maxpoints: 4 },
      ],
      'Attendance & Discipline': [
        { label: 'Absence', maxpoints: 3 },
        { label: 'Punctuality', maxpoints: 1 },
        { label: 'Unpreparedness', maxpoints: 1 },
      ],
      'Additional Responsibilities': [
        { label: 'Extra assignments & coverage', maxpoints: 3 },
      ],
      'Administrative Excellence': [
        { label: 'Report Submission Timeliness', maxpoints: 1 },
        { label: 'Report Accuracy', maxpoints: 1 },
      ],
    },
    Sales: {
      'Revenue Score': [{ label: 'Revenue target achievement', maxpoints: 50 }],
      'Accounts Score': [{ label: 'Accounts closed', maxpoints: 25 }],
      'Activities Score': [{ label: 'Meetings conducted', maxpoints: 8 }, { label: 'Calls made', maxpoints: 7 }],
      'Attendance & Discipline': [{ label: 'Attendance & discipline', maxpoints: 3 }, { label: 'Conduct & compliance', maxpoints: 2 }],
      'Additional Responsibilities': [{ label: 'Additional responsibilities', maxpoints: 3 }],
      'Administrative Excellence': [{ label: 'Process & documentation', maxpoints: 2 }],
    },
    Accounting: {
      'Accounting Excellence': [
        { label: 'Financial reports submitted accurately and on time', maxpoints: 30 },
        { label: 'Audit Compliance Score', maxpoints: 20 },
      ],
      'Purchasing Excellence': [
        { label: 'Purchase Order Accuracy', maxpoints: 15 },
        { label: 'Vendor Management Score', maxpoints: 15 },
      ],
      'Purchasing/Admin Excellence': [
        { label: 'PO & administrative coordination', maxpoints: 5 },
        { label: 'Procurement documentation', maxpoints: 5 },
      ],
      'Additional Responsibilities': [{ label: 'Special projects and flexibility', maxpoints: 3 }],
      'Attendance & Discipline': [{ label: 'Attendance and discipline', maxpoints: 3 }, { label: 'Punctuality & conduct', maxpoints: 2 }],
      'Administrative Excellence': [
        { label: 'Office administration & filing', maxpoints: 1 },
        { label: 'Internal compliance & SLAs', maxpoints: 1 },
      ],
    },
    IT: {
      'System Uptime & Reliability': [
        { label: 'Network and server uptime maintained above SLA', maxpoints: 30 },
        { label: 'Zero critical system outages caused by negligence', maxpoints: 20 },
      ],
      'Technical Support Quality': [
        { label: 'Help desk tickets resolved within SLA', maxpoints: 15 },
        { label: 'User satisfaction score on support cases', maxpoints: 10 },
      ],
      'Security & Compliance': [
        { label: 'Security policies and patch management followed', maxpoints: 9 },
        { label: 'Data backup and recovery procedures executed correctly', maxpoints: 6 },
      ],
      'Attendance & Discipline': [
        { label: 'Attendance Rate', maxpoints: 3 },
        { label: 'Discipline & Conduct', maxpoints: 2 },
      ],
      'Additional Responsibilities': [
        { label: 'On-call and extra coverage', maxpoints: 3 },
      ],
      'Administrative Excellence': [
        { label: 'IT documentation & change control', maxpoints: 1 },
        { label: 'Asset & access compliance', maxpoints: 1 },
      ],
    },
    Marketing: {
      'Campaign Execution & Quality': [
        { label: 'Campaign Completion Rate', maxpoints: 25 },
        { label: 'Creative Quality Score', maxpoints: 25 },
      ],
      'Lead Generation & Sales Support': [
        { label: 'Leads Generated', maxpoints: 15 },
        { label: 'Sales Enablement Score', maxpoints: 10 },
      ],
      'Digital & Social Media Performance': [
        { label: 'Engagement Rate', maxpoints: 9 },
        { label: 'Follower Growth', maxpoints: 6 },
      ],
      'Additional Responsibilities': [
        { label: 'Additional Tasks Completed', maxpoints: 3 },
      ],
      'Attendance & Discipline': [
        { label: 'Attendance Rate', maxpoints: 3 },
        { label: 'Punctuality & conduct', maxpoints: 2 },
      ],
      'Administrative Excellence': [
        { label: 'Campaign admin & budget tracking', maxpoints: 1 },
        { label: 'Reporting & stakeholder updates', maxpoints: 1 },
      ],
    },
  };

  // Snapshot and draft when Edit weighted scores modal opens; merge default grading content when category has none
  useEffect(() => {
    if (gradingEditDept) {
      const base = gradingEditDraftOverride ?? departmentWeights[gradingEditDept] ?? [];
      const copy = JSON.parse(JSON.stringify(base)) as CategoryWeightItem[];
      const deptDefaults = DEFAULT_CATEGORY_CONTENT[gradingEditDept];
      if (deptDefaults) {
        for (const cat of copy) {
          if (!cat.content || cat.content.length === 0) {
            const defaultContent = deptDefaults[cat.label];
            if (defaultContent?.length) {
              cat.content = defaultContent.map((c) => withDefaultCriterionUi({ ...c }));
            }
          } else {
            cat.content = cat.content.map((item) => withDefaultCriterionUi(item as CategoryContentItem));
          }
        }
      }
      setGradingEditInitialSnapshot(JSON.parse(JSON.stringify(copy)));
      setGradingEditDraft(copy);
    } else {
      setGradingEditInitialSnapshot(null);
      setGradingEditDraft(null);
      setGradingWeightRaw({});
      setGradingExitConfirmOpen(false);
      setGradingEditDraftOverride(null);
    }
  }, [gradingEditDept, gradingEditDraftOverride, departmentWeights]);

  const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
    Wrench,
    Handshake,
    Users2,
    TrendingUp,
    FileStack,
    ShieldCheck,
    FileText,
    ClipboardCheck,
    Trophy,
    CalendarCheck,
    Calculator,
    Activity,
    DollarSign,
    Target,
    Scale,
    Cpu,
  };
  // Ensure the "paper" icon is the first visible option in the logo picker gallery.
  const CATEGORY_ICON_KEYS = [
    'FileText',
    ...Object.keys(CATEGORY_ICON_MAP).filter((k) => k !== 'FileText'),
  ];

  /** Preset icon key per department, in category order (used when category has no icon set). */
  const DEFAULT_CATEGORY_ICONS: Record<string, string[]> = {
    Technical: ['Wrench', 'Handshake', 'Users2', 'CalendarCheck', 'Handshake', 'FileStack'],
    Sales: ['DollarSign', 'Target', 'Activity', 'CalendarCheck', 'Handshake', 'FileStack'],
    Marketing: ['FileText', 'TrendingUp', 'Activity', 'CalendarCheck', 'Target', 'FileStack'],
    Accounting: ['Calculator', 'FileText', 'Scale', 'CalendarCheck', 'Handshake', 'FileStack'],
    IT: ['Cpu', 'ClipboardCheck', 'ShieldCheck', 'CalendarCheck', 'Target', 'FileText'],
  };

  const [gradingEditDraft, setGradingEditDraft] = useState<CategoryWeightItem[] | null>(null);

  // Drop any legacy session key so a reload never re-opens the modal from stale storage.
  useEffect(() => {
    clearGradingEditSession();
  }, []);

  // Persistence State
  const [availableDepts] = useState<string[]>(INITIAL_DEPARTMENTS);

  const [gradingConfig, setGradingConfig] = useState({ perfWeight: 45, profWeight: 35, behWeight: 20 });
  const [animatedActiveRatio, setAnimatedActiveRatio] = useState(0);
  const activeRatioPrevRef = useRef(0);
  const [animatedDeptScores, setAnimatedDeptScores] = useState<Record<string, number>>({});
  const [animatedDeptPerfRatio, setAnimatedDeptPerfRatio] = useState(0);
  const deptPerfPrevRef = useRef(0);
  const [animatedDeptQuarterScores, setAnimatedDeptQuarterScores] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const deptQuarterPrevRef = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const deptScoresPrevRef = useRef<Record<string, number>>({});

  const [incentiveTiers, setIncentiveTiers] = useState<IncentiveTier[]>(() => getIncentiveTiersFromStorage());

  const DEFAULT_DEPARTMENT_WEIGHTS: DepartmentWeights = {
    Technical: [
      { label: 'Project Execution Quality', weightPct: 50, content: [{ label: 'Zero Back-Job Rate', maxpoints: 25 }, { label: 'First-Time Fix Quality', maxpoints: 12 }, { label: 'Technical Compliance & Standards', maxpoints: 7 }, { label: 'Schedule Adherence', maxpoints: 6 }] },
      { label: 'Client Satisfaction & Turnover', weightPct: 25, content: [{ label: 'Client Satisfaction Score', maxpoints: 15 }, { label: 'Client Retention Rate', maxpoints: 10 }] },
      { label: 'Team Leadership & Accountability', weightPct: 15, content: [{ label: 'Team Coordination', maxpoints: 8 }, { label: 'Accountability & Ownership', maxpoints: 7 }] },
      { label: 'Attendance & Discipline', weightPct: 5, content: [{ label: 'Attendance Rate', maxpoints: 3 }, { label: 'Discipline & Conduct', maxpoints: 2 }] },
      { label: 'Additional Responsibilities', weightPct: 3, content: [{ label: 'Additional Tasks Completed', maxpoints: 3 }] },
      { label: 'Administrative Excellence', weightPct: 2, content: [{ label: 'Report Accuracy & Timeliness', maxpoints: 2 }] },
    ],
    IT: [
      { label: 'System Uptime & Reliability', weightPct: 50, content: [{ label: 'Uptime Percentage', maxpoints: 30 }, { label: 'Incident Prevention', maxpoints: 20 }] },
      { label: 'Technical Support Quality', weightPct: 25, content: [{ label: 'Ticket Resolution Rate', maxpoints: 15 }, { label: 'User Satisfaction Score', maxpoints: 10 }] },
      { label: 'Security & Compliance', weightPct: 15, content: [{ label: 'Security Audit Score', maxpoints: 9 }, { label: 'Policy Compliance', maxpoints: 6 }] },
      { label: 'Attendance & Discipline', weightPct: 5, content: [{ label: 'Attendance Rate', maxpoints: 3 }, { label: 'Discipline & Conduct', maxpoints: 2 }] },
      { label: 'Additional Responsibilities', weightPct: 3, content: [{ label: 'Additional Tasks Completed', maxpoints: 3 }] },
      { label: 'Administrative Excellence', weightPct: 2, content: [{ label: 'Documentation & Process Compliance', maxpoints: 2 }] },
    ],
    Sales: [
      { label: 'Revenue Score', weightPct: 50, content: [{ label: 'Revenue vs Target', maxpoints: 50 }] },
      { label: 'Accounts Score', weightPct: 25, content: [{ label: 'Accounts Closed', maxpoints: 25 }] },
      { label: 'Activities Score', weightPct: 15, content: [{ label: 'Meetings Conducted', maxpoints: 8 }, { label: 'Calls Made', maxpoints: 7 }] },
      { label: 'Attendance & Discipline', weightPct: 5, content: [{ label: 'Attendance Rate', maxpoints: 3 }, { label: 'Discipline & Conduct', maxpoints: 2 }] },
      { label: 'Additional Responsibilities', weightPct: 3, content: [{ label: 'Additional Tasks Completed', maxpoints: 3 }] },
      { label: 'Administrative Excellence', weightPct: 2, content: [{ label: 'Process & documentation compliance', maxpoints: 2 }] },
    ],
    Marketing: [
      { label: 'Campaign Execution & Quality', weightPct: 50, content: [{ label: 'Campaign Completion Rate', maxpoints: 25 }, { label: 'Creative Quality Score', maxpoints: 25 }] },
      { label: 'Lead Generation & Sales Support', weightPct: 25, content: [{ label: 'Leads Generated', maxpoints: 15 }, { label: 'Sales Enablement Score', maxpoints: 10 }] },
      { label: 'Digital & Social Media Performance', weightPct: 15, content: [{ label: 'Engagement Rate', maxpoints: 9 }, { label: 'Follower Growth', maxpoints: 6 }] },
      { label: 'Attendance & Discipline', weightPct: 5, content: [{ label: 'Attendance Rate', maxpoints: 3 }, { label: 'Punctuality & conduct', maxpoints: 2 }] },
      { label: 'Additional Responsibilities', weightPct: 3, content: [{ label: 'Additional Tasks Completed', maxpoints: 3 }] },
      { label: 'Administrative Excellence', weightPct: 2, content: [{ label: 'Process compliance', maxpoints: 2 }] },
    ],
    Accounting: [
      { label: 'Accounting Excellence', weightPct: 50, content: [{ label: 'Financial Report Accuracy', maxpoints: 30 }, { label: 'Audit Compliance Score', maxpoints: 20 }] },
      { label: 'Purchasing Excellence', weightPct: 30, content: [{ label: 'Purchase Order Accuracy', maxpoints: 15 }, { label: 'Vendor Management Score', maxpoints: 15 }] },
      { label: 'Purchasing/Admin Excellence', weightPct: 10, content: [{ label: 'PO & admin coordination', maxpoints: 5 }, { label: 'Procurement documentation', maxpoints: 5 }] },
      { label: 'Attendance & Discipline', weightPct: 5, content: [{ label: 'Attendance Rate', maxpoints: 3 }, { label: 'Discipline & Conduct', maxpoints: 2 }] },
      { label: 'Additional Responsibilities', weightPct: 3, content: [{ label: 'Additional Tasks Completed', maxpoints: 3 }] },
      { label: 'Administrative Excellence', weightPct: 2, content: [{ label: 'Office administration & compliance', maxpoints: 2 }] },
    ],
  };

  // Effects
  useEffect(() => {
    if (activeDept === 'Admin') {
      setNewEmployeeRole(UserRole.ADMIN);
    } else if (newEmployeeRole === UserRole.ADMIN) {
      setNewEmployeeRole(UserRole.EMPLOYEE);
    }
  }, [activeDept]);

  useEffect(() => {
    setLogFilterUser('all');
  }, [logFilterDept]);

  // (Removed Logs tab auto-scroll behavior)

  useEffect(() => {
    if (!transferringNode) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const isInsideTransferMenu = !!target.closest('[data-transfer-menu="true"]');
      if (!isInsideTransferMenu) {
        setTransferringNode(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [transferringNode]);

  // Incentive matrix: sync from other tabs / DevTools localStorage edits
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === INCENTIVE_TIERS_STORAGE_KEY && e.newValue != null) {
        setIncentiveTiers(getIncentiveTiersFromStorage());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Derived State
  const roleMap = useMemo(() => {
    return registry.reduce((acc: Record<string, any>, u: any) => ({
      ...acc,
      [u.name]: { role: u.role, isActive: u.isActive !== false, department: u.department }
    }), {});
  }, [registry]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const matchesSeverity = logFilterSeverity === 'all' || log.type === logFilterSeverity;
      const matchesUser = logFilterUser === 'all' || log.user === logFilterUser;
      const userDept = roleMap[log.user]?.department || 'SYSTEM';
      const matchesDept = logFilterDept === 'all' || userDept === logFilterDept;
      return matchesSeverity && matchesUser && matchesDept;
    });
  }, [auditLogs, logFilterSeverity, logFilterUser, logFilterDept, roleMap]);

  const validatedTransmissions = useMemo(
    () =>
      transmissionHistory.filter(
        (t) => t.status === 'validated' && t.ratings?.finalScore != null
      ),
    [transmissionHistory]
  );

  const departmentSummaries = useMemo(() => {
    return availableDepts
      .filter((d) => d !== 'Admin')
      .map((dept) => {
        const deptMembers = registry.filter(
          (u: any) => u.department === dept && u.role !== UserRole.ADMIN
        );
        const memberNames = new Set(deptMembers.map((u: any) => u.name));
        const deptTransmissions = validatedTransmissions.filter((t) =>
          memberNames.has(t.userName)
        );
        if (deptTransmissions.length === 0) return { dept, avgScore: 0 };
        const totalScore = deptTransmissions.reduce(
          (sum, t) => sum + Number(t.ratings!.finalScore || 0),
          0
        );
        return { dept, avgScore: totalScore / deptTransmissions.length };
      });
  }, [availableDepts, registry, validatedTransmissions]);

  const { deptAvgScore, deptPerfRatio, deptQuarterScores } = useMemo(() => {
    const activeDeptSummary = departmentSummaries.find((s) => s.dept === activeDept);
    const score = activeDeptSummary
      ? Math.max(0, Math.min(100, activeDeptSummary.avgScore || 0))
      : 0;
    const activeDeptMembers = registry.filter(
      (u: any) => u.department === activeDept && u.role !== UserRole.ADMIN
    );
    const activeDeptNames = new Set(activeDeptMembers.map((u: any) => u.name));
    const activeDeptTransmissions = validatedTransmissions.filter((t) =>
      activeDeptNames.has(t.userName)
    );
    const quarterTotals = [0, 0, 0, 0];
    const quarterCounts = [0, 0, 0, 0];
    activeDeptTransmissions.forEach((t) => {
      const month = new Date(t.timestamp).getMonth();
      const quarterIndex = month < 3 ? 0 : month < 6 ? 1 : month < 9 ? 2 : 3;
      const sc = Number(t.ratings?.finalScore ?? 0);
      quarterTotals[quarterIndex] += sc;
      quarterCounts[quarterIndex] += 1;
    });
    const quarterScores = quarterTotals.map((total, idx) =>
      quarterCounts[idx] > 0 ? Math.max(0, Math.min(100, total / quarterCounts[idx])) : 0
    );
    return {
      deptAvgScore: score,
      deptPerfRatio: score / 100,
      deptQuarterScores: quarterScores,
    };
  }, [departmentSummaries, activeDept, registry, validatedTransmissions]);

  const dynamicPersonnelOptions = useMemo(() => {
    if (logFilterDept === 'all') {
      const users = new Set<string>();
      auditLogs.forEach(l => users.add(l.user));
      return Array.from(users).sort();
    } else {
      return Object.entries(roleMap)
        .filter(([_, data]: [string, any]) => data.department === logFilterDept)
        .map(([name]) => name)
        .sort();
    }
  }, [auditLogs, logFilterDept, roleMap]);

  const totalWeight = gradingConfig.perfWeight + gradingConfig.profWeight + gradingConfig.behWeight;

  const activeRatioForRing = useMemo(() => {
    const deptUsers = adminUsers[activeDept] || [];
    const total = deptUsers.length;
    const active = deptUsers.filter((name: string) => roleMap[name]?.isActive).length;
    return total ? active / total : 0;
  }, [activeDept, adminUsers, roleMap]);

  useEffect(() => {
    const startValue = activeRatioPrevRef.current;
    const endValue = activeRatioForRing;
    if (startValue === endValue) {
      setAnimatedActiveRatio(endValue);
      return;
    }
    const duration = 600;
    const startTime = performance.now();
    let frame: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = startValue + (endValue - startValue) * eased;
      setAnimatedActiveRatio(value);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        activeRatioPrevRef.current = endValue;
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [activeRatioForRing]);

  useEffect(() => {
    const start = deptPerfPrevRef.current;
    const end = deptPerfRatio;
    if (start === end) {
      setAnimatedDeptPerfRatio(end);
      return;
    }
    const duration = 600;
    const startTime = performance.now();
    let frame: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedDeptPerfRatio(start + (end - start) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
      else deptPerfPrevRef.current = end;
    };
    frame = requestAnimationFrame(step);
    return () => { if (frame) cancelAnimationFrame(frame); };
  }, [deptPerfRatio]);

  useEffect(() => {
    const start = deptQuarterPrevRef.current;
    const end = deptQuarterScores;
    const duration = 600;
    const startTime = performance.now();
    let frame: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedDeptQuarterScores([
        start[0] + (end[0] - start[0]) * eased,
        start[1] + (end[1] - start[1]) * eased,
        start[2] + (end[2] - start[2]) * eased,
        start[3] + (end[3] - start[3]) * eased,
      ]);
      if (t < 1) frame = requestAnimationFrame(step);
      else deptQuarterPrevRef.current = [...end] as [number, number, number, number];
    };
    frame = requestAnimationFrame(step);
    return () => { if (frame) cancelAnimationFrame(frame); };
  }, [deptQuarterScores]);

  useEffect(() => {
    const targets: Record<string, number> = {};
    departmentSummaries.forEach((s) => {
      targets[s.dept] = Math.max(0, Math.min(100, s.avgScore || 0));
    });
    const prev = deptScoresPrevRef.current;
    const duration = 600;
    const startTime = performance.now();
    const allDepts = Array.from(new Set([...Object.keys(prev), ...Object.keys(targets)]));
    let frame: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next: Record<string, number> = {};
      allDepts.forEach((dept) => {
        const startVal = prev[dept] ?? 0;
        const endVal = targets[dept] ?? 0;
        next[dept] = startVal + (endVal - startVal) * eased;
      });
      setAnimatedDeptScores(next);
      if (t < 1) frame = requestAnimationFrame(step);
      else deptScoresPrevRef.current = { ...targets };
    };
    frame = requestAnimationFrame(step);
    return () => { if (frame) cancelAnimationFrame(frame); };
  }, [departmentSummaries]);

  // Actions — `onUpdateDepartmentWeights` is the only path from this screen to live employee UI data:
  // Edit weighted scores , then finalize (with maintenance), Load standard confirm, or department Reset. Drafts stay in local state / grading session until Commit.
  const triggerToast = (title: string, detail: string) => {
    setToastMessage({ title, detail });
    setShowExportSuccess(true);
    setTimeout(() => setShowExportSuccess(false), 3000);
  };

  const handleUpdateMatrix = (index: number, field: keyof IncentiveTier, value: string | number) => {
    setIncentiveTiers((prev) => {
      const newTiers = [...prev];
      if (field === 'minScore' || field === 'yield') {
        const val = parseInt(value as string) || 0;
        newTiers[index] = { ...newTiers[index], [field]: Math.max(0, Math.min(100, val)) };
      } else {
        newTiers[index] = { ...newTiers[index], [field]: value as any };
      }
      saveIncentiveTiersToStorage(newTiers);
      window.dispatchEvent(new Event(INCENTIVE_Tiers_UPDATED_EVENT));
      return newTiers;
    });
  };

  const handleSaveMatrix = () => {
    saveIncentiveTiersToStorage(incentiveTiers);
    window.dispatchEvent(new Event(INCENTIVE_Tiers_UPDATED_EVENT));
    onAddAuditEntry('ADMIN_CONFIG', 'Incentive eligibility matrix modified and committed to core', 'OK');
    triggerToast('Saved', 'Incentive settings have been saved successfully.');
  };

  const handleSaveGradingAsStandard = () => {
    const snapshot = normalizeDepartmentWeightsForUi(
      JSON.parse(JSON.stringify(departmentWeights)) as DepartmentWeights
    );
    const ok = saveDepartmentWeightsStandard(snapshot);
    if (!ok) {
      triggerToast('Could not save standard', 'Browser storage failed (private mode, quota, or blocked).');
      setStandardSnapshotExists(hasDepartmentWeightsStandardSnapshot());
      return;
    }
    setStandardSnapshotExists(true);
    onAddAuditEntry('ADMIN_CONFIG', 'Department grading standard snapshot saved', 'OK');
    triggerToast('Standard saved', 'Current department grading breakdown is now the saved standard.');
  };

  const handleOpenSetStandardConfirm = () => {
    setSetStandardConfirmOpen(true);
  };

  const handleConfirmSetStandard = () => {
    setSetStandardConfirmOpen(false);
    handleSaveGradingAsStandard();
  };

  const handleOpenLoadStandardConfirm = () => {
    if (!loadDepartmentWeightsStandard()) {
      triggerToast('No standard saved', 'Use Set as standard first.');
      return;
    }
    setLoadStandardConfirmOpen(true);
  };

  const handleConfirmLoadStandard = () => {
    const loaded = loadDepartmentWeightsStandard();
    setLoadStandardConfirmOpen(false);
    if (!loaded) {
      triggerToast('No standard found', 'Save a standard first using Set as standard.');
      setStandardSnapshotExists(false);
      return;
    }
    const next = normalizeDepartmentWeightsForUi(
      JSON.parse(JSON.stringify(loaded)) as DepartmentWeights
    );
    onUpdateDepartmentWeights(next);
    onAddAuditEntry('ADMIN_CONFIG', 'Department grading standard snapshot loaded and applied', 'WARN');
    triggerToast('Standard loaded', 'Department grading weights have been restored from the saved standard.');
  };

  const handleUpdateDepartmentWeight = (dept: string, categoryIndex: number, value: number) => {
    const newWeight = Math.max(0, Math.min(100, value));
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      if (!list[categoryIndex]) return prev;
      const cat = list[categoryIndex];
      const oldContent = cat.content || [];

      // Redistribute criterion maxpoints so they always sum to the new weightPct.
      let newContent = oldContent;
      if (oldContent.length > 0 && newWeight > 0) {
        const oldSum = oldContent.reduce((s, item) => s + (Number(item.maxpoints) || 0), 0);
        if (oldSum > 0) {
          // Proportional scale: each criterion gets floor(pts * ratio), remainder on last item.
          let assigned = 0;
          const scaled = oldContent.map((item, i) => {
            const isLast = i === oldContent.length - 1;
            const pts = isLast
              ? newWeight - assigned
              : Math.floor((Number(item.maxpoints) || 0) * newWeight / oldSum);
            assigned += pts;
            return { ...item, maxpoints: Math.max(0, pts) };
          });
          newContent = scaled;
        } else {
          // All criteria were 0 pts: distribute evenly.
          const base = Math.floor(newWeight / oldContent.length);
          const rem = newWeight - base * oldContent.length;
          newContent = oldContent.map((item, i) => ({
            ...item,
            maxpoints: base + (i === oldContent.length - 1 ? rem : 0),
          }));
        }
      } else if (oldContent.length > 0 && newWeight === 0) {
        // Weight set to 0 — zero out all criteria points.
        newContent = oldContent.map((item) => ({ ...item, maxpoints: 0 }));
      }

      list[categoryIndex] = { ...cat, weightPct: newWeight, content: newContent };
      return list;
    });
  };

  const handleUpdateCategoryLabel = (dept: string, categoryIndex: number, label: string) => {
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      if (!list[categoryIndex]) return prev;
      list[categoryIndex] = { ...list[categoryIndex], label };
      return list;
    });
  };

  const handleUpdateCategoryIcon = (dept: string, categoryIndex: number, iconKey: string) => {
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      if (!list[categoryIndex]) return prev;
      list[categoryIndex] = { ...list[categoryIndex], icon: iconKey };
      return list;
    });
  };

  const handleRemoveCategory = (dept: string, categoryIndex: number) => {
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      if (list.length <= 1) return prev; // keep at least one category
      if (!list[categoryIndex]) return prev;
      list.splice(categoryIndex, 1);
      return list;
    });

    setGradingWeightRaw({});
    setGradingIconPickerOpen(null);
  };

  const handleResetCategory = (dept: string, categoryIndex: number) => {
    const defaults = DEFAULT_DEPARTMENT_WEIGHTS[dept];
    if (!defaults || !defaults[categoryIndex]) return;
    const d = defaults[categoryIndex];
    const presetIcon = DEFAULT_CATEGORY_ICONS[dept]?.[categoryIndex];
    // Use DEFAULT_DEPARTMENT_WEIGHTS content so criterion maxpoints sum to weightPct (not 100).
    const defaultContent =
      d.content?.map((c) => withDefaultCriterionUi({ ...c })) ?? undefined;
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      if (!list[categoryIndex]) return prev;
      list[categoryIndex] = { label: d.label, weightPct: d.weightPct, icon: presetIcon, definition: '', content: defaultContent };
      return list;
    });
    setGradingIconPickerOpen(null);
  };

  const handleResetDepartmentWeights = (dept: string) => {
    const standard = loadDepartmentWeightsStandard();
    const fromStandard = standard?.[dept];
    let nextWeights: CategoryWeightItem[];
    let usedSavedStandard = false;

    if (Array.isArray(fromStandard) && fromStandard.length > 0) {
      nextWeights = JSON.parse(JSON.stringify(fromStandard)) as CategoryWeightItem[];
      usedSavedStandard = true;
    } else {
      const defaults = DEFAULT_DEPARTMENT_WEIGHTS[dept];
      if (!defaults) return;

      const presetIcons = DEFAULT_CATEGORY_ICONS[dept] || [];
      const deptDefaultsContent = DEFAULT_CATEGORY_CONTENT[dept] || {};

      nextWeights = defaults.map((d, idx) => ({
        label: d.label,
        weightPct: d.weightPct,
        icon: presetIcons[idx],
        definition: '',
        content: deptDefaultsContent[d.label]?.map((c) => withDefaultCriterionUi({ ...c })) ?? undefined,
      }));
    }

    // Apply to live config (explicit admin action — not the Edit modal draft).
    const merged: DepartmentWeights = {
      ...departmentWeights,
      [dept]: nextWeights.map((c) => ({ ...c })),
    };
    onUpdateDepartmentWeights(
      normalizeDepartmentWeightsForUi(JSON.parse(JSON.stringify(merged)) as DepartmentWeights)
    );

    if (usedSavedStandard) {
      onAddAuditEntry(
        'ADMIN_CONFIG',
        `Department grading weights for ${dept} reset from saved standard snapshot`,
        'INFO'
      );
      triggerToast('Weights reset', `${dept} restored from the saved standard.`);
    } else {
      onAddAuditEntry('ADMIN_CONFIG', `Department grading weights for ${dept} reset to built-in defaults`, 'INFO');
      triggerToast(
        'Weights reset',
        standard
          ? `${dept} has no data in the saved standard — restored built-in defaults.`
          : `No saved standard yet — ${dept} restored to built-in defaults. Use Set as standard first to store a snapshot.`
      );
    }

    // If the edit modal is open for the same department, close it so the UI matches the reset.
    if (gradingEditDept === dept) {
      clearGradingEditSession();
      setGradingEditDept(null);
      setGradingEditDraft(null);
      setGradingEditDraftOverride(null);
      setGradingIconPickerOpen(null);
      setGradingExitConfirmOpen(false);
      setGradingWeightRaw({});
    }
  };

  const handleOpenEdit = (userName: string) => {
    const currentRole = roleMap[userName]?.role as UserRole || UserRole.EMPLOYEE;
    setEditingNode({ originalName: userName, name: userName, role: currentRole });
  };

  const handleSaveEdit = () => {
    if (!editingNode || !editingNode.name.trim()) return;
    const { originalName, name, role } = editingNode;
    const trimmedName = name.trim();

    onUpdateAdminUsers({
      ...adminUsers,
      [activeDept]: (adminUsers[activeDept] || []).map(u => u === originalName ? trimmedName : u)
    });

    const updatedReg = registry.map((u: any) =>
      u.name === originalName ? { ...u, name: trimmedName, role: role } : u
    );
    onUpdateRegistry(updatedReg);

    onAddAuditEntry('ADMIN_OVERRIDE', `Modified user: ${originalName} -> ${trimmedName} (${role})`, 'OK');
    triggerToast('User updated', `Saved changes for ${trimmedName}.`);
    setEditingNode(null);
  };

  const handleCommitProvision = () => {
    if (!newEmployeeName.trim()) return;
    const name = newEmployeeName.trim();

    if (activeDept === 'Admin' && adminAuthKey !== ADMIN_PROVISION_KEY) {
      triggerToast('Auth Refused', 'Invalid Master Authorization Key.');
      onAddAuditEntry('ADMIN_PROVISION_FAIL', `Unauthorized attempt to provision Admin user: ${name}`, 'WARN');
      return;
    }

    if (registry.some((u: any) => u.name.toLowerCase() === name.toLowerCase())) {
      triggerToast('Already Exists', 'A user with this name already exists.');
      return;
    }

    const defaultPassword =
      newEmployeeRole === UserRole.ADMIN ? 'admin' : newEmployeeRole === UserRole.SUPERVISOR ? 'supervisor' : DEFAULT_NODE_PASSKEY;

    const newUser = {
      name,
      password: defaultPassword,
      department: activeDept,
      role: newEmployeeRole,
      isActive: true
    };

    onUpdateRegistry([...registry, newUser]);

    onUpdateAdminUsers({
      ...adminUsers,
      [activeDept]: [...(adminUsers[activeDept] || []), name]
    });

    onAddAuditEntry('ADMIN_PROVISION', `New user added: ${name} in ${activeDept} as ${newEmployeeRole}`, 'OK');
    triggerToast('User added', `${name} was added to the directory.`);

    setNewEmployeeName('');
    setAdminAuthKey('');
    setIsProvisioning(false);
  };

  const handleToggleStatus = (userName: string) => {
    const isAdmin = roleMap[userName]?.role === UserRole.ADMIN;
    const currentlyActive = !!roleMap[userName]?.isActive;
    if (isAdmin && currentlyActive) {
      const activeAdminCount = registry.filter(
        (u: any) => u.role === UserRole.ADMIN && roleMap[u.name]?.isActive
      ).length;
      if (activeAdminCount <= 1) {
        triggerToast('Cannot deactivate', 'At least one admin must remain active.');
        return;
      }
    }
    const updatedReg = registry.map((u: any) =>
      u.name === userName ? { ...u, isActive: u.isActive === false } : u
    );
    onUpdateRegistry(updatedReg);
    const newStatus = !roleMap[userName]?.isActive;
    onAddAuditEntry('ADMIN_CONFIG', `User ${userName} status set to ${newStatus ? 'ACTIVE' : 'INACTIVE'}.`, 'INFO');
    triggerToast('Status Updated', `${userName} is now ${newStatus ? 'Active' : 'Inactive'}.`);
  };

  const handleExecuteTransfer = (userName: string, targetDept: string) => {
    if (!userName) return;

    let sourceDept = activeDept;
    Object.keys(adminUsers).forEach(dept => {
      if (adminUsers[dept].includes(userName)) {
        sourceDept = dept;
      }
    });

    if (sourceDept === targetDept) return;

    let targetRole = roleMap[userName]?.role || UserRole.EMPLOYEE;
    if (targetDept === 'Admin') targetRole = UserRole.ADMIN;

    const sourceUsers = (adminUsers[sourceDept] || []).filter(u => u !== userName);
    const targetUsers = [...(adminUsers[targetDept] || []), userName];
    onUpdateAdminUsers({ ...adminUsers, [sourceDept]: sourceUsers, [targetDept]: targetUsers });

    const updatedReg = registry.map((u: any) =>
      u.name === userName ? { ...u, department: targetDept, role: targetRole } : u
    );
    onUpdateRegistry(updatedReg);

    onAddAuditEntry('ADMIN_TRANSFER', `Transferred ${userName} from ${sourceDept} to ${targetDept}`, 'INFO');
    setTransferringNode(null);
    triggerToast('User moved', `${userName} is now in ${targetDept}.`);
  };

  const handleExportLogs = async () => {
    try {
      const filtersLabel = [
        logFilterDept !== 'all' ? `Dept: ${logFilterDept}` : null,
        logFilterUser !== 'all' ? `User: ${logFilterUser}` : null,
        logFilterSeverity !== 'all' ? `Severity: ${logFilterSeverity}` : null,
      ]
        .filter(Boolean)
        .join(' • ');

      await downloadIsoAuditTrailPdf({
        auditLogs: filteredLogs,
        authorizingAdmin: user.name,
        filtersLabel: filtersLabel || undefined,
      });
      onAddAuditEntry('ADMIN_EXPORT', 'ISO-9001 Audit Trail exported as binary PDF', 'INFO');
      triggerToast('Audit Export', 'ISO-9001 Logs compiled and downloaded.');
    } catch (error) {
      console.error("PDF Generation failed:", error);
    }
  };

  const downloadJson = (filename: string, payload: unknown) => {
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      triggerToast('Export failed', 'Could not generate JSON export.');
    }
  };

  const renderPerformance = () => {
    // Build top performers from validated history
    const validated = transmissionHistory.filter(t => t.status === 'validated' && t.ratings?.finalScore != null);

    // Get current month and last month bounds
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Current month submissions
    const thisMonthValidated = validated.filter(t => new Date(t.timestamp) >= currentMonthStart);
    // Last month submissions
    const lastMonthValidated = validated.filter(t => {
      const d = new Date(t.timestamp);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });

    // Aggregate per employee: best finalScore per employee this month
    const employeeScores: Record<string, { name: string; dept: string; score: number; count: number }> = {};
    thisMonthValidated.forEach(t => {
      const score = t.ratings!.finalScore!;
      if (!employeeScores[t.userName]) {
        employeeScores[t.userName] = { name: t.userName, dept: t.department || '—', score, count: 1 };
      } else {
        employeeScores[t.userName].score = Math.max(employeeScores[t.userName].score, score);
        employeeScores[t.userName].count += 1;
      }
    });

    // Last month scores
    const lastMonthScores: Record<string, number> = {};
    lastMonthValidated.forEach(t => {
      const score = t.ratings!.finalScore!;
      if (!lastMonthScores[t.userName] || score > lastMonthScores[t.userName]) {
        lastMonthScores[t.userName] = score;
      }
    });

    // If no this-month data, fall back to all-time for leaderboard
    const leaderboardSource = thisMonthValidated.length > 0 ? employeeScores : (() => {
      const allScores: Record<string, { name: string; dept: string; score: number; count: number }> = {};
      validated.forEach(t => {
        const score = t.ratings!.finalScore!;
        if (!allScores[t.userName]) {
          allScores[t.userName] = { name: t.userName, dept: t.department || '—', score, count: 1 };
        } else {
          allScores[t.userName].score = Math.max(allScores[t.userName].score, score);
          allScores[t.userName].count += 1;
        }
      });
      return allScores;
    })();

    const topPerformers = Object.values(leaderboardSource)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const medalColors = ['text-yellow-500', 'text-slate-400 dark:text-slate-500 dark:text-slate-500', 'text-amber-600'];
    const medalBg = ['bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200', 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600', 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700'];

    return (
      <div className="p-6 md:p-5 space-y-10">
        {/* Top Performers Board */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center shadow-sm">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Top Performers Board</h2>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                {thisMonthValidated.length > 0 ? 'Current month • Highest finalized score' : 'All-time • Highest finalized score'}
              </p>
            </div>
          </div>

          {topPerformers.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-5 text-center shadow-sm">
              <Trophy className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500">No validated submissions yet</p>
              <p className="text-xs text-slate-300 mt-1">Leaderboard will appear once admin finalizes submissions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topPerformers.map((emp, i) => {
                const lastScore = lastMonthScores[emp.name];
                const diff = lastScore != null ? emp.score - lastScore : null;
                const isTop3 = i < 3;
                return (
                  <div
                    key={emp.name}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${isTop3
                      ? `${medalBg[i]} shadow-sm`
                      : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                  >
                    {/* Rank */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-lg ${isTop3 ? medalColors[i] : 'text-slate-300'
                      }`}>
                      {i < 3 ? <Medal className="w-6 h-6" /> : <span className="text-sm font-black text-slate-400 dark:text-slate-500 dark:text-slate-500">#{i + 1}</span>}
                    </div>

                    {/* Name + dept */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">{emp.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">{emp.dept} • {emp.count} submission{emp.count !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Compare with last month */}
                    {diff != null && (
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide shrink-0 ${diff > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' :
                        diff < 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600' :
                          'bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 dark:text-slate-500'
                        }`}>
                        {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                        {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '='} vs last mo.
                      </div>
                    )}

                    {/* Score */}
                    <div className="flex items-center gap-3 shrink-0">
                      {(() => {
                        const gradeInfo = getGradeForScore(emp.score);
                        const cls = getGradeColorClasses(gradeInfo.color);
                        return (
                          <div className={`px-2 py-1 rounded-lg border flex flex-col items-center leading-none min-w-[3rem] ${cls.bg} ${cls.text} ${cls.border}`}>
                            <span className="text-xs font-black">{gradeInfo.letter}</span>
                            <span className="text-[7px] uppercase font-bold tracking-tighter opacity-70 mt-0.5">{gradeInfo.label}</span>
                          </div>
                        );
                      })()}
                      <div className={`text-2xl font-black tabular-nums ${emp.score >= 90 ? 'text-emerald-600' : emp.score >= 75 ? 'text-blue-600' : 'text-slate-700 dark:text-slate-300'
                        }`}>
                        {emp.score}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compare with Last Month — all employees */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Compare with Last Month</h2>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Score movement per employee</p>
            </div>
          </div>

          {(() => {
            // All employees with both months
            const allNames = new Set([
              ...Object.keys(employeeScores),
              ...Object.keys(lastMonthScores),
            ]);
            const rows = Array.from(allNames).map(name => ({
              name,
              dept: employeeScores[name]?.dept || validated.find(t => t.userName === name)?.department || '—',
              current: employeeScores[name]?.score ?? null,
              last: lastMonthScores[name] ?? null,
            })).sort((a, b) => {
              const diff = (b.current ?? 0) - (a.current ?? 0);
              return diff !== 0 ? diff : a.name.localeCompare(b.name);
            });

            if (rows.length === 0) return (
              <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-5 text-center shadow-sm">
                <TrendingUp className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500">Not enough data yet</p>
                <p className="text-xs text-slate-300 mt-1">Need validated submissions from at least two months to compare</p>
              </div>
            );

            return (
              <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 text-[10px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-500 px-5 py-3 border-b border-slate-100 dark:border-slate-700 min-w-[340px]">
                    <span>Employee</span>
                    <span className="text-center px-4">Last Month</span>
                    <span className="text-center px-4">This Month</span>
                    <span className="text-center px-4">Change</span>
                  </div>
                  {rows.map(row => {
                    const diff = row.current != null && row.last != null ? row.current - row.last : null;
                    return (
                      <div key={row.name} className="grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center px-5 py-2 border-b border-slate-50 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors min-w-[340px]">
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{row.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">{row.dept}</p>
                        </div>
                        <div className="text-center px-4 text-sm font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 tabular-nums flex flex-col items-center gap-0.5">
                          {row.last != null ? (
                            <>
                              <span>{row.last}%</span>
                              <span className="text-[8px] font-bold opacity-60">({getGradeForScore(row.last).letter})</span>
                            </>
                          ) : '—'}
                        </div>
                        <div className={`text-center px-4 text-sm font-black tabular-nums flex flex-col items-center gap-0.5 ${row.current != null ? 'text-slate-900 dark:text-slate-100' : 'text-slate-300'
                          }`}>
                          {row.current != null ? (
                            <>
                              <span>{row.current}%</span>
                              <span className="text-[9px] font-black opacity-80" style={{ color: getGradeColorClasses(getGradeForScore(row.current).color).text.split(' ')[0].replace('text-', '') }}>
                                {getGradeForScore(row.current).letter}
                              </span>
                            </>
                          ) : '—'}
                        </div>
                        <div className={`flex items-center justify-center gap-1 px-3 py-1 mx-2 rounded-xl text-[10px] font-black uppercase tracking-wide ${diff == null ? 'text-slate-300' :
                          diff > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' :
                            diff < 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600' :
                              'bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 dark:text-slate-500'
                          }`}>
                          {diff != null && diff !== 0 && (diff > 0
                            ? <TrendingUp className="w-3 h-3" />
                            : <TrendingDown className="w-3 h-3" />
                          )}
                          {diff == null ? '—' : diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '±0'}
                        </div>
                      </div>
                    );
                  })}
                </div>{/* end overflow-x-auto */}
              </div>
            );
          })()}
        </div>

        {/* Per-Employee Individual Performance Charts */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Individual Performance</h2>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Score breakdown per employee — all time</p>
            </div>
          </div>

          {(() => {
            // Group all validated submissions by employee
            const byEmployee: Record<string, { name: string; dept: string; scores: number[]; latestScore: number }> = {};
            validated.forEach(t => {
              const score = t.ratings?.finalScore;
              if (score == null) return;
              if (!byEmployee[t.userName]) {
                byEmployee[t.userName] = {
                  name: t.userName,
                  dept: t.department || '—',
                  scores: [],
                  latestScore: 0,
                };
              }
              byEmployee[t.userName].scores.push(score);
            });
            // Compute latest score and sort
            Object.values(byEmployee).forEach(emp => {
              emp.latestScore = emp.scores[emp.scores.length - 1] ?? 0;
            });
            const employees = Object.values(byEmployee).sort((a, b) => b.latestScore - a.latestScore);

            if (employees.length === 0) return (
              <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-8 text-center shadow-sm">
                <Activity className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500">No employee scores yet</p>
                <p className="text-xs text-slate-300 mt-1">Charts will appear once submissions are validated</p>
              </div>
            );

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {employees.map(emp => {
                  const avg = emp.scores.length > 0
                    ? Math.round(emp.scores.reduce((a, b) => a + b, 0) / emp.scores.length)
                    : 0;
                  const best = Math.max(...emp.scores);
                  const worst = Math.min(...emp.scores);
                  const barColor = emp.latestScore >= 90 ? 'bg-emerald-500' : emp.latestScore >= 75 ? 'bg-blue-500' : emp.latestScore >= 60 ? 'bg-amber-500' : 'bg-red-400';
                  const textColor = emp.latestScore >= 90 ? 'text-emerald-600' : emp.latestScore >= 75 ? 'text-blue-600' : emp.latestScore >= 60 ? 'text-amber-600' : 'text-red-500';

                  return (
                    <div key={emp.name} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-slate-100">{emp.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide mt-0.5">{emp.dept} · {emp.scores.length} submission{emp.scores.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const gradeInfo = getGradeForScore(emp.latestScore);
                            const cls = getGradeColorClasses(gradeInfo.color);
                            return (
                              <div className={`px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-tighter ${cls.bg} ${cls.text} ${cls.border}`}>
                                {gradeInfo.letter}
                              </div>
                            );
                          })()}
                          <span className={`text-xl font-black tabular-nums ${textColor}`}>{emp.latestScore}%</span>
                        </div>
                      </div>

                      {/* Progress bar for latest score */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Latest score</span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 dark:bg-[#0d1526] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                            style={{ width: `${Math.min(emp.latestScore, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Mini score history bars */}
                      {emp.scores.length > 1 && (
                        <div className="mb-3">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Submission history</span>
                          <div className="flex items-end gap-1 mt-1.5 h-10">
                            {emp.scores.slice(-10).map((s, i) => (
                              <div
                                key={i}
                                className={`flex-1 rounded-sm ${barColor} opacity-80`}
                                style={{ height: `${Math.max(10, s)}%` }}
                                title={`${s}%`}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-50 dark:border-slate-700">
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Average</p>
                          <p className="text-sm font-black text-slate-700 dark:text-slate-300 tabular-nums">{avg}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Best</p>
                          <p className="text-sm font-black text-emerald-600 tabular-nums">{best}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Lowest</p>
                          <p className="text-sm font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 tabular-nums">{worst}%</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  const renderData = () => {
    const allDepartments = availableDepts.filter((d) => d !== 'Admin');
    const deptCounts: Record<string, number> = allDepartments.reduce((acc, d) => {
      acc[d] = 0;
      return acc;
    }, {} as Record<string, number>);

    transmissionHistory
      .filter((t) => {
        const isEmployee = roleMap[t.userName]?.role === UserRole.EMPLOYEE;
        const hasStatus = t.status === 'validated' || t.status === 'rejected';
        return isEmployee && hasStatus;
      })
      .forEach((t) => {
        const dept = roleMap[t.userName]?.department || 'Unknown';
        if (deptCounts[dept] == null) deptCounts[dept] = 0;
        deptCounts[dept] += 1;
      });

    const deptsToShow = [
      ...allDepartments,
      ...Object.keys(deptCounts).filter((d) => !allDepartments.includes(d)),
    ];

    return (
      <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm p-6">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Submission Records</p>
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none">ADMIN DATA CONTROL</h2>
                <p className="mt-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Exports and data distribution controls.</p>
              </div>
            </div>
          </div>

          {/* Top KPI tiles removed (Audit records / Departments / Risk). */}
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 items-stretch">
          <div>
            {renderLogs('h-[75vh] max-h-[75vh]')}
          </div>

          <div className="flex flex-col gap-6 h-[75vh] max-h-[75vh]">
            <div className="relative bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-7 flex flex-col flex-[1.4] min-h-0 overflow-hidden">
              <div className="absolute top-6 right-6 w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 flex items-center justify-center border border-slate-100 dark:border-slate-700 shadow-sm">
                <Users className="w-5 h-5" />
              </div>
              <div className="pr-14">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Distribution</p>
                <h3 className="mt-2 text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Department counts</h3>
              </div>

              <div className="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  onClick={buildEmployeeAuditsZip}
                  disabled={dataZipBusy}
                  className={`px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-600/20 text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-2 ${dataZipBusy ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                  title="Download all employee audits as ZIP"
                >
                  <Download className="w-4 h-4 text-white" />
                  {dataZipBusy ? 'Preparing ZIP…' : 'EXPORT AUDITS'}
                </button>
              </div>

              <div className="mt-5 flex-1 min-h-0 overflow-y-hidden space-y-1 pr-0">
                {deptsToShow.map((dept) => {
                  const count = deptCounts[dept] ?? 0;
                  return (
                    <div key={dept} className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-1.5">
                      <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide truncate">{dept}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-black text-slate-900 dark:text-slate-100 tabular-nums">{count}</span>
                        <button
                          type="button"
                          onClick={() => buildDepartmentAuditsZip(dept)}
                          disabled={dataZipBusy || count === 0}
                          className={`px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all shadow-sm text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5 ${dataZipBusy || count === 0 ? 'opacity-70 cursor-not-allowed' : ''
                            }`}
                          title={`Download ${dept} validated + rejected audits as ZIP`}
                        >
                          <Download className="w-3.5 h-3.5 text-blue-600" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* end right column */}
        </div>
      </div>
    );
  };

  const handleResetWeights = () => {
    setGradingConfig({ perfWeight: 45, profWeight: 35, behWeight: 20 });
    saveIncentiveTiersToStorage(DEFAULT_INCENTIVE_TIERS);
    window.dispatchEvent(new Event(INCENTIVE_Tiers_UPDATED_EVENT));
    setIncentiveTiers(DEFAULT_INCENTIVE_TIERS);
    onAddAuditEntry('ADMIN_CONFIG', 'Grading coefficients and Matrix reset to defaults', 'INFO');
    triggerToast('Reset Complete', 'Scoring standards have been restored to default.');
  };

  const renderRegistry = () => {
    const deptUsers = adminUsers[activeDept] || [];
    const totalNodes = deptUsers.length;
    const activeNodes = deptUsers.filter(name => roleMap[name]?.isActive).length;
    const inactiveNodes = totalNodes - activeNodes;

    const normalizedSearch = registrySearch.trim().toLowerCase();
    const statusFilterValues = {
      all: () => true,
      active: (name: string) => !!roleMap[name]?.isActive,
      inactive: (name: string) => !roleMap[name]?.isActive
    };

    const filteredUsers = deptUsers
      .filter(name =>
        (!normalizedSearch || name.toLowerCase().includes(normalizedSearch)) &&
        statusFilterValues[registryStatusFilter ?? 'all'](name)
      )
      .sort((a, b) => a.localeCompare(b));

    const roleLabelMap: Record<string, string> = {
      [UserRole.ADMIN]: 'Admin users',
      [UserRole.SUPERVISOR]: 'Supervisor users',
      [UserRole.EMPLOYEE]: 'Employee users'
    };

    const groupedByRole: Record<string, string[]> = {};
    filteredUsers.forEach(name => {
      const role = roleMap[name]?.role || UserRole.EMPLOYEE;
      const key = roleLabelMap[role] || 'Other users';
      if (!groupedByRole[key]) groupedByRole[key] = [];
      groupedByRole[key].push(name);
    });

    const renderRow = (userName: string) => {
      const isMatch = normalizedSearch !== '' && userName.toLowerCase().includes(normalizedSearch);
      const isActive = !!roleMap[userName]?.isActive;
      const isCurrentAdmin = userName === user.name;
      const isAdmin = roleMap[userName]?.role === UserRole.ADMIN;
      const activeAdminCount = registry.filter(
        (u: any) => u.role === UserRole.ADMIN && roleMap[u.name]?.isActive
      ).length;
      const isLastActiveAdmin = isAdmin && isActive && activeAdminCount <= 1;

      const baseBg = isActive
        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 shadow-md'
        : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700';

      return (
        <div
          key={userName}
          className={`group flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 sm:p-5 rounded-lg transition-all border ${baseBg}`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-xs font-black shadow-sm border-2 shrink-0 ${isActive
                ? 'border-blue-700 text-blue-700 dark:text-blue-400'
                : 'border-red-400 text-red-500'
                }`}
            >
              {userName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                {userName} - {roleMap[userName]?.role || 'Employee'}
              </p>
              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                USER_ID: {btoa(userName).substring(0, 8).toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex flex-row items-center justify-end sm:flex-col sm:items-end gap-2 sm:gap-3">
            <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 mr-auto sm:mr-0">
              {isActive ? 'Active' : 'Inactive'}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleToggleStatus(userName)}
                disabled={isLastActiveAdmin}
                title={isLastActiveAdmin ? 'At least one admin must remain active' : undefined}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-[0.18em] transition-all min-w-[96px] justify-center ${isLastActiveAdmin
                  ? 'border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-[#0d1526] text-slate-400 dark:text-slate-500 dark:text-slate-500 cursor-not-allowed opacity-70'
                  : isActive
                    ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700'
                    : 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 text-red-700'
                  }`}
              >
                <span
                  className={`relative inline-flex items-center w-10 h-5 rounded-full transition-colors ${isActive ? 'bg-emerald-400/80' : 'bg-red-300/80'
                    }`}
                >
                  <span
                    className={`absolute w-4 h-4 rounded-full bg-white dark:bg-slate-800 shadow-sm transition-transform ${isActive ? 'translate-x-5' : 'translate-x-1'
                      }`}
                  />
                </span>
                <span>{isActive ? 'On' : 'Off'}</span>
              </button>
              <button
                onClick={() => handleOpenEdit(userName)}
                className="p-1.5 sm:p-2.5 rounded-xl text-slate-300 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                title="Edit user"
              >
                <Settings className="w-4 h-4" />
              </button>
              {activeDept !== 'Admin' && (
                <div className="relative" data-transfer-menu="true">
                  <button
                    onClick={() => setTransferringNode(transferringNode === userName ? null : userName)}
                    className={`p-1.5 sm:p-2.5 rounded-xl transition-all ${transferringNode === userName
                      ? 'text-blue-600'
                      : 'text-slate-300 hover:text-blue-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    title="Move user"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  {transferringNode === userName && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                      <p className="px-4 py-2 text-[8px] font-black text-slate-300 uppercase tracking-wide border-b border-slate-50 dark:border-slate-700 mb-1">
                        Transfer to Dept
                      </p>
                      {availableDepts
                        .filter(d => d !== activeDept && d !== 'Admin')
                        .map(dept => (
                          <button
                            key={dept}
                            onClick={() => handleExecuteTransfer(userName, dept)}
                            className="w-full text-left px-4 py-2 text-[10px] font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-blue-600 transition-colors uppercase tracking-wide"
                          >
                            {dept}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    const activeRatio = totalNodes ? activeNodes / totalNodes : 0;
    const circumference = 2 * Math.PI * 40;

    return (
      <div className="bg-transparent rounded-none p-0 shadow-none border-0 animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col space-y-6">
        {/* Administrative roster */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                  User directory
                </p>
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none">
                  Administrative roster
                </h3>
              </div>
            </div>
          </div>

          <div
            ref={deptTabsRef}
            className="mt-4 flex gap-2 overflow-x-auto py-2 no-scrollbar"
          >
            {availableDepts.map(dept => (
              <button
                key={dept}
                onClick={() => setActiveDept(dept)}
                className={`px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-wide whitespace-nowrap transition-all duration-300 ease-out transform-gpu ${activeDept === dept
                  ? 'bg-[#0F2F6F] text-white shadow-lg shadow-[#0F2F6F]/20 ring-1 ring-[#0F2F6F]/40 -translate-y-0.5'
                  : 'bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:-translate-y-0.5 hover:shadow-md'
                  }`}
              >
                {dept} <span className="ml-2 opacity-50">{(adminUsers[dept] || []).length}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Department status overview */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(180px,1fr)_minmax(0,2.8fr)] gap-6 items-stretch bg-slate-50 dark:bg-slate-900 rounded-lg pt-4 pb-3 px-4 lg:pt-9 lg:pb-4 lg:px-10 shadow-lg border border-slate-200 dark:border-slate-600/70 text-slate-900 dark:text-slate-100 relative overflow-hidden mb-6">
          {/* Decorative background blobs removed for pure light background */}
          {/* Panel 1/3: Team status */}
          <div className="flex flex-col gap-3 min-w-0 justify-start pb-4 border-b border-slate-200 dark:border-slate-600/70 lg:pb-0 lg:border-b-0">
            <div className="flex items-center gap-4 w-full min-h-[40px]">
              <div className="w-10 h-10 bg-white dark:bg-slate-800/70 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/10 border border-slate-200 dark:border-slate-600">
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide">
                  Team status
                </p>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px] lg:max-w-[280px]">
                  {activeDept} department
                </h3>
                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mt-1">
                  {activeNodes} active · {inactiveNodes} inactive
                </p>
              </div>
            </div>
            <div className="relative w-40 h-40 mt-1 self-center">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgb(30 64 175 / 0.25)" strokeWidth="10" strokeLinecap="round" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgb(16 185 129)" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, animatedActiveRatio)))}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[9px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-400">Active users</span>
                <span className="text-2xl font-black text-emerald-600">
                  {totalNodes ? Math.round(activeRatio * 100) : 0}%
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-600/70 p-5 lg:p-6 w-full min-w-0">
            <div
              className="grid grid-cols-1 xl:grid-cols-[max-content_minmax(0,1fr)] gap-6 items-start w-full"
            >
              {/* Panel 2/3: Department average — donut LEFT, Q1-Q4 bars RIGHT */}
              <div className="flex flex-col justify-start pb-4 xl:pb-0 border-b xl:border-b-0 border-slate-200 dark:border-slate-600/60 min-w-0">
                <div className="flex items-center gap-3 mb-3 min-h-[36px]">
                  <div className="w-8 h-8 bg-white dark:bg-slate-800/70 rounded-lg flex items-center justify-center shadow shadow-sky-500/10 border border-slate-200 dark:border-slate-600 flex-shrink-0">
                    <Scale className="w-4 h-4 text-sky-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none">
                      Department average
                    </p>
                    <p className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mt-0.5">
                      Full-year overview
                    </p>
                  </div>
                </div>
                {/* Donut + Q1-Q4: mobile = centered column, sm+ = row */}
                <div className="flex flex-col items-center sm:flex-row sm:items-center sm:flex-wrap gap-6 sm:gap-10">
                  <div className="relative w-36 h-36 flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="rgb(30 64 175 / 0.25)" strokeWidth="10" strokeLinecap="round" />
                      <circle cx="50" cy="50" r="40" fill="none" stroke="rgb(59 130 246)" strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={(2 * Math.PI * 40) * (1 - Math.max(0, Math.min(1, animatedDeptPerfRatio)))}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">Dept avg</span>
                      <span className="text-2xl font-black text-blue-500">
                        {Math.round(animatedDeptPerfRatio * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Mobile: horizontal bars. sm+: vertical bars */}
                  {/* VERTICAL bars (sm and up) */}
                  <div
                    className="hidden sm:flex items-end flex-shrink-0"
                    style={{ height: '144px', gap: '10px' }}
                  >
                    {['Q1', 'Q2', 'Q3', 'Q4'].map((label, idx) => {
                      const value = deptQuarterScores[idx] || 0;
                      const animatedVal = animatedDeptQuarterScores[idx] ?? 0;
                      const heightPct = Math.min(100, Math.max(0, animatedVal));
                      return (
                        <div key={label} className="flex flex-col items-center justify-end gap-0.5 flex-shrink-0 h-full" style={{ width: '22px' }}>
                          <span className="font-black text-slate-600 dark:text-slate-400 tabular-nums text-center leading-none text-[8px]">
                            {Math.round(value)}%
                          </span>
                          <div className="relative flex-1 w-full rounded-sm bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-end">
                            <div className="w-full bg-[#3880F0] transition-none" style={{ height: `${heightPct}%` }} />
                          </div>
                          <span className="font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 leading-none text-[8px]">
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* HORIZONTAL bars (mobile only) */}
                  <div className="flex sm:hidden flex-col gap-2 w-full">
                    {['Q1', 'Q2', 'Q3', 'Q4'].map((label, idx) => {
                      const value = deptQuarterScores[idx] || 0;
                      const animatedVal = animatedDeptQuarterScores[idx] ?? 0;
                      const widthPct = Math.min(100, Math.max(0, animatedVal));
                      return (
                        <div key={label} className="flex items-center gap-2">
                          <span className="w-5 text-[8px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 shrink-0">
                            {label}
                          </span>
                          <div className="flex-1 h-4 rounded-sm bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full bg-[#3880F0] transition-none" style={{ width: `${widthPct}%` }} />
                          </div>
                          <span className="w-7 text-right text-[8px] font-black text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
                            {Math.round(value)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Panel 3/3: Department performance — compact */}
              <div className="flex flex-col justify-start overflow-hidden py-2 lg:py-0 xl:pl-6">
                <div className="flex items-center gap-3 mb-2 min-h-[36px]">
                  <div className="w-8 h-8 bg-white dark:bg-slate-800/70 rounded-lg flex items-center justify-center shadow shadow-sky-500/10 border border-slate-200 dark:border-slate-600 flex-shrink-0">
                    <Cpu className="w-4 h-4 text-sky-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none">
                      Department performance
                    </p>
                    <p className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mt-0.5">
                      Avg scores overview
                    </p>
                  </div>
                </div>
                <div className="mt-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar-thin">
                  {departmentSummaries.map(summary => (
                    <div key={summary.dept} className="flex items-center gap-2 py-0.5">
                      <span className="w-[4.5rem] text-[9px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-400 truncate flex-shrink-0">
                        {summary.dept}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-500 transition-none"
                          style={{ width: `${Math.max(0, Math.min(100, animatedDeptScores[summary.dept] ?? 0))}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-[9px] font-black text-slate-600 dark:text-slate-400 dark:text-slate-400 tabular-nums flex-shrink-0">
                        {Math.round(Math.max(0, Math.min(100, summary.avgScore || 0)))}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/70 shadow-sm p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                  Authorized personnel
                </p>
                <div className="relative group w-full max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-300 group-focus-within:text-blue-600 transition-colors" />
                  <input
                    type="text"
                    placeholder="Find user by name..."
                    className="pl-9 pr-5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-[11px] font-black text-black dark:text-white tracking-[0.05em] focus:outline-none focus:ring-4 focus:ring-blue-500/15 w-full transition-all focus:bg-white dark:bg-slate-800 focus:border-blue-200 dark:border-blue-700"
                    value={registrySearch}
                    onChange={(e) => setRegistrySearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <div className="grid grid-cols-3 w-full sm:w-auto bg-slate-100 dark:bg-[#0d1526]/90 p-1.5 rounded-lg border border-slate-200 dark:border-slate-600/60 shadow-inner gap-1">
                  {(['all', 'active', 'inactive'] as const).map(filter => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setRegistryStatusFilter(filter)}
                      className={`w-full py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.18em] transition-all ${(registryStatusFilter ?? 'all') === filter
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-500'
                        }`}
                    >
                      {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : 'Inactive'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setIsProvisioning(true)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-wide shadow-md shadow-blue-600/25 hover:bg-blue-500 active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <UserPlus className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                  Add user
                </button>
              </div>
            </div>
          </div>

          {isProvisioning && (
            <div className="fixed inset-0 z-[5100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 p-5 space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-md">
                      <UserPlus className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-[0.25em]">Add user</p>
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">Add new personnel</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsProvisioning(false)}
                    className="p-2 text-slate-300 hover:text-slate-600 dark:hover:text-slate-400 dark:hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
                    aria-label="Close add user dialog"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-blue-600/60 uppercase tracking-wide ml-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="Enter Name"
                      className="w-full bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                      value={newEmployeeName}
                      onChange={(e) => setNewEmployeeName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-blue-600/60 uppercase tracking-wide ml-1">Designation</label>
                    <div className="relative">
                      <button
                        type="button"
                        className="w-full pl-4 pr-10 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg font-bold text-sm text-slate-900 dark:text-slate-100 cursor-pointer text-left outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-200 dark:border-blue-700 transition-all hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500 flex items-center disabled:opacity-60"
                        aria-haspopup="listbox"
                        aria-expanded={provisionRoleOpen}
                        onClick={() => setProvisionRoleOpen(v => !v)}
                        disabled={activeDept === 'Admin'}
                      >
                        <span className="flex-1">
                          {newEmployeeRole}
                        </span>
                        <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-500 pointer-events-none transition-transform ${provisionRoleOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {provisionRoleOpen && (
                        <div
                          className="absolute left-0 right-0 top-full mt-1.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm shadow-slate-200/50 z-50 overflow-hidden"
                          role="listbox"
                        >
                          {(activeDept === 'Admin'
                            ? [UserRole.ADMIN]
                            : Object.values(UserRole).filter(role => role !== UserRole.ADMIN)
                          ).map(role => (
                            <button
                              key={role}
                              type="button"
                              role="option"
                              aria-selected={newEmployeeRole === role}
                              onClick={() => { setNewEmployeeRole(role as UserRole); setProvisionRoleOpen(false); }}
                              className={`w-full px-4 py-2.5 text-left text-sm font-bold transition-colors first:pt-3 last:pb-3 ${newEmployeeRole === role
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-blue-600/60 uppercase tracking-wide ml-1">Department</label>
                    <div className="relative">
                      <button
                        type="button"
                        className="w-full pl-4 pr-10 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg font-bold text-sm text-slate-900 dark:text-slate-100 cursor-pointer text-left outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-200 dark:border-blue-700 transition-all hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500 flex items-center"
                        aria-haspopup="listbox"
                        aria-expanded={provisionDeptOpen}
                        onClick={() => setProvisionDeptOpen(v => !v)}
                      >
                        <span className="flex-1">
                          {activeDept}
                        </span>
                        <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-500 pointer-events-none transition-transform ${provisionDeptOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {provisionDeptOpen && (
                        <div
                          className="absolute left-0 right-0 top-full mt-1.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm shadow-slate-200/50 z-50 overflow-hidden"
                          role="listbox"
                        >
                          {availableDepts.map(dept => (
                            <button
                              key={dept}
                              type="button"
                              role="option"
                              aria-selected={activeDept === dept}
                              onClick={() => { setActiveDept(dept); setProvisionDeptOpen(false); }}
                              className={`w-full px-4 py-2.5 text-left text-sm font-bold transition-colors first:pt-3 last:pb-3 ${activeDept === dept
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                            >
                              {dept}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {activeDept === 'Admin' && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-left-2">
                      <label className="text-[9px] font-black text-red-600 uppercase tracking-wide ml-1 flex items-center gap-1.5">
                        <Key className="w-2.5 h-2.5" /> Master Auth Key Required
                      </label>
                      <input
                        type="password"
                        placeholder="Enter Master Auth Key"
                        className="w-full bg-white dark:bg-slate-800 border border-red-200 dark:border-red-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-red-500/5 transition-all"
                        value={adminAuthKey}
                        onChange={(e) => setAdminAuthKey(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setIsProvisioning(false)} className="px-4 py-2 text-slate-400 dark:text-slate-500 dark:text-slate-500 text-[10px] font-black uppercase tracking-wide">Cancel</button>
                  <button onClick={handleCommitProvision} className="px-8 py-3 bg-blue-600 text-white text-[10px] font-black uppercase tracking-wide rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all">Save user changes</button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex-1 min-h-0">
            {filteredUsers.length === 0 ? (
              <div className="h-[22rem] min-h-[22rem] flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 dark:text-slate-500 space-y-2 border border-dashed border-slate-200 dark:border-slate-600 rounded-lg">
                <ShieldAlert className="w-8 h-8 text-slate-300 mb-1" />
                <p className="text-[11px] font-black uppercase tracking-[0.18em]">
                  No users match the current filters
                </p>
                <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 dark:text-slate-500">
                  Adjust your search text or status filter to see results.
                </p>
              </div>
            ) : (
              <div className="h-[22rem] min-h-[22rem] overflow-y-auto pr-2 custom-scrollbar space-y-4 py-3">
                {(['Supervisor users', 'Employee users', 'Admin users', 'Other users'] as const)
                  .filter(group => groupedByRole[group]?.length)
                  .map(group => (
                    <div key={group} className="space-y-2">
                      <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide px-1">
                        {group}
                      </p>
                      <div className="space-y-3">
                        {groupedByRole[group].map(name => renderRow(name))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderLogs = (heightClass: string = 'min-h-[750px]') => (
    <div className={`flex flex-col ${heightClass} rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-6 md:p-5 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500`}>
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide leading-none mb-1">GLOBAL SYSTEM LOGS</h3>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide">REAL-TIME AUDITS</p>
            </div>
          </div>

          <button
            onClick={handleExportLogs}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm text-[9px] font-black uppercase tracking-wide flex items-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            <Download className="w-3 h-3 text-white shrink-0" />
            <span>Export Logs</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 md:p-5 bg-white dark:bg-slate-800/80 rounded-3xl border border-slate-200 dark:border-slate-600 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Department</label>
            <div className="relative">
              <select
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 outline-none appearance-none cursor-pointer focus:border-blue-600"
                value={logFilterDept}
                onChange={(e) => setLogFilterDept(e.target.value)}
              >
                <option value="all">ALL DEPARTMENTS</option>
                {availableDepts.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Employee</label>
            <div className="relative">
              <select
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 outline-none appearance-none cursor-pointer focus:border-blue-600"
                value={logFilterUser}
                onChange={(e) => setLogFilterUser(e.target.value)}
              >
                <option value="all">ALL PERSONNEL</option>
                {dynamicPersonnelOptions.map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Severity Tier</label>
            <div className="relative">
              <select
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 outline-none appearance-none cursor-pointer focus:border-blue-600"
                value={logFilterSeverity}
                onChange={(e) => setLogFilterSeverity(e.target.value)}
              >
                <option value="all">ALL SEVERITIES</option>
                <option value="OK">OK (SUCCESS)</option>
                <option value="INFO">INFO (GENERAL)</option>
                <option value="WARN">WARN (ALERT)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 pointer-events-none" />
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setLogFilterDept('all'); setLogFilterUser('all'); setLogFilterSeverity('all'); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wide hover:bg-slate-800 transition-all"
            >
              <FilterX className="w-3.5 h-3.5" />
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="min-h-[360px] flex flex-col items-center justify-center space-y-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/70">
            <Filter className="w-16 h-16 text-slate-400 dark:text-slate-500 dark:text-slate-500" />
            <p className="text-sm font-black uppercase tracking-wide text-slate-600 dark:text-slate-400 dark:text-slate-400">No logs match filter criteria</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm flex gap-4 font-mono text-sm group hover:border-slate-300 dark:hover:border-slate-500 hover:shadow transition-all">
              <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500 shrink-0 text-sm">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
              <div className="space-y-1.5 flex-grow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${log.type === 'OK' ? 'bg-emerald-100 text-emerald-700' : log.type === 'WARN' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700 dark:text-blue-400'}`}>{log.action}</span>
                    <span className="text-slate-900 dark:text-slate-100 font-bold text-sm">{log.user}</span>
                  </div>
                  <span className="text-xs font-black text-slate-300 uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                    DEPT: {roleMap[log.user]?.department || 'SYS'}
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 dark:text-slate-400 leading-relaxed text-sm">{log.details}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderValidation = () => {
    const recommendedLabel = (s: Transmission['supervisorRecommendation']) =>
      s === 'rejected' ? 'Changes Requested' : 'Supervisor Approved';

    // Pending: in pendingTransmissions, not yet finalized (no supervisor step needed)
    const pendingCandidates = pendingTransmissions.filter((t) => {
      const u = roleMap[t.userName];
      const dept = u?.department || 'Unknown';
      if (dept !== activeDept) return false;
      return t.status !== 'validated' && t.status !== 'rejected';
    });

    // Validated: moved to history with status 'validated'
    const validatedCandidates = transmissionHistory.filter((t) => {
      const u = roleMap[t.userName];
      const dept = u?.department || t.department || 'Unknown';
      return dept === activeDept && t.status === 'validated';
    });

    // Rejected: moved to history with status 'rejected'
    const rejectedCandidates = transmissionHistory.filter((t) => {
      const u = roleMap[t.userName];
      const dept = u?.department || t.department || 'Unknown';
      return dept === activeDept && t.status === 'rejected';
    });

    const activeCandidates =
      validationStatusTab === 'pending'
        ? pendingCandidates
        : validationStatusTab === 'validated'
          ? validatedCandidates
          : rejectedCandidates;

    const term = validationSearch.trim().toLowerCase();
    const filtered = !term
      ? activeCandidates
      : activeCandidates.filter((t) =>
        t.userName.toLowerCase().includes(term) ||
        t.id.toLowerCase().includes(term) ||
        (t.jobId || '').toLowerCase().includes(term) ||
        (t.jobType || '').toLowerCase().includes(term)
      );

    const statusTabConfig = [
      { key: 'pending' as const, label: 'Pending', count: pendingCandidates.length, color: 'amber' },
      { key: 'validated' as const, label: 'Validated', count: validatedCandidates.length, color: 'emerald' },
      { key: 'rejected' as const, label: 'Rejected', count: rejectedCandidates.length, color: 'red' },
    ] as const;

    const emptyMessages = {
      pending: { icon: <ClipboardCheck className="w-12 h-12 text-slate-300" />, title: 'No pending submissions', desc: 'Once supervisors finish grading, their submissions will show up here for approval or rejection.' },
      validated: { icon: <ClipboardCheck className="w-12 h-12 text-slate-300" />, title: 'No validated submissions yet', desc: 'Approved submissions will appear here.' },
      rejected: { icon: <ClipboardCheck className="w-12 h-12 text-slate-300" />, title: 'No rejected submissions', desc: 'Submissions returned for revision will appear here.' },
    };

    return (
      <div className="bg-transparent rounded-none p-0 shadow-none border-0 animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col space-y-6">
        {/* Department Tabs Summary */}
        <ValidationTabs
          pendingTransmissions={pendingTransmissions}
          validatedTransmissions={transmissionHistory.filter(tx => tx.status === 'validated')}
          rejectedTransmissions={transmissionHistory.filter(tx => tx.status === 'rejected')}
          registry={registry}
          activeTab={activeDept}
          onTabChange={(dept) => { setActiveDept(dept); setValidationStatusTab('pending'); }}
        />

        {/* Header + Search */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">Admin grade control</p>
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none">Grade Validation</h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
                  {activeDept} submissions
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={validationSearch}
                onChange={(e) => setValidationSearch(e.target.value)}
                placeholder="Search by name or submission ID..."
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-[10px] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-300 dark:border-blue-600"
              />
            </div>
          </div>

          {/* Status Sub-tabs: Pending / Validated / Rejected */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {statusTabConfig.map(({ key, label, count, color }) => {
              const isActive = validationStatusTab === key;
              const colorMap = {
                amber: { active: 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300', badge: 'bg-amber-200 text-amber-800', inactive: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900' },
                emerald: { active: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300', badge: 'bg-emerald-200 text-emerald-800', inactive: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900' },
                red: { active: 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-600 text-red-800 dark:text-red-300', badge: 'bg-red-200 text-red-800', inactive: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900' },
              } as const;
              const c = colorMap[color];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setValidationStatusTab(key); setValidationSearch(''); }}
                  className={`w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-[9px] font-black uppercase tracking-wide transition-all ${isActive ? c.active : `bg-white dark:bg-slate-800 ${c.inactive}`}`}
                >
                  {label}
                  <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md text-[9px] font-black ${isActive ? c.badge : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="min-h-[220px] flex flex-col items-center justify-center space-y-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 p-5 text-center">
            {emptyMessages[validationStatusTab].icon}
            <p className="text-sm font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">{emptyMessages[validationStatusTab].title}</p>
            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 max-w-[360px] leading-relaxed">{emptyMessages[validationStatusTab].desc}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm p-3 sm:p-6">
            <div className="flex flex-col gap-3">
              {filtered
                .slice()
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((t) => {
                  const finalScore = t.ratings?.finalScore != null ? Number(t.ratings.finalScore) : null;

                  return (
                    <div
                      key={t.id}
                      className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-5 rounded-lg border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 hover:shadow-sm transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="w-12 h-12 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center text-xs font-black shadow-sm">
                            {t.userName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">{t.userName}</p>
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                              Submission ID: {t.id} • {t.jobType || '—'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {/* Status badge */}
                          {validationStatusTab === 'pending' && t.supervisorRecommendation && (
                            <span className="px-3 py-1 bg-slate-900 text-white text-[9px] font-black rounded-full uppercase tracking-wide">
                              {recommendedLabel(t.supervisorRecommendation)}
                            </span>
                          )}
                          {validationStatusTab === 'validated' && (
                            <span className="px-3 py-1 bg-emerald-600 text-white text-[9px] font-black rounded-full uppercase tracking-wide">
                              Approved
                            </span>
                          )}
                          {validationStatusTab === 'rejected' && (
                            <span className="px-3 py-1 bg-red-600 text-white text-[9px] font-black rounded-full uppercase tracking-wide">
                              Changes Requested
                            </span>
                          )}

                          {/* Score badge */}
                          {finalScore != null && (() => {
                            const gradeInfo = getGradeForScore(finalScore);
                            const cls = getGradeColorClasses(gradeInfo.color);
                            return (
                              <span className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-wide flex items-center gap-1.5 ${cls.bg} ${cls.text} ${cls.border}`}>
                                <span>{gradeInfo.letter} ({finalScore}%)</span>
                                <span className="opacity-70 text-[8px]">{gradeInfo.label}</span>
                              </span>
                            );
                          })()}
                          {finalScore == null && (
                            <span className="px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-wide bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400">
                              Score: —
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons — only for pending */}
                      {validationStatusTab === 'pending' && (
                        <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenReview(t)}
                            className="px-4 py-3 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-blue-700 transition-colors flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" />
                            Review & Grade
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onValidate(t.id, undefined, 'validated');
                              triggerToast('Approved', `Submission finalized and approved.`);
                            }}
                            className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-emerald-700 transition-colors"
                          >
                            Quick Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onValidate(t.id, undefined, 'rejected');
                              triggerToast('Changes Requested', `Submission returned for revision.`);
                            }}
                            className="px-4 py-3 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-red-700 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {/* View details for validated/rejected */}
                      {validationStatusTab !== 'pending' && (
                        <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenReview(t, true)}
                            className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-black uppercase tracking-wide hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" />
                            View Details
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGrading = () => {
    const gradingDepts = availableDepts.filter((d) => d !== 'Admin');

    return (
      <>
        <div className="bg-transparent rounded-none p-0 shadow-none border-0 animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col space-y-6">
          {/* Header */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 shrink-0 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Scale className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Configuration</p>
                  <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none">
                    Grading systems
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide mt-1">Set department score weights and bonus thresholds</p>
                </div>
              </div>
            </div>
          </div>

          {/* Department grading in depth */}
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide shrink-0">
                Score weights by department
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenSetStandardConfirm}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:hover:bg-slate-800 disabled:hover:border-slate-200 dark:hover:border-slate-600"
                >
                  <Save className="w-4 h-4 text-blue-600" />
                  Set as standard
                </button>
                <button
                  type="button"
                  onClick={handleOpenLoadStandardConfirm}
                  title={
                    !standardSnapshotExists
                      ? 'No saved standard yet. Use Set as standard first.'
                      : undefined
                  }
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-wide shadow-sm transition-colors ${standardSnapshotExists
                    ? 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-800 hover:bg-blue-100 hover:border-blue-300 dark:hover:border-blue-600'
                    : 'cursor-not-allowed border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 dark:text-slate-500'
                    }`}
                >
                  <Download className="w-4 h-4" />
                  Load standard
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {gradingDepts.map((dept) => {
                const accentClases = 'from-blue-500/10 to-transparent border-blue-200 dark:border-blue-700/60 text-blue-700 dark:text-blue-400';
                const weightClases = 'text-blue-600';
                const categories = departmentWeights[dept] || [];
                const deptSum = categories.reduce((s, c) => s + c.weightPct, 0);
                const sumValid = deptSum === 100;
                return (
                  <div key={dept} className="group bg-white dark:bg-slate-800 rounded-[1.75rem] border border-slate-200 dark:border-slate-600/90 shadow-lg shadow-slate-200/50 overflow-hidden transition-all duration-300 hover:shadow-sm hover:shadow-slate-200/60 hover:border-slate-300 dark:hover:border-slate-500/80">
                    <div className={`px-6 py-2 bg-gradient-to-br ${accentClases} border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3`}>
                      <div>
                        <h5 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">{dept}</h5>
                        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-[0.25em] mt-1">Category weights</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className={`text-[10px] font-black uppercase tracking-wide ${sumValid ? 'text-emerald-600' : 'text-amber-600'}`}>
                          Total: {deptSum}%
                        </span>
                        <button
                          type="button"
                          onClick={() => handleResetDepartmentWeights(dept)}
                          title="Replace this department with its copy from the saved standard (Set as standard), or built-in defaults if none."
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 dark:text-slate-400 text-[9px] font-black uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:hover:bg-slate-800/80"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => setGradingEditDept(dept)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-500 transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:hover:bg-slate-800 disabled:hover:border-slate-200 dark:hover:border-slate-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit weighted scores
                        </button>
                      </div>
                    </div>
                    <div className="p-5">
                      {categories.map((cat, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 py-2.5 px-1 border-b border-slate-100 dark:border-slate-700/80 last:border-0">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide leading-snug min-w-0 flex-1">{cat.label}</span>
                          <span className={`text-xs font-black tabular-nums shrink-0 ${weightClases}`}>{cat.weightPct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Incentive matrix */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm p-6 md:p-5">
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-200 dark:border-slate-600 pb-6 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600/10 border border-blue-200 dark:border-blue-700 rounded-xl flex items-center justify-center shadow-sm">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">Bonus eligibility thresholds</h4>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Applies to all departments & employees</p>
                </div>
              </div>
              <button
                onClick={handleSaveMatrix}
                className="flex items-center gap-2 px-5 py-3 rounded-lg text-[10px] font-black uppercase tracking-wide bg-emerald-600 text-white hover:bg-emerald-500 shadow-md transition-all active:scale-[0.98]"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
            <div className="space-y-4">
              {incentiveTiers.map((tier, i) => (
                <div
                  key={i}
                  className="group bg-white dark:bg-slate-800 rounded-[1.75rem] border border-slate-200 dark:border-slate-600/90 shadow-lg shadow-slate-200/50 overflow-hidden transition-all duration-300 hover:shadow-sm hover:shadow-slate-200/60 hover:border-slate-300 dark:hover:border-slate-500/80"
                >
                  <div className="px-6 py-2 bg-gradient-to-br from-blue-500/10 to-transparent border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-[200px]">
                      <h5 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">{tier.status || 'Tier'}</h5>
                      <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-[0.25em] mt-1">{tier.outcome || 'Outcome'}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className="text-[10px] font-black uppercase tracking-wide text-blue-700 dark:text-blue-400 bg-white dark:bg-slate-800/80 border border-blue-200 dark:border-blue-700/80 px-3 py-1.5 rounded-xl">
                        Min {tier.minScore}% · Yield {tier.yield}%
                      </span>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide block mb-1">Tier designation</label>
                        <input
                          type="text"
                          value={tier.status}
                          onChange={(e) => handleUpdateMatrix(i, 'status', e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-200 dark:border-blue-700 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide block mb-1">Yield outcome</label>
                        <input
                          type="text"
                          value={tier.outcome}
                          onChange={(e) => handleUpdateMatrix(i, 'outcome', e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-200 dark:border-blue-700 transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide block mb-1">Min score requirement</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={tier.minScore}
                            onChange={(e) => handleUpdateMatrix(i, 'minScore', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl pl-4 pr-10 py-3 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-200 dark:border-blue-700 transition-all"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide block mb-1">Payout Yield</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={tier.yield}
                            onChange={(e) => handleUpdateMatrix(i, 'yield', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl pl-4 pr-10 py-3 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-200 dark:border-blue-700 transition-all"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500">%</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide block mb-1">
                        Payout range (supervisor Yield cards)
                      </label>
                      <input
                        type="text"
                        value={tier.payoutRange ?? ''}
                        onChange={(e) => handleUpdateMatrix(i, 'payoutRange', e.target.value)}
                        placeholder="e.g. ₱9k - ₱12k"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-200 dark:border-blue-700 transition-all"
                      />
                      <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 mt-1 uppercase tracking-wide">
                        Shown on department supervisor dashboards; leave blank to show Yield % instead.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {loadStandardConfirmOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-[2px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="load-standard-title"
              onClick={() => setLoadStandardConfirmOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-600/90 bg-white dark:bg-slate-800 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.18)]"
                onClick={(e) => e.stopPropagation()}
              >
                <h4 id="load-standard-title" className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  Load saved standard?
                </h4>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-400 leading-relaxed">
                  This replaces the current department grading weights and criteria with your saved standard for all departments.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLoadStandardConfirmOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 shadow-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmLoadStandard}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-wide shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-colors"
                  >
                    Load standard
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        {setStandardConfirmOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-[10051] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-[2px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="set-standard-title"
              onClick={() => setSetStandardConfirmOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-600/90 bg-white dark:bg-slate-800 p-6 shadow-[0_25px_80px_rgba(15,23,42,0.18)]"
                onClick={(e) => e.stopPropagation()}
              >
                <h4 id="set-standard-title" className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  Save current grading as standard?
                </h4>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-400 leading-relaxed">
                  This will overwrite the saved grading standard with the current department grading breakdown (weights + criteria).
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSetStandardConfirmOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 shadow-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSetStandard}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-wide shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-colors"
                  >
                    Save as standard
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  };

  return (
    <div className="w-full max-w-full xl:max-w-[1600px] 2xl:max-w-[1800px] mx-auto flex flex-col pb-6 md:pb-12 flex-1">
      {dataDeleteCountdownOpen && (
        <div className="fixed inset-0 z-[9500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm overflow-hidden">
            <div className="px-8 py-7 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-600/20">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">Deletion scheduled</h3>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mt-1">Final confirmation window</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDataDeleteCountdownOpen(false)}
                className="p-2.5 rounded-xl text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-800 transition-all"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-8 py-7 space-y-5">
              <div className="text-center">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Countdown</p>
                <div className="mt-3 flex items-center justify-center">
                  <div className="w-28 h-28 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-100 flex items-center justify-center shadow-sm">
                    <span className="text-6xl font-black text-red-700 tabular-nums tracking-tight">{dataDeleteSecondsLeft}</span>
                  </div>
                </div>
                <p className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">
                  Employee audits will be deleted when the timer reaches <span className="font-black">0</span>.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDataDeleteCountdownOpen(false);
                    setDataPurgeErr(null);
                    triggerToast('Deletion cancelled', 'No data was removed.');
                  }}
                  className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                >
                  Cancel deletion
                </button>
                <div className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide bg-red-50 dark:bg-red-900/30 text-red-700 border border-red-100 text-center tabular-nums">
                  Deleting in {dataDeleteSecondsLeft}s
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {dataAutoPurgeConfirmOpen && (
        <div
          className="fixed inset-0 z-[9500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setDataAutoPurgeConfirmOpen(false)}
        >
          <div
            className="relative bg-white dark:bg-slate-800 w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" aria-hidden />
            <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" aria-hidden />

            <div className="relative px-10 py-8 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-[#0b1222]/50 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">Enable Year-End Auto Clear</h3>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mt-1">
                    Requires ZIP backup + admin password confirmation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDataAutoPurgeConfirmOpen(false)}
                className="relative p-2.5 rounded-xl text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative px-10 py-8 space-y-6">
              <p className="text-[13px] font-bold text-slate-700 dark:text-slate-300 leading-7">
                When the year ends, the system will automatically delete all employee audits from memory (pending + history,
                including validated/rejected). Before deletion, it will require downloading a ZIP backup and then prompting you
                to enter the admin password. This action can’t be undone.
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDataAutoPurgeConfirmOpen(false)}
                  className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDataAutoPurgeEnabled(true);
                    setDataAutoPurgeConfirmOpen(false);
                    triggerToast('Auto clear enabled', 'Year-end automatic data clear is now scheduled.');
                  }}
                  className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                >
                  Enable Auto Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dataPurgeOpen && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-slate-800 w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm overflow-hidden">
            <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" aria-hidden />
            <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" aria-hidden />

            <div className="relative px-10 py-8 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-[#0b1222]/50 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-600/20">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">Delete employee audits</h3>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mt-1">Admin confirmation required</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setDataPurgeOpen(false); setDataPurgePwd(''); setDataPurgeErr(null); }}
                className="relative p-2.5 rounded-xl text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative px-10 py-8 space-y-6">
              <p className="text-[13px] font-bold text-slate-700 dark:text-slate-300 leading-7">
                This will remove <span className="font-black">all employee audits</span> (pending + history, including validated/rejected). This can’t be undone.
              </p>

              {dataBackupRequired && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide">Backup required</p>
                  <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400 leading-relaxed">
                    Download a ZIP backup before confirming deletion.
                  </p>
                  <button
                    type="button"
                    disabled={dataZipBusy}
                    onClick={buildEmployeeAuditsZip}
                    className={`mt-3 w-full px-5 py-3 rounded-lg text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${dataZipBusy
                      ? 'bg-slate-100 dark:bg-[#0d1526] text-slate-400 dark:text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-600'
                      : dataBackupDone
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/10'
                      }`}
                  >
                    <Download className="w-4 h-4" />
                    {dataZipBusy ? 'Preparing ZIP…' : dataBackupDone ? 'Backup downloaded' : 'Download ZIP backup'}
                  </button>
                  <p className="mt-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400">
                    ZIP structure: <span className="font-black">Department / (validated|pending|rejected)</span>
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Admin password</label>
                <input
                  type="password"
                  value={dataPurgePwd}
                  onChange={(e) => { setDataPurgePwd(e.target.value); setDataPurgeErr(null); }}
                  className="w-full px-4 py-2 bg-slate-100 dark:bg-[#0d1526] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-4 focus:ring-red-500/10 outline-none font-bold text-sm transition-all"
                  placeholder="••••••••"
                />
                {dataPurgeErr && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 border border-red-100 text-[10px] font-black uppercase tracking-wide">
                    {dataPurgeErr}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setDataPurgeOpen(false); setDataPurgePwd(''); setDataPurgeErr(null); }}
                  className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const me = registry.find((u: any) => String(u.name).toLowerCase() === String(user.name).toLowerCase());
                    const expected = me?.password ?? '';
                    if (!dataPurgePwd || dataPurgePwd !== expected) {
                      setDataPurgeErr('Incorrect admin password.');
                      return;
                    }
                    if (dataBackupRequired && !dataBackupDone) {
                      setDataPurgeErr('Backup required: Download ZIP before deleting.');
                      return;
                    }
                    // Start a short cancellation window before final purge
                    setDataPurgeOpen(false);
                    setDataDeleteCountdownOpen(true);
                  }}
                  className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                >
                  Confirm delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gradingEditDept && (() => {
        const dept = gradingEditDept;
        const weightClases = 'text-blue-600';
        const categories = gradingEditDraft ?? departmentWeights[dept] ?? [];
        const totalWeight = categories.reduce((s, c) => s + c.weightPct, 0);
        const isTotalWeightValid = totalWeight === 100;
        const categoryContentPointSums = (categories || []).map((cat) =>
          (cat.content || []).reduce((s, item) => s + (Number(item.maxpoints) || 0), 0)
        );
        // Each category's criterion maxpoints must sum to the category's own weightPct (not hardcoded 100).
        const areAllCategoryContentsValid =
          (categories || []).length > 0 &&
          categoryContentPointSums.every((sum, i) => sum === (categories[i]?.weightPct ?? 0));
        const canCommitGrading = isTotalWeightValid && areAllCategoryContentsValid;
        const presetIcons = DEFAULT_CATEGORY_ICONS[dept] || [];
        return (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[5000] bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-300"
              aria-label="Close weighted scores editor"
              onClick={() => {
                setGradingEditDept(null);
                setGradingIconPickerOpen(null);
                setGradingEditDraft(null);
              }}
            />
            <div className="fixed inset-0 z-[5001] flex items-center justify-center p-4 pointer-events-none" aria-hidden="true">
              <div className="bg-white dark:bg-slate-800 rounded-[1.75rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-sm shadow-slate-900/10 border border-slate-200 dark:border-slate-600/90 overflow-hidden animate-in zoom-in-95 duration-200 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-2 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-4 flex-wrap bg-slate-50 dark:bg-slate-900/60 shrink-0 overflow-visible">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-600/25">
                      <Scale className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">Edit weighted scores</h3>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mt-0.5">{dept} · Name, icon, weight & grading content</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border font-semibold text-sm tabular-nums tracking-tight ${isTotalWeightValid ? 'bg-emerald-500/10 border-emerald-200/80 text-emerald-700' : 'bg-amber-500/10 border-amber-200 dark:border-amber-700/80 text-amber-700'}`}>
                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide">Total weight</span>
                      <span className="font-black">{totalWeight}%</span>
                    </span>
                    <button
                      type="button"
                      disabled={!canCommitGrading}
                      title={
                        canCommitGrading
                          ? undefined
                          : !isTotalWeightValid
                            ? 'Changes cannot be confirmed until total weight equals 100%.'
                            : 'Changes cannot be confirmed until each category\u2019s criterion points total its weighted impact % (e.g. 35% \u2192 35 pts).'
                      }
                      onClick={async () => {
                        if (
                          gradingEditDraft &&
                          gradingEditDept &&
                          isTotalWeightValid &&
                          areAllCategoryContentsValid
                        ) {
                          const merged: DepartmentWeights = {
                            ...departmentWeights,
                            [gradingEditDept]: gradingEditDraft,
                          };
                          const next = normalizeDepartmentWeightsForUi(
                            JSON.parse(JSON.stringify(merged)) as DepartmentWeights
                          );
                          onUpdateDepartmentWeights(next);
                          const synced = await syncCriteriaAdminSnapshot(gradingEditDept, gradingEditDraft);
                          if (synced) {
                            triggerToast('Saved', 'Department weights saved and synced to backend API.');
                          } else {
                            triggerToast('Saved locally only', 'Department weights were saved in this app.');
                          }
                          clearGradingEditSession();
                        }
                        setGradingEditDept(null);
                        setGradingIconPickerOpen(null);
                        setGradingEditDraft(null);
                      }}
                      className="px-5 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wide shadow-lg shadow-slate-900/25 hover:bg-slate-800 hover:shadow-sm hover:shadow-slate-900/30 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-900 disabled:hover:shadow-lg"
                    >
                      Save changes
                    </button>
                    {!canCommitGrading ? (
                      <span className="text-[10px] font-black uppercase tracking-wide text-amber-700">
                        {!isTotalWeightValid
                          ? 'Save is disabled: total weight must be exactly 100%.'
                          : 'Save is disabled: each category criteria total must match its weight (%).'}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        const draft = gradingEditDraft || [];
                        const snapshot = gradingEditInitialSnapshot || [];
                        const hasChanges = JSON.stringify(draft) !== JSON.stringify(snapshot);
                        if (hasChanges) {
                          setGradingExitConfirmOpen(true);
                        } else {
                          clearGradingEditSession();
                          setGradingEditDept(null);
                          setGradingEditDraft(null);
                          setGradingIconPickerOpen(null);
                          setGradingExitConfirmOpen(false);
                        }
                      }}
                      className="p-2.5 rounded-xl text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 dark:hover:border-red-700 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600/80 shadow-sm hover:shadow transition-all duration-200"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    {gradingExitConfirmOpen && createPortal(
                      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/20" onClick={() => setGradingExitConfirmOpen(false)}>
                        <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-5 shadow-sm shadow-slate-900/10" onClick={(e) => e.stopPropagation()}>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Exit without saving? Your changes will not be saved.</p>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setGradingExitConfirmOpen(false)}
                              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wide hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                clearGradingEditSession();
                                setGradingEditDept(null);
                                setGradingEditDraft(null);
                                setGradingIconPickerOpen(null);
                                setGradingExitConfirmOpen(false);
                              }}
                              className="px-3 py-2 rounded-lg bg-red-600 text-white text-[11px] font-bold uppercase tracking-wide hover:bg-red-700 transition-colors"
                            >
                              Exit
                            </button>
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                </div>


                <div className="p-6 overflow-y-auto flex-1 min-h-0">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-4">Edit category name, icon, and weight (%).</p>
                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide">KPI categories</p>
                    {categories.map((cat, idx) => {
                      const effectiveIcon = cat.icon ?? presetIcons[idx] ?? 'FileText';
                      const IconComponent = CATEGORY_ICON_MAP[effectiveIcon] || FileText;
                      const content = cat.content ?? [];
                      const contentPointSum = categoryContentPointSums[idx] ?? 0;
                      const isContentPointSumValid = contentPointSum === cat.weightPct;
                      return (
                        <div
                          key={idx}
                          className={`rounded-xl border overflow-visible shadow-sm ${isContentPointSumValid ? 'border-slate-200 dark:border-slate-600/90 bg-slate-50 dark:bg-slate-900/40' : 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30'}`}
                        >
                          <div className="p-4 space-y-3">
                            <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_minmax(0,240px)_1fr_auto] gap-3 items-center min-w-0">
                              <div className="relative shrink-0" style={{ zIndex: gradingIconPickerOpen === idx ? 5100 : undefined }}>
                                <button
                                  type="button"
                                  onClick={() => { setGradingIconPickerOpen(gradingIconPickerOpen === idx ? null : idx); }}
                                  className="w-10 h-10 rounded-xl bg-blue-500/10 border border-slate-200 dark:border-slate-600 flex items-center justify-center shadow-sm hover:bg-blue-500/20 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                                  title="Choose icon"
                                >
                                  <IconComponent className="w-5 h-5 text-blue-600" />
                                </button>
                                {gradingIconPickerOpen === idx && (
                                  <div className="absolute top-full left-0 mt-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 z-[5100] box-border shadow-[0_0_12px_rgba(15,23,42,0.08)] w-fit">
                                    <div className="grid gap-1.5 w-max" style={{ gridTemplateRows: 'repeat(4, 28px)', gridTemplateColumns: `repeat(${Math.ceil(CATEGORY_ICON_KEYS.length / 4)}, 52px)` }}>
                                      {CATEGORY_ICON_KEYS.map((key) => {
                                        const Icon = CATEGORY_ICON_MAP[key];
                                        const selected = effectiveIcon === key;
                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            onClick={() => { handleUpdateCategoryIcon(dept, idx, key); setGradingIconPickerOpen(null); }}
                                            className={`w-9 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-600' : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500'}`}
                                            title={key}
                                          >
                                            {Icon && <Icon className="w-5 h-5" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <input
                                type="text"
                                value={cat.label}
                                onChange={(e) => handleUpdateCategoryLabel(dept, idx, e.target.value)}
                                className="w-full min-w-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 shadow-sm truncate"
                                placeholder="Category name"
                              />
                              <div className="flex items-center justify-end gap-2 min-h-[20px] min-w-0 px-2 py-1">
                                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide shrink-0">Weighted impact</span>
                                <select
                                  value={cat.weightPct}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    const otherTotal = totalWeight - cat.weightPct;
                                    if (otherTotal + val <= 100) {
                                      handleUpdateDepartmentWeight(dept, idx, val);
                                    }
                                  }}
                                  className={`w-28 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm font-black tabular-nums outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 shadow-sm ${weightClases}`}
                                >
                                  {[1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(w => {
                                    const otherTotal = totalWeight - cat.weightPct;
                                    const wouldExceed = otherTotal + w > 100;
                                    return (
                                      <option key={w} value={w} disabled={wouldExceed && w !== cat.weightPct}>
                                        {w}%{wouldExceed && w !== cat.weightPct ? ' (over 100%)' : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                              <div className="flex items-center justify-end gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleResetCategory(dept, idx)}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-400 text-[9px] font-black uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-900 shadow-sm transition-colors shrink-0"
                                  title="Reset this category to default"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Reset
                                </button>
                                <button
                                  type="button"
                                  disabled={categories.length <= 1}
                                  onClick={() => handleRemoveCategory(dept, idx)}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[9px] font-black uppercase tracking-wide shadow-sm transition-colors shrink-0 ${categories.length <= 1
                                    ? 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-300 cursor-not-allowed opacity-70'
                                    : 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-600 hover:bg-red-100 hover:border-red-300 dark:hover:border-red-600'
                                    }`}
                                  title={categories.length <= 1 ? 'At least one category is required' : 'Remove this category'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}
      {editingNode && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-sm p-5 shadow-sm border border-slate-100 dark:border-slate-700 space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="flex justify-between items-center relative">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center"><Settings className="w-5 h-5 text-white" /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide leading-none mb-1">Manage user</h3>
                  <p className="text-[9px] font-bold text-slate-300 uppercase tracking-wide">Administrative Override</p>
                </div>
              </div>
              <button onClick={() => setEditingNode(null)} className="p-2 text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-6 relative">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Rename Identity</label>
                <input type="text" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-5 py-2 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all" value={editingNode.name} onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Access Designation</label>
                <div className="relative">
                  <select
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-5 py-2 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 appearance-none cursor-pointer disabled:opacity-50"
                    value={editingNode.role}
                    onChange={(e) => setEditingNode({ ...editingNode, role: e.target.value as UserRole })}
                    disabled={activeDept === 'Admin'}
                  >
                    {activeDept === 'Admin' ? (
                      <option value={UserRole.ADMIN}>{UserRole.ADMIN}</option>
                    ) : (
                      Object.values(UserRole).filter(role => role !== UserRole.ADMIN).map(role => <option key={role} value={role}>{role}</option>)
                    )}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-500 pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={handleSaveEdit} className="w-full bg-slate-900 text-white py-2 rounded-lg text-[11px] font-black uppercase tracking-wide shadow-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-3"><Save className="w-4 h-4" />Save changes</button>
              <button
                onClick={() => editingNode && setUnenrollConfirmName(editingNode.originalName)}
                className="w-full bg-red-600 text-white py-2 rounded-lg text-[11px] font-black uppercase tracking-wide shadow-sm hover:bg-red-700 transition-all flex items-center justify-center gap-3"
              >
                <UserMinus className="w-4 h-4" /> Unenroll
              </button>
            </div>
          </div>
        </div>
      )}

      {unenrollConfirmName && (
        <div className="fixed inset-0 z-[5010] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-sm p-5 shadow-sm border border-slate-100 dark:border-slate-700 space-y-6 relative">
            <div className="text-center space-y-2">
              <p className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Are you sure you want to unenroll <span className="text-red-600">{unenrollConfirmName}</span>?</p>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">This will permanently remove the user and its data.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setUnenrollConfirmName(null)}
                className="flex-1 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide border-2 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const name = unenrollConfirmName;
                  setUnenrollConfirmName(null);
                  setEditingNode(null);
                  onDeleteUser(name, name);
                  triggerToast('User removed', `${name} was removed from the directory.`);
                }}
                className="flex-1 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide bg-red-600 text-white hover:bg-red-700 transition-all flex items-center justify-center gap-2"
              >
                <UserMinus className="w-4 h-4" /> Yes, unenroll
              </button>
            </div>
          </div>
        </div>
      )}

      {showExportSuccess && (
        <div className="fixed top-24 right-8 z-[9999] animate-in slide-in-from-right-full fade-in duration-500">
          <div className="bg-[#0b1222] text-white px-6 py-2 rounded-lg shadow-sm border border-emerald-500/30 flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg"><CheckCircle2 className="w-6 h-6 text-white" /></div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide mb-1">{toastMessage.title}</p>
              <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-tighter">{toastMessage.detail}</p>
            </div>
          </div>
        </div>
      )}

      {/* Grading Review Overlay — opens when Admin clicks "Review & Grade" on a pending submission */}
      {selectedReviewItem && (() => {
        const dept = selectedReviewItem.department || 'Technical';
        const weights = departmentWeights[dept] || [];
        const labels = weights.map(c => c.label);

        return createPortal(
          <div
            className="fixed inset-0 z-[8000] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setSelectedReviewItem(null)}
          >
            <div
              className="bg-white dark:bg-slate-800 rounded-[1.75rem] w-full max-w-6xl max-h-[90vh] flex flex-col shadow-sm border border-slate-200 dark:border-slate-600/90 overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
                    <Scale className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide truncate">
                      {isReadOnly ? 'Score Details' : 'Grade Submission'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-0.5 truncate">
                      {selectedReviewItem.userName} · {dept} · {selectedReviewItem.id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Live score */}
                  <div className={`flex flex-col items-center px-4 py-2 rounded-xl border ${calculatedReviewScore.final >= 90 ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-600' :
                    calculatedReviewScore.final >= 75 ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-600' :
                      calculatedReviewScore.final >= 60 ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-600' :
                        'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-600'
                    }`}>
                    <span className="text-2xl font-black tabular-nums text-slate-900 dark:text-slate-100">{calculatedReviewScore.final}%</span>
                    <span className={`text-[9px] font-black uppercase tracking-wide ${getGradeColorClasses(calculatedReviewScore.gradeInfo.color).text
                      }`}>
                      {calculatedReviewScore.gradeInfo.letter} — {calculatedReviewScore.gradeInfo.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedReviewItem(null)}
                    className="p-2.5 rounded-xl text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body — Two-column layout on desktop */}
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
                {/* Left Column: Evidence / Documents */}
                <div className="w-full md:w-1/2 flex flex-col border-r border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Paperclip className="w-3.5 h-3.5" />
                      Submitted Evidence
                    </h4>
                    {selectedReviewItem.attachments && selectedReviewItem.attachments.length > 1 && (
                      <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase">
                        {activeAttachmentIndex + 1} of {selectedReviewItem.attachments.length}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                    {/* Attachment Preview */}
                    <div className="flex-1">
                      {selectedReviewItem.attachments && selectedReviewItem.attachments.length > 0 ? (
                        <AttachmentLivePreviewPanel file={previewFile} />
                      ) : (
                        <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800/50">
                          <Paperclip className="w-8 h-8 text-slate-300 mb-2" />
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">No attachments provided</p>
                        </div>
                      )}
                    </div>

                    {/* Attachment List / Selector */}
                    {selectedReviewItem.attachments && selectedReviewItem.attachments.length > 1 && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {selectedReviewItem.attachments.map((file, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveAttachmentIndex(idx)}
                            className={`p-2 rounded-xl border text-left transition-all ${
                              activeAttachmentIndex === idx
                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-600 ring-2 ring-blue-500/10'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                          >
                            <p className={`text-[9px] font-black uppercase tracking-tight truncate ${
                              activeAttachmentIndex === idx ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'
                            }`}>
                              {file.name}
                            </p>
                            <p className="text-[8px] font-bold text-slate-400 mt-0.5">{file.size}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Submitter Note */}
                    {selectedReviewItem.projectReport && (
                      <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">Submitter's Report / Note</label>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {selectedReviewItem.projectReport}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Grading Control */}
                <div className="w-full md:w-1/2 flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-800">
                    <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Scale className="w-3.5 h-3.5" />
                      Adjust Weighted Scores
                    </h4>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Category sliders */}
                    {labels.map((label, idx) => {
                      const weight = weights[idx];
                      if (!weight) return null;
                      const score = grading[label] ?? 0;
                      const maxScore = weight.weightPct;
                      const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0;
                      const barColor = pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-blue-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-400';

                      return (
                        <div key={label} className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-600/80 p-4">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide truncate">{label}</span>
                              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0">
                                ({weight.weightPct}% weight)
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <input
                                type="number"
                                min={0}
                                max={maxScore}
                                step={1}
                                value={score}
                                disabled={isReadOnly}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(maxScore, Number(e.target.value) || 0));
                                  setGrading(prev => ({ ...prev, [label]: v }));
                                }}
                                className="w-16 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-60"
                              />
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">/ {maxScore}</span>
                            </div>
                          </div>
                          {/* Slider */}
                          <input
                            type="range"
                            min={0}
                            max={maxScore}
                            step={1}
                            value={score}
                            disabled={isReadOnly}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setGrading(prev => ({ ...prev, [label]: v }));
                            }}
                            className="w-full h-2 appearance-none cursor-pointer rounded-full bg-slate-200 dark:bg-slate-700 accent-blue-600 disabled:cursor-default"
                          />
                          {/* Progress bar */}
                          <div className="mt-1.5 w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}

                    {/* Justification / Comment */}
                    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-600/80 p-4">
                      <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">
                        <MessageSquare className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                        Admin Feedback / Justification
                      </label>
                      <textarea
                        ref={justificationTextareaRef}
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        disabled={isReadOnly}
                        placeholder="Explain any adjustments or provide feedback..."
                        className="w-full h-24 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none disabled:opacity-60"
                      />
                    </div>

                    {/* Incentive info */}
                    {calculatedReviewScore.incentivePct > 0 && (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-600">
                        <DollarSign className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <p className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">
                            Incentive eligibility: {calculatedReviewScore.incentivePct}% payout
                          </p>
                          <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            Based on final score of {calculatedReviewScore.final}%
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              {!isReadOnly && (
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedReviewItem(null)}
                    className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleGradingAction('REJECT')}
                      className="px-5 py-3 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-red-700 transition-colors shadow-md shadow-red-600/20"
                    >
                      Request Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGradingAction('APPROVE')}
                      className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-600/20 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve & Finalize
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        );
      })()}

      <div className="flex-grow flex flex-col min-h-0">
        {/* Mobile header (navigation moved to burger drawer) */}
        {/* Mobile header */}
        <div className="mb-3 flex flex-col gap-2 lg:hidden">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
              Admin Dashboard
            </h1>
            <p className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-slate-100 to-blue-50 dark:from-slate-800/50 dark:to-slate-800/30 border border-slate-200 dark:border-slate-600/80 shadow-sm">
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide">Signed in as</span>
              <span className="text-slate-800 dark:text-slate-200 font-bold text-xs uppercase tracking-wide">{user.name}</span>
            </p>
          </div>

        </div>

        {/* Desktop layout: fixed sidenav + content (reference-style) */}
        <div className="hidden lg:block">
          <aside
            className={`fixed left-0 ${APP_NAV_SIDENAV_TOP} z-[60] ${APP_NAV_SIDENAV_HEIGHT} overflow-hidden border-r border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm transition-[width] duration-200 ease-out ${railOpen ? 'w-[272px]' : 'w-[76px]'
              }`}
            aria-label="Admin sidenav"
          >
            <div className="flex h-full min-h-0 flex-col">
              {/* Nav items — always visible; icon-only when collapsed */}
              <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 pt-3 pb-2">
                {[
                  { id: 'registry', label: 'Users & Departments', desc: 'Manage users & departments', icon: Users },
                  { id: 'validation', label: 'Approve Grades', desc: 'Review & approve submitted grades', icon: ShieldCheck },
                  { id: 'grading', label: 'Grading System Configuration', desc: 'Set scoring weights & criteria', icon: Scale },
                  { id: 'performance', label: 'Performance', desc: 'Employee scores & rankings', icon: Trophy },
                  { id: 'data', label: 'Data & Backup', desc: 'Export data only', icon: Database },
                  { id: 'summary', label: 'Year-End Summary', desc: 'Annual scores by quarter', icon: CalendarCheck },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id as AdminTab)}
                      title={!railOpen ? item.label : undefined}
                      className={`group relative flex w-full min-w-0 items-center justify-start rounded-lg border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400/40 gap-3 px-2 py-2 text-left ${active
                        ? 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300 shadow-sm'
                        : 'border-transparent text-slate-600 dark:text-slate-400 dark:text-slate-400 hover:border-slate-100 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${active ? 'border-blue-300 dark:border-blue-600 bg-blue-100' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                      >
                        <Icon className={`h-[17px] w-[17px] ${active ? 'text-blue-600' : 'text-slate-700 dark:text-slate-300'}`} aria-hidden />
                      </span>
                      {railOpen && (
                        <span className="min-w-0 flex-1 pt-0.5 text-left">
                          <span className={`block text-xs font-semibold leading-tight ${active ? 'text-blue-900 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200'}`}>
                            {item.label}
                          </span>
                          <span className={`mt-0.5 block text-[10px] font-normal leading-snug ${active ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 dark:text-slate-500'}`}>
                            {item.desc}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Collapse/expand — above sign out */}
              <div className={`shrink-0 ${railOpen ? 'px-3 pb-2' : 'px-2 pb-2'}`}>
                <button
                  type="button"
                  onClick={toggleRail}
                  title={!railOpen ? 'Expand sidebar' : undefined}
                  className={`flex w-full items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-400 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400/40 ${railOpen ? 'gap-2 px-3 py-2' : 'p-2'
                    }`}
                  aria-expanded={railOpen}
                  aria-label={railOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                  {railOpen
                    ? <><ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden /><span className="text-[11px] font-semibold">Collapse</span></>
                    : <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                  }
                </button>
              </div>

              <div
                className={`shrink-0 ${railOpen
                  ? 'border-t border-slate-100 dark:border-slate-700 px-3 pb-4 pt-3'
                  : 'px-2 pb-3'
                  }`}
              >
                <button
                  type="button"
                  onClick={logout}
                  title={!railOpen ? 'Sign out' : undefined}
                  className={`flex w-full items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30 ${railOpen ? 'gap-2 px-4 py-2.5 text-[11px] font-semibold' : 'p-2'
                    }`}
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                  {railOpen && 'Sign out'}
                </button>
              </div>
            </div>
          </aside>

          <div className={` px-4 min-h-0`}>
            <section className="min-w-0 min-h-0">
              {activeTab === 'registry' && renderRegistry()}
              {activeTab === 'validation' && renderValidation()}
              {activeTab === 'grading' && renderGrading()}
              {activeTab === 'performance' && renderPerformance()}
              {activeTab === 'data' && renderData()}
              {activeTab === 'summary' && (
                <AnnualSummaryPanel
                  transmissions={[...pendingTransmissions, ...transmissionHistory]}
                />
              )}
            </section>
          </div>
        </div>

        {/* Non-desktop: content panel */}
        <div className="lg:hidden flex flex-col gap-4 pb-8">
          {activeTab === 'registry' && renderRegistry()}
          {activeTab === 'validation' && renderValidation()}
          {activeTab === 'grading' && renderGrading()}
          {activeTab === 'performance' && renderPerformance()}
          {activeTab === 'data' && renderData()}
          {activeTab === 'summary' && (
            <AnnualSummaryPanel
              transmissions={[...pendingTransmissions, ...transmissionHistory]}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;


