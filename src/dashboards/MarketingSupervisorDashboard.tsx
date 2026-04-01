import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Transmission, Announcement, UserRole, DepartmentWeights } from '../types';
import {
  computeIncentivePctFromFinal,
  getIncentiveTiersFromStorage,
  INCENTIVE_Tiers_UPDATED_EVENT,
  INCENTIVE_TIERS_STORAGE_KEY,
  getSortedIncentiveTiersDesc,
  getIncentiveTierForScore,
  formatIncentiveTierPayoutDisplay,
  getSupervisorTierRowStyle,
} from '../utils/incentiveTiers';
import { SupervisorToast } from '../components/SupervisorToast';
import { SupervisorIncentiveMatrixPanel } from '../components/SupervisorIncentiveMatrixPanel';
import { RoleSidenav } from '../components/RoleSidenav';
import { useMobileSidenav } from '../contexts/MobileSidenavContext';
import {
  getCategoryTotalsFromAllSalesData,
  getWeightedScoreFromCategoryWeights,
  MarketingCategoryTotals,
  getAccountingBreakdown,
  getPurchasingBreakdown,
  getAdministrativeBreakdown,
  getAttendanceBreakdown,
} from '../utils/marketingScoring';
import {
  type AuditBuckets,
  getDepartmentBucketForSupervisor,
  countRejectedAudits,
  countPendingReviewAudits,
  isAwaitingSupervisorReview,
  listRejectedAudits,
} from '../utils/auditStore';
import { GradingExpiredBadge } from '../components/GradingExpiredBadge';
import { isPendingGradingConfigExpired } from '../utils/gradingConfigSignature';
import {
  Users,
  FileText,
  Shield,
  CheckCircle2,
  X,
  LayoutDashboard,
  ListTodo,
  ClipboardCheck,
  History,
  AlertTriangle,
  Eye,
  Megaphone,
  Send,
  Clock,
  Trash2,
  Activity,
  ShieldCheck,
  Search,
  MessageSquare,
  Paperclip,
  FileImage,
  File as FileIcon,
  FileCheck,
  Download,
  Trophy,
  Calendar,
  Info,
  AlertCircle,
  PhilippinePeso,
  Cpu,
  BarChart3
} from 'lucide-react';

interface Props {
  user: User;
  pendingTransmissions: Transmission[];
  transmissionHistory: Transmission[];
  auditBuckets: AuditBuckets;
  announcements: Announcement[];
  departmentWeights?: DepartmentWeights;
  onSupervisorGrade: (id: string, overrides?: any, supervisorRecommendation?: 'approved' | 'rejected') => void;
  onAddAuditEntry: (action: string, details: string, type?: 'INFO' | 'OK' | 'WARN', userName?: string) => void;
  onPostAnnouncement: (message: string) => void;
  onDeleteAnnouncement: (id: string) => void;
  registry: any[];
}

const PesoCircleIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <div className={`border-2 border-current rounded-full flex items-center justify-center shrink-0 ${className}`}>
    <PhilippinePeso className="w-[65%] h-[65%]" strokeWidth={3} />
  </div>
);

const CATEGORY_ICONS: Record<string, any> = {
  'Accounting Excellence': FileText,
  'Purchasing Excellence': Activity,
  'Administrative Excellence': ClipboardCheck,
  'Additional Responsibilities': Trophy,
  'Attendance & Discipline': ShieldCheck
};

const CATEGORY_KEYS: Record<string, keyof MarketingGrading> = {
  'Accounting Excellence': 'accountingExcellenceScore',
  'Purchasing Excellence': 'purchasingExcellenceScore',
  'Administrative Excellence': 'administrativeExcellenceScore',
  'Additional Responsibilities': 'additionalResponsibilitiesScore',
  'Attendance & Discipline': 'attendanceDisciplineScore'
};

const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  'Accounting Excellence': 0.40,
  'Purchasing Excellence': 0.30,
  'Administrative Excellence': 0.25,
  'Additional Responsibilities': 0.03,
  'Attendance & Discipline': 0.02
};

/** Panel config for Detailed Audit Review: label, max points, and how to get score/details per category. */
const MARKETING_DETAILED_PANELS: Record<string, Array<{ label: string; maxPoints: number; breakdownKey?: string; detailKeys?: { label: string; key: string }[]; taskKey?: 'task1' | 'task2' | 'task3'; detailKey?: 'absences' | 'tardies' | 'violations' }>> = {
  'Accounting Excellence': [
    { label: 'Financial Accuracy & Compliance', maxPoints: 35, breakdownKey: 'financialAccuracy', detailKeys: [{ label: 'Critical errors', key: 'financialAccuracyCritical' }, { label: 'Minor errors', key: 'financialAccuracyMinor' }] },
    { label: 'Timeliness — Reports & Entries', maxPoints: 30, breakdownKey: 'timeliness', detailKeys: [{ label: 'Reports by day', key: 'timelinessReportDay' }, { label: 'Entry %', key: 'timelinessEntryPct' }] },
    { label: 'Accounts Receivable Management', maxPoints: 25, breakdownKey: 'arManagement', detailKeys: [{ label: 'DSO days', key: 'arManagementDSO' }, { label: 'Collections %', key: 'arManagementCollections' }] },
    { label: 'Reconciliation & Month-End Close', maxPoints: 10, breakdownKey: 'reconciliation', detailKeys: [{ label: 'Close day', key: 'reconciliationCloseDay' }] }
  ],
  'Purchasing Excellence': [
    { label: 'Cost Savings & Budget Compliance', maxPoints: 40, breakdownKey: 'costSavingsBudget', detailKeys: [{ label: 'Cost savings %', key: 'costSavingsPct' }, { label: 'Budget over %', key: 'budgetOverPct' }] },
    { label: 'Vendor Management & Quality', maxPoints: 35, breakdownKey: 'vendorManagement', detailKeys: [{ label: 'Vendor rating', key: 'vendorRating' }, { label: 'Due diligence incomplete', key: 'dueDiligenceIncomplete' }, { label: 'Stock incidents', key: 'stockAvailabilityIncidents' }] },
    { label: 'PO Processing & Accuracy', maxPoints: 25, breakdownKey: 'poProcessing', detailKeys: [{ label: 'PO speed %', key: 'poSpeedPct' }, { label: 'PO accuracy %', key: 'poAccuracyPct' }] }
  ],
  'Administrative Excellence': [
    { label: 'Task Completion & SLA', maxPoints: 45, breakdownKey: 'taskCompletionSla', detailKeys: [{ label: 'Task on-time %', key: 'taskCompletionPct' }, { label: 'SLA compliance %', key: 'slaCompliancePct' }] },
    { label: 'Accuracy & Quality', maxPoints: 35, breakdownKey: 'accuracyQuality', detailKeys: [{ label: 'Error rate %', key: 'errorRatePct' }, { label: 'Data entry %', key: 'dataEntryPct' }] },
    { label: 'Internal Customer Satisfaction', maxPoints: 20, breakdownKey: 'internalCustomerSatisfaction', detailKeys: [{ label: 'Survey rating', key: 'internalSurveyRating' }] }
  ],
  'Additional Responsibilities': [
    { label: 'Additional Responsibilities', maxPoints: 100, detailKeys: [{ label: 'Value', key: 'additionalRespValue' }] }
  ],
  'Attendance & Discipline': [
    { label: 'Attendance (Base 60)', maxPoints: 60, taskKey: 'task1', detailKey: 'absences' },
    { label: 'Punctuality (Base 30)', maxPoints: 30, taskKey: 'task2', detailKey: 'tardies' },
    { label: 'Discipline (Base 10)', maxPoints: 10, taskKey: 'task3', detailKey: 'violations' }
  ]
};

interface MarketingGrading {
  accountingExcellenceScore: number;
  purchasingExcellenceScore: number;
  administrativeExcellenceScore: number;
  additionalResponsibilitiesScore: number;
  attendanceDisciplineScore: number;
}

type Page = 'dashboard' | 'queue' | 'validation' | 'team' | 'incentives';

const MarketingSupervisorDashboard: React.FC<Props> = ({
  user,
  pendingTransmissions: _pendingTransmissions,
  transmissionHistory: _transmissionHistory,
  auditBuckets,
  announcements,
  registry,
  departmentWeights,
  onSupervisorGrade,
  onAddAuditEntry,
  onPostAnnouncement,
  onDeleteAnnouncement
}) => {
  const dept = user.department || 'Marketing';
  const deptBucket = getDepartmentBucketForSupervisor(auditBuckets, dept, _pendingTransmissions, _transmissionHistory);
  const pendingTransmissions = deptBucket.pending || [];
  const transmissionHistory = deptBucket.history || [];
  const categoryWeights = useMemo(() => {
    const list = departmentWeights?.Marketing;
    if (!list?.length) return DEFAULT_CATEGORY_WEIGHTS;
    const out: Record<string, number> = {};
    list.forEach((c) => { out[c.label] = c.weightPct / 100; });
    return out;
  }, [departmentWeights]);

  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedItem, setSelectedLog] = useState<Transmission | null>(null);
  const [announcementMsg, setAnnouncementMsg] = useState('');
  const [queueTab, setQueueTab] = useState<'pending' | 'history' | 'rejected'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [teamSearchTerm, setTeamSearchTerm] = useState('');
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [registryElastic, setRegistryElastic] = useState<'top' | 'bottom' | null>(null);
  const [teamElastic, setTeamElastic] = useState<'top' | 'bottom' | null>(null);
  const [incentiveTiers, setIncentiveTiers] = useState(() => getIncentiveTiersFromStorage());
  const [overrides, setOverrides] = useState<any>(null);
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    const onUpdated = () => setIncentiveTiers(getIncentiveTiersFromStorage());
    window.addEventListener(INCENTIVE_Tiers_UPDATED_EVENT, onUpdated);
    const onStorage = (e: StorageEvent) => {
      if (e.key === INCENTIVE_TIERS_STORAGE_KEY && e.newValue != null) onUpdated();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(INCENTIVE_Tiers_UPDATED_EVENT, onUpdated);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const [grading, setGrading] = useState<MarketingGrading>({
    accountingExcellenceScore: 0,
    purchasingExcellenceScore: 0,
    administrativeExcellenceScore: 0,
    additionalResponsibilitiesScore: 0,
    attendanceDisciplineScore: 0
  });
  const initialGradingRef = useRef<MarketingGrading | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [justificationPopupMessage, setJustificationPopupMessage] = useState<string | null>(null);
  const [deptMembers, setDeptMembers] = useState<any[]>([]);
  const justificationTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { setConfig: setMobileNavConfig } = useMobileSidenav();

  const roleMap = useMemo(() => {
    return registry.reduce((acc: Record<string, any>, u: any) => ({
      ...acc,
      [u.name]: { role: u.role, isActive: u.isActive !== false, department: u.department }
    }), [registry]);
  }, [registry]);

  const filteredPending = useMemo(() => {
    return pendingTransmissions.filter(t => {
      const uData = roleMap[t.userName];
      return uData?.department === dept || uData?.role === UserRole.ADMIN;
    });
  }, [pendingTransmissions, roleMap, dept]);

  useEffect(() => {
    const pendingCount = countPendingReviewAudits(filteredPending);
    setMobileNavConfig({
      ariaLabel: 'Supervisor navigation',
      items: [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
        { id: 'queue', label: 'Submissions', icon: ListTodo, badge: pendingCount },
        { id: 'team', label: 'Team', icon: Users },
        { id: 'incentives', label: 'Incentives', icon: Trophy },
      ],
      activeId: currentPage,
      onSelect: (id) => {
        setCurrentPage(id as Page);
        if (id === 'queue') {
          setQueueTab('pending');
          setSearchTerm('');
        }
      },
      showSignOut: true,
    });

    return () => setMobileNavConfig(null);
  }, [setMobileNavConfig, currentPage, filteredPending]);

  const filteredHistory = useMemo(() => {
    return transmissionHistory.filter(t => {
      const uData = roleMap[t.userName];
      return uData?.department === dept || uData?.role === UserRole.ADMIN;
    });
  }, [transmissionHistory, roleMap, dept]);

  useEffect(() => {
    const members = registry.filter((u: any) => u.department === dept && u.role !== UserRole.ADMIN);
    setDeptMembers(members);
  }, [currentPage, registry, dept]);

  useEffect(() => {
    if (!registryElastic) return;
    const t = setTimeout(() => setRegistryElastic(null), 400);
    return () => clearTimeout(t);
  }, [registryElastic]);

  useEffect(() => {
    if (!teamElastic) return;
    const t = setTimeout(() => setTeamElastic(null), 400);
    return () => clearTimeout(t);
  }, [teamElastic]);

  const activeAnnouncements = useMemo(() => {
    const now = new Date();
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1);
    return announcements
      .filter(a => a.department === dept)
      .filter(a => new Date(a.timestamp) >= quarterStart)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [announcements, dept]);

  const handleDownload = (file: { name: string; data?: string }) => {
    if (!file.data) {
      alert('Could not download this file. Refresh the page or try again.');
      return;
    }
    const link = document.createElement('a');
    link.href = file.data;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredQueue = useMemo(() => {
    let base: Transmission[];
    if (queueTab === 'history') {
      base = filteredHistory.filter(t => !t.status || t.status === 'validated');
    } else if (queueTab === 'rejected') {
      base = listRejectedAudits(filteredPending, filteredHistory);
    } else {
      base = filteredPending.filter(isAwaitingSupervisorReview);
    }
    if (!searchTerm.trim()) return base;
    const term = searchTerm.toLowerCase();
    return base.filter(item => {
      const formattedTime = new Date(item.timestamp).toLocaleString().toLowerCase();
      return (
        item.userName.toLowerCase().includes(term) ||
        item.id.toLowerCase().includes(term) ||
        (item.jobId || '').toLowerCase().includes(term) ||
        (item.jobType || '').toLowerCase().includes(term) ||
        formattedTime.includes(term)
      );
    });
  }, [queueTab, filteredPending, filteredHistory, searchTerm]);

  const sortedTeam = useMemo(() => {
    const others = deptMembers.filter(m => m.name !== user.name);
    return [
      { name: user.name, role: user.role, isSupervisor: true, id: user.id, department: user.department },
      ...others
    ];
  }, [deptMembers, user]);

  const filteredTeam = useMemo(() => {
    const term = teamSearchTerm.trim().toLowerCase();
    if (!term) return sortedTeam;
    return sortedTeam.filter((member: any) =>
      member.name.toLowerCase().includes(term) ||
      String(member.role).toLowerCase().includes(term) ||
      String(member.department || '').toLowerCase().includes(term)
    );
  }, [sortedTeam, teamSearchTerm]);

  const calculateInitialScores = (item: Transmission): MarketingGrading => {
    const allData = item.allSalesData || {};
    const totals = getCategoryTotalsFromAllSalesData(allData);
    return {
      accountingExcellenceScore: totals.accountingExcellence,
      purchasingExcellenceScore: totals.purchasingExcellence,
      administrativeExcellenceScore: totals.administrativeExcellence,
      additionalResponsibilitiesScore: totals.additionalResponsibilities,
      attendanceDisciplineScore: totals.attendanceDiscipline
    };
  };

  const getWeightedKpiForEntry = (item: Transmission): number => {
    if (item.status === 'validated' && item.ratings?.finalScore != null) return Number(item.ratings.finalScore);
    const totals = getCategoryTotalsFromAllSalesData(item.allSalesData || {});
    return getWeightedScoreFromCategoryWeights(totals, categoryWeights);
  };

  const getCurrentQuarter = (): 'Q1' | 'Q2' | 'Q3' | 'Q4' => {
    const m = new Date().getMonth();
    if (m < 3) return 'Q1';
    if (m < 6) return 'Q2';
    if (m < 9) return 'Q3';
    return 'Q4';
  };

  const [leaderboardQuarter, setLeaderboardQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>(getCurrentQuarter);

  useEffect(() => {
    if (currentPage === 'dashboard') {
      setLeaderboardQuarter(getCurrentQuarter());
    }
  }, [currentPage]);

  const { companyAvgScore, companyAuditCount, departmentLeaderboard } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();

    let startMonth = 0;
    if (leaderboardQuarter === 'Q2') startMonth = 3;
    else if (leaderboardQuarter === 'Q3') startMonth = 6;
    else if (leaderboardQuarter === 'Q4') startMonth = 9;
    const endMonth = startMonth + 3;

    const inQuarter = (d: Date) =>
      d.getFullYear() === year && d.getMonth() >= startMonth && d.getMonth() < endMonth;

    const validatedWithScore = transmissionHistory.filter(
      t => t.status === 'validated' && t.ratings?.finalScore != null
    );

    const quarterValidated = validatedWithScore.filter(t => inQuarter(new Date(t.timestamp)));

    const employees = registry.filter(
      (u: any) => u.department === user.department && u.role === UserRole.EMPLOYEE
    );

    const leaderboard: { name: string; auditCount: number; avgScore: number }[] = [];

    employees.forEach((member: any) => {
      const userLogs = quarterValidated.filter(t => t.userName === member.name);
      const count = userLogs.length;
      if (!count) return;
      const total = userLogs.reduce(
        (sum, t) => sum + Number(t.ratings!.finalScore || 0),
        0
      );
      leaderboard.push({
        name: member.name,
        auditCount: count,
        avgScore: total / count
      });
    });

    const totalDeptAudits = leaderboard.reduce((sum, e) => sum + e.auditCount, 0);
    const employeeCountWithData = leaderboard.length;
    const companyAvgScore =
      employeeCountWithData > 0
        ? leaderboard.reduce((sum, e) => sum + e.avgScore, 0) / employeeCountWithData
        : 0;

    leaderboard.sort((a, b) => b.avgScore - a.avgScore);

    return {
      companyAvgScore,
      companyAuditCount: totalDeptAudits,
      departmentLeaderboard: leaderboard.slice(0, 8)
    };
  }, [leaderboardQuarter, registry, transmissionHistory, user.department]);

  const [productivityDisplayScore, setProductivityDisplayScore] = useState(0);

  useEffect(() => {
    if (currentPage !== 'dashboard') return;

    if (!Number.isFinite(companyAvgScore) || companyAuditCount === 0) {
      setProductivityDisplayScore(0);
      return;
    }

    const startScore = 0;
    const endScore = companyAvgScore || 0;
    const duration = 1000;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    let startTime: number | null = null;

    const step = (now: number) => {
      if (startTime == null) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const k = easeOutCubic(t);
      const scoreVal = startScore + (endScore - startScore) * k;
      setProductivityDisplayScore(scoreVal);
      if (t < 1) requestAnimationFrame(step);
    };

    setProductivityDisplayScore(0);
    requestAnimationFrame(step);
  }, [currentPage, companyAvgScore, companyAuditCount]);

  const handleOpenValidation = (item: Transmission, readOnly: boolean = false) => {
    setSelectedLog(item);
    setIsReadOnly(readOnly);
    setOverrides({
      responseTime: item.responseTime,
      accuracy: item.accuracy,
      uptime: item.uptime,
      jobId: item.jobId,
      clientSite: item.clientSite,
      jobType: item.jobType,
      systemStatus: item.systemStatus
    });
    const savedMetrics = ((item.ratings as unknown) as { marketingMetrics?: MarketingGrading } | undefined)?.marketingMetrics;
    const hasSavedGrading =
      savedMetrics &&
      typeof savedMetrics === 'object' &&
      'accountingExcellenceScore' in savedMetrics;
    const initial = hasSavedGrading ? { ...savedMetrics } : calculateInitialScores(item);
    setGrading(initial);
    initialGradingRef.current = { ...initial };
    setOverrideReason(item.supervisorComment || '');
    setCurrentPage('validation');
  };

  const calculatedScore = useMemo(() => {
    const total =
      grading.accountingExcellenceScore * (categoryWeights['Accounting Excellence'] ?? 0.40) +
      grading.purchasingExcellenceScore * (categoryWeights['Purchasing Excellence'] ?? 0.30) +
      grading.administrativeExcellenceScore * (categoryWeights['Administrative Excellence'] ?? 0.25) +
      grading.additionalResponsibilitiesScore * (categoryWeights['Additional Responsibilities'] ?? 0.03) +
      grading.attendanceDisciplineScore * (categoryWeights['Attendance & Discipline'] ?? 0.02);
    const final = Math.round(total * 100) / 100;
    const incentivePct = computeIncentivePctFromFinal(final, incentiveTiers);
    return { final, incentivePct };
  }, [grading, categoryWeights, incentiveTiers]);

  const handleAction = (type: 'APPROVE' | 'REJECT' | 'OVERRIDE') => {
    if (!selectedItem || isReadOnly) return;
    const reason = overrideReason.trim();
    if (type === 'REJECT') {
      if (!reason) {
        setJustificationPopupMessage('Please enter supervisor justification in the field above before submitting your rejection recommendation for Admin Validation.');
        return;
      }
    } else if (type === 'APPROVE') {
      const initial = initialGradingRef.current;
      const gradingChanged = initial && (
        grading.accountingExcellenceScore !== initial.accountingExcellenceScore ||
        grading.purchasingExcellenceScore !== initial.purchasingExcellenceScore ||
        grading.administrativeExcellenceScore !== initial.administrativeExcellenceScore ||
        grading.additionalResponsibilitiesScore !== initial.additionalResponsibilitiesScore ||
        grading.attendanceDisciplineScore !== initial.attendanceDisciplineScore
      );
      if (gradingChanged && !reason) {
        setJustificationPopupMessage('You changed the grading matrix. Please enter supervisor justification in the field above before submitting your grading recommendation for Admin Validation.');
        return;
      }
    } else if (type === 'OVERRIDE' && !reason) {
      setJustificationPopupMessage('Please provide a justification for manual data override in the field above.');
      return;
    }

    const MARKETING_LOG_CATEGORIES = ['Accounting Excellence', 'Purchasing Excellence', 'Administrative Excellence', 'Additional Responsibilities', 'Attendance & Discipline'] as const;
    const logDetailSnapshot = MARKETING_LOG_CATEGORIES.map((name) => {
      const key = CATEGORY_KEYS[name];
      return { name, weightPct: Math.round((categoryWeights[name] ?? 0) * 100), score: (grading as any)[key] ?? 0 };
    });

    const ratings = {
      performance: 0,
      proficiency: 0,
      professionalism: 0,
      finalScore: calculatedScore.final,
      incentivePct: calculatedScore.incentivePct,
      marketingMetrics: grading,
      logDetailSnapshot
    };

    if (type === 'REJECT') {
      onAddAuditEntry('KPI_REJECTED', `Supervisor requested changes on TX ${selectedItem.id}.`, 'WARN');
      onSupervisorGrade(
        selectedItem.id,
        { ...(overrides || {}), ratings, supervisorComment: reason },
        'rejected'
      );
      setFeedbackMsg('Changes requested — awaiting admin finalization.');
    } else {
      onAddAuditEntry(
        'KPI_APPROVED',
        `Supervisor approved on TX ${selectedItem.id}. Score: ${calculatedScore.final}%. Awaiting Admin Validation.`,
        'OK'
      );
      onSupervisorGrade(
        selectedItem.id,
        { ...(overrides || {}), ratings, supervisorComment: reason },
        'approved'
      );
      setFeedbackMsg('Approval submitted — awaiting admin finalization.');
    }
    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 3000);
    setCurrentPage('queue');
    setSelectedLog(null);
    setJustificationPopupMessage(null);
  };

  useEffect(() => {
    if (!justificationPopupMessage) return;
    justificationTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    justificationTextareaRef.current?.focus();
    const t = setTimeout(() => setJustificationPopupMessage(null), 4000);
    return () => clearTimeout(t);
  }, [justificationPopupMessage]);

  const handleDispatchAnnouncement = () => {
    if (announcementMsg.trim()) {
      onPostAnnouncement(announcementMsg.trim());
      setAnnouncementMsg('');
    }
  };

  const handleDeleteBroadcast = (id: string) => {
    onDeleteAnnouncement(id);
  };

  const renderDashboard = () => (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Company productivity + department leaderboard */}
      <div className="bg-slate-100 rounded-xl p-5 border border-slate-200 shadow-lg h-[22rem] min-h-[22rem] flex flex-col">
        <div className="flex flex-col lg:flex-row gap-8 items-stretch flex-1 min-h-0">
          {/* Company productivity ring */}
          <div className="w-full lg:w-1/3 flex flex-col items-center justify-center">
            <div className="w-full flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black tracking-wide text-slate-400 uppercase">
                  Company productivity
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-900 tracking-tight uppercase">
                  This quarter
                </h2>
              </div>
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-slate-200 shadow-sm">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wide">
                  Live average
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="relative flex items-center justify-center w-40 h-40 mb-3 rounded-full bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 shadow-inner">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="rgb(226 232 240)"
                    strokeWidth="10"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="rgb(59 130 246)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 42}
                    strokeDashoffset={
                      2 *
                      Math.PI *
                      42 *
                      (1 -
                        Math.min(
                          1,
                          Math.max(0, productivityDisplayScore / 100)
                        ))
                    }
                    className=""
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Average score
                  </span>
                  <span className="text-3xl font-black tabular-nums leading-none text-blue-700 mt-1">
                    {companyAuditCount > 0
                      ? `${productivityDisplayScore.toFixed(1)}%`
                      : '—'}
                  </span>
                </div>
              </div>
              <p className="text-[10px] font-medium text-slate-500 text-center">
                Based on{' '}
                <span className="font-black">
                  {companyAuditCount > 0 ? companyAuditCount : 'no'}
                </span>{' '}
                validated audits in the {user.department} department for {leaderboardQuarter}.
              </p>
            </div>
          </div>

          {/* Department leaderboard */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4 shrink-0">
              <div>
                <p className="text-[10px] font-black tracking-wide text-slate-400 uppercase">
                  Department leaderboard
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-900 tracking-tight uppercase">
                  {user.department} employees
                </h2>
                <p className="mt-1 text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                  Ranked by average final score in {leaderboardQuarter}
                </p>
              </div>
              <div className="flex flex-col items-end">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Select quarter
                </p>
                <div className="flex w-full max-w-[22rem] bg-slate-100/90 p-2 rounded-lg gap-2 shadow-inner border border-slate-200/60">
                  {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setLeaderboardQuarter(q)}
                    className={`flex-1 min-w-[4.5rem] py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-200 ${
                      leaderboardQuarter === q
                        ? 'bg-blue-600 text-white shadow-md border border-blue-600 ring-2 ring-blue-200/50'
                        : 'bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700 hover:shadow'
                    }`}
                    aria-pressed={leaderboardQuarter === q}
                  >
                    {q}
                  </button>
                ))}
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4 md:p-5 flex-1 min-h-0 overflow-y-auto">
              {departmentLeaderboard.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                    <BarChart3 className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                    No data for {leaderboardQuarter}
                  </p>
                  <p className="mt-1 text-[10px] font-medium text-slate-400 max-w-xs">
                    Once audits are validated this quarter, employees will appear here
                    ranked by their average performance.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {departmentLeaderboard.map((entry, index) => (
                    <div
                      key={entry.name}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black">
                        #{index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {entry.name}
                        </p>
                        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-wide">
                          {entry.auditCount} audit
                          {entry.auditCount === 1 ? '' : 's'} ·{' '}
                          {entry.avgScore.toFixed(1)}%
                        </p>
                      </div>
                      <div className="flex items-center gap-2 w-40 max-w-[11rem]">
                        <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{
                              width: `${Math.max(
                                4,
                                Math.min(100, entry.avgScore)
                              )}%`
                            }}
                          />
                        </div>
                        <span className="w-12 text-right text-[10px] font-black text-slate-700 tabular-nums">
                          {entry.avgScore.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-5 flex flex-col">
          <div className="bg-slate-100 rounded-xl p-5 border border-slate-200 shadow-lg overflow-hidden h-[22rem] min-h-[22rem] flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 shrink-0">
              <div>
                <p className="text-[10px] font-black tracking-wide text-slate-400 uppercase">Message to your team</p>
                <h2 className="mt-1 text-xl font-black text-slate-900 tracking-tight">New announcement</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 border border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-wide shadow-sm">This department only</span>
            </div>
            <div className="flex-1 min-h-0 flex flex-col gap-4 bg-white rounded-lg p-6 border border-slate-200/80 shadow-sm overflow-hidden">
              <textarea
                value={announcementMsg}
                onChange={e => setAnnouncementMsg(e.target.value)}
                placeholder="Write a message for your team…"
                className="w-full flex-1 min-h-[120px] bg-slate-50/80 border border-slate-100 rounded-xl px-5 py-2 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-200 transition-all resize-none"
              />
              <button
                onClick={handleDispatchAnnouncement}
                disabled={!announcementMsg.trim()}
                className="w-full flex items-center justify-center gap-2.5 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-200/50 shrink-0"
              >
                <Send className="w-4 h-4 shrink-0" aria-hidden />
                Post to team
              </button>
            </div>
          </div>
        </div>
        <div className="lg:col-span-7 flex flex-col">
          <div className="bg-slate-100 rounded-xl p-5 border border-slate-200 shadow-lg overflow-hidden h-[22rem] min-h-[22rem] flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 shrink-0">
              <div>
                <p className="text-[10px] font-black tracking-wide text-slate-400 uppercase">This quarter</p>
                <h2 className="mt-1 text-xl font-black text-slate-900 tracking-tight">Announcements sent</h2>
              </div>
              {activeAnnouncements.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-[9px] font-black text-blue-700 uppercase tracking-wide">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  {activeAnnouncements.length} active
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 flex flex-col bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-hidden">
              {activeAnnouncements.length === 0 ? (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center shrink-0">
                  <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-4 border border-slate-200">
                    <Megaphone className="w-8 h-8 text-slate-300" aria-hidden />
                  </div>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">No announcements yet</p>
                  <p className="mt-1 text-[10px] font-medium text-slate-400 max-w-[220px]">Messages sent this quarter will appear here.</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 pr-2 custom-scrollbar">
                  {activeAnnouncements.map(a => (
                    <div
                      key={a.id}
                      className="relative group p-5 rounded-lg bg-slate-50/80 border border-slate-100 hover:bg-blue-50/60 hover:border-blue-100 hover:shadow-sm transition-all"
                    >
                      <button
                        onClick={() => handleDeleteBroadcast(a.id)}
                        className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all focus:outline-none focus:ring-2 focus:ring-red-300"
                        aria-label={`Delete announcement ${a.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <p className="text-sm font-medium text-slate-700 leading-relaxed pr-10">&quot;{a.message}&quot;</p>
                      <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        Supervisor: {a.senderName}
                      </p>
                      <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-slate-200/80">
                        <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-wide">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(a.timestamp).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </span>
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[8px] font-black uppercase rounded-full border border-blue-100">
                          Active
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderQueue = () => {
    const marketingValidatedCount = filteredHistory.filter(t => !t.status || t.status === 'validated').length;
    const marketingRejectedCount = countRejectedAudits(filteredPending, filteredHistory);
    const marketingPendingCount = countPendingReviewAudits(filteredPending);
    const marketingTotalAudits = marketingPendingCount + marketingValidatedCount + marketingRejectedCount;
    return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Unit Overview panel — above Registry Management */}
      <div className="bg-slate-100 rounded-xl p-5 border border-slate-200 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-black tracking-wide text-slate-400 uppercase">
              Work Status
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-900 tracking-tight uppercase">
              Team Work Overview
            </h2>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <div className="h-10 px-4 rounded-full bg-white/80 border border-slate-200 shadow-sm flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                Live audit status
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button
            type="button"
            onClick={() => { setQueueTab('pending'); setSearchTerm(''); }}
            className={`w-full p-5 rounded-lg border flex flex-col items-center text-left transition-transform duration-200 ease-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-100 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-lg ${queueTab === 'pending' ? 'bg-blue-50 border-blue-300 shadow-md scale-[1.06] -translate-y-1' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
            aria-label="Show pending audits in registry"
            aria-pressed={queueTab === 'pending'}
          >
            <p className={`text-[10px] font-black uppercase tracking-wide mb-1 ${queueTab === 'pending' ? 'text-blue-700' : 'text-slate-400'}`}>Needs Review</p>
            <p className={`text-[9px] font-bold uppercase tracking-wide mb-4 ${queueTab === 'pending' ? 'text-blue-600/90' : 'text-slate-500'}`}>Marketing Department</p>
            <div className="relative flex items-center justify-center w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(226 232 240)" strokeWidth="10" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(59 130 246)" strokeWidth="10" strokeLinecap="round" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - (marketingTotalAudits ? Math.min(1, marketingPendingCount / marketingTotalAudits) : 0))} className="transition-[stroke-dashoffset] duration-500 animate-ring-pulse" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-black tabular-nums leading-none ${queueTab === 'pending' ? 'text-blue-700' : 'text-blue-600'}`}>{marketingPendingCount}/{marketingTotalAudits}</span>
                <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 ${queueTab === 'pending' ? 'text-blue-600' : 'text-slate-400'}`}>submitted</span>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => { setQueueTab('history'); setSearchTerm(''); }}
            className={`w-full p-5 rounded-lg border flex flex-col items-center text-left transition-transform duration-200 ease-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-100 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-lg ${queueTab === 'history' ? 'bg-emerald-50 border-emerald-300 shadow-md scale-[1.06] -translate-y-1' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
            aria-label="Show validated audits in registry"
            aria-pressed={queueTab === 'history'}
          >
            <p className={`text-[10px] font-black uppercase tracking-wide mb-1 ${queueTab === 'history' ? 'text-emerald-700' : 'text-slate-400'}`}>Approved</p>
            <p className={`text-[9px] font-bold uppercase tracking-wide mb-4 ${queueTab === 'history' ? 'text-emerald-600/90' : 'text-slate-500'}`}>Marketing Department</p>
            <div className="relative flex items-center justify-center w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(226 232 240)" strokeWidth="10" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(16 185 129)" strokeWidth="10" strokeLinecap="round" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - (marketingTotalAudits ? Math.min(1, marketingValidatedCount / marketingTotalAudits) : 0))} className="transition-[stroke-dashoffset] duration-500 animate-ring-pulse" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-black tabular-nums leading-none ${queueTab === 'history' ? 'text-emerald-700' : 'text-emerald-600'}`}>{marketingValidatedCount}/{marketingTotalAudits}</span>
                <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 ${queueTab === 'history' ? 'text-emerald-600' : 'text-slate-400'}`}>validated</span>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => { setQueueTab('rejected'); setSearchTerm(''); }}
            className={`w-full p-5 rounded-lg border flex flex-col items-center text-left transition-transform duration-200 ease-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-slate-100 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-lg ${queueTab === 'rejected' ? 'bg-red-50 border-red-300 shadow-md scale-[1.06] -translate-y-1' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
            aria-label="Show rejected audits in registry"
            aria-pressed={queueTab === 'rejected'}
          >
            <p className={`text-[10px] font-black uppercase tracking-wide mb-1 ${queueTab === 'rejected' ? 'text-red-700' : 'text-slate-400'}`}>Rejected</p>
            <p className={`text-[9px] font-bold uppercase tracking-wide mb-4 ${queueTab === 'rejected' ? 'text-red-600/90' : 'text-slate-500'}`}>Marketing Department</p>
            <div className="relative flex items-center justify-center w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(226 232 240)" strokeWidth="10" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(239 68 68)" strokeWidth="10" strokeLinecap="round" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - (marketingTotalAudits ? Math.min(1, marketingRejectedCount / marketingTotalAudits) : 0))} className="transition-[stroke-dashoffset] duration-500 animate-ring-pulse" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-black tabular-nums leading-none ${queueTab === 'rejected' ? 'text-red-700' : 'text-red-500'}`}>{marketingRejectedCount}/{marketingTotalAudits}</span>
                <span className={`text-[9px] font-bold uppercase tracking-wide mt-1 ${queueTab === 'rejected' ? 'text-red-600' : 'text-slate-400'}`}>rejected</span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-lg border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center"><ListTodo className="w-5 h-5 text-white" /></div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Work Items</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              {queueTab === 'pending' ? 'Waiting for your review' : queueTab === 'history' ? 'Approved items' : 'Returned items'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="relative group w-full md:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-300 group-focus-within:text-blue-600 transition-colors" />
            <input
              type="text"
              placeholder="Search team records..."
              className="pl-9 pr-5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-black text-black tracking-[0.05em] focus:outline-none focus:ring-4 focus:ring-blue-500/15 w-full md:w-80 lg:w-96 transition-all focus:bg-white focus:border-blue-200"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div
        className="registry-list-scroll h-[19rem] min-h-[19rem] rounded-lg border border-slate-200 bg-slate-50/50 shadow-sm"
        onWheelCapture={(e) => {
          const el = e.currentTarget;
          const { scrollTop, scrollHeight, clientHeight } = el;
          const noScroll = scrollHeight <= clientHeight;
          const atTop = scrollTop <= 0;
          const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
          const shouldPrevent = noScroll || (atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0);
          if (shouldPrevent) {
            e.preventDefault();
            e.stopPropagation();
            if (noScroll) setRegistryElastic(e.deltaY < 0 ? 'top' : 'bottom');
            else if (atTop && e.deltaY < 0) setRegistryElastic('top');
            else if (atBottom && e.deltaY > 0) setRegistryElastic('bottom');
          }
        }}
      >
        <div className={`registry-list-inner space-y-3 py-1 ${registryElastic ? `elastic-${registryElastic}` : ''}`}>
        {filteredQueue.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-lg border border-slate-50 border-dashed">
            <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4"><ClipboardCheck className="w-8 h-8 text-slate-200" /></div>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-wide">
              {searchTerm.trim() ? 'No records match your search' : 'No submissions in this view'}
            </p>
          </div>
        ) : (
          filteredQueue.map(item => {
            const formattedTime = new Date(item.timestamp).toLocaleString();
            const kpiVal = getWeightedKpiForEntry(item);
            const valueColor = kpiVal >= 90 ? 'text-emerald-600' : kpiVal >= 70 ? 'text-blue-600' : kpiVal >= 50 ? 'text-amber-600' : 'text-red-600';
            return (
              <div key={item.id} className="group flex items-center justify-between p-6 rounded-lg border bg-white border-slate-50 hover:shadow-md transition-all">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 rounded-lg flex items-center justify-center font-black bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    {item.userName.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-slate-900">{item.userName}</p>
                      {queueTab === 'history' && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black rounded border border-emerald-100 uppercase">APPROVED</span>}
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mt-1">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">TX ID: {item.id} • {item.jobId || '—'}</p>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border w-fit bg-slate-50 border-slate-100 text-slate-400">
                        <Clock className="w-2.5 h-2.5" />
                        <span className="text-[8px] font-black uppercase tracking-wide">{formattedTime}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {queueTab === 'pending' && isPendingGradingConfigExpired(item, 'Marketing', departmentWeights) ? (
                    <GradingExpiredBadge />
                  ) : null}
                  {(() => {
                    const kpiBg = Number(kpiVal) >= 90 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : Number(kpiVal) >= 70 ? 'bg-blue-50 border-blue-100 text-blue-700' : Number(kpiVal) >= 50 ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-red-50 border-red-100 text-red-700';
                    return (
                      <div className={`w-[6.5rem] min-w-[6.5rem] py-2 rounded-xl flex flex-col items-center justify-center border shrink-0 ${kpiBg}`}>
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-wide">Initial Score</p>
                        <p className="text-sm font-black leading-none tabular-nums">{Number(kpiVal).toFixed(1)}%</p>
                      </div>
                    );
                  })()}
                  {queueTab === 'history' && item.ratings && (() => {
                    const f = Number(item.ratings.finalScore ?? 0);
                    const finalBg = f >= 90 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : f >= 70 ? 'bg-blue-50 border-blue-100 text-blue-700' : f >= 50 ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-red-50 border-red-100 text-red-700';
                    const finalDisplay = f === 100 ? '100%' : `${Number(f).toFixed(1)}%`;
                    return (
                      <div className={`w-[8rem] min-w-[8rem] py-2.5 rounded-xl flex flex-col items-center justify-center border shrink-0 ${finalBg}`}>
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-wide">Final Score</p>
                        <p className="text-base font-extrabold leading-none tabular-nums">{finalDisplay}</p>
                      </div>
                    );
                  })()}
                  {queueTab === 'rejected' && (
                    <div className="w-[8rem] min-w-[8rem] py-2.5 rounded-xl flex flex-col items-center justify-center border shrink-0 bg-red-50 border-red-100 text-red-700">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-wide">Status</p>
                      <p className="text-sm font-extrabold leading-none uppercase">REJECTED</p>
                    </div>
                  )}
                  <button
                    onClick={() => handleOpenValidation(item, queueTab === 'history' || queueTab === 'rejected')}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all bg-slate-900 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    aria-label={queueTab !== 'pending' ? `View ${item.id}` : `Review ${item.id}`}
                  >
                    {queueTab !== 'pending' ? 'View' : 'Review'} <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>
    </div>
  );
  };

  const renderTeam = () => {
    const supervisorCount = sortedTeam.filter(m => m.isSupervisor || m.role === UserRole.SUPERVISOR).length;
    const employeeCount = sortedTeam.filter(m => m.role === UserRole.EMPLOYEE).length;
    return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-lg border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center"><Users className="w-5 h-5 text-white" /></div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Marketing Team Matrix</h3>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">Team members, roles, and status</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <span className="text-[9px] font-black uppercase tracking-wide">{sortedTeam.length} team members</span>
          </div>
        </div>
      </div>
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-blue-600 transition-colors" />
        <input
          type="text"
          placeholder="Search team members..."
          className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/15 w-full transition-all focus:bg-white focus:border-blue-200"
          value={teamSearchTerm}
          onChange={(e) => setTeamSearchTerm(e.target.value)}
        />
      </div>
      <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide">
          {supervisorCount} Supervisor{supervisorCount !== 1 ? 's' : ''} · {employeeCount} Employee{employeeCount !== 1 ? 's' : ''}
        </p>
      </div>
      <div
        className="registry-list-scroll h-[19rem] min-h-[19rem] rounded-lg border border-slate-200 bg-slate-50/50 shadow-sm"
        onWheelCapture={(e) => {
          const el = e.currentTarget;
          const { scrollTop, scrollHeight, clientHeight } = el;
          const noScroll = scrollHeight <= clientHeight;
          const atTop = scrollTop <= 0;
          const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
          const shouldPrevent = noScroll || (atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0);
          if (shouldPrevent) {
            e.preventDefault();
            e.stopPropagation();
            if (noScroll) setTeamElastic(e.deltaY < 0 ? 'top' : 'bottom');
            else if (atTop && e.deltaY < 0) setTeamElastic('top');
            else if (atBottom && e.deltaY > 0) setTeamElastic('bottom');
          }
        }}
      >
        <div className={`registry-list-inner space-y-3 py-1 ${teamElastic ? `elastic-${teamElastic}` : ''}`}>
        {filteredTeam.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-lg border border-slate-50 border-dashed mx-1">
            <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-4"><Users className="w-8 h-8 text-slate-200" /></div>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-wide">{teamSearchTerm.trim() ? 'No team members match your search' : 'No team members in this department'}</p>
          </div>
        ) : (
          filteredTeam.map((member, idx) => (
            <div key={idx} className={`group flex items-center justify-between p-6 rounded-lg border transition-all ${member.isSupervisor ? 'bg-blue-50 border-blue-200 shadow-sm shadow-blue-50' : 'bg-white border-slate-50 hover:shadow-md hover:-translate-y-0.5'}`}>
              <div className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-lg flex items-center justify-center font-black transition-colors shrink-0 ${member.isSupervisor ? 'bg-blue-600 text-white ring-2 ring-blue-200' : 'bg-slate-100 text-slate-600 ring-2 ring-slate-100'}`}>
                  {member.name.charAt(0)}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className={`font-black text-slate-900 ${member.isSupervisor ? 'text-base' : 'text-sm'}`}>{member.name}</p>
                    {member.name === user.name && member.isSupervisor && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[8px] font-black rounded uppercase">YOU</span>}
                  </div>
                  <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-bold uppercase tracking-wide mt-1">{member.role}</span>
                </div>
              </div>
              {member.isSupervisor && (
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0" aria-hidden>
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
              )}
            </div>
          ))
        )}
        </div>
      </div>
    </div>
    );
  };

  const renderIncentives = () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const getQuarterInfo = (month: number) => {
      if (month < 3) return { q: 'Q1', months: 'Jan-Feb-Mar', payout: 'April 15' };
      if (month < 6) return { q: 'Q2', months: 'Apr-May-Jun', payout: 'July 15' };
      if (month < 9) return { q: 'Q3', months: 'Jul-Aug-Sep', payout: 'October 15' };
      return { q: 'Q4', months: 'Oct-Nov-Dec', payout: 'January 15' };
    };

    const qInfo = getQuarterInfo(currentMonth);

    const sortedYieldTiers = getSortedIncentiveTiersDesc(incentiveTiers);

    const employeeIncentives = sortedTeam
      .filter(member => member.role === UserRole.EMPLOYEE)
      .map(member => {
        const history = filteredHistory.filter(t => t.userName === member.name && t.status === 'validated');
        const currentQuarterHistory = history.filter(t => {
          const d = new Date(t.timestamp);
          const m = d.getMonth();
          const y = d.getFullYear();
          const tQ = m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
          return tQ === qInfo.q && y === currentYear;
        });

        const totalScore = currentQuarterHistory.reduce((sum, t) => sum + (t.ratings?.finalScore || 0), 0);
        const avgScore = currentQuarterHistory.length > 0 ? Math.round(totalScore / currentQuarterHistory.length) : 0;

        const tierRow = getIncentiveTierForScore(avgScore, incentiveTiers);
        const tier = tierRow.status;
        const potentialAmount = formatIncentiveTierPayoutDisplay(tierRow);
        const tierIdx = sortedYieldTiers.findIndex((x) => x.minScore === tierRow.minScore && x.status === tierRow.status);
        const tierColor = getSupervisorTierRowStyle(tierIdx >= 0 ? tierIdx : sortedYieldTiers.length - 1);

        const latestLog = history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

        return {
          ...member,
          avgScore,
          auditCount: currentQuarterHistory.length,
          tier,
          potentialAmount,
          tierColor,
          lastUpdated: latestLog?.timestamp
        };
      });

    const schedules = [
      { q: 'Q1', months: 'Jan-Mar', payout: 'Apr 15' },
      { q: 'Q2', months: 'Apr-Jun', payout: 'Jul 15' },
      { q: 'Q3', months: 'Jul-Sep', payout: 'Oct 15' },
      { q: 'Q4', months: 'Oct-Dec', payout: 'Jan 15' }
    ];

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="bg-slate-100 rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <p className="text-[10px] font-black tracking-wide text-slate-400 uppercase">Incentives</p>
              <h2 className="mt-1 text-xl font-black text-slate-900 tracking-tight uppercase">Marketing Incentives</h2>
              <p className="mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                Quarterly cycle: {qInfo.q} ({qInfo.months}) · Payout Est. {qInfo.payout}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {schedules.map(s => (
                <div key={s.q} className={`px-4 py-2.5 rounded-xl border flex flex-col items-center min-w-[90px] ${s.q === qInfo.q ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <span className="text-[9px] font-black uppercase tracking-wide">{s.q}</span>
                  <span className={`text-[10px] font-black ${s.q === qInfo.q ? 'text-blue-100' : 'text-slate-700'}`}>{s.payout}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SupervisorIncentiveMatrixPanel tiers={incentiveTiers} departmentLabel="Marketing" />

        <div className="bg-blue-50/80 border border-blue-100 rounded-lg p-6 flex items-start gap-4">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shrink-0">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-black text-blue-900 uppercase tracking-wide mb-1">Policy note (under review)</p>
            <p className="text-xs font-medium text-blue-700 leading-relaxed">
              Incentive amounts are indicative until final approval. Ranges are based on quarterly performance (average of monthly scores). Policy as of {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-wide">Employee Performance Tracking</h4>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-100">
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-wide">Real-Time Aggregation</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wide">Marketing Personnel</th>
                  <th className="px-6 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wide text-center">Audits ({qInfo.q})</th>
                  <th className="px-6 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wide text-center">Quarterly Avg</th>
                  <th className="px-6 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wide">Tier Status</th>
                  <th className="px-6 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wide text-right">Potential Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {employeeIncentives.map((emp, idx) => (
                  <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-600 text-sm border border-slate-100">
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">{emp.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Last audit: {emp.lastUpdated ? new Date(emp.lastUpdated).toLocaleDateString() : 'None'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-2 text-center">
                      <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-600">{emp.auditCount}</span>
                    </td>
                    <td className="px-6 py-2 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`text-base font-black ${emp.avgScore >= 90 ? 'text-blue-700' : emp.avgScore >= 70 ? 'text-blue-600' : 'text-slate-300'}`}>
                          {emp.avgScore > 0 ? `${emp.avgScore}%` : '--'}
                        </span>
                        {emp.avgScore > 0 && (
                          <div className="w-14 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full rounded-full ${emp.avgScore >= 90 ? 'bg-blue-600' : emp.avgScore >= 70 ? 'bg-blue-500' : 'bg-slate-300'}`} style={{ width: `${Math.min(100, emp.avgScore)}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-2">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide border ${emp.tierColor}`}>{emp.tier}</span>
                    </td>
                    <td className="px-6 py-2 text-right">
                      <p className={`text-sm font-black ${emp.avgScore >= 70 ? 'text-slate-900' : 'text-slate-300'}`}>{emp.potentialAmount}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Est. {qInfo.payout}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderReports = () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentValidated = filteredHistory.filter(t => (t.status === 'validated' || !t.status) && new Date(t.timestamp) >= thirtyDaysAgo).length;
    const recentRejected = listRejectedAudits(filteredPending, filteredHistory).filter(
      (t) => new Date(t.timestamp) >= thirtyDaysAgo
    ).length;
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-6">Marketing Department — Last 30 Days</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-6 bg-emerald-50 rounded-lg border border-emerald-100">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wide mb-1">Validated</p>
              <p className="text-3xl font-black text-slate-900 tabular-nums">{recentValidated}</p>
            </div>
            <div className="p-6 bg-red-50 rounded-lg border border-red-100">
              <p className="text-[10px] font-black text-red-600 uppercase tracking-wide mb-1">Rejected</p>
              <p className="text-3xl font-black text-slate-900 tabular-nums">{recentRejected}</p>
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-6">Export and detailed reports coming soon.</p>
        </div>
      </div>
    );
  };

  const renderValidation = () => {
    if (!selectedItem || !overrides) return null;
    const allData = selectedItem.allSalesData || {};

    return (
      <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden pb-12">
          <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-6">
              <button onClick={() => setCurrentPage('queue')} className="flex items-center gap-2 p-3 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" aria-label="Back to List"><X className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-wide">Back to List</span></button>
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  {isReadOnly ? (selectedItem.status === 'rejected' ? 'Rejected entry' : 'Approved entry') : 'Review entry'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Record ID: {selectedItem.id}</p>
              </div>
            </div>
            {isReadOnly && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${selectedItem.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                {selectedItem.status === 'rejected' ? <X className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                <span className="text-[9px] font-black uppercase tracking-wide">{selectedItem.status === 'rejected' ? 'Rejected' : 'Validated'}</span>
              </div>
            )}
            {!isReadOnly && (
              <div className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-wide flex items-center gap-2 ${calculatedScore.incentivePct >= 1 ? 'bg-emerald-50 text-emerald-600 border-emerald-100 animate-pulse' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                {calculatedScore.incentivePct >= 1 ? <Trophy className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
                {calculatedScore.incentivePct >= 1 ? 'Incentive target met' : 'Below incentive target'}
              </div>
            )}
          </div>

          <div className="p-5 space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-7">
                <div className="bg-[#0b1222] rounded-xl p-5 text-white shadow-sm relative overflow-hidden h-full">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 blur-[60px] rounded-full" />
                  <div className="flex items-center justify-between mb-8 relative z-10">
                    <div className="flex items-center gap-4">
                      <ShieldCheck className="w-6 h-6 text-blue-400" />
                      <h4 className="text-sm font-black uppercase tracking-wide">Marketing Grading Matrix</h4>
                    </div>
                    {!isReadOnly && (
                      <button
                        onClick={() => setGrading(calculateInitialScores(selectedItem))}
                        className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[9px] font-black uppercase tracking-wide rounded-lg transition-all border border-blue-500/30 flex items-center gap-2"
                      >
                        <Cpu className="w-3 h-3" /> Auto-Calculate
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 relative z-10">
                    {Object.keys(CATEGORY_ICONS).map(category => {
                      const key = CATEGORY_KEYS[category];
                      const weight = categoryWeights[category];
                      const Icon = CATEGORY_ICONS[category];
                      const value = grading[key];
                      return (
                        <div key={category} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <Icon className="w-3 h-3 text-slate-400" />
                              <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wide">{category} ({(weight * 100).toFixed(0)}%)</span>
                            </div>
                            <span className="text-xs font-black text-white">{value} PTS</span>
                          </div>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(val => {
                              const scoreVal = val * 20;
                              return (
                                <button
                                  key={val}
                                  disabled={isReadOnly}
                                  onClick={() => setGrading({ ...grading, [key]: scoreVal })}
                                  className={`flex-1 h-2 rounded-full transition-all ${scoreVal <= value ? 'bg-blue-600' : 'bg-white/10'} ${isReadOnly ? 'cursor-default' : ''}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-10 pt-10 border-t border-white/10 relative z-10">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm font-black text-slate-300 uppercase tracking-wide shrink-0">Final Weighted Score</p>
                      <p className={`text-6xl font-black tracking-tighter tabular-nums ${
                        calculatedScore.final >= 90 ? 'text-emerald-400' :
                        calculatedScore.final >= 70 ? 'text-blue-400' :
                        calculatedScore.final >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>{calculatedScore.final}%</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-5 flex flex-col gap-6 min-h-0">
                {!isReadOnly ? (
                  <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm h-full flex flex-col min-h-0">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wide ml-1 flex-shrink-0">Supervisor Justification</label>
                    <textarea
                      ref={justificationTextareaRef}
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      placeholder="Notes are required when requesting changes."
                      className="w-full min-h-[140px] bg-slate-50 border border-slate-200 rounded-lg p-5 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none overflow-auto flex-1"
                      aria-label="Supervisor justification (required for rejection or score override)"
                    />
                    <div className="grid grid-cols-2 gap-4 flex-shrink-0 pt-2">
                      <button onClick={() => handleAction('REJECT')} className="py-2 rounded-xl bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-wide hover:bg-red-100 transition-colors">Request Changes</button>
                      <button onClick={() => handleAction('APPROVE')} className="py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200">Approve</button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm space-y-6 h-full flex flex-col justify-center">
                    <div className="space-y-4 text-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto"><ShieldCheck className="w-8 h-8 text-slate-400" /></div>
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">Record Finalized</h4>
                      <p className="text-xs font-medium text-slate-500 max-w-[200px] mx-auto leading-relaxed">This audit has been processed and is now part of the permanent registry.</p>
                    </div>
                    <button onClick={() => setCurrentPage('queue')} className="w-full py-2 bg-slate-900 text-white rounded-lg text-[11px] font-black uppercase tracking-wide transition-all mt-6">Back to List</button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3"><div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center"><MessageSquare className="w-4 h-4 text-white" /></div><p className="text-[10px] font-black text-slate-900 uppercase tracking-wide">Employee Narrative</p></div>
              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                <p className="text-sm font-medium text-slate-600 leading-relaxed italic">&quot;{selectedItem.projectReport}&quot;</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3"><div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center"><ClipboardCheck className="w-4 h-4 text-white" /></div><p className="text-[10px] font-black text-slate-900 uppercase tracking-wide">Supervisor Justification</p></div>
              <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
                <p className="text-sm font-medium text-slate-600 leading-relaxed italic">&quot;{selectedItem.supervisorComment || (isReadOnly ? 'No supervisor justification recorded.' : 'Not validated yet.')}&quot;</p>
              </div>
            </div>

            {/* Detailed Audit Review — dept. format aligned with Technical Review Terminal */}
            <div className="space-y-8">
              <div className="flex items-center gap-3"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><FileText className="w-4 h-4 text-white" /></div><p className="text-[10px] font-black text-slate-900 uppercase tracking-wide">Detailed Audit Review</p></div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {Object.keys(CATEGORY_ICONS).map((category) => {
                  const Icon = CATEGORY_ICONS[category];
                  const catData = allData[category] || { checklist: {} as Record<string, unknown>, status: 'N/A' };
                  const checklist = (catData.checklist || {}) as Record<string, unknown>;
                  const snapshot = selectedItem.ratings?.logDetailSnapshot || [];
                  const snap = snapshot.find((s) => s?.name === category);
                  const weightPct = snap?.weightPct ?? (departmentWeights?.Marketing?.find((w) => w.label === category)?.weightPct ?? 0);
                  const panels = MARKETING_DETAILED_PANELS[category] || [];
                  let totalScore = 0;
                  let accBreakdown: ReturnType<typeof getAccountingBreakdown> | null = null;
                  let purchBreakdown: ReturnType<typeof getPurchasingBreakdown> | null = null;
                  let adminBreakdown: ReturnType<typeof getAdministrativeBreakdown> | null = null;
                  let attBreakdown: ReturnType<typeof getAttendanceBreakdown> | null = null;
                  if (category === 'Accounting Excellence') accBreakdown = getAccountingBreakdown(checklist);
                  if (category === 'Purchasing Excellence') purchBreakdown = getPurchasingBreakdown(checklist);
                  if (category === 'Administrative Excellence') adminBreakdown = getAdministrativeBreakdown(checklist);
                  if (category === 'Attendance & Discipline') attBreakdown = getAttendanceBreakdown(checklist);
                  if (snap && typeof snap.score === 'number') {
                    totalScore = snap.score;
                  } else {
                    if (category === 'Additional Responsibilities') totalScore = Math.min(100, Math.max(0, Number(checklist.additionalRespValue) || 0));
                    else if (accBreakdown) totalScore = accBreakdown.financialAccuracy + accBreakdown.timeliness + accBreakdown.arManagement + accBreakdown.reconciliation;
                    else if (purchBreakdown) totalScore = purchBreakdown.costSavingsBudget + purchBreakdown.vendorManagement + purchBreakdown.poProcessing;
                    else if (adminBreakdown) totalScore = adminBreakdown.taskCompletionSla + adminBreakdown.accuracyQuality + adminBreakdown.internalCustomerSatisfaction;
                    else if (attBreakdown) totalScore = attBreakdown.task1.score + attBreakdown.task2.score + attBreakdown.task3.score;
                  }

                  return (
                    <div key={category} className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm flex flex-col">
                      <div className="p-5 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-slate-100 shadow-sm">
                            <Icon className="w-6 h-6 text-slate-700" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{category}</h4>
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">
                              Weighted Score: {((totalScore * weightPct) / 100).toFixed(2)}%
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Category Score</p>
                          <p className="text-2xl font-black text-slate-900">{typeof totalScore === 'number' ? totalScore.toFixed(1) : '0.0'}</p>
                        </div>
                      </div>
                      <div className="p-5 space-y-4 flex-grow">
                        {panels.map((panel, taskIdx) => {
                          let score = 0;
                          const detailRows: { label: string; value: string | number }[] = [];
                          if (panel.breakdownKey && accBreakdown && (accBreakdown as Record<string, number>)[panel.breakdownKey] !== undefined) {
                            score = (accBreakdown as Record<string, number>)[panel.breakdownKey];
                            (panel.detailKeys || []).forEach(d => { const v = checklist[d.key]; if (v !== undefined && v !== '') detailRows.push({ label: d.label, value: typeof v === 'number' ? v : String(v) }); });
                          } else if (panel.breakdownKey && purchBreakdown && (purchBreakdown as Record<string, number>)[panel.breakdownKey] !== undefined) {
                            score = (purchBreakdown as Record<string, number>)[panel.breakdownKey];
                            (panel.detailKeys || []).forEach(d => { const v = checklist[d.key]; if (v !== undefined && v !== '') detailRows.push({ label: d.label, value: typeof v === 'number' ? v : String(v) }); });
                          } else if (panel.breakdownKey && adminBreakdown && (adminBreakdown as Record<string, number>)[panel.breakdownKey] !== undefined) {
                            score = (adminBreakdown as Record<string, number>)[panel.breakdownKey];
                            (panel.detailKeys || []).forEach(d => { const v = checklist[d.key]; if (v !== undefined && v !== '') detailRows.push({ label: d.label, value: typeof v === 'number' ? v : String(v) }); });
                          } else if (category === 'Additional Responsibilities' && taskIdx === 0) {
                            score = totalScore;
                            (panel.detailKeys || []).forEach(d => { const v = checklist[d.key]; if (v !== undefined && v !== '') detailRows.push({ label: d.label, value: typeof v === 'number' ? v : String(v) }); });
                          } else if (panel.taskKey && attBreakdown && panel.detailKey) {
                            const task = attBreakdown[panel.taskKey];
                            score = task.score;
                            const val = task[panel.detailKey];
                            if (val !== undefined) detailRows.push({ label: panel.detailKey === 'absences' ? 'Absences' : panel.detailKey === 'tardies' ? 'Tardies' : 'Violations', value: val });
                          }
                          const maxPoints = panel.maxPoints;
                          return (
                            <div key={taskIdx} className="bg-slate-50 p-5 rounded-lg border border-slate-100 flex flex-col justify-between gap-3 hover:border-blue-200 transition-colors">
                              <div>
                                <div className="flex justify-between items-start mb-2">
                                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight leading-tight">{panel.label}</span>
                                  <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${score === maxPoints ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {score} / {maxPoints}
                                  </span>
                                </div>
                                {detailRows.length > 0 && (
                                  <div className="space-y-1.5">
                                    {detailRows.map((row, i) => (
                                      <div key={i} className="flex justify-between text-[10px] text-slate-500">
                                        <span>{row.label}:</span>
                                        <span className="font-bold text-slate-900">
                                          {typeof row.value === 'number' ? row.value : row.value}
                                          {row.label.toLowerCase().includes('%') && typeof row.value === 'number' ? '%' : ''}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3"><div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center"><Paperclip className="w-4 h-4 text-white" /></div><p className="text-[10px] font-black text-slate-900 uppercase tracking-wide">Attachments</p></div>
              {selectedItem.attachments && selectedItem.attachments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {selectedItem.attachments.map((file: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-lg group/file overflow-hidden">
                      <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0">{file.type?.includes?.('image') ? <FileImage className="w-5 h-5 text-blue-500" /> : <FileIcon className="w-5 h-5 text-slate-400" />}</div>
                        <div className="overflow-hidden min-w-0 flex-1">
                          <p className="text-[9px] font-black text-slate-900 truncate uppercase">{file.name}</p>
                          <p className="text-[8px] font-bold text-slate-400">{file.size}</p>
                        </div>
                      </div>
                      <button onClick={() => handleDownload(file)} className="p-2 shrink-0 opacity-0 group-hover/file:opacity-100 text-slate-400 hover:text-blue-600 transition-all"><Download className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-medium text-slate-400 italic py-2">No attached file</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const currentView = () => {
    switch (currentPage) {
      case 'dashboard': return renderDashboard();
      case 'queue': return renderQueue();
      case 'team': return renderTeam();
      case 'incentives': return renderIncentives();
      case 'validation': return renderValidation();
      default: return renderDashboard();
    }
  };

  return (
    <div className="w-full flex flex-col px-4 sm:px-6 md:px-8 lg:px-12 pb-6 md:pb-12">
      {showFeedback && (
        <SupervisorToast message={feedbackMsg} onDismiss={() => setShowFeedback(false)} autoHideMs={4000} />
      )}
      {justificationPopupMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[7000] max-w-md w-[calc(100%-2rem)] px-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-amber-50 border-2 border-amber-300 text-amber-900 px-4 py-3 rounded-xl shadow-lg text-center">
            <p className="text-sm font-bold">{justificationPopupMessage}</p>
          </div>
        </div>
      )}

      <div
        className={`mb-6 md:mb-8 flex flex-col gap-6 sticky top-0 z-40 bg-slate-50/90 backdrop-blur-md border-b border-slate-200/60 
        -mt-4 sm:-mt-6 md:-mt-8 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8
        py-2 sm:py-6 md:py-8
        lg:mx-0 lg:px-0 lg:mt-0 ${navCollapsed ? 'lg:pl-[92px]' : 'lg:pl-[272px]'}`}
      >
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-none">Marketing Supervisor</h1>
        </div>
        <div className="hidden lg:hidden flex flex-wrap bg-white p-1.5 rounded-lg border border-slate-100 shadow-sm w-fit ml-auto" role="navigation" aria-label="Supervisor navigation">
          {[
            { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
            { id: 'queue', label: 'Submissions', icon: ListTodo, badge: countPendingReviewAudits(filteredPending) },
            { id: 'team', label: 'Team', icon: Users },
            { id: 'incentives', label: 'Incentives', icon: PesoCircleIcon }
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCurrentPage(item.id as Page);
                  if (item.id === 'queue') { setQueueTab('pending'); setSearchTerm(''); }
                }}
                className={`relative flex items-center gap-2.5 px-5 py-3 rounded-xl border text-[10px] font-black uppercase tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${currentPage === item.id ? 'z-10 bg-blue-50 border-blue-200 text-blue-800 shadow-sm' : 'z-0 border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                aria-current={currentPage === item.id ? 'page' : undefined}
                aria-label={item.badge != null ? `${item.label} (${item.badge} pending)` : item.label}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden />
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 ? <span className="ml-0.5 bg-blue-600 text-white px-1.5 py-0.5 rounded text-[8px]">{item.badge}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden lg:block">
        <RoleSidenav
          roleLabel="Supervisor"
          items={[
            { id: 'dashboard', label: 'Overview', description: 'Team summary', icon: LayoutDashboard },
            { id: 'queue', label: 'Submissions', description: countPendingReviewAudits(filteredPending) ? `${countPendingReviewAudits(filteredPending)} for review` : 'Items to review', icon: ListTodo, badge: countPendingReviewAudits(filteredPending) },
            { id: 'team', label: 'Team', description: 'People and roles', icon: Users },
            { id: 'incentives', label: 'Incentives', description: 'Payout levels', icon: PesoCircleIcon },
          ]}
          activeId={currentPage}
          onSelect={(id) => {
            setCurrentPage(id as Page);
            if (id === 'queue') {
              setQueueTab('pending');
              setSearchTerm('');
            }
          }}
          collapsed={navCollapsed}
          onToggleCollapsed={() => setNavCollapsed((v) => !v)}
        />

        <div className={`${navCollapsed ? 'pl-[92px]' : 'pl-[272px]'} min-h-0`}>
          <section className="min-w-0 min-h-0">{currentView()}</section>
        </div>
      </div>

      <div className="lg:hidden">
        {currentView()}
      </div>
    </div>
  );
};

export default MarketingSupervisorDashboard;
