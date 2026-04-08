
import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
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
import { saveDepartmentWeightsToStorage } from '../utils/departmentWeightsStorage';
import { clearGradingEditSession } from '../utils/gradingEditSession';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import {
  APP_NAV_RAIL_PL_COLLAPSED,
  APP_NAV_RAIL_PL_EXPANDED,
  APP_NAV_SIDENAV_HEIGHT,
  APP_NAV_SIDENAV_TOP,
} from '../constants/navbarLayout';
import {
  type BasicGradingSystemElement,
  type CheckboxGradingSystemElement,
  type GradingCheckpoint,
  normalizeBasicGradingSystemFromRaw,
  normalizeCheckboxGradingSystemFromRaw,
  scoreFromEmployeeInput,
  snapshotBasicGradingForTextboxCount,
  checkpointsForTextboxOrdinal,
  maxScoreFromCheckpointList,
  gradingCheckpointsStableJson,
  sanitizeCheckpoint,
} from '../lib/gradingCheckpoints';
import {
  AUDIT_PANEL_CRITERION_BODY_CLASS,
  AUDIT_PANEL_INPUT_GRID_CLASS,
  auditPanelInputColSpan,
} from '../utils/auditPanelRule';

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
  Plus,
  Trash2,
  Database,
  Menu,
  ChevronRight,
  ChevronLeft,
  LogOut
} from 'lucide-react';
import { useAuthActions } from '../contexts/AuthActionsContext';
import { useMobileSidenav } from '../contexts/MobileSidenavContext';
import { useRoleSidenavRail } from '../contexts/RoleSidenavRailContext';
import { ValidationTabs } from '../components/ValidationTabs';
import { GradingWeightControl } from '../components/GradingWeightControl';
import { AnnualSummaryPanel } from '../components/AnnualSummaryPanel';

function getCriterionGradingSystemIdx(elements: unknown[], mode: 'textbox' | 'checkbox'): number {
  if (mode === 'checkbox') {
    return elements.findIndex((x: any) => x?.type === 'checkboxGradingSystem');
  }
  return elements.findIndex((x: any) => x?.type === 'basicGradingSystem');
}

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
  /**
   * Admin finalizes grades by setting `status` (moves pending → history).
   * Supervisor-only grading is handled via `onSupervisorGrade`.
   */
  onValidate: (id: string, overrides?: SystemStats, status?: 'validated' | 'rejected') => void;
}

const INITIAL_DEPARTMENTS = ['Technical', 'IT', 'Sales', 'Marketing', 'Accounting', 'Admin'];
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

/** Criterion max points follow the highest checkpoint score (Yield). */
function maxScoreFromCriterionElementsDraft(
  elements: Array<
    | { type: 'logo'; iconKey: string }
    | { type: 'checkbox'; label: string }
    | { type: 'textboxButton'; title: string; value: number }
    | BasicGradingSystemElement
    | CheckboxGradingSystemElement
  >
): number {
  const textboxCount = elements.filter((x: any) => x?.type === 'textboxButton').length;
  let m = 0;
  for (const x of elements) {
    if (x?.type === 'basicGradingSystem') {
      const basic = x as BasicGradingSystemElement;
      if (textboxCount > 1) {
        let sum = 0;
        for (let ord = 0; ord < textboxCount; ord++) {
          sum += maxScoreFromCheckpointList(checkpointsForTextboxOrdinal(basic, ord));
        }
        if (sum > m) m = sum;
      } else {
        const cps = basic.checkpoints;
        if (!cps?.length) continue;
        for (const c of cps) {
          const s = Math.max(0, Number(c.score) || 0);
          if (s > m) m = s;
        }
      }
    } else if (x?.type === 'checkboxGradingSystem') {
      const cps = (x as CheckboxGradingSystemElement).checkpoints;
      if (!cps?.length) continue;
      for (const c of cps) {
        const s = Math.max(0, Number(c.score) || 0);
        if (s > m) m = s;
      }
    }
  }
  return Math.min(1000, m);
}

/**
 * Index of the row that may use "no max" (∞):
 * - Exactly one checkpoint → that row (index 0) may use no max.
 * - Two or more → only the unique largest `min` may use no max (lower tiers must be bounded).
 */
function resolveGradingNoMaxAllowedRowIndex(checkpoints: GradingCheckpoint[]): number | null {
  const n = checkpoints.length;
  if (n === 0) return null;
  if (n === 1) return 0;
  const mins = checkpoints.map((c) => (Number.isFinite(Number(c.min)) ? Number(c.min) : 0));
  const topMin = Math.max(...mins);
  const topIndices = mins.map((m, i) => (m === topMin ? i : -1)).filter((i) => i >= 0);
  if (topIndices.length !== 1) return null;
  return topIndices[0];
}

/** Clear invalid ∞ on lower tiers; default max = min when forcing finite. */
function enforceGradingCheckpointNoMaxRule(checkpoints: GradingCheckpoint[]): GradingCheckpoint[] {
  const allowedIdx = resolveGradingNoMaxAllowedRowIndex(checkpoints);
  return checkpoints.map((c, i) => {
    if (c.max !== null && c.max !== undefined) return c;
    if (allowedIdx !== null && i === allowedIdx) return c;
    const min = Number.isFinite(Number(c.min)) ? Number(c.min) : 0;
    return { ...c, max: min };
  });
}

/** Checklist count tiers always use a finite max (no open-ended ∞). */
function enforceCheckboxGradingFiniteMax(checkpoints: GradingCheckpoint[]): GradingCheckpoint[] {
  return checkpoints.map((c) => {
    if (c.max !== null && c.max !== undefined) return c;
    const min = Number.isFinite(Number(c.min)) ? Number(c.min) : 0;
    return { ...c, max: min };
  });
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

  // UI State
  const [isAtBottom] = useState(true);
  const [showExportSuccess, setShowExportSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState({ title: '', detail: '' });

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
  const [gradingContentExpanded, setGradingContentExpanded] = useState<number | null>(null);
  const [gradingIconPickerOpen, setGradingIconPickerOpen] = useState<number | null>(null);
  const [gradingEditInitialSnapshot, setGradingEditInitialSnapshot] = useState<CategoryWeightItem[] | null>(null);
  const [gradingExitConfirmOpen, setGradingExitConfirmOpen] = useState(false);
  /** When present, the modal will load this draft instead of current `departmentWeights` (used for commit-only "Reset" actions). */
  const [gradingEditDraftOverride, setGradingEditDraftOverride] = useState<CategoryWeightItem[] | null>(null);
  /** Per-category raw string for weight % input so user can clear and type (key = category index when modal open). */
  const [gradingWeightRaw, setGradingWeightRaw] = useState<Record<number, string>>({});
  /** Edit panel for a single grading criterion (category-level content item). */
  const [gradingCriterionEditor, setGradingCriterionEditor] = useState<{ dept: string; catIdx: number; itemIdx: number } | null>(null);
  const [gradingCriterionLabelDraft, setGradingCriterionLabelDraft] = useState<string>('');
  /** Shown on employee hover over the panel criterion icon (saved under `ui.definition`). */
  const [gradingCriterionDefinitionDraft, setGradingCriterionDefinitionDraft] = useState<string>('');
  const [gradingCriterionmaxpointsDraft, setGradingCriterionmaxpointsDraft] = useState<number>(0);
  const [gradingCriterionElementsDraft, setGradingCriterionElementsDraft] = useState<
    Array<
      | { type: 'logo'; iconKey: string }
      | { type: 'checkbox'; label: string }
      | { type: 'textboxButton'; title: string; value: number }
      | BasicGradingSystemElement
      | CheckboxGradingSystemElement
    >
  >([]);
  const [gradingCriterionLogoPickerOpenIdx, setGradingCriterionLogoPickerOpenIdx] = useState<number | null>(null);
  /** Snapshot when criterion editor opens — used to detect unsaved changes before close confirmation. */
  const [gradingCriterionInitialSnapshot, setGradingCriterionInitialSnapshot] = useState<{
    label: string;
    maxpoints: number;
    elementsJson: string;
    definition: string;
  } | null>(null);
  const [gradingCriterionExitConfirmOpen, setGradingCriterionExitConfirmOpen] = useState(false);
  /** Popup for checkpoint grading (textbox value or checkbox checked-count), opened from YIELD in criterion canvas. */
  const [gradingCriterionGradingSystemPopupOpen, setGradingCriterionGradingSystemPopupOpen] = useState(false);
  /** Which grading block the popup edits — must match panel type (textbox vs checklist). */
  const [gradingGradingSystemPopupMode, setGradingGradingSystemPopupMode] = useState<'textbox' | 'checkbox'>('textbox');
  /** Hover popover on canvas YIELD showing checkpoint rules. */
  const [criterionYieldGradingHover, setCriterionYieldGradingHover] = useState(false);
  const criterionYieldHoverTimeoutRef = useRef<number | null>(null);
  /** Confirm discard when closing grading popup with unsaved checkpoint edits (same pattern as criterion editor X). */
  const [gradingSystemPopupExitConfirmOpen, setGradingSystemPopupExitConfirmOpen] = useState(false);
  const gradingCriterionmaxpointsRef = useRef(0);
  gradingCriterionmaxpointsRef.current = gradingCriterionmaxpointsDraft;
  const prevGradingPopupOpenRef = useRef(false);
  const gradingSystemPopupSnapshotRef = useRef<string | null>(null);
  /** While editing Max in the checkpoint popup, allow empty string without writing `max: null` (No max only via checkbox). */
  const [gradingCheckpointMaxDraft, setGradingCheckpointMaxDraft] = useState<Record<string, string>>({});
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

  /** Local-only tester values on the criterion canvas (checkboxes + textbox number); never written to draft / commit. */
  const [criterionCanvasTest, setCriterionCanvasTest] = useState<{
    check: Record<number, boolean>;
    text: Record<number, string>;
  }>({ check: {}, text: {} });

  const bumpCriterionCanvasTestTextbox = useCallback((idx: number, delta: number) => {
    setCriterionCanvasTest((prev) => {
      const curRaw = prev.text[idx];
      const cur = curRaw === undefined || String(curRaw).trim() === '' ? 0 : parseFloat(String(curRaw));
      const n = Number.isFinite(cur) ? cur : 0;
      const next = Math.max(0, Math.min(1000, n + delta));
      return { ...prev, text: { ...prev.text, [idx]: String(next) } };
    });
  }, []);

  useEffect(() => {
    setCriterionCanvasTest({ check: {}, text: {} });
  }, [gradingCriterionElementsDraft.length]);

  useEffect(() => {
    if (!gradingCriterionGradingSystemPopupOpen) {
      setGradingCheckpointMaxDraft({});
    }
  }, [gradingCriterionGradingSystemPopupOpen]);

  const cancelCriterionYieldHoverClose = () => {
    if (criterionYieldHoverTimeoutRef.current !== null) {
      window.clearTimeout(criterionYieldHoverTimeoutRef.current);
      criterionYieldHoverTimeoutRef.current = null;
    }
  };

  const scheduleCriterionYieldHoverClose = () => {
    cancelCriterionYieldHoverClose();
    criterionYieldHoverTimeoutRef.current = window.setTimeout(() => {
      setCriterionYieldGradingHover(false);
      criterionYieldHoverTimeoutRef.current = null;
    }, 180);
  };

  useEffect(() => {
    const open = gradingCriterionGradingSystemPopupOpen;
    if (open && !prevGradingPopupOpenRef.current) {
      const idx = getCriterionGradingSystemIdx(gradingCriterionElementsDraft, gradingGradingSystemPopupMode);
      if (idx >= 0) {
        const el = gradingCriterionElementsDraft[idx] as BasicGradingSystemElement | CheckboxGradingSystemElement;
        if (gradingGradingSystemPopupMode === 'textbox' && el.type === 'basicGradingSystem') {
          const tbCount = gradingCriterionElementsDraft.filter((x: any) => x?.type === 'textboxButton').length;
          gradingSystemPopupSnapshotRef.current = snapshotBasicGradingForTextboxCount(el, tbCount);
        } else {
          gradingSystemPopupSnapshotRef.current = gradingCheckpointsStableJson(el.checkpoints);
        }
      } else {
        gradingSystemPopupSnapshotRef.current = null;
      }
    }
    if (!open) {
      gradingSystemPopupSnapshotRef.current = null;
      setGradingSystemPopupExitConfirmOpen(false);
    }
    prevGradingPopupOpenRef.current = open;
  }, [gradingCriterionGradingSystemPopupOpen, gradingCriterionElementsDraft, gradingGradingSystemPopupMode]);

  /** Fix invalid "no max" on lower tiers when opening the grading popup (legacy / mistaken configs). */
  useEffect(() => {
    if (!gradingCriterionGradingSystemPopupOpen) return;
    const mode = gradingGradingSystemPopupMode;
    setGradingCriterionElementsDraft((prev) => {
      const idx = getCriterionGradingSystemIdx(prev, mode);
      if (idx < 0) return prev;
      const row = prev[idx] as any;
      if (row.type !== 'basicGradingSystem' && row.type !== 'checkboxGradingSystem') return prev;

      if (row.type === 'checkboxGradingSystem') {
        const cps = row.checkpoints as GradingCheckpoint[];
        if (!cps?.length) return prev;
        let enforced = enforceGradingCheckpointNoMaxRule(cps);
        enforced = enforceCheckboxGradingFiniteMax(enforced);
        if (JSON.stringify(enforced) === JSON.stringify(cps)) return prev;
        return prev.map((x, j) => (j === idx ? { type: 'checkboxGradingSystem' as const, checkpoints: enforced } : x));
      }

      const tbCount = prev.filter((x: any) => x?.type === 'textboxButton').length;
      const b = row as BasicGradingSystemElement;
      if (tbCount <= 1) {
        const cps = b.checkpoints as GradingCheckpoint[];
        if (!cps?.length) return prev;
        const enforced = enforceGradingCheckpointNoMaxRule(cps);
        if (JSON.stringify(enforced) === JSON.stringify(cps)) return prev;
        return prev.map((x, j) =>
          j === idx && (x as any).type === 'basicGradingSystem'
            ? { ...b, checkpoints: enforced, perTextboxCheckpoints: undefined }
            : x
        );
      }

      const base = (b.checkpoints?.length ? b.checkpoints : [{ min: 0, max: 0, score: 0 }]).map((c: GradingCheckpoint) => ({
        ...c,
      }));
      let per = Array.from({ length: tbCount }, (_, i) =>
        b.perTextboxCheckpoints?.[i]?.length
          ? b.perTextboxCheckpoints[i]!.map((c: GradingCheckpoint) => ({ ...c }))
          : base.map((c: GradingCheckpoint) => ({ ...c }))
      );
      let perChanged = false;
      per = per.map((list: GradingCheckpoint[]) => {
        const e = enforceGradingCheckpointNoMaxRule(list);
        if (JSON.stringify(e) !== JSON.stringify(list)) perChanged = true;
        return e;
      });
      const mainCps = b.checkpoints?.length ? b.checkpoints : base;
      const enforcedMain = enforceGradingCheckpointNoMaxRule(mainCps.map((c: GradingCheckpoint) => ({ ...c })));
      const mainChanged = JSON.stringify(enforcedMain) !== JSON.stringify(mainCps);
      const perSame =
        b.perTextboxCheckpoints?.length === tbCount && JSON.stringify(per) === JSON.stringify(b.perTextboxCheckpoints);
      if (!perChanged && !mainChanged && perSame) return prev;

      return prev.map((x, j) =>
        j === idx && (x as any).type === 'basicGradingSystem'
          ? {
              ...b,
              checkpoints: enforcedMain,
              perTextboxCheckpoints: per,
            }
          : x
      );
    });
  }, [gradingCriterionGradingSystemPopupOpen, gradingGradingSystemPopupMode]);

  const requestCloseGradingSystemPopup = useCallback(() => {
    if (!gradingCriterionGradingSystemPopupOpen) return;
    const idx = getCriterionGradingSystemIdx(gradingCriterionElementsDraft, gradingGradingSystemPopupMode);
    if (idx < 0) {
      setGradingCriterionGradingSystemPopupOpen(false);
      return;
    }
    const el = gradingCriterionElementsDraft[idx] as BasicGradingSystemElement | CheckboxGradingSystemElement;
    let currentJson: string;
    if (gradingGradingSystemPopupMode === 'textbox' && el.type === 'basicGradingSystem') {
      const tbCount = gradingCriterionElementsDraft.filter((x: any) => x?.type === 'textboxButton').length;
      currentJson = snapshotBasicGradingForTextboxCount(el, tbCount);
    } else {
      currentJson = gradingCheckpointsStableJson(el.checkpoints);
    }
    const snap = gradingSystemPopupSnapshotRef.current;
    if (snap !== null && currentJson !== snap) {
      setGradingSystemPopupExitConfirmOpen(true);
    } else {
      setGradingCriterionGradingSystemPopupOpen(false);
    }
  }, [gradingCriterionGradingSystemPopupOpen, gradingCriterionElementsDraft, gradingGradingSystemPopupMode]);

  /** Criterion max points follow the highest checkpoint score (Yield). */
  useLayoutEffect(() => {
    setGradingCriterionmaxpointsDraft(maxScoreFromCriterionElementsDraft(gradingCriterionElementsDraft));
  }, [gradingCriterionElementsDraft]);

  /** Close checkpoint popup if the panel type no longer matches (e.g. last textbox/checkbox removed). */
  useEffect(() => {
    if (!gradingCriterionGradingSystemPopupOpen) return;
    const hasTextbox = gradingCriterionElementsDraft.some((x: any) => x?.type === 'textboxButton');
    const hasCheckbox = gradingCriterionElementsDraft.some((x: any) => x?.type === 'checkbox');
    if (gradingGradingSystemPopupMode === 'textbox' && !hasTextbox) {
      setGradingCriterionGradingSystemPopupOpen(false);
      setGradingSystemPopupExitConfirmOpen(false);
    }
    if (gradingGradingSystemPopupMode === 'checkbox' && !hasCheckbox) {
      setGradingCriterionGradingSystemPopupOpen(false);
      setGradingSystemPopupExitConfirmOpen(false);
    }
  }, [gradingCriterionElementsDraft, gradingCriterionGradingSystemPopupOpen, gradingGradingSystemPopupMode]);

  useEffect(() => {
    return () => {
      cancelCriterionYieldHoverClose();
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
        setStandardConfirmOpen
    )
  );

  /** Default grading content (audit criteria panels) per department and category label. Used when category has no content. */
  const DEFAULT_CATEGORY_CONTENT: Record<string, Record<string, { label: string; maxpoints: number }[]>> = {
    Technical: {
      'Project Execution Quality': [
        { label: 'Zero Back-Job Rate', maxpoints: 20 },
        { label: 'First-Time Fix Quality', maxpoints: 10 },
        { label: 'Technical Compliance & Standards', maxpoints: 5 },
        { label: 'Schedule Adherence', maxpoints: 5 },
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
      'Sales Support & Lead Development': [
        { label: 'Site Visits & Technical Consultations', maxpoints: 4 },
        { label: 'Technical Feasibility Confirmations', maxpoints: 3 },
        { label: 'Sales Team Feedback', maxpoints: 3 },
      ],
      'Administrative Excellence': [
        { label: 'Report Submission Timeliness', maxpoints: 3 },
        { label: 'Report Accuracy', maxpoints: 2 },
      ],
      'Attendance & Discipline': [
        { label: 'Absence', maxpoints: 3 },
        { label: 'Punctuality', maxpoints: 1 },
        { label: 'Unpreparedness', maxpoints: 1 },
      ],
    },
    Sales: {
      'Revenue Score': [{ label: 'Revenue target achievement', maxpoints: 40 }],
      'Accounts Score': [{ label: 'Accounts closed', maxpoints: 20 }],
      'Activities Score': [{ label: 'Sales activities', maxpoints: 20 }],
      'Quotation Mgmt': [{ label: 'Quotation management', maxpoints: 10 }],
      'Attendance': [{ label: 'Attendance & discipline', maxpoints: 5 }],
      'Additional Responsibility': [{ label: 'Additional responsibilities', maxpoints: 5 }],
    },
    Accounting: {
      'Accounting Excellence': [
        { label: 'Financial reports submitted accurately and on time', maxpoints: 25 },
        { label: 'Audit Compliance Score', maxpoints: 15 },
      ],
      'Purchasing Excellence': [
        { label: 'Purchase Order Accuracy', maxpoints: 15 },
        { label: 'Vendor Management Score', maxpoints: 15 },
      ],
      'Administrative Excellence': [
        { label: 'Administrative Task Completion', maxpoints: 15 },
        { label: 'Documentation Quality', maxpoints: 10 },
      ],
      'Additional Responsibility': [{ label: 'Special projects and flexibility', maxpoints: 3 }],
      'Attendance': [{ label: 'Attendance and discipline', maxpoints: 2 }],
    },
    IT: {
      'SYSTEM UPTIME & RELIABILITY': [
        { label: 'Network and server uptime maintained above SLA', maxpoints: 20 },
        { label: 'Zero critical system outages caused by negligence', maxpoints: 15 },
      ],
      'Technical Support Quality': [
        { label: 'Help desk tickets resolved within SLA', maxpoints: 15 },
        { label: 'User satisfaction score on support cases', maxpoints: 10 },
      ],
      'Security & Compliance': [
        { label: 'Security policies and patch management followed', maxpoints: 12 },
        { label: 'Data backup and recovery procedures executed correctly', maxpoints: 8 },
      ],
      'Project & Development Delivery': [
        { label: 'IT projects delivered on time and within scope', maxpoints: 10 },
        { label: 'Code quality and documentation standards met', maxpoints: 5 },
      ],
      'Attendance & Discipline': [
        { label: 'Attendance Rate', maxpoints: 3 },
        { label: 'Discipline & Conduct', maxpoints: 2 },
      ],
    },
    Marketing: {
      'Campaign Execution & Quality': [
        { label: 'Campaign Completion Rate', maxpoints: 22 },
        { label: 'Creative Quality Score', maxpoints: 18 },
      ],
      'Lead Generation & Sales Support': [
        { label: 'Leads Generated', maxpoints: 20 },
        { label: 'Sales Enablement Score', maxpoints: 10 },
      ],
      'Digital & Social Media Performance': [
        { label: 'Engagement Rate', maxpoints: 15 },
        { label: 'Follower Growth', maxpoints: 10 },
      ],
      'Additional Responsibilities': [
        { label: 'Additional Tasks Completed', maxpoints: 3 },
      ],
      'Attendance & Discipline': [
        { label: 'Attendance Rate', maxpoints: 2 },
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
    Technical: ['Wrench', 'Handshake', 'Users2', 'TrendingUp', 'FileStack', 'ShieldCheck'],
    Sales: ['DollarSign', 'Target', 'Activity', 'FileText', 'CalendarCheck', 'Handshake'],
    Marketing: ['FileText', 'TrendingUp', 'Activity', 'Target', 'FileStack', 'CalendarCheck'],
    Accounting: ['Calculator', 'FileText', 'FileStack', 'Handshake', 'CalendarCheck'],
    IT: ['Cpu', 'ShieldCheck', 'ShieldCheck', 'FileStack', 'FileText', 'CalendarCheck'],
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
      list[categoryIndex] = { ...list[categoryIndex], label: label.trim() || list[categoryIndex].label };
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

  const handleUpdateCategoryContent = (dept: string, categoryIndex: number, content: { label: string; maxpoints: number }[]) => {
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      if (!list[categoryIndex]) return prev;
      list[categoryIndex] = { ...list[categoryIndex], content };
      return list;
    });
  };

  const handleUpdateContentItem = (dept: string, catIdx: number, itemIdx: number, field: 'label' | 'maxpoints', value: string | number) => {
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      const cat = list[catIdx];
      if (!cat?.content) return prev;
      const next = [...cat.content];
      if (!next[itemIdx]) return prev;
      next[itemIdx] = { ...next[itemIdx], [field]: field === 'maxpoints' ? (typeof value === 'number' ? value : parseInt(String(value), 10) || 0) : String(value) };
      list[catIdx] = { ...cat, content: next };
      return list;
    });
  };

  const handleAddContentItem = (dept: string, catIdx: number) => {
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      const cat = list[catIdx];
      if (!cat) return prev;
      const seed = withDefaultCriterionUi({ label: 'New criterion', maxpoints: 10 });
      const content = cat.content ? [...cat.content, seed] : [seed];
      list[catIdx] = { ...cat, content };
      return list;
    });
  };

  const handleRemoveContentItem = (dept: string, catIdx: number, itemIdx: number) => {
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      const cat = list[catIdx];
      if (!cat?.content) return prev;
      const next = cat.content.filter((_, i) => i !== itemIdx);
      list[catIdx] = { ...cat, content: next.length ? next : undefined };
      return list;
    });
  };

  const handleUpdateContentItemBulk = (
    dept: string,
    catIdx: number,
    itemIdx: number,
    next: { label?: string; maxpoints?: number; ui?: any }
  ) => {
    // Update label + maxpoints in one state transition to avoid index/race issues.
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      const cat = list[catIdx];
      if (!cat?.content) return prev;
      const item = cat.content[itemIdx];
      if (!item) return prev;
      const updatedItem = {
        ...item,
        ...(next.label !== undefined ? { label: next.label } : null),
        ...(next.maxpoints !== undefined ? { maxpoints: next.maxpoints } : null),
        ...(next.ui !== undefined ? { ui: next.ui } : null),
      };
      const updatedContent = cat.content.map((c, i) => (i === itemIdx ? updatedItem : c));
      list[catIdx] = { ...cat, content: updatedContent };
      return list;
    });
  };

  const openCriterionEditor = (dept: string, catIdx: number, itemIdx: number) => {
    setGradingCriterionEditor({ dept, catIdx, itemIdx });
    setGradingCriterionExitConfirmOpen(false);
    setCriterionCanvasTest({ check: {}, text: {} });
    setCriterionYieldGradingHover(false);
    cancelCriterionYieldHoverClose();
    const current = gradingEditDraft ?? departmentWeights[dept] ?? [];
    const cat = current[catIdx];
    const item = cat?.content?.[itemIdx];
    const label = String(item?.label ?? '');
    const maxpoints = Number(item?.maxpoints ?? 0) || 0;
    const definition = String((item as any)?.ui?.definition ?? '');
    setGradingCriterionLabelDraft(label);
    setGradingCriterionDefinitionDraft(definition);
    const rawElements = ((item as any)?.ui?.elements ?? []) as any[];
    const mappedElements = rawElements.map((el) => {
      if (!el || typeof el !== 'object') return el;
      if (el.type === 'textboxButton') {
        return {
          type: 'textboxButton',
          title: String(el.title ?? 'Textbox name'),
          value: Number(el.value ?? 0) || 0,
        };
      }
      if (el.type === 'logo') {
        return { type: 'logo', iconKey: String(el.iconKey ?? CATEGORY_ICON_KEYS[0] ?? 'FileText') };
      }
      if (el.type === 'basicGradingSystem') {
        return normalizeBasicGradingSystemFromRaw(el, maxpoints);
      }
      if (el.type === 'checkboxGradingSystem') {
        return normalizeCheckboxGradingSystemFromRaw(el, maxpoints);
      }
      if (el.type === 'checkbox') {
        return { type: 'checkbox', label: String(el.label ?? 'checkbox') };
      }
      return el;
    });
    const hasTextbox = mappedElements.some((e: any) => e?.type === 'textboxButton');
    const hasCheckbox = mappedElements.some((e: any) => e?.type === 'checkbox');
    let base = mappedElements;
    if (!hasTextbox) base = base.filter((e: any) => e?.type !== 'basicGradingSystem');
    if (!hasCheckbox) base = base.filter((e: any) => e?.type !== 'checkboxGradingSystem');
    const hasTextboxGrading = base.some((e: any) => e?.type === 'basicGradingSystem');
    const hasCheckboxGrading = base.some((e: any) => e?.type === 'checkboxGradingSystem');
    let elementsWithMandatoryGrading = base;
    if (hasTextbox && !hasTextboxGrading) {
      elementsWithMandatoryGrading = [
        ...elementsWithMandatoryGrading,
        { type: 'basicGradingSystem' as const, checkpoints: [{ min: 0, max: 0, score: 0 }] },
      ];
    }
    if (hasCheckbox && !hasCheckboxGrading) {
      elementsWithMandatoryGrading = [
        ...elementsWithMandatoryGrading,
        { type: 'checkboxGradingSystem' as const, checkpoints: [{ min: 0, max: 0, score: 0 }] },
      ];
    }
    const derivedMax = maxScoreFromCriterionElementsDraft(elementsWithMandatoryGrading);
    setGradingCriterionElementsDraft(elementsWithMandatoryGrading);
    setGradingCriterionInitialSnapshot({
      label,
      maxpoints: derivedMax,
      elementsJson: JSON.stringify(elementsWithMandatoryGrading),
      definition,
    });
  };

  const closeCriterionEditor = () => {
    setGradingCriterionEditor(null);
    setGradingCriterionLabelDraft('');
    setGradingCriterionDefinitionDraft('');
    setGradingCriterionmaxpointsDraft(0);
    setGradingCriterionElementsDraft([]);
    setGradingCriterionLogoPickerOpenIdx(null);
    setGradingCriterionInitialSnapshot(null);
    setGradingCriterionExitConfirmOpen(false);
    setGradingCriterionGradingSystemPopupOpen(false);
    setGradingGradingSystemPopupMode('textbox');
    setGradingSystemPopupExitConfirmOpen(false);
    setCriterionCanvasTest({ check: {}, text: {} });
    setCriterionYieldGradingHover(false);
    cancelCriterionYieldHoverClose();
  };

  // Panel-rule style arrow press-and-hold (1s delay then accelerate).
  const holdTimeoutRef = useRef<number | null>(null);
  const holdDelayRef = useRef(220);

  const stopHold = () => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    holdDelayRef.current = 220;
  };

  const startHold = (fn: () => void) => {
    stopHold();
    fn(); // one step immediately on press
    holdDelayRef.current = 220;

    const runRepeat = () => {
      fn();
      holdDelayRef.current = Math.max(45, Math.round(holdDelayRef.current * 0.9));
      holdTimeoutRef.current = window.setTimeout(runRepeat, holdDelayRef.current);
    };

    // Start repeating exactly after the 1s hold threshold.
    holdTimeoutRef.current = window.setTimeout(runRepeat, 1000);
  };

  // Safety: stop hold when pointer/touch releases anywhere.
  useEffect(() => {
    window.addEventListener('mouseup', stopHold);
    window.addEventListener('touchend', stopHold);
    window.addEventListener('touchcancel', stopHold);
    window.addEventListener('blur', stopHold);
    return () => {
      window.removeEventListener('mouseup', stopHold);
      window.removeEventListener('touchend', stopHold);
      window.removeEventListener('touchcancel', stopHold);
      window.removeEventListener('blur', stopHold);
    };
  }, []);

  const addCriterionElement = (type: 'logo' | 'checkbox' | 'textboxButton') => {
    setGradingCriterionElementsDraft((prev) => {
      const next = [...prev];
      if (type === 'logo') {
        next.push({ type: 'logo', iconKey: CATEGORY_ICON_KEYS[0] || 'FileText' });
      } else if (type === 'checkbox') {
        next.push({ type: 'checkbox', label: 'checkbox' });
        if (
          !next.some((x: any) => x?.type === 'textboxButton') &&
          !next.some((x: any) => x?.type === 'checkboxGradingSystem')
        ) {
          next.push({ type: 'checkboxGradingSystem', checkpoints: [{ min: 0, max: 0, score: 0 }] });
        }
      } else if (type === 'textboxButton') {
        next.push({ type: 'textboxButton', title: 'Textbox name', value: 0 });
        if (!next.some((x: any) => x?.type === 'basicGradingSystem')) {
          next.push({ type: 'basicGradingSystem', checkpoints: [{ min: 0, max: 0, score: 0 }] });
        }
        const tbCount = next.filter((x: any) => x?.type === 'textboxButton').length;
        if (tbCount >= 2) {
          const bi = next.findIndex((x: any) => x?.type === 'basicGradingSystem');
          if (bi >= 0) {
            const b = next[bi] as BasicGradingSystemElement;
            const base = (b.checkpoints?.length ? b.checkpoints : [{ min: 0, max: 0, score: 0 }]).map((c) => ({ ...c }));
            const perExisting = b.perTextboxCheckpoints;
            const per = Array.from({ length: tbCount }, (_, i) =>
              perExisting?.[i]?.length ? perExisting[i]!.map((c) => ({ ...c })) : base.map((c) => ({ ...c }))
            );
            next[bi] = {
              ...b,
              checkpoints: b.checkpoints?.length ? b.checkpoints : base,
              perTextboxCheckpoints: per,
            };
          }
        }
      }
      return next;
    });
  };

  const removeCriterionElementAt = (idx: number) => {
    setGradingCriterionElementsDraft((prev) => {
      const el = prev[idx];
      if ((el as any)?.type === 'basicGradingSystem') return prev;
      if ((el as any)?.type === 'checkboxGradingSystem') return prev;

      const textboxIndicesBefore = prev
        .map((e, i) => ((e as any)?.type === 'textboxButton' ? i : -1))
        .filter((i) => i >= 0);
      const removedTextboxOrd = textboxIndicesBefore.indexOf(idx);

      let out = prev.filter((_, i) => i !== idx);
      const hasTextbox = out.some((x: any) => x?.type === 'textboxButton');
      const hasCheckbox = out.some((x: any) => x?.type === 'checkbox');

      const basicIdx = out.findIndex((x: any) => x?.type === 'basicGradingSystem');
      if (basicIdx >= 0 && removedTextboxOrd >= 0) {
        const basic = out[basicIdx] as BasicGradingSystemElement;
        const oldPer = basic.perTextboxCheckpoints;
        if (oldPer && oldPer.length > removedTextboxOrd) {
          const newPer = oldPer.filter((_, i) => i !== removedTextboxOrd);
          if (newPer.length <= 1) {
            const sole = newPer[0]?.length ? newPer[0] : basic.checkpoints;
            out = out.map((x, i) =>
              i === basicIdx
                ? ({
                    ...basic,
                    checkpoints: (sole ?? []).map((c) => ({ ...c })),
                    perTextboxCheckpoints: undefined,
                  } as BasicGradingSystemElement)
                : x
            );
          } else {
            out = out.map((x, i) =>
              i === basicIdx
                ? ({
                    ...basic,
                    perTextboxCheckpoints: newPer.map((r) => r.map((c) => ({ ...c }))),
                  } as BasicGradingSystemElement)
                : x
            );
          }
        }
      }

      if (!hasTextbox) {
        out = out.filter((x: any) => x?.type !== 'basicGradingSystem');
      }
      if (!hasCheckbox) {
        out = out.filter((x: any) => x?.type !== 'checkboxGradingSystem');
      }
      return out;
    });
  };

  const handleAddCategory = (dept: string) => {
    setGradingEditDraft(prev => {
      const list = [...(prev || [])];
      const existingLabels = new Set(list.map((c) => String(c.label).trim()).filter(Boolean));

      let n = list.length + 1;
      let label = `New Category ${n}`;
      while (existingLabels.has(label)) {
        n += 1;
        label = `New Category ${n}`;
      }

      // Keep grading content point totals valid by default (100pts),
      // while weight starts at 0 so total weight remains controllable by admin.
      const content = [withDefaultCriterionUi({ label: 'New criterion', maxpoints: 100 })];

      const presetIcon = DEFAULT_CATEGORY_ICONS[dept]?.[list.length] ?? undefined;
      list.push({
        label,
        weightPct: 0,
        icon: presetIcon,
        definition: '',
        content,
      });
      return list;
    });

    // Clear transient raw input states since indexes changed after add.
    setGradingWeightRaw({});
    setGradingContentExpanded(null);
    setGradingIconPickerOpen(null);
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

    setGradingContentExpanded((idx) => {
      if (idx == null) return idx;
      if (idx === categoryIndex) return null;
      if (idx > categoryIndex) return idx - 1;
      return idx;
    });
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
      setGradingContentExpanded(null);
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
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                      isTop3
                        ? `${medalBg[i]} shadow-sm`
                        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    {/* Rank */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-lg ${
                      isTop3 ? medalColors[i] : 'text-slate-300'
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
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide shrink-0 ${
                        diff > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' :
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
                      <div className={`text-2xl font-black tabular-nums ${
                        emp.score >= 90 ? 'text-emerald-600' : emp.score >= 75 ? 'text-blue-600' : 'text-slate-700 dark:text-slate-300'
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
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 text-[10px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-500 px-5 py-3 border-b border-slate-100 dark:border-slate-700">
                  <span>Employee</span>
                  <span className="text-center px-4">Last Month</span>
                  <span className="text-center px-4">This Month</span>
                  <span className="text-center px-4">Change</span>
                </div>
                {rows.map(row => {
                  const diff = row.current != null && row.last != null ? row.current - row.last : null;
                  return (
                    <div key={row.name} className="grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center px-5 py-2 border-b border-slate-50 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
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
                      <div className={`text-center px-4 text-sm font-black tabular-nums flex flex-col items-center gap-0.5 ${
                        row.current != null ? 'text-slate-900 dark:text-slate-100' : 'text-slate-300'
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
                      <div className={`flex items-center justify-center gap-1 px-3 py-1 mx-2 rounded-xl text-[10px] font-black uppercase tracking-wide ${
                        diff == null ? 'text-slate-300' :
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
                  className={`px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-600/20 text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-2 ${
                    dataZipBusy ? 'opacity-70 cursor-not-allowed' : ''
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
                          className={`px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all shadow-sm text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5 ${
                            dataZipBusy || count === 0 ? 'opacity-70 cursor-not-allowed' : ''
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
          className={`group flex items-center justify-between p-5 rounded-lg transition-all border ${baseBg}`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-xs font-black shadow-sm border-2 ${
                isActive
                  ? 'border-blue-700 text-blue-700 dark:text-blue-400'
                  : 'border-red-400 text-red-500'
              }`}
            >
              {userName.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                {userName} - {roleMap[userName]?.role || 'Employee'}
              </p>
              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                USER_ID: {btoa(userName).substring(0, 8).toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-500">
              {isActive ? 'Active' : 'Inactive'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleToggleStatus(userName)}
                disabled={isLastActiveAdmin}
                title={isLastActiveAdmin ? 'At least one admin must remain active' : undefined}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-[0.18em] transition-all min-w-[96px] justify-center ${
                  isLastActiveAdmin
                    ? 'border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-[#0d1526] text-slate-400 dark:text-slate-500 dark:text-slate-500 cursor-not-allowed opacity-70'
                    : isActive
                    ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700'
                    : 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 text-red-700'
                }`}
              >
                <span
                  className={`relative inline-flex items-center w-10 h-5 rounded-full transition-colors ${
                    isActive ? 'bg-emerald-400/80' : 'bg-red-300/80'
                  }`}
                >
                  <span
                    className={`absolute w-4 h-4 rounded-full bg-white dark:bg-slate-800 shadow-sm transition-transform ${
                      isActive ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </span>
                <span>{isActive ? 'On' : 'Off'}</span>
              </button>
              <button
                onClick={() => handleOpenEdit(userName)}
                className="p-2.5 rounded-xl text-slate-300 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                title="Edit user"
              >
                <Settings className="w-4 h-4" />
              </button>
              {activeDept !== 'Admin' && (
                <div className="relative" data-transfer-menu="true">
                  <button
                    onClick={() => setTransferringNode(transferringNode === userName ? null : userName)}
                    className={`p-2.5 rounded-xl transition-all ${
                      transferringNode === userName
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
                className={`px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-wide whitespace-nowrap transition-all duration-300 ease-out transform-gpu ${
                  activeDept === dept
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(180px,1fr)_minmax(0,2.8fr)] gap-6 items-stretch bg-slate-50 dark:bg-slate-900 rounded-lg pt-7 pb-3 px-6 lg:pt-9 lg:pb-4 lg:px-10 shadow-lg border border-slate-200 dark:border-slate-600/70 text-slate-900 dark:text-slate-100 relative overflow-hidden mb-6">
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

          <div className="rounded-[1.75rem] bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-600/70 p-5 lg:p-6 w-full min-w-0 overflow-x-auto">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start" style={{ minWidth: '360px' }}>
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
                {/* Donut + Q1-Q4: flex-shrink-0 wrapper so the whole unit never compresses */}
                <div className={`flex items-center flex-shrink-0 w-max ${railOpen ? 'gap-6' : 'gap-10'}`}>
                  <div className="relative w-36 h-36 flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="rgb(30 64 175 / 0.25)" strokeWidth="10" strokeLinecap="round" />
                      <circle cx="50" cy="50" r="40" fill="none" stroke="rgb(59 130 246)" strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={(2 * Math.PI * 40) * (1 - Math.max(0, Math.min(1, animatedDeptPerfRatio)))}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 dark:text-slate-500">Dept avg</span>
                      <span className="text-2xl font-black text-blue-500">
                        {Math.round(animatedDeptPerfRatio * 100)}%
                      </span>
                    </div>
                  </div>
                  {/* Q1–Q4 bars — thicker/taller when sidebar closed, slim when open */}
                  <div
                    className="flex items-end flex-shrink-0"
                    style={{ height: railOpen ? '120px' : '144px', gap: railOpen ? '6px' : '10px' }}
                  >
                    {['Q1', 'Q2', 'Q3', 'Q4'].map((label, idx) => {
                      const value = deptQuarterScores[idx] || 0;
                      const animatedVal = animatedDeptQuarterScores[idx] ?? 0;
                      const heightPct = Math.min(100, Math.max(0, animatedVal));
                      const barWidth = railOpen ? '14px' : '22px';
                      return (
                        <div key={label} className="flex flex-col items-center justify-end gap-0.5 flex-shrink-0 h-full" style={{ width: barWidth }}>
                          <span className={`font-black text-slate-600 dark:text-slate-400 dark:text-slate-400 tabular-nums text-center leading-none ${railOpen ? 'text-[7px]' : 'text-[8px]'}`}>
                            {Math.round(value)}%
                          </span>
                          <div className="relative flex-1 w-full rounded-sm bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-end">
                            <div
                              className="w-full bg-[#3880F0] transition-none"
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <span className={`font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-400 leading-none ${railOpen ? 'text-[7px]' : 'text-[8px]'}`}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Panel 3/3: Department performance — compact */}
              <div className="flex flex-col justify-start overflow-hidden py-2 lg:py-0">
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

        <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/70 shadow-sm p-6">
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
              <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end">
                <div className="flex bg-slate-100 dark:bg-[#0d1526]/90 p-1.5 rounded-lg border border-slate-200 dark:border-slate-600/60 shadow-inner gap-1">
                  {(['all', 'active', 'inactive'] as const).map(filter => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setRegistryStatusFilter(filter)}
                      className={`min-w-[3.5rem] px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.18em] transition-all ${
                        (registryStatusFilter ?? 'all') === filter
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
                  className="flex items-center gap-2.5 px-5 py-3 rounded-lg bg-blue-600 text-white text-[11px] font-black uppercase tracking-wide shadow-md shadow-blue-600/25 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/30 active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white"
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
                          className={`w-full px-4 py-2.5 text-left text-sm font-bold transition-colors first:pt-3 last:pb-3 ${
                            newEmployeeRole === role
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
                          className={`w-full px-4 py-2.5 text-left text-sm font-bold transition-colors first:pt-3 last:pb-3 ${
                            activeDept === dept
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
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-600/20 text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4 text-white" />
            <span className="text-[10px] font-black uppercase tracking-[0.15em]">EXPORT SYSTEM LOGS</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5 bg-white dark:bg-slate-800/80 rounded-3xl border border-slate-200 dark:border-slate-600 shadow-sm">
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

    // Pending: in pendingTransmissions, supervisor already graded, not yet finalized
    const pendingCandidates = pendingTransmissions.filter((t) => {
      const u = roleMap[t.userName];
      const dept = u?.department || 'Unknown';
      if (dept !== activeDept) return false;
      return t.status !== 'validated' && t.status !== 'rejected' && !!t.supervisorRecommendation;
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
      { key: 'pending' as const,   label: 'Pending',   count: pendingCandidates.length,   color: 'amber'   },
      { key: 'validated' as const, label: 'Validated', count: validatedCandidates.length, color: 'emerald' },
      { key: 'rejected' as const,  label: 'Rejected',  count: rejectedCandidates.length,  color: 'red'     },
    ] as const;

    const emptyMessages = {
      pending:   { icon: <ClipboardCheck className="w-12 h-12 text-slate-300" />, title: 'No pending submissions', desc: 'Once supervisors finish grading, their submissions will show up here for approval or rejection.' },
      validated: { icon: <ClipboardCheck className="w-12 h-12 text-slate-300" />, title: 'No validated submissions yet', desc: 'Approved submissions will appear here.' },
      rejected:  { icon: <ClipboardCheck className="w-12 h-12 text-slate-300" />, title: 'No rejected submissions', desc: 'Submissions returned for revision will appear here.' },
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
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-[10px] font-black text-slate-800 dark:text-slate-200 outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-300 dark:border-blue-600"
              />
            </div>
          </div>

          {/* Status Sub-tabs: Pending / Validated / Rejected */}
          <div className="mt-4 flex gap-2 flex-wrap">
            {statusTabConfig.map(({ key, label, count, color }) => {
              const isActive = validationStatusTab === key;
              const colorMap = {
                amber:   { active: 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300', badge: 'bg-amber-200 text-amber-800', inactive: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900' },
                emerald: { active: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300', badge: 'bg-emerald-200 text-emerald-800', inactive: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900' },
                red:     { active: 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-600 text-red-800 dark:text-red-300', badge: 'bg-red-200 text-red-800', inactive: 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900' },
              } as const;
              const c = colorMap[color];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setValidationStatusTab(key); setValidationSearch(''); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wide transition-all ${isActive ? c.active : `bg-white dark:bg-slate-800 ${c.inactive}`}`}
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
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm p-6">
            <div className="flex flex-col gap-3">
              {filtered
                .slice()
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((t) => {
                  const finalScore = t.ratings?.finalScore != null ? Number(t.ratings.finalScore) : null;

                  return (
                    <div
                      key={t.id}
                      className="group flex items-center justify-between gap-4 p-5 rounded-lg border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 hover:shadow-sm transition-all"
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
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onValidate(t.id, undefined, 'validated');
                              triggerToast('Approved', `Submission finalized and approved.`);
                            }}
                            className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-emerald-700 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onValidate(t.id, undefined, 'rejected');
                              triggerToast('Changes Requested', `Submission returned for revision.`);
                            }}
                            className="px-4 py-3 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-red-700 transition-colors"
                          >
                            Request Changes
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
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-wide shadow-sm transition-colors ${
                  standardSnapshotExists
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
            );})}
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
                          value={tier.points}
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
    <div className="w-full max-w-full xl:max-w-[1600px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 md:px-8 flex flex-col pb-6 md:pb-12 min-h-0 flex-1 overflow-auto">
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
                    className={`mt-3 w-full px-5 py-3 rounded-lg text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${
                      dataZipBusy
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
            <div className="fixed inset-0 z-[5000] bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-300" aria-hidden="true" role="presentation" />
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
                    onClick={() => {
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
                        saveDepartmentWeightsToStorage(next);
                        clearGradingEditSession();
                      }
                      setGradingEditDept(null);
                      setGradingContentExpanded(null);
                      setGradingIconPickerOpen(null);
                      setGradingEditDraft(null);
                    }}
                    className="px-5 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wide shadow-lg shadow-slate-900/25 hover:bg-slate-800 hover:shadow-sm hover:shadow-slate-900/30 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-900 disabled:hover:shadow-lg"
                  >
                    Save changes
                  </button>
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
                        setGradingContentExpanded(null);
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
                              setGradingContentExpanded(null);
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

              {gradingCriterionEditor && (
                <>
                  <div className="fixed inset-0 z-[5200] bg-slate-900/30 backdrop-blur-sm" aria-hidden="true" />
                  <div className="fixed inset-0 z-[5201] flex items-center justify-center p-4">
                    <div
                      className="bg-gradient-to-b from-white to-slate-50/70 rounded-lg w-full max-w-5xl border border-slate-200 dark:border-slate-600/70 shadow-[0_30px_120px_rgba(2,6,23,0.22)] p-6 relative overflow-hidden flex flex-col h-[600px] max-h-[85vh]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-600/60">
                        <div className="flex items-center gap-2">
                          <Edit2 className="w-5 h-5 text-blue-600" />
                          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">Edit grading criterion</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-5 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wide shadow-lg shadow-slate-900/25 hover:bg-slate-800 hover:shadow-sm hover:shadow-slate-900/30 active:scale-[0.98] transition-all duration-200"
                            onClick={() => {
                              const s = gradingCriterionEditor;
                              if (!s) return;
                              handleUpdateContentItemBulk(s.dept, s.catIdx, s.itemIdx, {
                                label: gradingCriterionLabelDraft.trim() || 'New criterion',
                                maxpoints: gradingCriterionmaxpointsDraft,
                                ui: {
                                  elements: gradingCriterionElementsDraft,
                                  definition: gradingCriterionDefinitionDraft.trim(),
                                },
                              });
                              closeCriterionEditor();
                            }}
                          >
                            Save changes
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const snap = gradingCriterionInitialSnapshot;
                              const currentLabel = gradingCriterionLabelDraft.trim();
                              const defTrim = gradingCriterionDefinitionDraft.trim();
                              const current = {
                                label: currentLabel,
                                maxpoints: gradingCriterionmaxpointsDraft,
                                elementsJson: JSON.stringify(gradingCriterionElementsDraft),
                                definition: defTrim,
                              };
                              const hasChanges =
                                !snap ||
                                snap.label !== current.label ||
                                snap.maxpoints !== current.maxpoints ||
                                snap.elementsJson !== current.elementsJson ||
                                snap.definition !== current.definition;
                              if (hasChanges) {
                                setGradingCriterionExitConfirmOpen(true);
                              } else {
                                closeCriterionEditor();
                              }
                            }}
                            className="p-2.5 rounded-xl text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 dark:hover:border-red-700 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600/80 shadow-sm hover:shadow transition-all duration-200"
                            aria-label="Close"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 flex-1 min-h-0 overflow-y-auto pb-4">
                        <div className="flex flex-col space-y-3 min-h-0">
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-600/60 bg-white dark:bg-slate-800/80 shadow-sm">
                            <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mb-3">Criterion definition</p>
                            <div className="space-y-3">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Definition</label>
                                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1 leading-snug">
                                  Shown when employees hover the panel criterion icon.
                                </p>
                                <div className="w-full max-w-full">
                                  <textarea
                                    value={gradingCriterionDefinitionDraft}
                                    onChange={(e) => setGradingCriterionDefinitionDraft(e.target.value)}
                                    className="box-border w-full h-40 max-h-40 min-h-40 resize-none overflow-y-auto bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-3 text-[13px] font-black text-slate-900 dark:text-slate-100 leading-snug outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all"
                                    placeholder="Describe what this criterion measures…"
                                    aria-label="Criterion definition for employee hover"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600/60 shadow-sm">
                            <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mb-2">Element palette</p>
                            <div className="space-y-2">
                              {(() => {
                                const hasPanelCheckbox = gradingCriterionElementsDraft.some((x: any) => x?.type === 'checkbox');
                                const hasPanelTextbox = gradingCriterionElementsDraft.some((x: any) => x?.type === 'textboxButton');
                                return (
                                  <>
                                    <button
                                      type="button"
                                      disabled={hasPanelTextbox}
                                      onClick={() => addCriterionElement('checkbox')}
                                      title={
                                        hasPanelTextbox
                                          ? 'This panel already uses textbox + button. Remove those elements to add checkboxes.'
                                          : 'Add a checkbox row'
                                      }
                                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-wide hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                                    >
                                      <Plus className="w-4 h-4" />
                                      Add checkbox
                                    </button>
                                    <button
                                      type="button"
                                      disabled={hasPanelCheckbox}
                                      onClick={() => addCriterionElement('textboxButton')}
                                      title={
                                        hasPanelCheckbox
                                          ? 'This panel already uses checkboxes. Remove them to add textbox + button.'
                                          : 'Add a textbox with value controls'
                                      }
                                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-wide hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                                    >
                                      <Plus className="w-4 h-4" />
                                      Add textbox + button
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Panel rule canvas</p>
                              <p className="text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-400 mt-0.5">
                                Same layout as employee dashboards (<code className="text-[9px]">auditPanelRule.ts</code>): max 2 inputs
                                per row; odd counts → first full width. Preview-only (not saved).
                              </p>
                            </div>
                            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide shrink-0">
                              {gradingCriterionElementsDraft.length} element(s)
                            </span>
                          </div>

                          {(() => {
                            const elements = gradingCriterionElementsDraft;
                            const logoEntry = elements.map((el, idx) => ({ el, idx })).find((x) => x.el?.type === 'logo') || null;
                            const checkboxEntries = elements
                              .map((el, idx) => ({ el, idx }))
                              .filter((x) => x.el?.type === 'checkbox') as Array<{ el: any; idx: number }>;
                            const checkboxN = checkboxEntries.length;
                            const textboxEntries = elements
                              .map((el, idx) => ({ el, idx }))
                              .filter((x) => x.el?.type === 'textboxButton') as Array<{ el: any; idx: number }>;

                            const n = textboxEntries.length;

                            const YieldCap = Math.max(0, gradingCriterionmaxpointsDraft);
                            const YieldGradingEl = elements.find((x: any) => x?.type === 'basicGradingSystem') as
                              | BasicGradingSystemElement
                              | undefined;
                            const YieldCheckboxGradingEl = elements.find((x: any) => x?.type === 'checkboxGradingSystem') as
                              | CheckboxGradingSystemElement
                              | undefined;
                            const YieldCheckpoints: GradingCheckpoint[] =
                              YieldGradingEl?.checkpoints?.length
                                ? YieldGradingEl.checkpoints
                                : normalizeBasicGradingSystemFromRaw(
                                    YieldGradingEl ?? { type: 'basicGradingSystem' },
                                    YieldCap
                                  ).checkpoints;
                            const YieldCheckboxCheckpoints: GradingCheckpoint[] =
                              YieldCheckboxGradingEl?.checkpoints?.length
                                ? YieldCheckboxGradingEl.checkpoints
                                : normalizeCheckboxGradingSystemFromRaw(
                                    YieldCheckboxGradingEl ?? { type: 'checkboxGradingSystem' },
                                    YieldCap
                                  ).checkpoints;
                            const firstTextboxIdx = textboxEntries[0]?.idx;
                            const firstTextboxRaw =
                              firstTextboxIdx !== undefined ? criterionCanvasTest.text[firstTextboxIdx] : undefined;
                            const firstTextboxNum =
                              firstTextboxRaw === undefined || String(firstTextboxRaw).trim() === ''
                                ? 0
                                : parseFloat(String(firstTextboxRaw));
                            const employeeNumForText = Number.isFinite(firstTextboxNum) ? firstTextboxNum : 0;
                            const checkboxCheckedCount = checkboxEntries.reduce(
                              (acc, { idx: cidx }) => acc + (criterionCanvasTest.check[cidx] ? 1 : 0),
                              0
                            );
                            const scoreGot =
                              n > 1 && YieldGradingEl
                                ? Math.min(
                                    YieldCap,
                                    textboxEntries.reduce((acc, { idx: tbIdx }, ord) => {
                                      const raw = criterionCanvasTest.text[tbIdx];
                                      const num =
                                        raw === undefined || String(raw).trim() === ''
                                          ? 0
                                          : parseFloat(String(raw));
                                      const nVal = Number.isFinite(num) ? num : 0;
                                      const cps = checkpointsForTextboxOrdinal(YieldGradingEl, ord);
                                      const subCap = maxScoreFromCheckpointList(cps);
                                      return acc + scoreFromEmployeeInput(nVal, cps, subCap);
                                    }, 0)
                                  )
                                : n > 0
                                  ? scoreFromEmployeeInput(employeeNumForText, YieldCheckpoints, YieldCap)
                                  : checkboxN > 0
                                    ? scoreFromEmployeeInput(checkboxCheckedCount, YieldCheckboxCheckpoints, YieldCap)
                                    : 0;

                            return (
                              <div className="bg-white dark:bg-slate-800/70 rounded-lg border border-slate-200 dark:border-slate-600/70 p-4 md:p-5 space-y-4 shadow-sm backdrop-blur">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0 relative">
                                      {logoEntry ? (
                      <div className="relative">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setGradingCriterionLogoPickerOpenIdx(
                                                gradingCriterionLogoPickerOpenIdx === logoEntry.idx ? null : logoEntry.idx
                                              )
                                            }
                                            className="w-12 h-12 rounded-lg bg-blue-500/10 border border-slate-200 dark:border-slate-600 flex items-center justify-center shadow-sm hover:bg-blue-500/20 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                                            title="Choose logo icon"
                                          >
                                            {(() => {
                                              const Icon = CATEGORY_ICON_MAP[logoEntry.el.iconKey] as any;
                                              return Icon ? <Icon className="w-6 h-6 text-blue-600" /> : <FileText className="w-6 h-6 text-blue-600" />;
                                            })()}
                                          </button>

                                          {gradingCriterionLogoPickerOpenIdx === logoEntry.idx && (
                                            <div className="absolute top-full left-0 mt-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 z-[5200] box-border shadow-[0_0_12px_rgba(15,23,42,0.08)] w-fit">
                                              <div
                                                className="grid gap-1.5 w-max"
                                                style={{
                                                  gridTemplateRows: 'repeat(4, 28px)',
                                                  gridTemplateColumns: `repeat(${Math.ceil(CATEGORY_ICON_KEYS.length / 4)}, 52px)`,
                                                }}
                                              >
                                                {CATEGORY_ICON_KEYS.map((key) => {
                                                  const Icon = CATEGORY_ICON_MAP[key];
                                                  const selected = String(logoEntry.el.iconKey ?? '') === key;
                                                  return (
                                                    <button
                                                      key={key}
                                                      type="button"
                                                      onClick={() => {
                                                        setGradingCriterionElementsDraft(prev =>
                                                          prev.map((x, j) => (j === logoEntry.idx ? { type: 'logo', iconKey: key } : x))
                                                        );
                                                        setGradingCriterionLogoPickerOpenIdx(null);
                                                      }}
                                                      className={`w-9 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                                        selected
                                                          ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-600'
                                                          : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
                                                      }`}
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
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newIdx = elements.length;
                                            addCriterionElement('logo');
                                            setGradingCriterionLogoPickerOpenIdx(newIdx);
                                          }}
                                          className="w-12 h-12 rounded-lg bg-blue-500/10 border border-slate-200 dark:border-slate-600 flex items-center justify-center shadow-sm hover:bg-blue-500/20 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                                          title="Choose logo icon"
                                        >
                                          <FileText className="w-6 h-6 text-blue-600" />
                                        </button>
                                      )}
                </div>
                                    <div className="flex-1 min-w-[min(100%,24.5rem)]">
                                      <input
                                        type="text"
                                        value={gradingCriterionLabelDraft}
                                        onChange={(e) => setGradingCriterionLabelDraft(e.target.value)}
                                        className="w-full min-w-0 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-4 py-2.5 text-[13px] font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all"
                                        placeholder="Criterion"
                                        aria-label="Criterion name"
                                      />
            </div>
          </div>

                                  {n > 0 ? (
                                    <div
                                      className="relative shrink-0"
                                      onMouseEnter={() => {
                                        cancelCriterionYieldHoverClose();
                                        setCriterionYieldGradingHover(true);
                                      }}
                                      onMouseLeave={scheduleCriterionYieldHoverClose}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setGradingGradingSystemPopupMode('textbox');
                                          setGradingCriterionElementsDraft((prev) => {
                                            if (prev.some((x: any) => x?.type === 'basicGradingSystem')) return prev;
                                            return [
                                              ...prev,
                                              {
                                                type: 'basicGradingSystem',
                                                checkpoints: [{ min: 0, max: 0, score: 0 }],
                                              },
                                            ];
                                          });
                                          setGradingCriterionGradingSystemPopupOpen(true);
                                        }}
                                        className="text-right rounded-xl px-3 py-2 -mr-1 -my-1 border border-transparent hover:border-blue-100 dark:hover:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/30/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                        title="Click to edit checkpoints for the textbox value. Hover to view rules. Yield uses local tester input (not saved)."
                                        aria-label="Open grading system for Yield score"
                                      >
                                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Yield</p>
                                        <p className="text-[11px] font-black text-blue-600 tabular-nums">
                                          {scoreGot}/{YieldCap}
                                        </p>
                                      </button>
                                      {criterionYieldGradingHover && (
                                        <div
                                          className="absolute right-0 top-full z-[5260] mt-1.5 w-64 max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-left shadow-[0_12px_40px_rgba(15,23,42,0.12)]"
                                          onMouseEnter={() => {
                                            cancelCriterionYieldHoverClose();
                                            setCriterionYieldGradingHover(true);
                                          }}
                                          onMouseLeave={scheduleCriterionYieldHoverClose}
                                          role="tooltip"
                                        >
                                          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-2">
                                            Grading checkpoints
                                          </p>
                                          {n > 1 && YieldGradingEl ? (
                                            <div className="space-y-3 max-h-56 overflow-y-auto pr-0.5">
                                              {textboxEntries.map(({ el: tbEl, idx: tbIdx }, ord) => {
                                                const cps = checkpointsForTextboxOrdinal(YieldGradingEl, ord);
                                                return (
                                                  <div key={tbIdx}>
                                                    <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400 mb-1 truncate">
                                                      {String(tbEl.title ?? 'Textbox')}
                                                    </p>
                                                    <ul className="space-y-1.5">
                                                      {cps.map((c, i) => (
                                                        <li
                                                          key={i}
                                                          className="flex items-start justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-300"
                                                        >
                                                          <span className="text-slate-500 dark:text-slate-400 dark:text-slate-400 shrink min-w-0">
                                                            {c.max === null ? `≥ ${c.min}` : `${c.min} – ${c.max}`}
                                                          </span>
                                                          <span className="font-black text-blue-600 tabular-nums shrink-0">
                                                            {c.score} pts
                                                          </span>
                                                        </li>
                                                      ))}
                                                    </ul>
            </div>
                                                );
                                              })}
          </div>
                                          ) : (
                                            <ul className="space-y-1.5">
                                              {YieldCheckpoints.map((c, i) => (
                                                <li
                                                  key={i}
                                                  className="flex items-start justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-300"
                                                >
                                                  <span className="text-slate-500 dark:text-slate-400 dark:text-slate-400 shrink min-w-0">
                                                    {c.max === null ? `≥ ${c.min}` : `${c.min} – ${c.max}`}
                                                  </span>
                                                  <span className="font-black text-blue-600 tabular-nums shrink-0">{c.score} pts</span>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
        </div>
                                      )}
      </div>
                                  ) : checkboxN > 0 ? (
                                    <div
                                      className="relative shrink-0"
                                      onMouseEnter={() => {
                                        cancelCriterionYieldHoverClose();
                                        setCriterionYieldGradingHover(true);
                                      }}
                                      onMouseLeave={scheduleCriterionYieldHoverClose}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setGradingGradingSystemPopupMode('checkbox');
                                          setGradingCriterionElementsDraft((prev) => {
                                            if (prev.some((x: any) => x?.type === 'checkboxGradingSystem')) return prev;
                                            return [
                                              ...prev,
                                              {
                                                type: 'checkboxGradingSystem',
                                                checkpoints: [{ min: 0, max: 0, score: 0 }],
                                              },
                                            ];
                                          });
                                          setGradingCriterionGradingSystemPopupOpen(true);
                                        }}
                                        className="text-right rounded-xl px-3 py-2 -mr-1 -my-1 border border-transparent hover:border-blue-100 dark:hover:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/30/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                        title="Click to edit checkpoints by how many boxes are checked (0–N). Hover to view rules. Yield uses local tester state (not saved)."
                                        aria-label="Open checklist count grading for Yield score"
                                      >
                                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">Yield</p>
                                        <p className="text-[11px] font-black text-blue-600 tabular-nums">
                                          {scoreGot}/{YieldCap}
                                        </p>
                                      </button>
                                      {criterionYieldGradingHover && (
                                        <div
                                          className="absolute right-0 top-full z-[5260] mt-1.5 w-64 max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-left shadow-[0_12px_40px_rgba(15,23,42,0.12)]"
                                          onMouseEnter={() => {
                                            cancelCriterionYieldHoverClose();
                                            setCriterionYieldGradingHover(true);
                                          }}
                                          onMouseLeave={scheduleCriterionYieldHoverClose}
                                          role="tooltip"
                                        >
                                          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-2">
                                            Checklist count → points
                                          </p>
                                          <p className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400 mb-2 leading-snug">
                                            Min / Max = number of checkboxes selected (this panel has {checkboxN}).
                                          </p>
                                          <ul className="space-y-1.5">
                                            {YieldCheckboxCheckpoints.map((c, i) => (
                                              <li
                                                key={i}
                                                className="flex items-start justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-300"
                                              >
                                                <span className="text-slate-500 dark:text-slate-400 dark:text-slate-400 shrink min-w-0">
                                                  {c.max === null ? `≥ ${c.min} checked` : `${c.min} – ${c.max} checked`}
                                                </span>
                                                <span className="font-black text-blue-600 tabular-nums shrink-0">{c.score} pts</span>
                                              </li>
                                            ))}
                                          </ul>
    </div>
                                      )}
                                    </div>
                                  ) : null}
        </div>

                              <div className={AUDIT_PANEL_CRITERION_BODY_CLASS}>
                              {checkboxN > 0 ? (
                                <div className={AUDIT_PANEL_INPUT_GRID_CLASS}>
                                  {checkboxEntries.map(({ el, idx }, pos) => {
                                    const colSpan = auditPanelInputColSpan(pos, checkboxN);
                                    return (
                                      <div
                                        key={idx}
                                        className={`bg-white dark:bg-slate-800 rounded-[1.75rem] border border-slate-200 dark:border-slate-600/80 p-4 space-y-3 ${colSpan} shadow-sm hover:shadow-md transition-shadow`}
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-3 min-w-0">
                                            <input
                                              type="checkbox"
                                              checked={!!criterionCanvasTest.check[idx]}
                                              onChange={(e) => {
                                                const checked = e.target.checked;
                                                setCriterionCanvasTest((prev) => ({
                                                  ...prev,
                                                  check: { ...prev.check, [idx]: checked },
                                                }));
                                              }}
                                              className="w-5 h-5 accent-blue-600"
                                              aria-label="Checkbox (local tester — not saved)"
                                            />
                                            <input
                                              type="text"
                                              value={String(el.label ?? 'checkbox')}
                                              onChange={(e) => {
                                                const label = e.target.value;
                                                setGradingCriterionElementsDraft(prev =>
                                                  prev.map((x, j) => (j === idx ? { ...(x as any), type: 'checkbox', label } : x))
                                                );
                                              }}
                                              className="min-w-0 flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-[12px] font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                                            />
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => removeCriterionElementAt(idx)}
                                            className="p-2 rounded-xl text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                            aria-label="Remove checkbox element"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
      </div>
    </div>
  );
                                  })}
                                </div>
                              ) : null}

                                <div className={AUDIT_PANEL_INPUT_GRID_CLASS}>
                                  {textboxEntries.length === 0 ? null : (
                                    textboxEntries.map(({ el, idx }, pos) => {
                                      const colSpan = auditPanelInputColSpan(pos, n);
  return (
                                        <div key={idx} className={`bg-white dark:bg-slate-800 rounded-[1.75rem] border border-slate-200 dark:border-slate-600/80 p-4 space-y-3 ${colSpan} shadow-sm hover:shadow-md transition-shadow`}>
                                          <div className="flex items-center justify-between gap-3">
                                            <input
                                              type="text"
                                              value={String(el.title ?? 'Textbox name')}
                                              onChange={(e) => {
                                                const title = e.target.value;
                                                setGradingCriterionElementsDraft(prev =>
                                                  prev.map((x, j) => (j === idx ? { ...(x as any), type: 'textboxButton', title } : x))
                                                );
                                              }}
                                              className="min-w-0 flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-left text-[12px] font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                                            />

                                            <button
                                              type="button"
                                              onClick={() => removeCriterionElementAt(idx)}
                                              className="p-2 rounded-xl text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                              aria-label="Remove textbox element"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>

                                          {/* Panel rule: [textbox][←][→] */}
                                          <div className="flex w-full items-center gap-2">
                                            <input
                                              type="text"
                                              inputMode="numeric"
                                              value={criterionCanvasTest.text[idx] ?? ''}
                                              placeholder="0"
                                              onChange={(e) => {
                                                const digits = e.target.value.replace(/[^\d]/g, '');
                                                setCriterionCanvasTest((prev) => ({
                                                  ...prev,
                                                  text: { ...prev.text, [idx]: digits },
                                                }));
                                              }}
                                              className={`min-w-0 flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-3 text-center text-[12px] font-black outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400 dark:text-slate-500 dark:text-slate-500 ${
                                                (criterionCanvasTest.text[idx] ?? '').trim() === ''
                                                  ? 'text-slate-400 dark:text-slate-500 dark:text-slate-500'
                                                  : 'text-slate-900 dark:text-slate-100'
                                              }`}
                                              title="Local tester value — not saved with the criterion"
                                            />

                                            <div className="flex items-center gap-1 shrink-0">
                                              <button
                                                type="button"
                                                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#0d1526] flex items-center justify-center text-slate-500 dark:text-slate-400 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors select-none"
                                                onMouseDown={() => startHold(() => bumpCriterionCanvasTestTextbox(idx, -1))}
                                                onMouseUp={stopHold}
                                                onMouseLeave={stopHold}
                                                onTouchStart={() => startHold(() => bumpCriterionCanvasTestTextbox(idx, -1))}
                                                onTouchEnd={stopHold}
                                                onTouchCancel={stopHold}
                                                onBlur={stopHold}
                                                aria-label="Previous"
                                                title="Hold to decrement (accelerates)"
                                              >
                                                <ChevronLeft className="w-4 h-4" />
                                              </button>

                                              <button
                                                type="button"
                                                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#0d1526] flex items-center justify-center text-slate-500 dark:text-slate-400 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors select-none"
                                                onMouseDown={() => startHold(() => bumpCriterionCanvasTestTextbox(idx, +1))}
                                                onMouseUp={stopHold}
                                                onMouseLeave={stopHold}
                                                onTouchStart={() => startHold(() => bumpCriterionCanvasTestTextbox(idx, +1))}
                                                onTouchEnd={stopHold}
                                                onTouchCancel={stopHold}
                                                onBlur={stopHold}
                                                aria-label="Continue"
                                                title="Hold to increment (accelerates)"
                                              >
                                                <ChevronRight className="w-4 h-4" />
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>

                                {/* Basic grading system: edit via Yield popup (see portal below). */}

                                {/* Logo icon selection moved to the panel header (top-left). */}
                              </div>
                            );
                          })()}

                        </div>
                      </div>
                    </div>
                  </div>
                  {gradingCriterionExitConfirmOpen &&
                    createPortal(
                      <div
                        className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/20"
                        onClick={() => setGradingCriterionExitConfirmOpen(false)}
                      >
                        <div
                          className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-5 shadow-sm shadow-slate-900/10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                            Exit without saving? Your changes will not be saved.
                          </p>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setGradingCriterionExitConfirmOpen(false)}
                              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wide hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                closeCriterionEditor();
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
                  {gradingCriterionGradingSystemPopupOpen &&
                    ((gradingGradingSystemPopupMode === 'textbox' &&
                      gradingCriterionElementsDraft.some((x: any) => x?.type === 'textboxButton')) ||
                      (gradingGradingSystemPopupMode === 'checkbox' &&
                        gradingCriterionElementsDraft.some((x: any) => x?.type === 'checkbox'))) &&
                    createPortal(
                      <div
                        className="fixed inset-0 z-[5300] flex items-center justify-center p-4 bg-slate-900/25 backdrop-blur-[2px]"
                        role="presentation"
                        aria-modal="true"
                      >
                        <div
                          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[1.75rem] border border-slate-200 dark:border-slate-600/80 bg-white dark:bg-slate-800 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
                          onClick={(e) => e.stopPropagation()}
                          role="dialog"
                          aria-labelledby="grading-system-popup-title"
                        >
                          {(() => {
                            const mode = gradingGradingSystemPopupMode;
                            const gradingIdx = getCriterionGradingSystemIdx(gradingCriterionElementsDraft, mode);
                            if (gradingIdx < 0) {
                              return (
                                <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-400">
                                  {mode === 'checkbox'
                                    ? 'Add checklist rows to this panel to configure count-based checkpoints, or close and try again.'
                                    : 'Add a textbox + button to this panel to configure range checkpoints, or close and try again.'}
                                </p>
                              );
                            }
                            const el = gradingCriterionElementsDraft[gradingIdx] as
                              | BasicGradingSystemElement
                              | CheckboxGradingSystemElement;
                            const capForNormalize = Math.max(
                              0,
                              maxScoreFromCriterionElementsDraft(gradingCriterionElementsDraft)
                            );
                            const textboxCountForPopup = gradingCriterionElementsDraft.filter((x: any) => x?.type === 'textboxButton').length;
                            const multiTextboxGrading =
                              mode === 'textbox' && el.type === 'basicGradingSystem' && textboxCountForPopup > 1;
                            const textboxSectionTitles = gradingCriterionElementsDraft
                              .filter((x: any) => x?.type === 'textboxButton')
                              .map((x: any) => String(x.title ?? 'Textbox'));
                            const checkpoints: GradingCheckpoint[] = multiTextboxGrading
                              ? []
                              : el.checkpoints?.length > 0
                                ? el.checkpoints
                                : mode === 'checkbox'
                                  ? normalizeCheckboxGradingSystemFromRaw(el, capForNormalize).checkpoints
                                  : normalizeBasicGradingSystemFromRaw(el as BasicGradingSystemElement, capForNormalize).checkpoints;
                            const patchCheckpoints = (nextCps: GradingCheckpoint[]) => {
                              let enforced = enforceGradingCheckpointNoMaxRule(nextCps);
                              if (mode === 'checkbox') {
                                enforced = enforceCheckboxGradingFiniteMax(enforced);
                              }
                              setGradingCriterionElementsDraft((prev) =>
                                prev.map((x, j) => {
                                  if (j !== gradingIdx) return x;
                                  if (mode === 'checkbox' && (x as any).type === 'checkboxGradingSystem') {
                                    return { type: 'checkboxGradingSystem' as const, checkpoints: enforced };
                                  }
                                  if (mode === 'textbox' && (x as any).type === 'basicGradingSystem') {
                                    const bx = x as BasicGradingSystemElement;
                                    return {
                                      ...bx,
                                      checkpoints: enforced,
                                      perTextboxCheckpoints: undefined,
                                    };
                                  }
                                  return x;
                                })
                              );
                            };
                            const patchOrdinalCheckpoints = (ord: number, nextCps: GradingCheckpoint[]) => {
                              const enforced = enforceGradingCheckpointNoMaxRule(nextCps);
                              setGradingCriterionElementsDraft((prev) => {
                                const gi = getCriterionGradingSystemIdx(prev, mode);
                                if (gi < 0) return prev;
                                const b = prev[gi] as BasicGradingSystemElement;
                                const tbCount = prev.filter((x: any) => x?.type === 'textboxButton').length;
                                const base = (b.checkpoints?.length ? b.checkpoints : [{ min: 0, max: 0, score: 0 }]).map((c) => ({
                                  ...c,
                                }));
                                const per = Array.from({ length: tbCount }, (_, t) =>
                                  b.perTextboxCheckpoints?.[t]?.length
                                    ? b.perTextboxCheckpoints[t]!.map((c) => ({ ...c }))
                                    : base.map((c) => ({ ...c }))
                                );
                                per[ord] = enforced;
                                return prev.map((x, j) =>
                                  j === gi && (x as any).type === 'basicGradingSystem'
                                    ? {
                                        ...b,
                                        perTextboxCheckpoints: per,
                                        checkpoints: per[0] ?? enforced,
                                      }
                                    : x
                                );
                              });
                            };
                            const sanitizeCheckpointRows = (rows: GradingCheckpoint[]) =>
                              rows.map((c) => {
                                let min = Number.isFinite(Number(c.min)) ? Number(c.min) : 0;
                                const score = Math.max(0, Math.min(1000, Number(c.score) || 0));
                                let max: number | null = c.max;
                                if (max !== null && max !== undefined && String(max).trim() !== '') {
                                  max = Number(max);
                                  if (!Number.isFinite(max)) max = min;
                                  if (max < min) max = min;
                                } else {
                                  max = mode === 'checkbox' ? min : null;
                                }
                                return { min, max, score };
                              });
                            const checkboxCountForPreview = gradingCriterionElementsDraft.filter((x: any) => x?.type === 'checkbox').length;
                            const allowedNoMaxRowIdx =
                              mode === 'checkbox' || multiTextboxGrading
                                ? null
                                : resolveGradingNoMaxAllowedRowIndex(checkpoints);
                            const updateRow = (rowIdx: number, patch: Partial<GradingCheckpoint>) => {
                              const next = checkpoints.map((c, i) => (i === rowIdx ? { ...c, ...patch } : c));
                              const fixed = sanitizeCheckpointRows(next);
                              patchCheckpoints(enforceGradingCheckpointNoMaxRule(fixed));
                            };
                            return (
                              <>
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div>
                                    <p
                                      id="grading-system-popup-title"
                                      className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide"
                                    >
                                      Basic grading system
                                    </p>
                                    <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">Scoring checkpoints</p>
                                    {mode === 'checkbox' && (
                                      <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 mt-1 max-w-md leading-relaxed">
                                        Min / Max = inclusive count of checkboxes selected (this criterion has {checkboxCountForPreview}{' '}
                                        checklist row{checkboxCountForPreview === 1 ? '' : 's'}).
                                      </p>
                                    )}
                                    {mode === 'textbox' && multiTextboxGrading && (
                                      <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 mt-1 max-w-md leading-relaxed">
                                        Each section matches one textbox (canvas order). Points per section add together, capped at the criterion total (
                                        {capForNormalize} pts).
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => requestCloseGradingSystemPopup()}
                                    className="p-2.5 rounded-xl text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 dark:hover:border-red-700 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600/80 shadow-sm hover:shadow transition-all duration-200 shrink-0"
                                    aria-label="Close"
                                  >
                                    <X className="w-5 h-5" />
                                  </button>
                                </div>

                                {multiTextboxGrading ? (
                                  <div className="space-y-8 mb-4">
                                    {Array.from({ length: textboxCountForPopup }, (_, ord) => {
                                      const sectionCps = checkpointsForTextboxOrdinal(el as BasicGradingSystemElement, ord);
                                      const cps =
                                        sectionCps.length > 0
                                          ? sectionCps
                                          : [{ min: 0, max: 0, score: 0 }];
                                      const dk = (row: number) => `${ord}-${row}`;
                                      const allowedOrd = resolveGradingNoMaxAllowedRowIndex(cps);
                                      const updateRowOrd = (rowIdx: number, patch: Partial<GradingCheckpoint>) => {
                                        const next = cps.map((c, i) => (i === rowIdx ? { ...c, ...patch } : c));
                                        const fixed = sanitizeCheckpointRows(next);
                                        patchOrdinalCheckpoints(ord, enforceGradingCheckpointNoMaxRule(fixed));
                                      };
                                      return (
                                        <div key={ord} className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 space-y-3">
                                          <p className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                                            {textboxSectionTitles[ord] ?? `Textbox ${ord + 1}`}
                                          </p>
                                          <div className="hidden sm:grid gap-2 text-[9px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide px-1 mb-1 sm:grid-cols-12">
                                            <span className="sm:col-span-2">Min</span>
                                            <span className="sm:col-span-3">Max</span>
                                            <span className="sm:col-span-2">Score (Yield)</span>
                                            <span className="sm:col-span-3 text-center">No max</span>
                                            <span className="sm:col-span-2">Remove</span>
                                          </div>
                                          <div className="space-y-3">
                                            {cps.map((cp, rowIdx) => (
                                              <div
                                                key={rowIdx}
                                                className="grid grid-cols-1 gap-2 items-end rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-[#0b1222]/50 p-3 sm:grid-cols-12"
                                              >
                                                <div className="space-y-1 sm:col-span-2">
                                                  <label className="sm:hidden text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                                                    Min value
                                                  </label>
                                                  <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={cp.min}
                                                    onChange={(e) => {
                                                      const raw = parseFloat(e.target.value);
                                                      updateRowOrd(rowIdx, { min: Number.isFinite(raw) ? raw : 0 });
                                                      setGradingCheckpointMaxDraft((prev) => {
                                                        const next = { ...prev };
                                                        delete next[dk(rowIdx)];
                                                        return next;
                                                      });
                                                    }}
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                                                  />
                                                </div>
                                                <div className="sm:col-span-3 space-y-1">
                                                  <label className="sm:hidden text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                                                    Max value
                                                  </label>
                                                  <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    disabled={cp.max === null}
                                                    value={
                                                      cp.max === null
                                                        ? ''
                                                        : gradingCheckpointMaxDraft[dk(rowIdx)] !== undefined
                                                          ? gradingCheckpointMaxDraft[dk(rowIdx)]
                                                          : String(cp.max ?? cp.min)
                                                    }
                                                    onChange={(e) => {
                                                      const s = e.target.value;
                                                      setGradingCheckpointMaxDraft((prev) => ({ ...prev, [dk(rowIdx)]: s }));
                                                      const v = s.trim();
                                                      if (v === '') return;
                                                      const raw = parseFloat(v);
                                                      if (Number.isFinite(raw)) {
                                                        updateRowOrd(rowIdx, { max: raw });
                                                      }
                                                    }}
                                                    onBlur={(e) => {
                                                      if (cp.max === null) return;
                                                      const v = e.target.value.trim();
                                                      if (v === '') {
                                                        updateRowOrd(rowIdx, { max: cp.min });
                                                      } else {
                                                        const raw = parseFloat(v);
                                                        updateRowOrd(rowIdx, {
                                                          max: Number.isFinite(raw) ? raw : cp.min,
                                                        });
                                                      }
                                                      setGradingCheckpointMaxDraft((prev) => {
                                                        const next = { ...prev };
                                                        delete next[dk(rowIdx)];
                                                        return next;
                                                      });
                                                    }}
                                                    placeholder={cp.max === null ? '∞' : '0'}
                                                    className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-black outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 disabled:bg-slate-100 dark:bg-[#0d1526] ${
                                                      cp.max === null
                                                        ? 'text-slate-900 dark:text-slate-100'
                                                        : 'text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:text-slate-500 dark:text-slate-500'
                                                    }`}
                                                  />
                                                </div>
                                                <div className="sm:col-span-2 space-y-1">
                                                  <label className="sm:hidden text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                                                    Score
                                                  </label>
                                                  <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    min={0}
                                                    max={1000}
                                                    value={cp.score}
                                                    onChange={(e) => {
                                                      const raw = parseInt(e.target.value || '0', 10) || 0;
                                                      const clamped = Math.min(1000, Math.max(0, raw));
                                                      updateRowOrd(rowIdx, { score: clamped });
                                                    }}
                                                    title="Max points from this textbox’s tiers (sums with other textboxes, capped at criterion total)."
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                                                  />
                                                </div>
                                                <div className="sm:col-span-3 flex items-center justify-center sm:justify-start gap-2 pb-1 sm:pb-2">
                                                  <input
                                                    id={`grading-no-max-${ord}-${rowIdx}`}
                                                    type="checkbox"
                                                    checked={cp.max === null}
                                                    disabled={allowedOrd !== rowIdx}
                                                    onChange={(e) => {
                                                      if (allowedOrd !== rowIdx) return;
                                                      const noMax = e.target.checked;
                                                      setGradingCheckpointMaxDraft((prev) => {
                                                        const next = { ...prev };
                                                        delete next[dk(rowIdx)];
                                                        return next;
                                                      });
                                                      updateRowOrd(rowIdx, {
                                                        max: noMax ? null : cp.min,
                                                      });
                                                    }}
                                                    className="w-4 h-4 accent-blue-600 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                                                  />
                                                  <label
                                                    htmlFor={`grading-no-max-${ord}-${rowIdx}`}
                                                    className={`text-[10px] font-black uppercase tracking-wide ${
                                                      allowedOrd === rowIdx
                                                        ? 'text-slate-500 dark:text-slate-400 dark:text-slate-400 cursor-pointer'
                                                        : 'text-slate-300 cursor-not-allowed'
                                                    }`}
                                                    title={
                                                      allowedOrd === rowIdx
                                                        ? cps.length <= 1
                                                          ? 'Open-ended range for this single tier'
                                                          : 'Open-ended range for the top tier only'
                                                        : 'Only this tier may have no upper limit (unique highest min when multiple tiers exist)'
                                                    }
                                                  >
                                                    No max (∞)
                                                  </label>
                                                </div>
                                                <div className="sm:col-span-2 flex justify-end">
                                                  <button
                                                    type="button"
                                                    disabled={cps.length <= 1}
                                                    onClick={() => {
                                                      setGradingCheckpointMaxDraft({});
                                                      patchOrdinalCheckpoints(
                                                        ord,
                                                        cps.filter((_, i) => i !== rowIdx)
                                                      );
                                                    }}
                                                    className="p-2 rounded-xl text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                                    aria-label="Remove checkpoint"
                                                  >
                                                    <Trash2 className="w-4 h-4" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setGradingCheckpointMaxDraft({});
                                              const last = cps[cps.length - 1];
                                              const nextMin =
                                                last && last.max != null && Number.isFinite(last.max)
                                                  ? last.max + 1
                                                  : last
                                                    ? last.min + 1
                                                    : 0;
                                              patchOrdinalCheckpoints(ord, [
                                                ...cps,
                                                {
                                                  min: nextMin,
                                                  max: null,
                                                  score: 0,
                                                },
                                              ]);
                                            }}
                                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-wide hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                          >
                                            <Plus className="w-4 h-4" />
                                            Add checkpoint
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <>
                                    <div
                                      className={`hidden sm:grid gap-2 text-[9px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide px-1 mb-1 ${
                                        mode === 'checkbox' ? 'sm:grid-cols-10' : 'sm:grid-cols-12'
                                      }`}
                                    >
                                      <span className={mode === 'checkbox' ? 'sm:col-span-3' : 'sm:col-span-2'}>
                                        {mode === 'checkbox' ? 'Min (checked)' : 'Min'}
                                      </span>
                                      <span className="sm:col-span-3">{mode === 'checkbox' ? 'Max (checked)' : 'Max'}</span>
                                      <span className={mode === 'checkbox' ? 'sm:col-span-2' : 'sm:col-span-2'}>Score (Yield)</span>
                                      {mode !== 'checkbox' && (
                                        <span className="sm:col-span-3 text-center">No max</span>
                                      )}
                                      <span className={mode === 'checkbox' ? 'sm:col-span-2' : 'sm:col-span-2'}>Remove</span>
                                    </div>

                                    <div className="space-y-3 mb-4">
                                      {checkpoints.map((cp, rowIdx) => {
                                        const rowKey = String(rowIdx);
                                        return (
                                          <div
                                            key={rowIdx}
                                            className={`grid grid-cols-1 gap-2 items-end rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-[#0b1222]/50 p-3 ${
                                              mode === 'checkbox' ? 'sm:grid-cols-10' : 'sm:grid-cols-12'
                                            }`}
                                          >
                                            <div className={`space-y-1 ${mode === 'checkbox' ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
                                              <label className="sm:hidden text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                                                {mode === 'checkbox' ? 'Min checked' : 'Min value'}
                                              </label>
                                              <input
                                                type="number"
                                                inputMode={mode === 'checkbox' ? 'numeric' : 'decimal'}
                                                value={cp.min}
                                                onChange={(e) => {
                                                  const raw = parseFloat(e.target.value);
                                                  updateRow(rowIdx, { min: Number.isFinite(raw) ? raw : 0 });
                                                  setGradingCheckpointMaxDraft((prev) => {
                                                    const next = { ...prev };
                                                    delete next[rowKey];
                                                    return next;
                                                  });
                                                }}
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                                              />
                                            </div>
                                            <div className="sm:col-span-3 space-y-1">
                                              <label className="sm:hidden text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                                                {mode === 'checkbox' ? 'Max checked' : 'Max value'}
                                              </label>
                                              <input
                                                type="text"
                                                inputMode={mode === 'checkbox' ? 'numeric' : 'decimal'}
                                                disabled={mode !== 'checkbox' && cp.max === null}
                                                value={
                                                  cp.max === null && mode !== 'checkbox'
                                                    ? ''
                                                    : gradingCheckpointMaxDraft[rowKey] !== undefined
                                                      ? gradingCheckpointMaxDraft[rowKey]
                                                      : String(cp.max ?? cp.min)
                                                }
                                                onChange={(e) => {
                                                  const s = e.target.value;
                                                  setGradingCheckpointMaxDraft((prev) => ({ ...prev, [rowKey]: s }));
                                                  const v = s.trim();
                                                  if (v === '') return;
                                                  const raw = parseFloat(v);
                                                  if (Number.isFinite(raw)) {
                                                    updateRow(rowIdx, { max: raw });
                                                  }
                                                }}
                                                onBlur={(e) => {
                                                  if (mode !== 'checkbox' && cp.max === null) return;
                                                  const v = e.target.value.trim();
                                                  if (v === '') {
                                                    updateRow(rowIdx, { max: cp.min });
                                                  } else {
                                                    const raw = parseFloat(v);
                                                    updateRow(rowIdx, {
                                                      max: Number.isFinite(raw) ? raw : cp.min,
                                                    });
                                                  }
                                                  setGradingCheckpointMaxDraft((prev) => {
                                                    const next = { ...prev };
                                                    delete next[rowKey];
                                                    return next;
                                                  });
                                                }}
                                                placeholder={mode !== 'checkbox' && cp.max === null ? '∞' : '0'}
                                                className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-black outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 disabled:bg-slate-100 dark:bg-[#0d1526] ${
                                                  mode !== 'checkbox' && cp.max === null
                                                    ? 'text-slate-900 dark:text-slate-100'
                                                    : 'text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:text-slate-500 dark:text-slate-500'
                                                }`}
                                              />
                                            </div>
                                            <div className="sm:col-span-2 space-y-1">
                                              <label className="sm:hidden text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                                                Score
                                              </label>
                                              <input
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                max={1000}
                                                value={cp.score}
                                                onChange={(e) => {
                                                  const raw = parseInt(e.target.value || '0', 10) || 0;
                                                  const clamped = Math.min(1000, Math.max(0, raw));
                                                  updateRow(rowIdx, { score: clamped });
                                                }}
                                                title="Highest score among all rows becomes the criterion max yield (Yield)."
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                                              />
                                            </div>
                                            {mode !== 'checkbox' && (
                                              <div className="sm:col-span-3 flex items-center justify-center sm:justify-start gap-2 pb-1 sm:pb-2">
                                                <input
                                                  id={`grading-no-max-${rowIdx}`}
                                                  type="checkbox"
                                                  checked={cp.max === null}
                                                  disabled={allowedNoMaxRowIdx !== rowIdx}
                                                  onChange={(e) => {
                                                    if (allowedNoMaxRowIdx !== rowIdx) return;
                                                    const noMax = e.target.checked;
                                                    setGradingCheckpointMaxDraft((prev) => {
                                                      const next = { ...prev };
                                                      delete next[rowKey];
                                                      return next;
                                                    });
                                                    updateRow(rowIdx, {
                                                      max: noMax ? null : cp.min,
                                                    });
                                                  }}
                                                  className="w-4 h-4 accent-blue-600 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                                                />
                                                <label
                                                  htmlFor={`grading-no-max-${rowIdx}`}
                                                  className={`text-[10px] font-black uppercase tracking-wide ${
                                                    allowedNoMaxRowIdx === rowIdx
                                                      ? 'text-slate-500 dark:text-slate-400 dark:text-slate-400 cursor-pointer'
                                                      : 'text-slate-300 cursor-not-allowed'
                                                  }`}
                                                  title={
                                                    allowedNoMaxRowIdx === rowIdx
                                                      ? checkpoints.length <= 1
                                                        ? 'Open-ended range for this single tier'
                                                        : 'Open-ended range for the top tier only'
                                                      : 'Only this tier may have no upper limit (unique highest min when multiple tiers exist)'
                                                  }
                                                >
                                                  No max (∞)
                                                </label>
                                              </div>
                                            )}
                                            <div className="sm:col-span-2 flex justify-end">
                                              <button
                                                type="button"
                                                disabled={checkpoints.length <= 1}
                                                onClick={() => {
                                                  setGradingCheckpointMaxDraft({});
                                                  patchCheckpoints(checkpoints.filter((_, i) => i !== rowIdx));
                                                }}
                                                className="p-2 rounded-xl text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                                aria-label="Remove checkpoint"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setGradingCheckpointMaxDraft({});
                                        const last = checkpoints[checkpoints.length - 1];
                                        const nextMin =
                                          last && last.max != null && Number.isFinite(last.max)
                                            ? last.max + 1
                                            : last
                                              ? last.min + 1
                                              : 0;
                                        patchCheckpoints([
                                          ...checkpoints,
                                          {
                                            min: nextMin,
                                            max: mode === 'checkbox' ? nextMin : null,
                                            score: 0,
                                          },
                                        ]);
                                      }}
                                      className="mb-4 w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-wide hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                    >
                                      <Plus className="w-4 h-4" />
                                      Add checkpoint
                                    </button>
                                  </>
                                )}

                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setGradingCriterionGradingSystemPopupOpen(false)}
                                    className="px-5 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wide shadow-lg shadow-slate-900/25 hover:bg-slate-800 hover:shadow-sm hover:shadow-slate-900/30 transition-all"
                                  >
                                    Save changes
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>,
                      document.body
                    )}
                  {gradingSystemPopupExitConfirmOpen &&
                    createPortal(
                      <div
                        className="fixed inset-0 z-[5400] flex items-center justify-center p-4 bg-slate-900/30"
                        onClick={() => setGradingSystemPopupExitConfirmOpen(false)}
                      >
                        <div
                          className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-5 shadow-sm shadow-slate-900/10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                            Close without saving? Your checkpoint changes will be discarded.
                          </p>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setGradingSystemPopupExitConfirmOpen(false)}
                              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wide hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const snap = gradingSystemPopupSnapshotRef.current;
                                const idx = getCriterionGradingSystemIdx(gradingCriterionElementsDraft, gradingGradingSystemPopupMode);
                                if (snap && idx >= 0) {
                                  try {
                                    const parsed = JSON.parse(snap) as unknown;
                                    const kind =
                                      gradingGradingSystemPopupMode === 'checkbox' ? 'checkboxGradingSystem' : 'basicGradingSystem';
                                    if (kind === 'checkboxGradingSystem' && Array.isArray(parsed)) {
                                      setGradingCriterionElementsDraft((prev) =>
                                        prev.map((x, j) =>
                                          j === idx && (x as any).type === kind
                                            ? {
                                                type: 'checkboxGradingSystem' as const,
                                                checkpoints: parsed.map((c: any) => sanitizeCheckpoint(c)),
                                              }
                                            : x
                                        )
                                      );
                                    } else if (kind === 'basicGradingSystem') {
                                      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                        const o = parsed as { v?: number; checkpoints?: unknown[]; per?: unknown };
                                        if (o.v === 2 && Array.isArray(o.per)) {
                                          setGradingCriterionElementsDraft((prev) =>
                                            prev.map((x, j) => {
                                              if (j !== idx || (x as any).type !== 'basicGradingSystem') return x;
                                              const cur = x as BasicGradingSystemElement;
                                              const per = (o.per as unknown[][]).map((row) =>
                                                Array.isArray(row) ? row.map((c: any) => sanitizeCheckpoint(c)) : []
                                              );
                                              const first = per[0]?.length ? per[0] : cur.checkpoints;
                                              return {
                                                ...cur,
                                                checkpoints: first.map((c) => ({ ...c })),
                                                perTextboxCheckpoints: per,
                                              };
                                            })
                                          );
                                        } else if (o.v === 1 && Array.isArray(o.checkpoints)) {
                                          setGradingCriterionElementsDraft((prev) =>
                                            prev.map((x, j) => {
                                              if (j !== idx || (x as any).type !== 'basicGradingSystem') return x;
                                              const cur = x as BasicGradingSystemElement;
                                              return {
                                                ...cur,
                                                checkpoints: o.checkpoints!.map((c: any) => sanitizeCheckpoint(c)),
                                                perTextboxCheckpoints: undefined,
                                              };
                                            })
                                          );
                                        }
                                      } else if (Array.isArray(parsed)) {
                                        setGradingCriterionElementsDraft((prev) =>
                                          prev.map((x, j) => {
                                            if (j !== idx || (x as any).type !== 'basicGradingSystem') return x;
                                            const cur = x as BasicGradingSystemElement;
                                            return {
                                              ...cur,
                                              checkpoints: parsed.map((c: any) => sanitizeCheckpoint(c)),
                                              perTextboxCheckpoints: undefined,
                                            };
                                          })
                                        );
                                      }
                                    }
                                  } catch {
                                    /* ignore */
                                  }
                                }
                                setGradingCriterionGradingSystemPopupOpen(false);
                                setGradingSystemPopupExitConfirmOpen(false);
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
                </>
              )}

              <div className="p-6 overflow-y-auto flex-1 min-h-0">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-4">Edit category name, icon, weight (%), and grading content criteria.</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide">KPI categories</p>
                    <button
                      type="button"
                      onClick={() => handleAddCategory(dept)}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-wide shadow-sm hover:bg-blue-700 active:scale-[0.99] transition-all flex items-center gap-2"
                      title="Add a new KPI category"
                    >
                      <Plus className="w-4 h-4" />
                      Add category
                    </button>
                  </div>
                  {categories.map((cat, idx) => {
                    const effectiveIcon = cat.icon ?? presetIcons[idx] ?? 'FileText';
                    const IconComponent = CATEGORY_ICON_MAP[effectiveIcon] || FileText;
                    const isContentExpanded = gradingContentExpanded === idx;
                    const content = cat.content ?? [];
                    const contentPointSum = categoryContentPointSums[idx] ?? 0;
                    const isContentPointSumValid = contentPointSum === cat.weightPct;
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border overflow-visible shadow-sm ${isContentPointSumValid ? 'border-slate-200 dark:border-slate-600/90 bg-slate-50 dark:bg-slate-900/40' : 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30'}`}
                      >
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-[auto_minmax(0,240px)_1fr_auto] gap-3 items-center min-w-0">
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
                                {[5,10,15,20,25,30,35,40,45,50].map(w => {
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
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[9px] font-black uppercase tracking-wide shadow-sm transition-colors shrink-0 ${
                                  categories.length <= 1
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
                          <div>
                            <button type="button" onClick={() => setGradingContentExpanded(isContentExpanded ? null : idx)} className="flex items-center gap-2 text-[10px] font-black text-slate-600 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide hover:text-blue-600 transition-colors">
                              <ChevronDown className={`w-4 h-4 transition-transform ${isContentExpanded ? 'rotate-180' : ''}`} />
                              <span>Grading content (audit criteria) — {content.length} item(s)</span>
                              <span className={`ml-2 px-2 py-1 rounded-lg border text-[10px] font-black tabular-nums ${isContentPointSumValid ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700' : 'border-amber-200 dark:border-amber-700 bg-amber-500/10 text-amber-700'}`}>
                                {contentPointSum}/{cat.weightPct} Yield
                              </span>
                            </button>
                            {isContentExpanded && (
                              <div className="mt-3 pl-4 border-l-2 border-slate-200 dark:border-slate-600 space-y-2">
                                {content.map((item, itemIdx) => (
                                  <div
                                    key={itemIdx}
                                    className="w-full flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-900/80 transition-colors"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => openCriterionEditor(dept, idx, itemIdx)}
                                      className="flex-1 min-w-0 flex items-center justify-between gap-3 px-1 py-0.5 text-left rounded-md hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                                      title="Edit grading criterion"
                                    >
                                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide truncate">
                                        {String(item.label || 'New criterion')}
                                      </span>
                                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 tabular-nums shrink-0">
                                        {Number(item.maxpoints ?? 0) || 0} Yield
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveContentItem(dept, idx, itemIdx);
                                      }}
                                      className="p-2 rounded-lg text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shrink-0"
                                      title="Remove criterion"
                                      aria-label="Remove criterion"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                                <button type="button" onClick={() => handleAddContentItem(dept, idx)} className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 uppercase tracking-wide hover:text-blue-700 dark:hover:text-blue-400">
                                  <Plus className="w-3.5 h-3.5" /> Add criterion
                                </button>
                              </div>
                            )}
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
                <input type="text" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-5 py-2 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all" value={editingNode.name} onChange={(e) => setEditingNode({...editingNode, name: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Access Designation</label>
                <div className="relative">
                  <select 
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg px-5 py-2 text-sm font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 appearance-none cursor-pointer disabled:opacity-50" 
                    value={editingNode.role} 
                    onChange={(e) => setEditingNode({...editingNode, role: e.target.value as UserRole})} 
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

      <div className="flex-grow flex flex-col min-h-0">
        {/* Mobile header (navigation moved to burger drawer) */}
        <div className="mb-8 flex flex-col gap-6 lg:hidden">
          <div>
            <h1 className="text-[34px] font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
              Admin Dashboard
            </h1>
            <p className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-slate-100 to-blue-50 border border-slate-200 dark:border-slate-600/80 shadow-sm">
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide">Signed in as</span>
              <span className="text-slate-800 dark:text-slate-200 font-bold text-sm uppercase tracking-wide">{user.name}</span>
            </p>
          </div>
        </div>

        {/* Desktop layout: fixed sidenav + content (reference-style) */}
        <div className="hidden lg:block">
          <aside
            className={`fixed left-0 ${APP_NAV_SIDENAV_TOP} z-[60] ${APP_NAV_SIDENAV_HEIGHT} overflow-hidden border-r border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm transition-[width] duration-200 ease-out ${
              railOpen ? 'w-[272px]' : 'w-[76px]'
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
                      className={`group relative flex w-full min-w-0 items-center justify-start rounded-lg border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400/40 gap-3 px-2 py-2 text-left ${
                        active
                          ? 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300 shadow-sm'
                          : 'border-transparent text-slate-600 dark:text-slate-400 dark:text-slate-400 hover:border-slate-100 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                          active ? 'border-blue-300 dark:border-blue-600 bg-blue-100' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:bg-slate-100 dark:hover:bg-slate-700'
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
                  className={`flex w-full items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-400 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400/40 ${
                    railOpen ? 'gap-2 px-3 py-2' : 'p-2'
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

              {railOpen && (
                <div className="shrink-0 border-t border-slate-100 dark:border-slate-700 px-3 pb-4 pt-3">
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                    Sign out
                  </button>
                </div>
              )}
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

        {/* Non-desktop: keep mobile header + top tabs */}
        <div className="lg:hidden">
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
