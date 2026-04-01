import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { getSubmissionStatusLabel, getSubmissionStatusSubLabel } from '../../utils/submissionStatus';
// createPortal handled by shared LedgerRegistryModal
import { User, Transmission, SystemStats, Announcement, DepartmentWeights, CategoryWeightItem } from '../../types';
import TechnicalCategoryAuditPanel, {
  buildDefaultPmChecklistForCategory,
  computeCategoryAggregateMetrics,
} from '../../components/employee/TechnicalCategoryAuditPanel';
import { getEmployeeCategoryIcon } from '../../utils/employeeCategoryIcons';
import { useAuditPanelCategoryHold } from '../../utils/auditPanelHold';
import { getCategoryTotalsFromAllSalesData, getWeightedScoreFromTotals } from '../../utils/marketingScoring';
import { DraggableLedgerFab } from '../../components/DraggableLedgerFab';
import { LedgerRegistryPanel } from '../../components/LedgerRegistryModal';
import { EMPLOYEE_WORKSPACE_ID, scrollEmployeeWorkspaceIntoView } from '../../utils/employeeWorkspaceScroll';
import { computeGradingConfigSignature, isPendingGradingConfigExpired } from '../../utils/gradingConfigSignature';
import { DirectDirectiveModal } from '../../components/DirectDirectiveModal';
import { downloadLogDetailPdf, getLogDetailPdfFilename, type CategoryScoreForPdf } from '../../utils/logDetailToPdf';
import { getAppLogoDataUrl } from '../../utils/pdfCommon';
import { getScoreSuggestion } from '../../utils/scoreSuggestion';
import { downloadPerformanceScorecardPdf, type QuarterPerformanceForPdf } from '../../utils/performanceScorecardToPdf';
import { computeQuarterlyStats, getCurrentQuarter, type Quarter, type PerformanceCategory } from '../../utils/performanceMatrix';
import { TechnicalLogDetailAuditReview } from '../../components/TechnicalLogDetailAuditReview';
import { PerformanceMatrix as PerformanceMatrixCard } from '../../components/PerformanceMatrix';
import { PdfToast, type PdfToastState } from '../../components/PdfToast';
import { RoleSidenav } from '../../components/RoleSidenav';
import { useMobileSidenav } from '../../contexts/MobileSidenavContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { 
  Activity, CheckCircle2, Clock, FileCheck, ChevronRight, ChevronLeft, ShieldCheck, Zap,
  File as FileIcon, FileImage, Upload, X, Eye, AlertCircle, FileText, Download, Megaphone,
  TrendingUp, ClipboardList, PenTool, CalendarCheck, Landmark, Trophy, Calendar,
  ShoppingCart, FileStack, Info, Medal, AlertTriangle, XCircle, AlertOctagon, Sparkles, History
} from 'lucide-react';

interface Props {
  user: User;
  validatedStats?: SystemStats;
  announcements: Announcement[];
  pendingTransmissions: Transmission[];
  transmissionHistory: Transmission[];
  onTransmit: (t: Transmission) => void;
  onDeleteSubmission?: (t: Transmission) => void;
  onEditSubmission?: (t: Transmission) => void;
  departmentWeights?: DepartmentWeights;
}

const MARKETING_DEFAULT_CATEGORIES = [
  { name: 'Accounting Excellence', label: 'ACC', weightPct: 40, color: 'bg-[#4CAF50]', textColor: 'text-[#4CAF50]' },
  { name: 'Purchasing Excellence', label: 'PUR', weightPct: 30, color: 'bg-[#3F51B5]', textColor: 'text-[#3F51B5]' },
  { name: 'Administrative Excellence', label: 'ADM', weightPct: 25, color: 'bg-[#FF9800]', textColor: 'text-[#FF9800]' },
  { name: 'Additional Responsibilities', label: 'ADR', weightPct: 3, color: 'bg-[#9C27B0]', textColor: 'text-[#9C27B0]' },
  { name: 'Attendance & Discipline', label: 'ATD', weightPct: 2, color: 'bg-[#757575]', textColor: 'text-[#757575]' }
];

/** Default Marketing grading rows (Admin → Department grading → Marketing) when no saved config. */
const DEFAULT_MARKETING_CLASSIFICATIONS = [
  { name: 'Accounting Excellence', description: '40% Weight', weight: '40%', tooltip: 'Weighted impact: 40%', icon: Landmark },
  { name: 'Purchasing Excellence', description: '30% Weight', weight: '30%', tooltip: 'Weighted impact: 30%', icon: ShoppingCart },
  { name: 'Administrative Excellence', description: '25% Weight', weight: '25%', tooltip: 'Weighted impact: 25%', icon: FileStack },
  { name: 'Additional Responsibilities', description: '3% Weight', weight: '3%', tooltip: 'Weighted impact: 3%', icon: PenTool },
  { name: 'Attendance & Discipline', description: '2% Weight', weight: '2%', tooltip: 'Weighted impact: 2%', icon: CalendarCheck },
];

/** Legacy task labels for Marketing log detail (default category names; admin uses criterion `content`). */
const MARKETING_LOG_CHECKLIST_CONTENT: Record<string, string[]> = {
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
  'Administrative Excellence': [
    'Assigned administrative tasks completed on time',
    'Documentation and filing systems maintained',
    'Service Level Agreements (SLAs) met consistently',
    'Data entry accuracy verified',
    'Internal communications handled promptly',
    'Office supplies and resources managed efficiently',
  ],
  'Additional Responsibilities': [],
  'Attendance & Discipline': [],
};

const MarketingDashboard: React.FC<Props> = ({ user, validatedStats, pendingTransmissions, transmissionHistory, announcements, onTransmit, departmentWeights, onDeleteSubmission, onEditSubmission }) => {
  const { startHoldPanel, stopHold } = useAuditPanelCategoryHold();
  const [isDragging, setIsDragging] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const { setConfig: setMobileNavConfig } = useMobileSidenav();
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<Transmission | null>(null);
  const logDetailFromLedgerRef = useRef(false);
  const [acknowledgedIds, setAcknowledgedIds] = useState<string[]>(() => {
    try {
      const key = `aa2000-kpi-ack-${user?.id ?? ''}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem(`aa2000-kpi-ack-${user.id}`, JSON.stringify(acknowledgedIds));
    } catch { /* ignore */ }
  }, [user?.id, acknowledgedIds]);

  const ledgerEntryCount = useMemo(() => {
    if (!user?.id) return 0;
    return (
      pendingTransmissions.filter((t) => t.userId === user.id).length +
      transmissionHistory.filter((t) => t.userId === user.id).length
    );
  }, [pendingTransmissions, transmissionHistory, user?.id]);

  useEffect(() => {
    setMobileNavConfig({
      ariaLabel: 'Employee navigation',
      items: [
        { id: '1', label: 'Core', icon: Activity },
        { id: '2', label: 'Verify', icon: ShieldCheck },
        { id: '3', label: 'Evidence', icon: FileText },
        { id: '4', label: 'Submit', icon: Megaphone },
        {
          id: 'ledger',
          label: 'Submission History',
          icon: History,
          badge: ledgerEntryCount > 0 ? ledgerEntryCount : null,
        },
      ],
      activeId: selectedLog ? 'ledger' : isRegistryOpen ? 'ledger' : `${activeStep}`,
      onSelect: (id) => {
        logDetailFromLedgerRef.current = false;
        if (id === 'ledger') {
          setSelectedLog(null);
          setIsRegistryOpen(true);
        } else {
          setSelectedLog(null);
          setActiveStep(Number(id));
          setIsRegistryOpen(false);
        }
        scrollEmployeeWorkspaceIntoView();
      },
      showSignOut: true,
    });

    return () => setMobileNavConfig(null);
  }, [setMobileNavConfig, activeStep, isRegistryOpen, ledgerEntryCount, selectedLog]);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [completedCategories, setCompletedCategories] = useState<string[]>([]);
  const [pdfToast, setPdfToast] = useState<PdfToastState>(null);

  useLockBodyScroll(Boolean(isBroadcastModalOpen));
  const closeLogDetail = useCallback(() => {
    setSelectedLog(null);
    if (logDetailFromLedgerRef.current) {
      logDetailFromLedgerRef.current = false;
      setIsRegistryOpen(true);
    }
  }, []);
  // Draft audit data: checklist + status per Department grading label (same contract as Technical).
  const categoryInputsRef = React.useRef<Record<string, { checklist: Record<string, unknown>; status: string }>>({});
  const [draftRevision, setDraftRevision] = useState(0);
  const [formData, setFormData] = useState({
    jobId: '',
    clientSite: '',
    jobType: 'Accounting Excellence',
    startTime: '',
    endTime: '',
    systemStatus: 'Active',
    projectReport: '',
    attachments: [] as { name: string; type: string; size: string; data?: string }[],
    pmChecklist: { task1: false, task2: false, task3: false, task4: false, task5: false, task6: false } as Record<string, unknown>,
  });

  useEffect(() => {
    const list = departmentWeights?.Marketing;
    if (!list?.length) return;
    setFormData((prev) => {
      if (list.some((c) => c.label === prev.jobType)) return prev;
      return { ...prev, jobType: list[0].label };
    });
  }, [departmentWeights]);

  useEffect(() => {
    const saved = categoryInputsRef.current[formData.jobType];
    if (saved) {
      setFormData((prev) => ({
        ...prev,
        pmChecklist: saved.checklist,
        systemStatus: saved.status,
      }));
      return;
    }
    const cat = departmentWeights?.Marketing?.find((c) => c.label === formData.jobType);
    if (cat?.content?.length) {
      setFormData((prev) => ({
        ...prev,
        pmChecklist: buildDefaultPmChecklistForCategory(cat),
        systemStatus: 'Active',
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      pmChecklist: { task1: false, task2: false, task3: false, task4: false, task5: false, task6: false } as Record<string, unknown>,
      systemStatus: 'Active',
    }));
  }, [formData.jobType, departmentWeights]);

  const getFinancialAccuracyScore = (critical: number, minor: number): number => {
    if (critical >= 2) return 0;
    if (critical === 1) return 15;
    if (minor <= 2) return 35;
    if (minor <= 5) return 30;
    return 30;
  };

  const getTimelinessReportScore = (day: number): number => {
    if (day <= 0) return 0;
    if (day <= 7) return 15;
    if (day <= 10) return 12;
    if (day <= 14) return 8;
    return 0;
  };

  const getTimelinessEntryScore = (pct: number): number => {
    if (pct >= 95) return 15;
    if (pct >= 90) return 13;
    if (pct >= 85) return 10;
    return 0;
  };

  const getARManagementDSOScore = (days: number): number => {
    if (days <= 35) return 15;
    if (days <= 45) return 13;
    if (days <= 60) return 10;
    return 0;
  };

  const getARManagementCollectionsScore = (pct: number): number => {
    if (pct >= 90) return 10;
    if (pct >= 85) return 8;
    if (pct >= 80) return 5;
    return 0;
  };

  const getReconciliationScore = (day: number): number => {
    if (day <= 0 || day > 10) return 0;
    if (day <= 5) return 10;
    if (day <= 7) return 8;
    return 5;
  };

  const getCostSavingsScore = (pct: number): number => {
    if (pct >= 7) return 25;
    if (pct >= 5) return 22;
    if (pct >= 3) return 20;
    if (pct >= 1) return 15;
    return 0;
  };

  const getBudgetComplianceScore = (overPct: number): number => {
    if (overPct <= 0) return 15;
    if (overPct <= 3) return 12;
    if (overPct <= 5) return 8;
    return 0;
  };

  const getVendorRatingScore = (rating: number): number => {
    if (rating >= 4.5) return 15;
    if (rating >= 4) return 13;
    if (rating >= 3.5) return 10;
    return 0;
  };

  const getDueDiligenceScore = (incomplete: number): number => {
    if (incomplete <= 0) return 10;
    if (incomplete === 1) return 7;
    return 0;
  };

  const getStockAvailabilityScore = (incidents: number): number => {
    if (incidents <= 0) return 10;
    if (incidents === 1) return 5;
    return 0;
  };

  const getPOSpeedScore = (pct: number): number => {
    if (pct >= 95) return 15;
    if (pct >= 90) return 13;
    if (pct >= 85) return 10;
    return 0;
  };

  const getPOAccuracyScore = (pct: number): number => {
    if (pct >= 98) return 10;
    if (pct >= 95) return 8;
    if (pct >= 90) return 6;
    return 0;
  };

  const getTaskCompletionScore = (pct: number): number => {
    if (pct >= 95) return 25;
    if (pct >= 90) return 18;
    return 0;
  };

  const getSLAComplianceScore = (pct: number): number => {
    if (pct >= 95) return 20;
    if (pct >= 90) return 17;
    if (pct >= 85) return 14;
    return 0;
  };

  const getErrorRateScore = (pct: number): number => {
    if (pct <= 2) return 20;
    if (pct <= 3) return 14;
    return 0;
  };

  const getDataEntryScore = (pct: number): number => {
    if (pct >= 99) return 15;
    if (pct >= 98) return 12;
    if (pct >= 95) return 6;
    return 0;
  };

  const getInternalCustomerSatisfactionScore = (rating: number): number => {
    if (rating >= 4.5) return 20;
    if (rating >= 4.0) return 17;
    if (rating >= 3.5) return 14;
    if (rating >= 3.0) return 10;
    return 0;
  };

  const getAccountingAggregate = (checklist: Record<string, unknown>) => {
    const crit = Math.max(0, Number(checklist.financialAccuracyCritical) || 0);
    const minor = Math.max(0, Number(checklist.financialAccuracyMinor) || 0);
    const useErrorInputs = 'financialAccuracyCritical' in checklist || 'financialAccuracyMinor' in checklist;
    const a = useErrorInputs ? getFinancialAccuracyScore(crit, minor) : Math.min(35, Math.max(0, Number(checklist.financialAccuracy) || 0));
    const useTimelinessInputs = 'timelinessReportDay' in checklist || 'timelinessEntryPct' in checklist;
    const reportDay = Math.min(31, Math.max(0, Math.round(Number(checklist.timelinessReportDay) || 0)));
    const entryPct = Math.min(100, Math.max(0, Number(checklist.timelinessEntryPct) || 0));
    const b = useTimelinessInputs ? getTimelinessReportScore(reportDay) + getTimelinessEntryScore(entryPct) : Math.min(30, Math.max(0, Number(checklist.timeliness) || 0));
    const useARInputs = 'arManagementDSO' in checklist || 'arManagementCollections' in checklist;
    const arDSODays = Math.max(0, Math.round(Number(checklist.arManagementDSO) || 0));
    const arCollectionsPct = Math.min(100, Math.max(0, Number(checklist.arManagementCollections) || 0));
    const c = useARInputs ? getARManagementDSOScore(arDSODays) + getARManagementCollectionsScore(arCollectionsPct) : Math.min(25, Math.max(0, Number(checklist.arManagement) || 0));
    const useReconciliationInput = 'reconciliationCloseDay' in checklist;
    const reconciliationDay = Math.min(31, Math.max(0, Math.round(Number(checklist.reconciliationCloseDay) || 0)));
    const d = useReconciliationInput ? getReconciliationScore(reconciliationDay) : Math.min(10, Math.max(0, Number(checklist.reconciliation) || 0));
    const total = a + b + c + d;
    return { total: Number.isFinite(total) ? total : 0, financialAccuracy: a, timeliness: b, arManagement: c, reconciliation: d };
  };

  const getPurchasingAggregate = (checklist: Record<string, unknown>) => {
    const useCostSavingsInputs = 'costSavingsPct' in checklist || 'budgetOverPct' in checklist;
    const costSavingsPctVal = Math.min(100, Math.max(0, Number(checklist.costSavingsPct) || 0));
    const budgetOverPctVal = Math.max(0, Number(checklist.budgetOverPct) || 0);
    const costSavings = useCostSavingsInputs
      ? getCostSavingsScore(costSavingsPctVal) + getBudgetComplianceScore(budgetOverPctVal)
      : Math.min(40, Math.max(0, Number(checklist.costSavings) || 0));
    const useVendorInputs = 'vendorRating' in checklist || 'dueDiligenceIncomplete' in checklist || 'stockAvailabilityIncidents' in checklist;
    const vendorRatingVal = Math.min(5, Math.max(0, Number(checklist.vendorRating) || 0));
    const dueDiligenceIncompleteVal = Math.max(0, Math.round(Number(checklist.dueDiligenceIncomplete) || 0));
    const stockIncidentsVal = Math.max(0, Math.round(Number(checklist.stockAvailabilityIncidents) || 0));
    const vendorManagement = useVendorInputs
      ? getVendorRatingScore(vendorRatingVal) + getDueDiligenceScore(dueDiligenceIncompleteVal) + getStockAvailabilityScore(stockIncidentsVal)
      : Math.min(35, Math.max(0, Number(checklist.vendorManagement) || 0));
    const usePOInputs = 'poSpeedPct' in checklist || 'poAccuracyPct' in checklist;
    const poSpeedPctVal = Math.min(100, Math.max(0, Number(checklist.poSpeedPct) || 0));
    const poAccuracyPctVal = Math.min(100, Math.max(0, Number(checklist.poAccuracyPct) || 0));
    const poProcessing = usePOInputs
      ? getPOSpeedScore(poSpeedPctVal) + getPOAccuracyScore(poAccuracyPctVal)
      : Math.min(25, Math.max(0, Number(checklist.poProcessing) || 0));
    const total = costSavings + vendorManagement + poProcessing;
    return {
      total: Number.isFinite(total) ? total : 0,
      costSavings,
      vendorManagement,
      poProcessing,
      costSavingsPctScore: useCostSavingsInputs ? getCostSavingsScore(costSavingsPctVal) : 0,
      budgetComplianceScore: useCostSavingsInputs ? getBudgetComplianceScore(budgetOverPctVal) : 0
    };
  };

  const getAdministrativeAggregate = (checklist: Record<string, unknown>) => {
    const useTaskSlaInputs = 'taskCompletionPct' in checklist || 'slaCompliancePct' in checklist;
    const taskCompletionPctVal = Math.min(100, Math.max(0, Number(checklist.taskCompletionPct) || 0));
    const slaCompliancePctVal = Math.min(100, Math.max(0, Number(checklist.slaCompliancePct) || 0));
    const taskCompletionSla = useTaskSlaInputs
      ? getTaskCompletionScore(taskCompletionPctVal) + getSLAComplianceScore(slaCompliancePctVal)
      : Math.min(45, Math.max(0, Number(checklist.taskCompletionSla) || 0));
    const useAccuracyInputs = 'errorRatePct' in checklist || 'dataEntryPct' in checklist;
    const errorRatePctVal = Math.min(100, Math.max(0, Number(checklist.errorRatePct) || 0));
    const dataEntryPctVal = Math.min(100, Math.max(0, Number(checklist.dataEntryPct) || 0));
    const accuracyQuality = useAccuracyInputs
      ? getErrorRateScore(errorRatePctVal) + getDataEntryScore(dataEntryPctVal)
      : Math.min(35, Math.max(0, Number(checklist.accuracyQuality) || 0));
    const useInternalSatisfactionInput = 'internalSurveyRating' in checklist;
    const internalSurveyRatingVal = Math.min(5, Math.max(0, Number(checklist.internalSurveyRating) || 0));
    const internalCustomerSatisfaction = useInternalSatisfactionInput
      ? getInternalCustomerSatisfactionScore(internalSurveyRatingVal)
      : Math.min(20, Math.max(0, Number(checklist.internalCustomerSatisfaction) || 0));
    const total = taskCompletionSla + accuracyQuality + internalCustomerSatisfaction;
    return {
      total: Number.isFinite(total) ? total : 0,
      taskCompletionSla,
      accuracyQuality,
      internalCustomerSatisfaction
    };
  };

  const getAttendanceDisciplineAggregate = (checklist: Record<string, unknown>) => {
    const t1 = (checklist.task1 || {}) as Record<string, unknown>;
    const t2 = (checklist.task2 || {}) as Record<string, unknown>;
    const t3 = (checklist.task3 || {}) as Record<string, unknown>;
    const absences = Math.max(0, Math.round(Number(t1.absences) || 0));
    const tardies = Math.max(0, Math.round(Number(t2.tardies) || 0));
    const violations = Math.max(0, Math.round(Number(t3.violations) || 0));

    // Starting 100: Attendance (60) -10/absence; Punctuality (30) -5/tardy, 3 allowed; Discipline (10) -10/violation
    const absencePts = Math.max(0, 60 - (absences * 10));
    const punctualityPts = tardies <= 3 ? 30 : Math.max(0, 30 - ((tardies - 3) * 5));
    const disciplinePts = Math.max(0, 10 - (violations * 10));
    const total = absencePts + punctualityPts + disciplinePts;
    return {
      total: Number.isFinite(total) ? total : 0,
      absences,
      tardies,
      violations,
      absencePts,
      punctualityPts,
      disciplinePts
    };
  };

  /** Same contract as Technical `CLASSIFICATIONS`: `name` === Department grading row label. */
  const CLASSIFICATIONS = useMemo(() => {
    if (departmentWeights?.Marketing?.length) {
      return departmentWeights.Marketing.map((c) => ({
        name: c.label,
        description: `${c.weightPct}% Weight`,
        weight: `${c.weightPct}%`,
        tooltip: c.definition?.trim() ? c.definition : `Weighted impact: ${c.weightPct}%`,
        icon: getEmployeeCategoryIcon(c.icon),
      }));
    }
    return DEFAULT_MARKETING_CLASSIFICATIONS;
  }, [departmentWeights]);

  const selectedCategoryConfig = useMemo((): CategoryWeightItem | undefined => {
    return departmentWeights?.Marketing?.find((c) => c.label === formData.jobType);
  }, [departmentWeights, formData.jobType]);

  /** Admin-configured criteria → aggregate points; else legacy Marketing formulas by category label. */
  const computeMarketingCategoryScore = useCallback(
    (catLabel: string, checklist: Record<string, unknown> | undefined): number => {
      if (!checklist) return 0;
      const catCfg = departmentWeights?.Marketing?.find((c) => c.label === catLabel);
      if (catCfg?.content?.length) {
        return computeCategoryAggregateMetrics(catCfg, checklist as any).aggregatePts;
      }
      if (
        catLabel === 'Accounting Excellence' &&
        ('financialAccuracy' in checklist || 'timeliness' in checklist || 'financialAccuracyCritical' in checklist)
      ) {
        return getAccountingAggregate(checklist).total;
      }
      if (
        catLabel === 'Purchasing Excellence' &&
        ('costSavingsPct' in checklist ||
          'budgetOverPct' in checklist ||
          'costSavings' in checklist ||
          'vendorRating' in checklist ||
          'vendorManagement' in checklist ||
          'poSpeedPct' in checklist ||
          'poAccuracyPct' in checklist ||
          'poProcessing' in checklist)
      ) {
        return getPurchasingAggregate(checklist).total;
      }
      if (
        catLabel === 'Administrative Excellence' &&
        ('taskCompletionPct' in checklist ||
          'slaCompliancePct' in checklist ||
          'taskCompletionSla' in checklist ||
          'errorRatePct' in checklist ||
          'dataEntryPct' in checklist ||
          'accuracyQuality' in checklist ||
          'internalSurveyRating' in checklist ||
          'internalCustomerSatisfaction' in checklist)
      ) {
        return getAdministrativeAggregate(checklist).total;
      }
      if (catLabel === 'Attendance & Discipline' && ('task1' in checklist || 'task2' in checklist || 'task3' in checklist)) {
        return getAttendanceDisciplineAggregate(checklist).total;
      }
      if (catLabel === 'Additional Responsibilities') {
        return Math.min(100, Math.max(0, Number(checklist.additionalRespValue) || 0));
      }
      return Math.min(100, Math.max(0, Number(checklist.score) || 0));
    },
    [departmentWeights]
  );

  const getReviewTotalScoreLegacyForLogDetail = useCallback(
    (category: string, checklist: unknown) =>
      computeMarketingCategoryScore(category, checklist as Record<string, unknown> | undefined),
    [computeMarketingCategoryScore]
  );

  const saveCurrentCategoryData = () => {
    categoryInputsRef.current = {
      ...categoryInputsRef.current,
      [formData.jobType]: {
        checklist: formData.pmChecklist as Record<string, unknown>,
        status: formData.systemStatus,
      },
    };
    setDraftRevision((v) => v + 1);
  };

  const handleNext = () => {
    if (activeStep === 1) {
      saveCurrentCategoryData();
      if (!completedCategories.includes(formData.jobType)) setCompletedCategories(prev => [...prev, formData.jobType]);
      const currentIndex = CLASSIFICATIONS.findIndex(c => c.name === formData.jobType);
      if (currentIndex < CLASSIFICATIONS.length - 1) {
        setFormData(prev => ({ ...prev, jobType: CLASSIFICATIONS[currentIndex + 1].name }));
      } else {
        setActiveStep(2);
      }
    } else {
      setActiveStep(prev => Math.min(4, prev + 1));
    }
  };

  const isStep3Complete = formData.attachments.length > 0;

  const handleTransmit = () => {
    if (!isStep3Complete) return;
    setIsTransmitting(true);
    saveCurrentCategoryData();
    const allData = { ...categoryInputsRef.current };
    const getWeightPct = (name: string) => {
      const fromAdmin = departmentWeights?.Marketing?.find((c) => c.label === name);
      if (fromAdmin) return fromAdmin.weightPct;
      const w = CLASSIFICATIONS.find((c) => c.name === name)?.weight ?? '0%';
      return parseInt(String(w).replace('%', ''), 10) || 0;
    };
    let weightedSum = 0;
    CLASSIFICATIONS.forEach((c) => {
      const checklist = allData[c.name]?.checklist as Record<string, unknown> | undefined;
      const score = computeMarketingCategoryScore(c.name, checklist);
      weightedSum += (score * getWeightPct(c.name)) / 100;
    });
    const finalScore = Math.round(Math.min(100, Math.max(0, Number.isFinite(weightedSum) ? weightedSum : 0)));

    const transmission: Transmission = {
      id: `TX-MKT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      userId: user.id, userName: user.name, timestamp: new Date().toISOString(),
      responseTime: '150ms', accuracy: '100%', uptime: '100%',
      jobId: formData.jobId, clientSite: formData.clientSite, jobType: 'Marketing Campaign',
      systemStatus: formData.systemStatus, projectReport: formData.projectReport, attachments: formData.attachments,
      startTime: formData.startTime || new Date().toISOString(),
      endTime: formData.endTime || new Date().toISOString(),
      pmChecklist: formData.pmChecklist as any,
      allSalesData: allData as any,
      ratings: { performance: 0, proficiency: 0, professionalism: 0, finalScore, incentivePct: 0 },
      gradingConfigSignature: computeGradingConfigSignature('Marketing', departmentWeights),
    };

    setTimeout(() => {
      onTransmit(transmission);
      setIsTransmitting(false);
      setShowSuccess(true);
      setActiveStep(1);
      setCompletedCategories([]);
      categoryInputsRef.current = {};
      setDraftRevision(v => v + 1);
      setFormData({
        jobId: '', clientSite: '', jobType: CLASSIFICATIONS[0].name, startTime: '', endTime: '',
        systemStatus: 'Active', projectReport: '', attachments: [],
        pmChecklist: { task1: false, task2: false, task3: false, task4: false, task5: false, task6: false } as Record<string, unknown>,
      });
      setTimeout(() => setShowSuccess(false), 4000);
    }, 1500);
  };

  const mySubmissions = useMemo(() => {
    const pending = pendingTransmissions.filter(t => t.userId === user.id);
    const history = transmissionHistory.filter(t => t.userId === user.id);
    return [...pending, ...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [pendingTransmissions, transmissionHistory, user.id]);

  const getWeightedKpiScore = useCallback(
    (sub: Transmission): number => {
      if (sub.ratings?.finalScore != null && sub.status === 'validated') return sub.ratings.finalScore;
      const data = sub.allSalesData || {};
      const getWeightPct = (name: string) => {
        const fromAdmin = departmentWeights?.Marketing?.find((c) => c.label === name);
        if (fromAdmin) return fromAdmin.weightPct;
        const w = CLASSIFICATIONS.find((c) => c.name === name)?.weight ?? '0%';
        return parseInt(String(w).replace('%', ''), 10) || 0;
      };
      let sum = 0;
      CLASSIFICATIONS.forEach((c) => {
        const checklist = data[c.name]?.checklist as Record<string, unknown> | undefined;
        sum += (computeMarketingCategoryScore(c.name, checklist) * getWeightPct(c.name)) / 100;
      });
      return Math.round(Math.min(100, Math.max(0, sum)));
    },
    [departmentWeights, CLASSIFICATIONS, computeMarketingCategoryScore]
  );

  const currentTotalWeightedScore = useMemo(() => {
    const mock = { allSalesData: categoryInputsRef.current, status: 'pending', ratings: {} } as any;
    const score = getWeightedKpiScore(mock);
    return Number.isFinite(score) ? score : 0;
  }, [draftRevision, formData.jobType, CLASSIFICATIONS, getWeightedKpiScore]);

  const hasUserPending = useMemo(() => pendingTransmissions.some(t => t.userId === user.id), [pendingTransmissions, user.id]);

  const latestValidated = useMemo(() => {
    const hist = transmissionHistory.filter(t => t.userId === user.id && t.status === 'validated');
    return hist.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }, [transmissionHistory, user.id]);

  const currentYear = new Date().getFullYear();
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>(() => getCurrentQuarter());

  useEffect(() => {
    setSelectedQuarter(getCurrentQuarter());
  }, []);

  const categoriesFromProgram = useMemo(() => {
    if (departmentWeights?.Marketing?.length) {
      return departmentWeights.Marketing.map((c, i) => ({
        name: c.label,
        label: MARKETING_DEFAULT_CATEGORIES[i]?.label ?? c.label.slice(0, 3),
        weightPct: c.weightPct,
        color: MARKETING_DEFAULT_CATEGORIES[i]?.color ?? 'bg-[#4CAF50]',
        textColor: MARKETING_DEFAULT_CATEGORIES[i]?.textColor ?? 'text-[#4CAF50]'
      }));
    }
    return MARKETING_DEFAULT_CATEGORIES;
  }, [departmentWeights]);

  const getQuarterPerformanceForPdf = useMemo(() => {
    const categories = categoriesFromProgram;

    const totalsKeys = ['accountingExcellence', 'purchasingExcellence', 'administrativeExcellence', 'additionalResponsibilities', 'attendanceDiscipline'] as const;

    return (q: 'Q1' | 'Q2' | 'Q3' | 'Q4'): QuarterPerformanceForPdf => {
      const history = transmissionHistory.filter(t => t.userId === user.id && t.status === 'validated');
      const currentQuarterHistory = history.filter(t => {
        const d = new Date(t.timestamp);
        const m = d.getMonth();
        const y = d.getFullYear();
        const tQ = m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
        return tQ === q && y === currentYear;
      });

      if (currentQuarterHistory.length === 0) {
        return {
          quarter: q,
          count: 0,
          finalScore: undefined,
          categories: categories.map(c => ({ label: c.label, name: c.name, weightPct: c.weightPct, avgPct: undefined })),
        };
      }

      const totalFinal = currentQuarterHistory.reduce((sum, t) => {
        const totals = getCategoryTotalsFromAllSalesData(t.allSalesData || {});
        const fs = t.ratings?.finalScore ?? getWeightedScoreFromTotals(totals);
        return sum + (Number(fs) || 0);
      }, 0);
      const finalScore = Math.round(totalFinal / currentQuarterHistory.length);

      const quarterCats = categories.map((c, idx) => {
        const key = totalsKeys[idx];
        const sumCat = currentQuarterHistory.reduce((sum, t) => {
          const totals = getCategoryTotalsFromAllSalesData(t.allSalesData || {});
          return sum + (Number(totals[key]) || 0);
        }, 0);
        const avg = sumCat / currentQuarterHistory.length;
        const avgPct = Number.isFinite(avg) ? Math.min(100, Math.max(0, avg)) : undefined;
        return { label: c.label, name: c.name, weightPct: c.weightPct, avgPct };
      });

      return { quarter: q, count: currentQuarterHistory.length, finalScore, categories: quarterCats };
    };
  }, [currentYear, transmissionHistory, user.id, categoriesFromProgram]);

  const totalsKeys = ['accountingExcellence', 'purchasingExcellence', 'administrativeExcellence', 'additionalResponsibilities', 'attendanceDiscipline'] as const;
  const quarterlyStats = useMemo(() => {
    const categories: PerformanceCategory[] = categoriesFromProgram.map((c: { name: string; label: string; weightPct: number }) => ({
      name: c.name,
      label: c.label,
      weightPct: c.weightPct,
    }));
    const getCategoryScoreFallback = (t: Transmission, categoryName: string) => {
      const idx = categoriesFromProgram.findIndex((c: { name: string }) => c.name === categoryName);
      if (idx < 0) return 0;
      const totals = getCategoryTotalsFromAllSalesData(t.allSalesData || {});
      const v = totals[totalsKeys[idx]];
      return Number.isFinite(v) ? Math.min(100, Math.max(0, Number(v))) : 0;
    };
    const getFinalScoreFallback = (t: Transmission) => getWeightedScoreFromTotals(getCategoryTotalsFromAllSalesData(t.allSalesData || {}));
    return computeQuarterlyStats({
      transmissions: transmissionHistory,
      userId: user.id,
      department: user.department,
      quarter: selectedQuarter,
      year: currentYear,
      categories,
      getCategoryScoreFallback,
      getFinalScoreFallback,
    }) as { ratings?: { finalScore: number }; categoryStats: Array<{ name: string; label: string; weightPct: number; val: number }>; count: number; quarter: Quarter };
  }, [transmissionHistory, user.id, selectedQuarter, currentYear, categoriesFromProgram]);

  const isValidated = !!quarterlyStats?.ratings;
  const score = Number.isFinite(Number(quarterlyStats?.ratings?.finalScore)) ? Number(quarterlyStats?.ratings?.finalScore) : 0;
  const dash = 251.2;
  const offset = dash - (dash * (score / 100));

  const [displayScore, setDisplayScore] = useState(0);
  const displayScoreRef = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(score)) return;
    const startScore = displayScoreRef.current;
    const endScore = score;
    const duration = 1000;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    let startTime: number | null = null;
    const step = (now: number) => {
      if (startTime == null) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const k = easeOutCubic(t);
      const scoreVal = startScore + (endScore - startScore) * k;
      displayScoreRef.current = scoreVal;
      setDisplayScore(scoreVal);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score]);

  const ringOffset = dash - (dash * (Math.max(0, Math.min(100, displayScore)) / 100));

  const handleDownloadPdf = useCallback(() => {
    try {
      setPdfToast('preparing');
      const quarters: QuarterPerformanceForPdf[] = (['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => getQuarterPerformanceForPdf(q));
      const opts = { employeeName: user.name, department: user.department, year: currentYear, quarters };
      getAppLogoDataUrl()
        .then((logoDataUrl) => downloadPerformanceScorecardPdf({ ...opts, logoDataUrl }))
        .catch(() => downloadPerformanceScorecardPdf(opts))
        .finally(() => setPdfToast('done'));
    } catch (err) {
      console.error('Scorecard PDF download failed', err);
      alert('Scorecard PDF download failed.');
      setPdfToast(null);
    }
  }, [user.name, user.department, currentYear, getQuarterPerformanceForPdf]);

  const deptAnnouncements = useMemo(() => {
    return (announcements || [])
      .filter((a: Announcement) => a.department === user.department)
      .sort((a: Announcement, b: Announcement) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [announcements, user.department]);

  const latestBroadcast = deptAnnouncements.length > 0 ? deptAnnouncements[0] : null;
  const isNewBroadcast = useMemo(() => {
    if (!latestBroadcast) return false;
    if (acknowledgedIds.includes(latestBroadcast.id)) return false;
    return (Date.now() - new Date(latestBroadcast.timestamp).getTime()) < 24 * 60 * 60 * 1000;
  }, [latestBroadcast, acknowledgedIds]);

  const handleAcknowledge = () => {
    if (latestBroadcast && !acknowledgedIds.includes(latestBroadcast.id)) setAcknowledgedIds(prev => [...prev, latestBroadcast.id]);
    setIsBroadcastModalOpen(false);
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileList = Array.from(e.dataTransfer.files);
      const processedFiles = await Promise.all(fileList.map((f: File) => {
        return new Promise<{ name: string; type: string; size: string; data?: string }>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              name: f.name,
              type: f.type,
              size: `${(f.size / 1024).toFixed(1)} KB`,
              data: reader.result as string
            });
          };
          reader.readAsDataURL(f);
        });
      }));
      setFormData(prev => ({ ...prev, attachments: [...prev.attachments, ...processedFiles] }));
    }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, { name: file.name, type: file.type, size: `${(file.size / 1024).toFixed(1)} KB`, data: reader.result as string }]
      }));
      reader.readAsDataURL(file as Blob);
    });
    e.target.value = '';
  };
  const removeFile = (idx: number) => setFormData(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }));
  const handleDownload = (file: { name: string; data?: string }) => {
    if (!file.data) return;
    const link = document.createElement('a');
    link.href = file.data;
    link.download = file.name;
    link.click();
  };

  return (
    <div
      className={`w-full max-w-full xl:max-w-[1600px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:pr-8 space-y-6 sm:space-y-8 pb-6 sm:pb-12 min-h-0 flex flex-col ${
        navCollapsed ? 'lg:pl-[104px] lg:pr-6' : 'lg:pl-[288px] lg:pr-6'
      }`}
    >
      <DirectDirectiveModal
        open={isBroadcastModalOpen}
        items={deptAnnouncements}
        acknowledgedIds={acknowledgedIds}
        latestBroadcast={latestBroadcast || null}
        onAcknowledge={handleAcknowledge}
        onClose={() => setIsBroadcastModalOpen(false)}
      />

      {showSuccess && (
        <div className="fixed top-24 right-8 z-[9999] animate-in slide-in-from-right-full fade-in duration-500">
          <div className="bg-[#0b1222] text-white px-6 py-2 rounded-lg shadow-sm border border-blue-500/30 flex items-center gap-4">
            <CheckCircle2 className="w-6 h-6 text-blue-500" />
            <div><p className="text-[11px] font-black uppercase tracking-wide mb-1">Submission sent</p><p className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Your supervisor can review it next</p></div>
                </div>
              </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-50/90 backdrop-blur-md border-b border-slate-200/60 -mt-4 sm:-mt-6 md:-mt-8 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 py-2 sm:py-6 md:py-8">
        <div className="space-y-4">
          <h1 className="text-[44px] font-black text-slate-900 tracking-tight leading-none">Marketing KPI Logs</h1>
          <p className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-slate-100 to-blue-50 border border-slate-200/80 shadow-sm">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Signed in as</span>
          <span className="text-slate-800 font-bold text-sm uppercase tracking-wide">{user.name}</span>
        </p>
                </div>
        <button onClick={() => setIsBroadcastModalOpen(true)} className="hidden lg:flex items-center text-left gap-4 bg-white p-6 rounded-xl border border-slate-100 shadow-sm min-w-[350px] max-w-md hover:bg-slate-50 transition-all group">
          <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center shrink-0 relative">
            <Megaphone className={`w-6 h-6 text-amber-600 ${isNewBroadcast ? 'animate-pulse' : ''}`} />
            {isNewBroadcast && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
          </div>
          <div className="overflow-hidden">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-1">Team announcements</p>
            <p className="text-[11px] font-bold text-slate-900 uppercase truncate">{latestBroadcast ? latestBroadcast.message : 'No new messages from your supervisor'}</p>
          </div>
        </button>
      </div>

      <PerformanceMatrixCard
        title="Performance Scorecard"
        isValidated={!!quarterlyStats?.ratings}
        hasUserPending={hasUserPending}
        displayScore={displayScore}
        dash={dash}
        ringOffset={ringOffset}
        quarterlyStats={quarterlyStats}
        onDownloadPdf={handleDownloadPdf}
        suggestion={getScoreSuggestion(quarterlyStats?.ratings?.finalScore, (quarterlyStats?.categoryStats ?? []).map(s => ({ label: s.label, val: s.val })), quarterlyStats?.count ?? 0)}
        variantStyles={{ excellent: 'text-blue-600', good: 'text-blue-600', solid: 'text-slate-700', progress: 'text-amber-600', growth: 'text-slate-600', empty: 'text-slate-500' }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12">
          <div className="hidden lg:block">
            <RoleSidenav
              roleLabel="Employee"
              items={[
                { id: '1', label: 'Core', description: 'Fill KPI inputs', icon: Activity },
                { id: '2', label: 'Verify', description: 'Review before submit', icon: ShieldCheck },
                { id: '3', label: 'Evidence', description: 'Attach evidence', icon: FileText },
                { id: '4', label: 'Submit', description: 'Send to supervisor', icon: Megaphone },
                {
                  id: 'ledger',
                  label: 'Submission History',
                  description: 'Your submission log',
                  icon: History,
                  badge: ledgerEntryCount > 0 ? ledgerEntryCount : null,
                },
              ]}
              activeId={(selectedLog ? 'ledger' : isRegistryOpen ? 'ledger' : `${activeStep}`) as '1' | '2' | '3' | '4' | 'ledger'}
              onSelect={(id) => {
                logDetailFromLedgerRef.current = false;
                if (id === 'ledger') {
                  setSelectedLog(null);
                  setIsRegistryOpen(true);
                } else {
                  setSelectedLog(null);
                  setActiveStep(Number(id));
                  setIsRegistryOpen(false);
                }
                scrollEmployeeWorkspaceIntoView();
              }}
              collapsed={navCollapsed}
              onToggleCollapsed={() => setNavCollapsed((v) => !v)}
            />
          </div>

          <div className="min-h-0">
            <div
              id={EMPLOYEE_WORKSPACE_ID}
              className="min-w-0 flex-1 bg-white rounded-xl border border-slate-100 shadow-sm overflow-visible flex flex-col min-h-[500px] scroll-mt-24"
            >
            <div className="hidden lg:hidden bg-slate-50 p-6 flex items-center justify-between border-b border-slate-100 rounded-t-[2.5rem]">
              <div className="flex items-center gap-4">
                {[{ id: 1, label: 'Core' }, { id: 2, label: 'Verify' }, { id: 3, label: 'Evidence' }, { id: 4, label: 'Submit' }].map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] transition-all ${activeStep === s.id ? 'bg-blue-600 text-white shadow-lg scale-110' : (activeStep > s.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-300 border border-slate-200')}`}>
                      {activeStep > s.id ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                </div>
                    <span className={`text-[10px] font-black uppercase tracking-wide hidden md:inline ${activeStep === s.id ? 'text-slate-900' : 'text-slate-300'}`}>{s.label}</span>
                    {s.id < 4 && <div className="w-4 h-px bg-slate-200 ml-2 hidden md:block" />}
              </div>
                ))}
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg"><ShieldCheck className="w-3 h-3" /><p className="text-[10px] font-black uppercase tracking-wide">Signed in</p></div>
            </div>

            <div className="flex-grow p-5 space-y-8 flex flex-col min-h-0">
              {selectedLog ? (
                <div className="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300">
                  <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${selectedLog.status === 'validated' ? 'bg-emerald-50' : selectedLog.status === 'rejected' ? 'bg-red-50' : 'bg-blue-600'}`}>
                        <FileText className={`w-6 h-6 ${selectedLog.status === 'validated' ? 'text-emerald-600' : selectedLog.status === 'rejected' ? 'text-red-600' : 'text-white'}`} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Marketing Log Review</h2>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wide truncate">{selectedLog.id} • {new Date(selectedLog.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        role="button"
                        tabIndex={0}
                        className="px-4 py-2.5 bg-slate-800 text-white hover:bg-slate-700 rounded-lg transition-all flex items-center gap-2 shadow-md cursor-pointer"
                        title="Download as PDF"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          try {
                            const MARKETING_PANEL_NAMES: Record<string, string[]> = {
                              'Accounting Excellence': ['Financial Accuracy & Compliance', 'Timeliness — Reports & Entries', 'Accounts Receivable Management', 'Reconciliation & Month-End Close'],
                              'Purchasing Excellence': ['Cost Savings & Budget Compliance', 'Vendor Management & Quality', 'PO Processing & Accuracy'],
                              'Administrative Excellence': ['Task Completion & SLA', 'Accuracy & Quality', 'Internal Customer Satisfaction'],
                              'Additional Responsibilities': ['Additional Responsibilities'],
                              'Attendance & Discipline': ['Attendance', 'Punctuality', 'Discipline'],
                            };
                            const categoryScores: CategoryScoreForPdf[] = CLASSIFICATIONS.map((cat) => {
                              const checklist = (selectedLog.allSalesData || {})[cat.name]?.checklist as Record<string, unknown> | undefined;
                              const weightPct =
                                departmentWeights?.Marketing?.find((c) => c.label === cat.name)?.weightPct ??
                                (parseInt(String(cat.weight).replace('%', ''), 10) || 0);
                              return {
                                name: cat.name,
                                score: computeMarketingCategoryScore(cat.name, checklist),
                                maxScore: 100,
                                weightPct,
                                panelNames: MARKETING_PANEL_NAMES[cat.name] || [],
                              };
                            });
                            const finalScore = getWeightedKpiScore(selectedLog);
                            const opts = {
                              title: 'Marketing Log Review',
                              filename: getLogDetailPdfFilename(selectedLog, 'Marketing'),
                              categoryScores,
                              finalScore: Number.isFinite(finalScore) ? finalScore : undefined
                            };
                            setPdfToast('preparing');
                            getAppLogoDataUrl()
                              .then((logoDataUrl) => downloadLogDetailPdf(selectedLog, { ...opts, logoDataUrl }))
                              .catch(() => downloadLogDetailPdf(selectedLog, { ...opts, logoDataUrl: undefined }))
                              .finally(() => setPdfToast('done'));
                          } catch (err) {
                            console.error('PDF download failed', err);
                            alert('PDF download failed. Try allowing downloads for this site or check the console.');
                            setPdfToast(null);
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
                      >
                        <Download className="w-5 h-5" />
                        <span className="text-[10px] font-black uppercase tracking-wide">PDF</span>
                      </div>
                      <button type="button" onClick={closeLogDetail} className="p-3 text-slate-300 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all" aria-label="Close log detail"><X className="w-6 h-6" /></button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-10 py-6 pr-1">
                    <div className={`w-full p-6 rounded-lg border flex items-center justify-between ${
                      selectedLog.status === 'validated' ? 'bg-emerald-50 border-emerald-100' :
                      selectedLog.status === 'rejected' ? 'bg-red-50 border-red-100' :
                      'bg-blue-50 border-blue-100'
                    }`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          selectedLog.status === 'validated' ? 'bg-emerald-100 text-emerald-600' :
                          selectedLog.status === 'rejected' ? 'bg-red-100 text-red-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {selectedLog.status === 'validated' ? <CheckCircle2 className="w-6 h-6" /> :
                           selectedLog.status === 'rejected' ? <XCircle className="w-6 h-6" /> :
                           <Clock className="w-6 h-6" />}
                        </div>
                        <div>
                          <h3 className={`text-lg font-black uppercase tracking-tight ${
                            selectedLog.status === 'validated' ? 'text-emerald-900' :
                            selectedLog.status === 'rejected' ? 'text-red-900' :
                            selectedLog.supervisorRecommendation ? 'text-orange-900' :
                            'text-blue-900'
                          }`}>
                            {getSubmissionStatusLabel(selectedLog)}
                          </h3>
                          <p className={`text-[10px] font-bold uppercase tracking-wide ${
                            selectedLog.status === 'validated' ? 'text-emerald-600' :
                            selectedLog.status === 'rejected' ? 'text-red-600' :
                            selectedLog.supervisorRecommendation ? 'text-orange-600' :
                            'text-blue-600'
                          }`}>
                            {getSubmissionStatusSubLabel(selectedLog)}
                          </p>
                        </div>
                      </div>
                      <div className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide ${
                        selectedLog.status === 'validated' ? 'bg-emerald-200 text-emerald-800' :
                        selectedLog.status === 'rejected' ? 'bg-red-200 text-red-800' :
                        selectedLog.supervisorRecommendation ? 'bg-orange-200 text-orange-800' :
                        'bg-blue-200 text-blue-800'
                      }`}>
                        {getSubmissionStatusLabel(selectedLog)}
                      </div>
                    </div>

                    {selectedLog.status === 'validated' && selectedLog.ratings && (
                      <div className="w-full p-5 bg-slate-900 rounded-xl shadow-sm relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
                        <div className="relative z-[1] flex items-center justify-between">
                          <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">Final Assessment Grade</h3>
                            <p className="text-emerald-400 text-sm font-bold uppercase tracking-wide">Official Performance Score</p>
                          </div>
                          <div className="text-right">
                            <span className="text-6xl font-black text-white tracking-tighter">{selectedLog.ratings.finalScore}%</span>
                            <div className="flex items-center gap-2 justify-end mt-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${selectedLog.ratings.finalScore >= 90 ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                {selectedLog.ratings.finalScore >= 90 ? 'Quota Met' : 'Below Target'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <TechnicalLogDetailAuditReview
                      selectedLog={selectedLog}
                      departmentKey="Marketing"
                      departmentWeights={departmentWeights}
                      CLASSIFICATIONS={CLASSIFICATIONS}
                      CHECKLIST_CONTENT={MARKETING_LOG_CHECKLIST_CONTENT}
                      getReviewTotalScoreLegacy={getReviewTotalScoreLegacyForLogDetail}
                      handleDownload={handleDownload}
                    />

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <ClipboardList className="w-4 h-4 text-slate-900" />
                        <h3 className="text-xs font-black uppercase tracking-wide text-black">Your report</h3>
                      </div>
                      <div className="p-5 bg-slate-50 border border-slate-100 rounded-3xl">
                        <p className="text-sm font-medium text-slate-700 leading-relaxed italic">&quot;{selectedLog.projectReport || 'No narrative provided.'}&quot;</p>
                      </div>
                    </div>

                    {selectedLog.attachments && selectedLog.attachments.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <FileCheck className="w-4 h-4 text-slate-900" />
                          <h3 className="text-xs font-black uppercase tracking-wide text-black">Attachments</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {selectedLog.attachments.map((file: { name: string; type?: string; size?: string; data?: string }, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg group/file overflow-hidden">
                              <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                                {file.type?.includes('image') ? <FileImage className="w-4 h-4 text-blue-500 shrink-0" /> : <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />}
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-black text-slate-900 truncate uppercase">{file.name}</p>
                                  <p className="text-[10px] font-bold text-slate-400">{file.size}</p>
                                </div>
                              </div>
                              <button type="button" onClick={() => handleDownload(file)} className="p-2 shrink-0 opacity-0 group-hover/file:opacity-100 text-slate-400 hover:text-blue-600 transition-all">
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(selectedLog.status === 'validated' || selectedLog.status === 'rejected') && (
                      <div className="p-5 bg-amber-50 border border-amber-100 rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-amber-700">
                          <AlertCircle className="w-4 h-4" />
                          <p className="text-[10px] font-black uppercase tracking-wide">Supervisor feedback</p>
                        </div>
                        <p className="text-sm font-bold text-amber-900 leading-relaxed italic">&quot;{selectedLog.supervisorComment || 'No supervisor justification recorded.'}&quot;</p>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 pt-6 border-t border-slate-100 flex justify-end">
                    <button type="button" onClick={closeLogDetail} className="px-10 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wide shadow-sm">Close</button>
                  </div>
                </div>
              ) : isRegistryOpen ? (
                <LedgerRegistryPanel
                  className="flex-1 min-h-0"
                  title="My Submissions"
                  emptyText="No local marketing records found."
                  records={mySubmissions}
                  onSelect={(log) => {
                    logDetailFromLedgerRef.current = true;
                    setSelectedLog(log);
                    setIsRegistryOpen(false);
                    scrollEmployeeWorkspaceIntoView();
                  }}
                  getInitialScore={(t) => getWeightedKpiScore({ ...t, status: undefined })}
                  getValidatedScore={(t) =>
                    t.status === 'validated' && t.ratings?.finalScore != null ? t.ratings.finalScore : undefined
                  }
                  isGradingExpired={(t) => isPendingGradingConfigExpired(t, 'Marketing', departmentWeights)}
                  onDelete={onDeleteSubmission}
                  onEdit={onEditSubmission}
                />
              ) : (
                <>
              {activeStep === 1 && (
                <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-500">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wide ml-1">KPI Category Selection</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {CLASSIFICATIONS.map(c => {
                        const isActive = formData.jobType === c.name;
                        const isCompleted = completedCategories.includes(c.name);
                        const isClickable = isActive || isCompleted;
                        return (
                          <div key={c.name} className="relative group">
                            <button
                              type="button"
                              disabled={!isClickable}
                              onClick={() => {
                                if (isClickable) {
                                  saveCurrentCategoryData();
                                  setFormData(prev => ({ ...prev, jobType: c.name }));
                                }
                              }}
                              className={`w-full text-left px-5 py-2 border rounded-lg font-bold text-xs transition-all flex justify-between items-center ${
                                isActive
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                  : isCompleted
                                    ? 'bg-[#1B367B] text-white border-[#1B367B] shadow-md'
                                    : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-white hover:border-[#1B367B] hover:shadow-md'
                              } ${!isClickable ? 'opacity-40 cursor-not-allowed filter grayscale-[0.5]' : ''}`}
                            >
                              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                                <c.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : isCompleted ? 'text-white/90' : 'text-slate-400'}`} />
                                <span className="uppercase tracking-tight truncate">{c.name}</span>
                              </div>
                              <span className={`text-sm font-black tabular-nums shrink-0 ${isActive || isCompleted ? 'text-white/90' : 'text-slate-400'}`}>{c.weight}</span>
                            </button>
                          </div>
                        );
                      })}
                  </div>
               </div>

                  {selectedCategoryConfig && (selectedCategoryConfig.content?.length ?? 0) > 0 ? (
                    <div className="bg-white p-5 rounded-lg border border-slate-100 shadow-sm mt-6 animate-in slide-in-from-top-4 duration-500 flex flex-col">
                      <TechnicalCategoryAuditPanel
                        category={selectedCategoryConfig}
                        pmChecklist={formData.pmChecklist as any}
                        setFormData={setFormData}
                        startHold={startHoldPanel}
                        stopHold={stopHold}
                      />
                    </div>
                  ) : (
                    <div className="p-5 mt-6 rounded-lg border border-amber-200 bg-amber-50/90 text-center space-y-3">
                      <p className="text-sm font-black text-amber-900 uppercase tracking-tight">Department grading not configured</p>
                      <p className="text-xs text-amber-800/90 max-w-lg mx-auto leading-relaxed">
                        This category has no audit criteria from the administrator yet. Configure <span className="font-bold">Department grading breakdown</span> for Marketing in admin.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {activeStep === 2 && (() => {
                const getWeightNum = (w: string) => parseInt(w.replace('%', ''), 10) || 0;
                const scoreBadge = (score: number, max: number) => score === max ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600';
                const getWeightedScoreColor = (score: number) => score >= 85 ? 'text-emerald-600' : score >= 70 ? 'text-blue-600' : score >= 50 ? 'text-amber-600' : 'text-rose-600';
                const getTotalScore = (catName: string, checklist: Record<string, unknown> | undefined): number =>
                  computeMarketingCategoryScore(catName, checklist);
                return (
                  <div className="space-y-8 animate-in slide-in-from-left-4 fade-in duration-500 pb-10">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                      <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Review & Verification</h3>
                        <p className="text-slate-400 text-sm font-medium mt-1">Please verify all inputs before proceeding to evidence submission.</p>
                      </div>
                      <div className="px-6 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-black uppercase tracking-wide border border-blue-100">
                        Status: Ready for Review
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      {CLASSIFICATIONS.map((cat) => {
                        const saved = categoryInputsRef.current[cat.name];
                        const checklist = (saved?.checklist ?? (formData.jobType === cat.name ? formData.pmChecklist : undefined)) as Record<string, unknown> | undefined;
                        const totalScore = getTotalScore(cat.name, checklist);
                        const weightNum =
                          departmentWeights?.Marketing?.find((c) => c.label === cat.name)?.weightPct ?? getWeightNum(cat.weight);
                        const weightedScoreText = (totalScore * weightNum / 100).toFixed(2) + '%';
                        const Icon = cat.icon;
                        return (
                          <div key={cat.name} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-6">
                            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                  <Icon className="w-5 h-5 text-blue-600" />
                                </div>
                <div>
                                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{cat.name}</h4>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                    Total Score: {totalScore} pts
                                  </p>
                </div>
              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Weighted Score</span>
                                <span className={`text-lg font-black tracking-tight ${getWeightedScoreColor(totalScore)}`}>
                                  {weightedScoreText}
                                </span>
              </div>
            </div>

                            {cat.name === 'Accounting Excellence' && checklist && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                  { label: 'Financial Accuracy & Compliance', max: 35, score: getFinancialAccuracyScore(Math.max(0, Number(checklist.financialAccuracyCritical) || 0), Math.max(0, Number(checklist.financialAccuracyMinor) || 0)), details: [{ k: 'Critical errors', v: checklist.financialAccuracyCritical ?? 0 }, { k: 'Minor errors', v: checklist.financialAccuracyMinor ?? 0 }] },
                                  { label: 'Timeliness — Reports & Entries', max: 30, score: getTimelinessReportScore(Math.min(31, Math.max(0, Math.round(Number(checklist.timelinessReportDay) || 0)))) + getTimelinessEntryScore(Math.min(100, Math.max(0, Number(checklist.timelinessEntryPct) || 0))), details: [{ k: 'Reports by day', v: checklist.timelinessReportDay ?? 0 }, { k: 'Entry %', v: checklist.timelinessEntryPct ?? 0 }] },
                                  { label: 'Accounts Receivable Management', max: 25, score: getARManagementDSOScore(Math.max(0, Math.round(Number(checklist.arManagementDSO) || 0))) + getARManagementCollectionsScore(Math.min(100, Math.max(0, Number(checklist.arManagementCollections) || 0))), details: [{ k: 'DSO days', v: checklist.arManagementDSO ?? 0 }, { k: 'Collections %', v: checklist.arManagementCollections ?? 0 }] },
                                  { label: 'Reconciliation & Month-End Close', max: 10, score: getReconciliationScore(Math.min(31, Math.max(0, Math.round(Number(checklist.reconciliationCloseDay) || 0)))), details: [{ k: 'Close day', v: checklist.reconciliationCloseDay ?? 0 }] },
                                ].map((panel, i) => (
                                  <div key={i} className="bg-slate-50 p-5 rounded-lg border border-slate-100 flex flex-col gap-3 hover:border-blue-200 transition-colors">
                                    <div className="flex justify-between items-start">
                                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight leading-tight">{panel.label}</span>
                                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${scoreBadge(panel.score, panel.max)}`}>{panel.score} / {panel.max}</span>
                  </div>
                                    <div className="space-y-1.5">
                                      {panel.details.map((d, j) => (
                                        <div key={j} className="flex justify-between text-[10px] text-slate-500"><span>{d.k}:</span> <span className="font-bold text-slate-900">{String(d.v)}</span></div>
                                      ))}
               </div>
               </div>
                                ))}
               </div>
                            )}

                            {cat.name === 'Purchasing Excellence' && checklist && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                  { label: 'Cost Savings & Budget Compliance', max: 40, score: getCostSavingsScore(Math.min(100, Number(checklist.costSavingsPct) || 0)) + getBudgetComplianceScore(Number(checklist.budgetOverPct) || 0), details: [{ k: 'Cost savings %', v: checklist.costSavingsPct ?? 0 }, { k: 'Budget over %', v: checklist.budgetOverPct ?? 0 }] },
                                  { label: 'Vendor Management & Quality', max: 35, score: getVendorRatingScore(Math.min(5, Number(checklist.vendorRating) || 0)) + getDueDiligenceScore(Math.max(0, Math.round(Number(checklist.dueDiligenceIncomplete) || 0))) + getStockAvailabilityScore(Math.max(0, Math.round(Number(checklist.stockAvailabilityIncidents) || 0))), details: [{ k: 'Vendor rating', v: checklist.vendorRating ?? 0 }, { k: 'Due diligence incomplete', v: checklist.dueDiligenceIncomplete ?? 0 }, { k: 'Stock incidents', v: checklist.stockAvailabilityIncidents ?? 0 }] },
                                  { label: 'PO Processing & Accuracy', max: 25, score: getPOSpeedScore(Math.min(100, Number(checklist.poSpeedPct) || 0)) + getPOAccuracyScore(Math.min(100, Number(checklist.poAccuracyPct) || 0)), details: [{ k: 'PO speed %', v: checklist.poSpeedPct ?? 0 }, { k: 'PO accuracy %', v: checklist.poAccuracyPct ?? 0 }] },
                                ].map((panel, i) => (
                                  <div key={i} className="bg-slate-50 p-5 rounded-lg border border-slate-100 flex flex-col gap-3 hover:border-blue-200 transition-colors">
                                    <div className="flex justify-between items-start">
                                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight leading-tight">{panel.label}</span>
                                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${scoreBadge(panel.score, panel.max)}`}>{panel.score} / {panel.max}</span>
            </div>
                                    <div className="space-y-1.5">
                                      {panel.details.map((d, j) => (
                                        <div key={j} className="flex justify-between text-[10px] text-slate-500"><span>{d.k}:</span> <span className="font-bold text-slate-900">{String(d.v)}</span></div>
                                      ))}
          </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {cat.name === 'Administrative Excellence' && checklist && (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                  { label: 'Task Completion & SLA', max: 45, score: getTaskCompletionScore(Math.min(100, Number(checklist.taskCompletionPct) || 0)) + getSLAComplianceScore(Math.min(100, Number(checklist.slaCompliancePct) || 0)), details: [{ k: 'On-time %', v: checklist.taskCompletionPct ?? 0 }, { k: 'SLA met %', v: checklist.slaCompliancePct ?? 0 }] },
                                  { label: 'Accuracy & Quality', max: 35, score: getErrorRateScore(Math.min(100, Number(checklist.errorRatePct) || 0)) + getDataEntryScore(Math.min(100, Number(checklist.dataEntryPct) || 0)), details: [{ k: 'Error rate %', v: checklist.errorRatePct ?? 0 }, { k: 'Data entry %', v: checklist.dataEntryPct ?? 0 }] },
                                  { label: 'Internal Customer Satisfaction', max: 20, score: getInternalCustomerSatisfactionScore(Math.min(5, Number(checklist.internalSurveyRating) || 0)), details: [{ k: 'Survey rating', v: checklist.internalSurveyRating ?? 0 }] },
                                ].map((panel, i) => (
                                  <div key={i} className="bg-slate-50 p-5 rounded-lg border border-slate-100 flex flex-col gap-3 hover:border-blue-200 transition-colors">
                                    <div className="flex justify-between items-start">
                                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight leading-tight">{panel.label}</span>
                                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${scoreBadge(panel.score, panel.max)}`}>{panel.score} / {panel.max}</span>
            </div>
                                    <div className="space-y-1.5">
                                      {panel.details.map((d, j) => (
                                        <div key={j} className="flex justify-between text-[10px] text-slate-500"><span>{d.k}:</span> <span className="font-bold text-slate-900">{String(d.v)}</span></div>
                                      ))}
        </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {cat.name === 'Attendance & Discipline' && checklist && (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {(() => {
                                  const agg = getAttendanceDisciplineAggregate(checklist);
                                  return [
                                    { label: 'Attendance (Base 60)', max: 60, score: agg.absencePts, details: [{ k: 'Unexcused absences', v: agg.absences }] },
                                    { label: 'Punctuality (Base 30)', max: 30, score: agg.punctualityPts, details: [{ k: 'Tardies', v: agg.tardies }] },
                                    { label: 'Discipline (Base 10)', max: 10, score: agg.disciplinePts, details: [{ k: 'Violations', v: agg.violations }] },
                                  ].map((panel, i) => (
                                    <div key={i} className="bg-slate-50 p-5 rounded-lg border border-slate-100 flex flex-col gap-3 hover:border-blue-200 transition-colors">
                                      <div className="flex justify-between items-start">
                                        <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight leading-tight">{panel.label}</span>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${scoreBadge(panel.score, panel.max)}`}>{panel.score} / {panel.max}</span>
                                      </div>
                                      <div className="space-y-1.5">
                                        {panel.details.map((d, j) => (
                                          <div key={j} className="flex justify-between text-[10px] text-slate-500"><span>{d.k}:</span> <span className="font-bold text-slate-900">{String(d.v)}</span></div>
                                        ))}
                                      </div>
                                    </div>
                                  ));
                                })()}
                              </div>
                            )}

                            {cat.name === 'Additional Responsibilities' && (
                              <div className="py-2">
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Supervisor-graded</p>
                                <p className="text-sm font-black text-purple-600 mt-1">{(checklist ? Math.min(100, Math.max(0, Number((checklist as Record<string, unknown>).additionalRespValue) || 0)) : 0)}/100</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-slate-900 p-5 rounded-xl text-white flex items-center justify-between shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full -mr-32 -mt-32"></div>
                      <div className="relative z-10 flex items-center gap-6">
                        <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center border border-white/20">
                          <ShieldCheck className="w-8 h-8 text-emerald-400" />
                        </div>
                <div>
                          <h4 className="text-xl font-black tracking-tight text-slate-900">Review your entries</h4>
                          <p className="text-slate-500 text-sm font-medium">By continuing, you confirm that the information you entered is accurate to the best of your knowledge.</p>
                </div>
             </div>
                    </div>
                  </div>
                );
              })()}

              {activeStep === 3 && (
                <div className="space-y-8 animate-in slide-in-from-left-4 fade-in duration-500">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wide ml-1">Project report</label>
                      <span className="text-xs text-slate-500">{formData.projectReport.length} characters</span>
                </div>
                    <textarea
                      placeholder="Provide a detailed summary of your campaign activities, metrics achieved, and compliance notes for this period..."
                      className="w-full h-48 p-5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm text-slate-900 outline-none focus:border-blue-500 transition-colors resize-none no-scrollbar"
                      value={formData.projectReport}
                      onChange={e => setFormData(prev => ({ ...prev, projectReport: e.target.value }))}
                   />
                </div>
                  <div className="space-y-4">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-wide ml-1">Global Proof (PDF/PNG/JPG) *</label>
                    <div className="flex flex-col md:flex-row gap-4 h-auto md:h-56">
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`w-full md:w-1/3 group flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-all cursor-pointer flex-shrink-0 py-6 md:py-0 ${isDragging ? 'bg-blue-50 border-blue-400 scale-[1.02]' : 'bg-slate-50 border-slate-200 hover:bg-blue-50 hover:border-blue-300'}`}
                      >
                        <div className="w-14 h-14 rounded-lg bg-white border border-slate-100 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                          <Upload className="w-7 h-7 text-blue-600" />
                        </div>
                        <p className="text-xs font-black text-slate-900 uppercase tracking-wide">Upload Evidence</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Attach supporting files</p>
                        <input ref={fileInputRef} type="file" className="hidden" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileSelect} />
                      </div>
                      <div className="w-full md:w-2/3 bg-white border border-slate-100 rounded-lg p-5 flex flex-col min-h-0 overflow-hidden flex-shrink-0">
                        <div className="flex items-center justify-between mb-3 sticky top-0 bg-white z-10 pb-2 border-b border-slate-100">
                          <span className="text-xs font-black text-slate-700 uppercase tracking-wide">Attached Files ({formData.attachments.length})</span>
                          {formData.attachments.length > 0 && (
                            <button type="button" onClick={() => setFormData(prev => ({ ...prev, attachments: [] }))} className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-wide">Clear All</button>
                          )}
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                          {formData.attachments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                              <FileIcon className="w-10 h-10 text-slate-200 mb-2" />
                              <p className="text-[10px] font-black text-slate-300 uppercase tracking-wide">No files attached</p>
                            </div>
                          ) : (
                            formData.attachments.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl group">
                                <div className="flex items-center gap-3 overflow-hidden min-w-0">
                                  <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center border border-slate-100 shrink-0">
                                    {file.type.includes('image') ? <FileImage className="w-4 h-4 text-blue-500" /> : <FileIcon className="w-4 h-4 text-slate-400" />}
                                  </div>
                                  <div className="overflow-hidden min-w-0">
                                    <p className="text-[10px] font-black text-slate-900 truncate uppercase">{file.name}</p>
                                    <p className="text-[10px] font-bold text-slate-400">{file.size}</p>
                                  </div>
                                </div>
                                <button type="button" onClick={() => removeFile(idx)} className="p-2 text-slate-300 hover:text-red-500 transition-colors shrink-0">
                                  <X className="w-4 h-4" />
                </button>
             </div>
                            ))
                          )}
          </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 4 && (
                <div className="flex flex-col items-center justify-center py-10 space-y-10 animate-in zoom-in-95 duration-500">
                  <div className="w-24 h-24 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm animate-pulse">
                    <FileCheck className="w-12 h-12 text-white" />
              </div>
                  <div className="text-center space-y-3">
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Ready to Submit</h3>
                    <p className="text-slate-400 text-base font-medium">Review your details, then submit your KPI log for supervisor review.</p>
            </div>
                  <div className="w-full max-sm space-y-4">
                    <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl space-y-4">
                      <div className="flex justify-between items-center text-xs font-black uppercase tracking-wide">
                        <span className="text-slate-400">Submission status</span>
                        <span className="text-blue-500">{isTransmitting ? 'Sending…' : 'Ready to send'}</span>
                    </div>
                      <div className="flex justify-between items-center text-xs font-black uppercase tracking-wide">
                        <span className="text-slate-400">Submitted by</span>
                        <span className="text-blue-600">{user.name}</span>
                    </div>
                      <div className="flex justify-between items-center text-xs font-black uppercase tracking-wide">
                        <span className="text-slate-400">Weighted score (total)</span>
                        <span className="text-slate-900">{currentTotalWeightedScore}%</span>
                  </div>
                </div>
            </div>
          </div>
              )}
                </>
              )}
            </div>

            {!selectedLog && !isRegistryOpen && (
            <div className="px-10 py-6 border-t border-slate-100 flex items-center justify-between gap-4 flex-wrap">
              <button type="button" onClick={() => setActiveStep(prev => Math.max(1, prev - 1))} disabled={activeStep === 1} className={`flex items-center gap-2 px-6 py-3 text-[10px] font-black uppercase tracking-wide transition-all ${activeStep === 1 ? 'opacity-0' : 'text-slate-400 hover:text-slate-900'}`}><ChevronLeft className="w-4 h-4" /> Previous</button>
              {activeStep < 4 ? (
                <button type="button" onClick={handleNext} disabled={activeStep === 3 && !isStep3Complete} className={`flex items-center gap-2 px-10 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide shadow-sm transition-all ${(activeStep === 1 || activeStep === 2 || (activeStep === 3 && isStep3Complete)) ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>Continue <ChevronRight className="w-4 h-4" /></button>
              ) : (
                <button type="button" onClick={handleTransmit} disabled={isTransmitting} className="bg-blue-600 text-white px-12 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide shadow-sm active:scale-95 flex items-center gap-3">{isTransmitting ? <Activity className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} {isTransmitting ? 'Submitting…' : 'Submit KPI log'}</button>
              )}
            </div>
            )}
            </div>
          </div>
        </div>
      </div>


      <DraggableLedgerFab
        storageKey="marketing"
        className="lg:hidden"
        hidden={isRegistryOpen || selectedLog != null || isBroadcastModalOpen}
        onOpen={() => setIsRegistryOpen(true)}
      />

      <PdfToast state={pdfToast} onDismiss={() => setPdfToast(null)} />
    </div>
  );
};

export default MarketingDashboard;
