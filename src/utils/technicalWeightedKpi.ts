import type { Transmission, DepartmentWeights, CategoryWeightItem } from '../types';
import { computeCategoryAggregateMetrics } from '../components/audit/TechnicalCategoryAuditPanel';
import { getGradeForScore, type GradeInfo } from './gradingSystem';

type ClassificationWeightRow = { name: string; weight: string };

/**
 * Legacy canonical Sales slot names (structured scoring / old logs). Mapped from Department grading labels.
 * New Core flow uses `departmentWeights.Sales[].label` as `allSalesData` keys (same pattern as Technical).
 */
export const SALES_WEIGHTED_CATEGORY_ORDER = [
  'Revenue Achievement',
  'End-User Accounts Closed',
  'Sales Activities',
  'Quotation Management',
  'Attendance & Discipline',
  'Additional Responsibilities',
  'Administrative Excellence',
] as const;

/** Default category labels when admin has not saved Department grading (matches Admin defaults). */
export const DEFAULT_SALES_CATEGORY_LABELS = [
  'Revenue Score',
  'Accounts Score',
  'Activities Score',
  'Attendance & Discipline',
  'Additional Responsibilities',
  'Administrative Excellence',
] as const;

const DEFAULT_SALES_WEIGHT_PCTS = [50, 25, 15, 5, 3, 2] as const;

/** Map Department grading label (or legacy canonical name) to legacy scoring slot. */
function legacySalesSlot(label: string): string {
  const t = String(label ?? '').trim();
  if ((SALES_WEIGHTED_CATEGORY_ORDER as readonly string[]).includes(t)) return t;
  const map: Record<string, (typeof SALES_WEIGHTED_CATEGORY_ORDER)[number]> = {
    'Revenue Score': 'Revenue Achievement',
    'Accounts Score': 'End-User Accounts Closed',
    'Activities Score': 'Sales Activities',
    'Quotation Mgmt': 'Quotation Management',
    'Attendance': 'Attendance & Discipline',
    'Additional Responsibility': 'Additional Responsibilities',
  };
  if (map[t]) return map[t];
  return t;
}

/** Category order for KPI / PDF: same as Technical — follow `departmentWeights.Sales` row order. */
export function getSalesWeightedCategoryOrderDynamic(departmentWeights: DepartmentWeights | undefined): string[] {
  const sales = departmentWeights?.Sales;
  if (sales?.length) return sales.map((c) => c.label);
  return [...DEFAULT_SALES_CATEGORY_LABELS] as string[];
}

/** Weight rows for `getSalesWeightedKpiSum` (`name` = Department grading label). */
export function getSalesClassificationRowsForKpi(
  departmentWeights: DepartmentWeights | undefined
): ClassificationWeightRow[] {
  const sales = departmentWeights?.Sales;
  if (sales?.length) {
    return sales.map((c) => ({ name: c.label, weight: `${c.weightPct}%` }));
  }
  return (DEFAULT_SALES_CATEGORY_LABELS as readonly string[]).map((name, i) => ({
    name,
    weight: `${DEFAULT_SALES_WEIGHT_PCTS[i] ?? 0}%`,
  }));
}

/** Resolve admin row for Sales (label === `departmentWeights.Sales[].label`). Same idea as Technical. */
export function resolveSalesCategoryWeightItem(
  category: string,
  departmentWeights: DepartmentWeights | undefined
): CategoryWeightItem | undefined {
  return departmentWeights?.Sales?.find((c) => c.label === category);
}

/** Legacy 0–100 category score from structured Sales `allSalesData` (no admin criteria). */
export function computeSalesLegacyCategoryScore(
  category: string,
  catData: Record<string, unknown>,
  log: Pick<Transmission, 'allSalesData' | 'revenueValue' | 'accountsClosedValue'>
): number {
  const slot = legacySalesSlot(category);
  const t = log as Transmission;
  const REVENUE_TARGET = 1500000;
  const ACCOUNTS_TARGET = 10;

  switch (slot) {
    case 'Revenue Achievement': {
      const revenue = Number((catData as { revenue?: number }).revenue ?? t.revenueValue ?? 0);
      return Math.min(100, Math.round((revenue / REVENUE_TARGET) * 100));
    }
    case 'End-User Accounts Closed': {
      const accounts = Number((catData as { accountsClosed?: number }).accountsClosed ?? t.accountsClosedValue ?? 0);
      return Math.min(100, Math.round((accounts / ACCOUNTS_TARGET) * 100));
    }
    case 'Sales Activities': {
      const act = (catData as { activities?: { quotations: number; meetings: number; calls: number } }).activities;
      if (!act) return 0;
      const q = act.quotations ?? 0;
      const m = act.meetings ?? 0;
      const c = act.calls ?? 0;
      const qNorm = Math.min(1, q / 20) * 33.33;
      const mNorm = Math.min(1, m / 15) * 33.33;
      const cNorm = Math.min(1, c / 30) * 33.34;
      return Math.min(100, Math.round((qNorm + mNorm + cNorm) * 10) / 10);
    }
    case 'Quotation Management': {
      const q = (catData as { quotationMgmt?: { onTime: number; errorFree: number; followedUp: number; total: number } }).
        quotationMgmt;
      if (!q || q.total === 0) return 0;
      const complianceRate = (q.onTime / q.total) * 100;
      const slaScore = complianceRate * 0.5;
      const accuracyRate = (q.errorFree / q.total) * 100;
      const accuracyScore = accuracyRate >= 95 ? 30 : accuracyRate >= 90 ? 25 : accuracyRate >= 85 ? 20 : 0;
      const followupRate = (q.followedUp / q.total) * 100;
      const followupScore = followupRate * 0.2;
      return slaScore + accuracyScore + followupScore;
    }
    case 'Attendance & Discipline': {
      const a = (catData as { attendance?: { days: number | ''; late: number | ''; violations: number | '' } }).attendance;
      if (!a) return 0;
      const absences = typeof a.days === 'number' ? a.days : 0;
      const tardies = typeof a.late === 'number' ? a.late : 0;
      const violations = typeof a.violations === 'number' ? a.violations : 0;
      const aScore = a.days === '' ? 0 : Math.max(0, 50 - absences * 10);
      const pScore = a.late === '' ? 0 : Math.max(0, 30 - Math.max(0, tardies - 2) * 15);
      const dScore = a.violations === '' ? 0 : violations === 0 ? 20 : Math.max(0, 20 - violations * 20);
      return Math.min(100, aScore + pScore + dScore);
    }
    case 'Additional Responsibilities': {
      return Number((catData as { additionalRespValue?: number }).additionalRespValue) || 0;
    }
    case 'Administrative Excellence': {
      const v = (catData as { administrativeExcellence?: number }).administrativeExcellence;
      if (v != null && Number.isFinite(Number(v))) return Math.min(100, Math.max(0, Number(v)));
      return 0;
    }
    default:
      return 0;
  }
}

/** Department slices that use the shared weighted-KPI / checklist pipeline. */
export type WeightedKpiDepartmentKey = 'Technical' | 'Sales' | 'Accounting' | 'IT' | 'Marketing';

function deptWeightRows(
  departmentWeights: DepartmentWeights | undefined,
  departmentKey: WeightedKpiDepartmentKey
): CategoryWeightItem[] | undefined {
  switch (departmentKey) {
    case 'Sales':
      return departmentWeights?.Sales;
    case 'Accounting':
      return departmentWeights?.Accounting;
    case 'IT':
      return departmentWeights?.IT;
    case 'Marketing':
      return departmentWeights?.Marketing;
    default:
      return departmentWeights?.Technical;
  }
}

/**
 * Global weighted KPI from `allSalesData` + admin department breakdown (same as Verify / Log Detail / PDF).
 * Admin criteria: Σ weightedImpactPct per category. Legacy Technical: Σ (category raw pts × weight/100).
 * Legacy Sales: Σ (legacy 0–100 category score × weight/100).
 */
export function getDepartmentWeightedKpiSum(
  log: Pick<Transmission, 'allSalesData' | 'revenueValue' | 'accountsClosedValue'>,
  departmentWeights: DepartmentWeights | undefined,
  departmentKey: WeightedKpiDepartmentKey,
  CHECKLIST_CONTENT: Record<string, string[]> = {},
  CLASSIFICATIONS: ClassificationWeightRow[] = []
): number {
  const allData = (log.allSalesData || {}) as Record<string, { checklist?: Record<string, unknown> }>;
  const deptConfig = deptWeightRows(departmentWeights, departmentKey);
  const categoryOrder =
    departmentKey === 'Sales'
      ? getSalesWeightedCategoryOrderDynamic(departmentWeights)
      : deptConfig?.length
        ? deptConfig.map((c) => c.label)
        : Object.keys(allData);

  let weightedSum = 0;

  for (const category of categoryOrder) {
    const catData = allData[category] || { checklist: {} };
    const checklist = (catData.checklist || {}) as Record<string, unknown>;
    const catCfg =
      departmentKey === 'Sales'
        ? resolveSalesCategoryWeightItem(category, departmentWeights)
        : deptConfig?.find((w) => w.label === category);

    if (catCfg?.content?.length) {
      const m = computeCategoryAggregateMetrics(catCfg, checklist as any);
      weightedSum += m.weightedImpactPct;
    } else if (departmentKey === 'Sales') {
      const legacy = computeSalesLegacyCategoryScore(category, catData as Record<string, unknown>, log);
      const weightPct =
        parseInt(CLASSIFICATIONS.find((c) => c.name === category)?.weight || '0', 10) || 0;
      weightedSum += legacy * (weightPct / 100);
    } else {
      const labels = CHECKLIST_CONTENT[category] || [];
      let totalScore = 0;
      labels.forEach((label, taskIdx) => {
        const key = `task${taskIdx + 1}`;
        const item = checklist[key];
        const maxpoints = label
          ? (() => {
              const mm = label.match(/\((\d+)\s*points?\)/i);
              return mm ? parseInt(mm[1], 10) : 0;
            })()
          : 0;
        let pts = 0;
        if (typeof item === 'object' && item != null && (item as Record<string, unknown>).score !== undefined) {
          pts = Number((item as Record<string, unknown>).score) || 0;
        } else if (item === true) pts = maxpoints;
        totalScore += pts;
      });
      const weightPct =
        parseInt(CLASSIFICATIONS.find((c) => c.name === category)?.weight || '0', 10) || 0;
      weightedSum += totalScore * (weightPct / 100);
    }
  }

  return Math.min(100, Math.max(0, weightedSum));
}

/** 
 * Returns both the numeric total (0–100) and the standardized GradeInfo (letter, label, color).
 */
export function getDepartmentWeightedScoreAndGrade(
  log: Pick<Transmission, 'allSalesData' | 'revenueValue' | 'accountsClosedValue'>,
  departmentWeights: DepartmentWeights | undefined,
  departmentKey: WeightedKpiDepartmentKey,
  CHECKLIST_CONTENT: Record<string, string[]> = {},
  CLASSIFICATIONS: ClassificationWeightRow[] = []
): { score: number; grade: GradeInfo } {
  const score = getDepartmentWeightedKpiSum(log, departmentWeights, departmentKey, CHECKLIST_CONTENT, CLASSIFICATIONS);
  return {
    score,
    grade: getGradeForScore(score),
  };
}

/** Legacy `technicalMetrics` keys from older supervisor saves → canonical category labels. */
const LEGACY_TECHNICAL_METRIC_KEYS: Array<{ key: string; label: string }> = [
  { key: 'projectExecutionScore', label: 'Project Execution Quality' },
  { key: 'clientSatisfactionScore', label: 'Client Satisfaction & Turnover' },
  { key: 'teamLeadershipScore', label: 'Team Leadership & Accountability' },
  { key: 'salesSupportScore', label: 'Sales Support & Lead Development' },
  { key: 'additionalResponsibilitiesScore', label: 'Additional Responsibilities' },
  { key: 'adminExcellenceScore', label: 'Administrative Excellence' },
  { key: 'attendanceScore', label: 'Attendance & Discipline' },
];

/**
 * Normalizes supervisor-stored metrics to label-keyed 0–100 scores (matches employee submission + admin criteria).
 */
export function migrateLegacyTechnicalMetrics(tm: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!tm || typeof tm !== 'object') return out;
  const keys = Object.keys(tm);
  const looksLikeLegacy = keys.some((k) => LEGACY_TECHNICAL_METRIC_KEYS.some((m) => m.key === k));
  if (!looksLikeLegacy) {
    for (const [k, v] of Object.entries(tm)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(100, Math.max(0, v));
    }
    return out;
  }
  for (const { key, label } of LEGACY_TECHNICAL_METRIC_KEYS) {
    const v = tm[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[label] = Math.min(100, Math.max(0, v));
  }
  return out;
}

/**
 * Per-category score 0–100 from employee `allSalesData` + admin Department grading (same rules as employee KPI / log detail).
 */
export function getDepartmentCategoryRawScoresForSupervisor(
  log: Pick<Transmission, 'allSalesData' | 'revenueValue' | 'accountsClosedValue'>,
  departmentWeights: DepartmentWeights | undefined,
  departmentKey: WeightedKpiDepartmentKey,
  CHECKLIST_CONTENT: Record<string, string[]>
): Record<string, number> {
  const allData = (log.allSalesData || {}) as Record<string, { checklist?: Record<string, unknown> }>;
  const deptConfig = deptWeightRows(departmentWeights, departmentKey);
  const categoryOrder =
    departmentKey === 'Sales'
      ? getSalesWeightedCategoryOrderDynamic(departmentWeights)
      : deptConfig?.length
        ? deptConfig.map((c) => c.label)
        : Object.keys(allData);

  const out: Record<string, number> = {};

  for (const category of categoryOrder) {
    const catData = allData[category] || { checklist: {} };
    const checklist = (catData.checklist || {}) as Record<string, unknown>;
    const catCfg =
      departmentKey === 'Sales'
        ? resolveSalesCategoryWeightItem(category, departmentWeights)
        : deptConfig?.find((w) => w.label === category);

    if (catCfg?.content?.length) {
      const m = computeCategoryAggregateMetrics(catCfg, checklist as any);
      const pct =
        m.categorymaxpoints > 0 ? Math.round((m.aggregatePts / m.categorymaxpoints) * 100) : 0;
      out[category] = Math.min(100, Math.max(0, pct));
    } else if (departmentKey === 'Sales') {
      const legacy = computeSalesLegacyCategoryScore(category, catData as Record<string, unknown>, log);
      out[category] = Math.min(100, Math.max(0, Math.round(legacy)));
    } else {
      const labels = CHECKLIST_CONTENT[category] || [];
      let totalScore = 0;
      let maxPts = 0;
      labels.forEach((label, taskIdx) => {
        const key = `task${taskIdx + 1}`;
        const item = checklist[key];
        const maxpoints = label
          ? (() => {
              const mm = label.match(/\((\d+)\s*points?\)/i);
              return mm ? parseInt(mm[1], 10) : 0;
            })()
          : 0;
        maxPts += maxpoints;
        let pts = 0;
        if (typeof item === 'object' && item != null && (item as Record<string, unknown>).score !== undefined) {
          pts = Number((item as Record<string, unknown>).score) || 0;
        } else if (item === true) pts = maxpoints;
        totalScore += pts;
      });
      const pct =
        maxPts > 0 ? Math.round((totalScore / maxPts) * 100) : Math.min(100, Math.round(totalScore));
      out[category] = Math.min(100, Math.max(0, pct));
    }
  }

  return out;
}

export function getTechnicalWeightedKpiSum(
  log: Pick<Transmission, 'allSalesData'>,
  departmentWeights: DepartmentWeights | undefined,
  CHECKLIST_CONTENT: Record<string, string[]> = {},
  CLASSIFICATIONS: ClassificationWeightRow[] = []
): number {
  return getDepartmentWeightedKpiSum(log, departmentWeights, 'Technical', CHECKLIST_CONTENT, CLASSIFICATIONS);
}

export function getSalesWeightedKpiSum(
  log: Pick<Transmission, 'allSalesData' | 'revenueValue' | 'accountsClosedValue'>,
  departmentWeights: DepartmentWeights | undefined,
  CHECKLIST_CONTENT: Record<string, string[]> = {},
  CLASSIFICATIONS: ClassificationWeightRow[] = []
): number {
  return getDepartmentWeightedKpiSum(log, departmentWeights, 'Sales', CHECKLIST_CONTENT, CLASSIFICATIONS);
}

/** Same weighted KPI pipeline as Technical — admin `departmentWeights.Accounting` + `allSalesData` checklists. */
export function getAccountingWeightedKpiSum(
  log: Pick<Transmission, 'allSalesData'>,
  departmentWeights: DepartmentWeights | undefined,
  CHECKLIST_CONTENT: Record<string, string[]> = {},
  CLASSIFICATIONS: ClassificationWeightRow[] = []
): number {
  return getDepartmentWeightedKpiSum(log, departmentWeights, 'Accounting', CHECKLIST_CONTENT, CLASSIFICATIONS);
}
/** Same weighted KPI pipeline as Technical — admin `departmentWeights.IT` + `allSalesData` checklists. */
export function getITWeightedKpiSum(
  log: Pick<Transmission, 'allSalesData'>,
  departmentWeights: DepartmentWeights | undefined,
  CHECKLIST_CONTENT: Record<string, string[]> = {},
  CLASSIFICATIONS: ClassificationWeightRow[] = []
): number {
  return getDepartmentWeightedKpiSum(log, departmentWeights, 'IT', CHECKLIST_CONTENT, CLASSIFICATIONS);
}

/** Same weighted KPI pipeline as Technical — admin `departmentWeights.Marketing` + `allSalesData` checklists. */
export function getMarketingWeightedKpiSum(
  log: Pick<Transmission, 'allSalesData'>,
  departmentWeights: DepartmentWeights | undefined,
  CHECKLIST_CONTENT: Record<string, string[]> = {},
  CLASSIFICATIONS: ClassificationWeightRow[] = []
): number {
  return getDepartmentWeightedKpiSum(log, departmentWeights, 'Marketing', CHECKLIST_CONTENT, CLASSIFICATIONS);
}
