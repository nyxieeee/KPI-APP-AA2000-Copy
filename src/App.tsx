import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { User, UserRole, Transmission, SystemStats, AuditEntry, SystemNotification, Announcement, DepartmentWeights } from './types';
import LoginCard from './components/LoginCard';
import Dashboard from './components/Dashboard';
import Navbar from './components/Navbar';
import NotFound from './components/NotFound';
import { AuthActionsProvider } from './contexts/AuthActionsContext';
import { MobileSidenavProvider } from './contexts/MobileSidenavContext';
import {
  DEPARTMENT_WEIGHTS_STORAGE_KEY,
  loadDepartmentWeightsFromStorage,
  saveDepartmentWeightsToStorage,
} from './utils/departmentWeightsStorage';
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

// User IDs (LoginCard uses btoa(name).substring(0,12))
const userId = (name: string) => btoa(name).substring(0, 12);

// Pre-installed Technical audit for paulotecemp — all categories at max score, pending validation
const PREINSTALLED_TECHNICAL_AUDIT = {
  id: 'TX-TEC-SEED1',
  userId: userId('employee technical'),
  userName: 'employee technical',
  timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  responseTime: '200ms',
  accuracy: '100%',
  uptime: '100%',
  jobId: '',
  clientSite: '',
  jobType: 'Multi-Category Audit',
  systemStatus: 'Operational',
  projectReport: 'Pre-installed sample audit. All KPI categories completed at maximum performance level for demonstration.',
  attachments: [],
  startTime: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  endTime: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
  ratings: { performance: 100, proficiency: 100, professionalism: 100, finalScore: 0, incentivePct: 0 },
  allSalesData: {
    'Project Execution Quality': {
      checklist: {
        task1: { score: 50, backJobs: 0 },
        task2: { score: 25, rate: 98 },
        task3: { score: 15 },
        task4: { score: 10, percentage: 100 }
      },
      status: 'Active'
    },
    'Client Satisfaction & Turnover': {
      checklist: {
        task1: { score: 50, csatRating: 4.9 },
        task2: { score: 30, percentage: 100 },
        task3: { score: 20, complaints: 0 }
      },
      status: 'Active'
    },
    'Team Leadership & Accountability': {
      checklist: {
        task1: { score: 40, projectsCompleted: 10, totalProjects: 10, onTimeProjects: 10 },
        task2: { score: 35, severity: 'Zero' },
        task3: { score: 25, rating: 'Exceeds' }
      },
      status: 'Active'
    },
    'Sales Support & Lead Development': {
      checklist: {
        task1: { score: 40, projectsCompleted: 12 },
        task2: { score: 35, rate: 95 },
        task3: { score: 25, rating: 4.8 }
      },
      status: 'Active'
    },
    'Administrative Excellence': {
      checklist: {
        task1: { score: 60 },
        task2: { score: 40 }
      },
      status: 'Active'
    },
    'Attendance & Discipline': {
      checklist: {
        task1: { score: 50, absences: 0 },
        task2: { score: 30, tardies: 0 },
        task3: { score: 20, violations: 0 }
      },
      status: 'Active'
    }
  }
} as unknown as Transmission;

// Pre-installed Sales audit for paulosalesemp — max scores, pending validation
const PREINSTALLED_SALES_AUDIT = {
  id: 'TX-SALES-SEED1',
  userId: userId('paulosalesemp'),
  userName: 'paulosalesemp',
  timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  responseTime: '120ms',
  accuracy: '100%',
  uptime: '100%',
  jobId: '',
  clientSite: '',
  jobType: 'Revenue Achievement',
  systemStatus: 'Active',
  projectReport: 'Pre-installed sample audit. All KPI categories at maximum performance for demonstration.',
  attachments: [],
  startTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  endTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
  ratings: { performance: 100, proficiency: 100, professionalism: 100, finalScore: 0, incentivePct: 0 },
  revenueValue: 1600000,
  accountsClosedValue: 6,
  allSalesData: {
    'Revenue Achievement': { revenue: 1600000, status: 'Active' },
    'End-User Accounts Closed': { accountsClosed: 6, status: 'Active' },
    'Sales Activities': {
      activities: { quotations: 15, meetings: 20, calls: 50 },
      status: 'Active'
    },
    'Quotation Management': {
      quotationMgmt: { onTime: 50, errorFree: 48, followedUp: 50, total: 50 },
      status: 'Active'
    },
    'Attendance & Discipline': {
      attendance: { days: 0, late: 0, violations: 0 },
      status: 'Active'
    },
    'Additional Responsibilities': { status: 'Active' }
  }
} as unknown as Transmission;

// Pre-installed Accounting audit for pauloaccemp — max scores, pending validation (keys match supervisor calculateInitialScores)
const PREINSTALLED_ACCOUNTING_AUDIT = {
  id: 'TX-ACC-SEED1',
  userId: userId('pauloaccemp'),
  userName: 'pauloaccemp',
  timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  responseTime: '95ms',
  accuracy: '100%',
  uptime: '100%',
  jobId: '',
  clientSite: '',
  jobType: 'Accounting Excellence',
  systemStatus: 'Balanced',
  projectReport: 'Pre-installed sample audit. All KPI categories at maximum performance for demonstration.',
  attachments: [],
  startTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  endTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
  ratings: { performance: 100, proficiency: 100, professionalism: 100, finalScore: 0, incentivePct: 0 },
  allSalesData: {
    'Financial Audit & Compliance': {
      checklist: { task1: true, task2: true, task3: true, task4: true, task5: true, task6: true },
      status: 'Active'
    },
    'Taxation & Statutory Reporting': {
      checklist: { task1: true, task2: true, task3: true, task4: true, task5: true, task6: true },
      status: 'Active'
    },
    'Accounts Payable/Receivable': {
      checklist: { task1: true, task2: true, task3: true, task4: true, task5: true, task6: true },
      status: 'Active'
    },
    'Budgeting & Forecasting': {
      checklist: { task1: true, task2: true, task3: true, task4: true, task5: true, task6: true },
      status: 'Active'
    },
    'Attendance & Discipline': {
      attendance: { days: 0, late: 0, violations: 0 },
      status: 'Active'
    }
  }
} as unknown as Transmission;

// Pre-installed Marketing audit for paulomaremp — all scores at max, pending validation
const PREINSTALLED_MARKETING_AUDIT = {
  id: 'TX-MKT-SEED1',
  userId: userId('paulomaremp'),
  userName: 'paulomaremp',
  timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  responseTime: '150ms',
  accuracy: '100%',
  uptime: '100%',
  jobId: '',
  clientSite: '',
  jobType: 'Marketing Campaign',
  systemStatus: 'Active',
  projectReport: 'Pre-installed sample audit. All KPI categories completed at maximum performance level for demonstration.',
  attachments: [],
  startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  endTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
  ratings: { performance: 100, proficiency: 100, professionalism: 100, finalScore: 100, incentivePct: 100 },
  allSalesData: {
    'Accounting Excellence': {
      checklist: {
        financialAccuracyCritical: 0,
        financialAccuracyMinor: 0,
        timelinessReportDay: 5,
        timelinessEntryPct: 98,
        arManagementDSO: 30,
        arManagementCollections: 95,
        reconciliationCloseDay: 5
      },
      status: 'Active'
    },
    'Purchasing Excellence': {
      checklist: {
        costSavingsPct: 8,
        budgetOverPct: 0,
        vendorRating: 4.8,
        dueDiligenceIncomplete: 0,
        stockAvailabilityIncidents: 0,
        poSpeedPct: 98,
        poAccuracyPct: 99,
        score: 100
      },
      status: 'Active'
    },
    'Administrative Excellence': {
      checklist: {
        taskCompletionPct: 98,
        slaCompliancePct: 97,
        errorRatePct: 1.5,
        dataEntryPct: 99.5,
        internalSurveyRating: 4.8,
        score: 100
      },
      status: 'Active'
    },
    'Additional Responsibilities': {
      checklist: { additionalRespValue: 100, score: 100 },
      status: 'Active'
    },
    'Attendance & Discipline': {
      checklist: {
        task1: { absences: 0, score: 60 },
        task2: { tardies: 0, score: 30 },
        task3: { violations: 0, score: 10 },
        score: 100
      },
      status: 'Active'
    }
  }
} as unknown as Transmission;

const daysAgoIso = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

// Pre-installed 90% audits (same weighted score) for each department: 1 validated, 1 pending, 1 rejected
const TECH_ALL_SALES_DATA_90 = {
  ...PREINSTALLED_TECHNICAL_AUDIT.allSalesData!,
  // Reduce Project Execution Quality to 75/100 so overall = 90 with 40% weight (30) + other max categories (60)
  'Project Execution Quality': {
    checklist: {
      task1: { score: 38, backJobs: 0 },
      task2: { score: 18, rate: 95 },
      task3: { score: 12 },
      task4: { score: 7, percentage: 95 }
    },
    status: 'Active'
  }
} as any;

// Sales: make overall 90 by setting Revenue=80 score (40% => 32) and Accounts=90 score (20% => 18), others max (40) => 90
const SALES_ALL_SALES_DATA_90 = {
  ...PREINSTALLED_SALES_AUDIT.allSalesData!,
  'Revenue Achievement': { revenue: 1200000, status: 'Active' }, // score ~80
  'End-User Accounts Closed': { accountsClosed: 4, status: 'Active' }, // score ~90
  'Sales Activities': { activities: { quotations: 15, meetings: 20, calls: 50 }, status: 'Active' }, // strong
  'Quotation Management': { quotationMgmt: { onTime: 50, errorFree: 48, followedUp: 50, total: 50 }, status: 'Active' }, // strong
  'Attendance & Discipline': { attendance: { days: 0, late: 0, violations: 0 }, status: 'Active' }, // strong
  'Additional Responsibilities': { additionalRespValue: 100, status: 'Active' }
} as any;

// Accounting: seed both panel-key data (for supervisor grading) AND category-key data
// (for Accounting Log Detail modal). Each category total should display as 90.
const ACCOUNTING_ALL_SALES_DATA_90 = {
  // Keep original panel-key structure used by AccountingSupervisorDashboard.calculateInitialScores
  ...PREINSTALLED_ACCOUNTING_AUDIT.allSalesData!,

  // Adjust attendance so employee scoring totals to 90
  'Attendance & Discipline': {
    attendance: { days: 0, late: 5, violations: 0 },
    status: 'Active'
  },

  // Category-key structure used by AccountingDashboard log detail modal
  'Accounting Excellence': {
    status: 'Active',
    // 30 + 25 + 25 + 10 = 90 (max 35/25/25/15)
    accExFinancial: 30,
    accExFinancialCritical: 0,
    accExFinancialMinor: 3,
    accExTimeliness: 25,
    accExReportsDay: 8,
    accExEntryPct: 90,
    accExAR: 25,
    accExDSODays: 30,
    accExCollectionsPct: 90,
    accExReconciliation: 10,
    accExCloseDay: 3
  },

  'Purchasing Excellence': {
    status: 'Active',
    // CostSavings(35) + VendorMgmt(30) + POAccuracy(25) = 90 (max 40/35/25)
    purchasingCostSavings: 35,
    purchasingCostSavingsPct: 3,
    purchasingBudgetOverPct: 0,
    purchasingVendorMgmt: 30,
    purchasingVendorRating: 4.6,
    purchasingDueDiligenceIncomplete: 0,
    purchasingStockIncidents: 1,
    purchasingPOAccuracy: 25,
    purchasingPOSpeedPct: 95,
    purchasingPOAccuracyPct: 98
  },

  'Administrative Excellence': {
    status: 'Active',
    // TaskCompletion&SL A(35) + Accuracy&Quality(35) + Satisfaction(20) = 90 (max 45/35/20)
    adminTaskSLA: 35,
    adminOnTimePct: 92,
    adminSLAMetPct: 93,
    adminAccuracyQuality: 35,
    adminErrorRatePct: 2,
    adminAccuracyPct: 99,
    adminCustomerSatisfaction: 20,
    adminSatisfactionPct: 4.5
  },

  'Additional Responsibilities': {
    status: 'Active',
    additionalRespValue: 90
  }
} as any;

// Marketing: reduce Accounting Excellence inputs slightly; keep ratings at 90 for consistent display
const MARKETING_ALL_SALES_DATA_90 = {
  ...PREINSTALLED_MARKETING_AUDIT.allSalesData!,
  'Accounting Excellence': {
    checklist: {
      financialAccuracyCritical: 0,
      financialAccuracyMinor: 3,
      timelinessReportDay: 10,
      timelinessEntryPct: 90,
      arManagementDSO: 40,
      arManagementCollections: 85,
      reconciliationCloseDay: 8
    },
    status: 'Active'
  }
} as any;

const makeSeedTransmission90 = (base: Transmission, opts: { id: string; daysAgo: number; status: 'pending' | 'validated' | 'rejected'; allSalesData: any }) => {
  const ts = daysAgoIso(opts.daysAgo);
  const status = opts.status === 'pending' ? undefined : opts.status;
  return {
    ...base,
    id: opts.id,
    timestamp: ts,
    startTime: ts,
    endTime: new Date(new Date(ts).getTime() + 3600000).toISOString(),
    status,
    supervisorComment: status === 'rejected' ? 'Pre-installed sample audit marked as rejected for demonstration.' : base.supervisorComment,
    // Keep a consistent 90% score label across validated/pending/rejected seed records
    ratings: { performance: 90, proficiency: 90, professionalism: 90, finalScore: 90, incentivePct: 90 },
    allSalesData: opts.allSalesData,
  } as unknown as Transmission;
};

/** Build Sales validated ratings (logDetailSnapshot + salesMetrics) from allSalesData. */
function buildSalesSeedRatings(allSalesData: typeof SALES_ALL_SALES_DATA_90): NonNullable<Transmission['ratings']> {
  const salesData = allSalesData || {};
  const revenueData = (salesData['Revenue Achievement'] || {}) as { revenue?: number };
  const accountsData = (salesData['End-User Accounts Closed'] || {}) as { accountsClosed?: number };
  const activitiesData = (salesData['Sales Activities'] || {}) as { activities?: { quotations?: number; meetings?: number; calls?: number } };
  const quotationData = (salesData['Quotation Management'] || {}) as { quotationMgmt?: { onTime?: number; errorFree?: number; followedUp?: number; total?: number } };
  const attendanceData = (salesData['Attendance & Discipline'] || {}) as { attendance?: { days?: number; late?: number; violations?: number } };
  const addRespData = (salesData['Additional Responsibilities'] || {}) as { additionalRespValue?: number };

  let revenueScore = 0;
  const revenue = revenueData.revenue ?? 0;
  if (revenue >= 1500000) revenueScore = 100;
  else if (revenue >= 1250000) revenueScore = 90;
  else if (revenue >= 1000000) revenueScore = 80;
  else if (revenue >= 750000) revenueScore = 70;

  let accountsScore = 0;
  const accounts = accountsData.accountsClosed ?? 0;
  if (accounts >= 5) accountsScore = 100;
  else if (accounts === 4) accountsScore = 90;
  else if (accounts === 3) accountsScore = 80;
  else if (accounts === 2) accountsScore = 70;
  else if (accounts === 1) accountsScore = 50;

  const q = Math.min(40, ((activitiesData.activities?.quotations ?? 0) / 15) * 40);
  const m = Math.min(40, ((activitiesData.activities?.meetings ?? 0) / 20) * 40);
  const c = Math.min(20, ((activitiesData.activities?.calls ?? 0) / 50) * 20);
  const activitiesScore = Math.min(100, Math.round(q + m + c));

  let quotationScore = 0;
  const qm = quotationData.quotationMgmt;
  const totalQuotes = qm?.total ?? 0;
  if (totalQuotes > 0) {
    const onTime = qm?.onTime ?? 0, errorFree = qm?.errorFree ?? 0, followedUp = qm?.followedUp ?? 0;
    const slaScore = (onTime / totalQuotes) * 50;
    const accuracyRate = (errorFree / totalQuotes) * 100;
    const accuracyScore = accuracyRate >= 95 ? 30 : accuracyRate >= 90 ? 25 : accuracyRate >= 85 ? 20 : 0;
    const followupScore = (followedUp / totalQuotes) * 20;
    quotationScore = Math.min(100, Math.round(slaScore + accuracyScore + followupScore));
  }

  const absences = attendanceData.attendance?.days ?? 0, tardies = attendanceData.attendance?.late ?? 0, violations = attendanceData.attendance?.violations ?? 0;
  const aScore = Math.max(0, 50 - (absences * 10));
  const pScore = Math.max(0, 30 - (Math.max(0, tardies - 2) * 15));
  const dScore = violations === 0 ? 20 : Math.max(0, 20 - (violations * 20));
  const attendanceScore = Math.min(100, Math.round(aScore + pScore + dScore));

  const additionalRespScore = Math.min(100, Math.max(0, Math.round(Number(addRespData.additionalRespValue) || 0)));

  const salesMetrics = { revenueScore, accountsScore, activitiesScore, quotationScore, attendanceScore, additionalRespScore };
  const weights = [40, 20, 20, 10, 5, 5] as const;
  const names = ['Revenue Achievement', 'End-User Accounts Closed', 'Sales Activities', 'Quotation Management', 'Attendance & Discipline', 'Additional Responsibilities'] as const;
  const keys = ['revenueScore', 'accountsScore', 'activitiesScore', 'quotationScore', 'attendanceScore', 'additionalRespScore'] as const;
  const logDetailSnapshot = names.map((name, i) => ({ name, weightPct: weights[i], score: (salesMetrics as Record<string, number>)[keys[i]] }));
  const finalScore = Math.round(
    revenueScore * 0.4 + accountsScore * 0.2 + activitiesScore * 0.2 + quotationScore * 0.1 + attendanceScore * 0.05 + additionalRespScore * 0.05
  );
  return { performance: 90, proficiency: 90, professionalism: 90, finalScore, incentivePct: finalScore, salesMetrics, logDetailSnapshot };
}

const PREINSTALLED_TECH_PENDING_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_TECHNICAL_AUDIT, { id: 'TX-TEC-PND-90', daysAgo: 8, status: 'pending', allSalesData: TECH_ALL_SALES_DATA_90 }), department: 'Technical' };
const PREINSTALLED_TECH_VALIDATED_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_TECHNICAL_AUDIT, { id: 'TX-TEC-VAL-90', daysAgo: 20, status: 'validated', allSalesData: TECH_ALL_SALES_DATA_90 }), department: 'Technical' };
const PREINSTALLED_TECH_REJECTED_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_TECHNICAL_AUDIT, { id: 'TX-TEC-REJ-90', daysAgo: 35, status: 'rejected', allSalesData: TECH_ALL_SALES_DATA_90 }), department: 'Technical' };

const PREINSTALLED_SALES_PENDING_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_SALES_AUDIT, { id: 'TX-SALES-PND-90', daysAgo: 7, status: 'pending', allSalesData: SALES_ALL_SALES_DATA_90 }), department: 'Sales' };
const PREINSTALLED_SALES_VALIDATED_90: Transmission = (() => {
  const base = makeSeedTransmission90(PREINSTALLED_SALES_AUDIT, { id: 'TX-SALES-VAL-90', daysAgo: 18, status: 'validated', allSalesData: SALES_ALL_SALES_DATA_90 }) as unknown as Transmission;
  return { ...base, department: 'Sales' as const, ratings: buildSalesSeedRatings(SALES_ALL_SALES_DATA_90) };
})();
const PREINSTALLED_SALES_REJECTED_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_SALES_AUDIT, { id: 'TX-SALES-REJ-90', daysAgo: 33, status: 'rejected', allSalesData: SALES_ALL_SALES_DATA_90 }), department: 'Sales' };

const PREINSTALLED_ACCOUNTING_PENDING_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_ACCOUNTING_AUDIT, { id: 'TX-ACC-PND-90', daysAgo: 6, status: 'pending', allSalesData: ACCOUNTING_ALL_SALES_DATA_90 }), department: 'Accounting' };
const PREINSTALLED_ACCOUNTING_VALIDATED_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_ACCOUNTING_AUDIT, { id: 'TX-ACC-VAL-90', daysAgo: 16, status: 'validated', allSalesData: ACCOUNTING_ALL_SALES_DATA_90 }), department: 'Accounting' };
const PREINSTALLED_ACCOUNTING_REJECTED_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_ACCOUNTING_AUDIT, { id: 'TX-ACC-REJ-90', daysAgo: 31, status: 'rejected', allSalesData: ACCOUNTING_ALL_SALES_DATA_90 }), department: 'Accounting' };

const PREINSTALLED_MARKETING_PENDING_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_MARKETING_AUDIT, { id: 'TX-MKT-PND-90', daysAgo: 9, status: 'pending', allSalesData: MARKETING_ALL_SALES_DATA_90 }), department: 'Marketing' };
const PREINSTALLED_MARKETING_VALIDATED_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_MARKETING_AUDIT, { id: 'TX-MKT-VAL-90', daysAgo: 22, status: 'validated', allSalesData: MARKETING_ALL_SALES_DATA_90 }), department: 'Marketing' };
const PREINSTALLED_MARKETING_REJECTED_90: Transmission = { ...makeSeedTransmission90(PREINSTALLED_MARKETING_AUDIT, { id: 'TX-MKT-REJ-90', daysAgo: 38, status: 'rejected', allSalesData: MARKETING_ALL_SALES_DATA_90 }), department: 'Marketing' };

const initialPending = [PREINSTALLED_TECH_PENDING_90, PREINSTALLED_SALES_PENDING_90, PREINSTALLED_ACCOUNTING_PENDING_90, PREINSTALLED_MARKETING_PENDING_90];
const initialHistory: Transmission[] = [
  PREINSTALLED_TECH_VALIDATED_90,
  PREINSTALLED_SALES_VALIDATED_90,
  PREINSTALLED_ACCOUNTING_VALIDATED_90,
  PREINSTALLED_MARKETING_VALIDATED_90,
  PREINSTALLED_TECH_REJECTED_90,
  PREINSTALLED_SALES_REJECTED_90,
  PREINSTALLED_ACCOUNTING_REJECTED_90,
  PREINSTALLED_MARKETING_REJECTED_90,
];

const TRANSMISSIONS_STORAGE_KEY = 'aa2000_kpi_transmissions';

function getStoredTransmissions(): { pending: Transmission[]; history: Transmission[] } | null {
  try {
    const raw = localStorage.getItem(TRANSMISSIONS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pending: Transmission[]; history: Transmission[] };
    if (Array.isArray(parsed?.pending) && Array.isArray(parsed?.history)) {
      // If storage was cleared/purged to empty, fall back to seeded records.
      // This keeps the app from booting into a blank state after destructive testing actions.
      if (parsed.pending.length === 0 && parsed.history.length === 0) return null;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredTransmissions(pending: Transmission[], history: Transmission[]) {
  try {
    localStorage.setItem(TRANSMISSIONS_STORAGE_KEY, JSON.stringify({ pending, history }));
  } catch {
    // ignore quota / private mode
  }
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [auditBuckets, setAuditBuckets] = useState<AuditBuckets>(() => {
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
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [registry, setRegistry] = useState<typeof INITIAL_REGISTRY>(INITIAL_REGISTRY);
  const [adminUsers, setAdminUsers] = useState<Record<string, string[]>>(INITIAL_ADMIN_USERS);

  const DEFAULT_DEPARTMENT_WEIGHTS: DepartmentWeights = {
    Technical: [
      { label: 'Project Execution Quality', weightPct: 40 },
      { label: 'Client Satisfaction & Turnover', weightPct: 25 },
      { label: 'Team Leadership & Accountability', weightPct: 15 },
      { label: 'Sales Support & Lead Development', weightPct: 10 },
      { label: 'Administrative Excellence', weightPct: 5 },
      { label: 'Attendance & Discipline', weightPct: 5 },
    ],
    IT: [
      { label: 'System Reliability & Uptime', weightPct: 30 },
      { label: 'Technical Support Quality', weightPct: 25 },
      { label: 'Security & Compliance', weightPct: 20 },
      { label: 'Project & Development Delivery', weightPct: 15 },
      { label: 'Administrative Excellence', weightPct: 5 },
      { label: 'Attendance & Discipline', weightPct: 5 },
    ],
    Sales: [
      { label: 'Revenue Score', weightPct: 40 },
      { label: 'Accounts Score', weightPct: 20 },
      { label: 'Activities Score', weightPct: 20 },
      { label: 'Quotation Mgmt', weightPct: 10 },
      { label: 'Attendance', weightPct: 5 },
      { label: 'Additional Responsibility', weightPct: 5 },
    ],
    Marketing: [
      { label: 'Campaign Execution & Quality', weightPct: 35 },
      { label: 'Lead Generation & Sales Support', weightPct: 30 },
      { label: 'Digital & Social Media Performance', weightPct: 25 },
      { label: 'Additional Responsibilities', weightPct: 5 },
      { label: 'Attendance & Discipline', weightPct: 5 },
    ],
    Accounting: [
      { label: 'Accounting Excellence', weightPct: 40 },
      { label: 'Purchasing Excellence', weightPct: 30 },
      { label: 'Administrative Excellence', weightPct: 25 },
      { label: 'Additional Responsibility', weightPct: 3 },
      { label: 'Attendance', weightPct: 2 },
    ],
  };
  /** Single source for employee/supervisor grading UI (weights, criteria content, panel definitions). Mutated only from admin: Edit weighted scores → Commit, Load standard, or per-dept Reset (not from unsaved drafts). */
  const [departmentWeights, setDepartmentWeights] = useState<DepartmentWeights>(() => loadDepartmentWeightsFromStorage() ?? DEFAULT_DEPARTMENT_WEIGHTS);

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
      }
    } catch {
      // ignore
    }
  }, []);

  // Keep seeded pre-installed demo audits in sync with the latest code.
  // Without this, localStorage can keep an older copy and the UI will still show old (incorrect) category inputs.
  useEffect(() => {
    setAuditBuckets((prev) => {
      const next: AuditBuckets = { ...prev };
      const b = next.Accounting ?? { pending: [], history: [] };
      next.Accounting = { pending: [...(b.pending || [])], history: [...(b.history || [])] };

      upsertAudit(next, 'Accounting', 'pending', PREINSTALLED_ACCOUNTING_PENDING_90);
      upsertAudit(next, 'Accounting', 'history', PREINSTALLED_ACCOUNTING_VALIDATED_90);
      upsertAudit(next, 'Accounting', 'history', PREINSTALLED_ACCOUNTING_REJECTED_90);
      return next;
    });
  }, []);

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
    try {
      localStorage.setItem(SESSION_USER_STORAGE_KEY, JSON.stringify(loggedInUser));
    } catch {
      // ignore
    }
    addNotification(`Welcome, ${loggedInUser.name}.`, loggedInUser.id, 'SUCCESS');
    addAuditEntry('SESSION_INIT', `Role: ${loggedInUser.role}`, 'OK', loggedInUser.name);
    const returnPath = (location.state as { from?: string } | null)?.from || '/dashboard';
    navigate(returnPath, { replace: true });
  }, [addNotification, addAuditEntry, navigate, location.state]);

  const handleLogout = useCallback(() => {
    addAuditEntry('SESSION_TERM', 'Disconnected', 'INFO');
    setUser(null);
    setNotifications([]);
    try {
      localStorage.removeItem(SESSION_USER_STORAGE_KEY);
    } catch {
      // ignore
    }
    navigate('/login');
  }, [addAuditEntry, navigate]);

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

    addAuditEntry('DATA_TRANSMIT', `${transmission.id} queued`, 'INFO', transmission.userName);
  }, [user, registry, addAuditEntry, setNotifications]);

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
      const employeeId = btoa(transmission.userName).substring(0, 12);
      const recLabel = supervisorRecommendation === 'approved' ? 'Approved' : 'Changes Requested';
      addNotification(`Your submission ${transmissionId} has been reviewed by your supervisor (${recLabel}). Awaiting admin finalization.`, employeeId, 'INFO');
    },
    [pendingTransmissions, user, addNotification]
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
      const employeeId = btoa(transmission.userName).substring(0, 12);
      if (status === 'validated') {
        setValidatedStats((prev) => ({ ...prev, [transmission.userId]: statsToUse }));
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
      const supId = btoa(sup.name).substring(0, 12);
      addNotification(`${user.name} deleted submission ${transmission.id}.`, supId, 'ALERT');
    });
    // Notify admin
    const admins = adminUsers['Admin'] || [];
    admins.forEach((adminName: string) => {
      const adminId = btoa(adminName).substring(0, 12);
      addNotification(`${user.name} (${dept}) deleted submission ${transmission.id}.`, adminId, 'ALERT');
    });
  }, [user, registry, adminUsers, addAuditEntry, addNotification]);

  const handleEditSubmission = useCallback((transmission: Transmission) => {
    if (!user) return;
    const dept = transmission.department || user.department || 'Unknown';
    addAuditEntry('DATA_EDIT', `Submission ${transmission.id} edited by ${user.name}`, 'INFO', user.name);

    // Notify supervisor(s)
    const deptSupervisors = registry.filter((u: any) => u.department === dept && u.role === UserRole.SUPERVISOR && u.isActive);
    deptSupervisors.forEach((sup: any) => {
      const supId = btoa(sup.name).substring(0, 12);
      addNotification(`${user.name} edited submission ${transmission.id}.`, supId, 'INFO');
    });
    // Notify admin
    const admins = adminUsers['Admin'] || [];
    admins.forEach((adminName: string) => {
      const adminId = btoa(adminName).substring(0, 12);
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
                ? 'h-screen w-full relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex flex-col'
                : 'h-screen w-full bg-slate-50 flex flex-col'
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
                <MobileSidenavProvider>
                  <Navbar
                    user={user}
                    onClearLocalCache={handleClearLocalCache}
                    validatedStats={validatedStats[user.id]}
                    registry={registry}
                    onUpdateRegistry={handleUpdateRegistry}
                    notifications={notifications.filter(n => n.targetUserId === user.id || (user.role === UserRole.ADMIN))}
                    onDeleteNotification={deleteNotification}
                  />
                  <main className="flex-1 flex flex-col min-h-0 w-full max-w-[1800px] mx-auto overflow-hidden">
                    <div className="px-4 sm:px-6 md:px-8 lg:px-0 py-4 sm:py-4 md:py-6 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
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
                        onValidate={handleValidate}
                        onSupervisorGrade={handleSupervisorGrade}
                        onPostAnnouncement={handlePostAnnouncement}
                        onDeleteAnnouncement={handleDeleteAnnouncement}
                        onAddAuditEntry={addAuditEntry}
                        onDeleteUser={handleDeleteUser}
                        onUpdateRegistry={handleUpdateRegistry}
                        onUpdateAdminUsers={handleUpdateAdminUsers}
                        onClearEmployeeAudits={handleClearEmployeeAudits}
                      />
                    </div>
                  </main>
                </MobileSidenavProvider>
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
            <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
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

export default App;
