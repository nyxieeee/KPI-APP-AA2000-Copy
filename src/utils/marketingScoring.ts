/**
 * Marketing KPI category score computation (shared for supervisor dashboard).
 * Mirrors logic from Marketing employee dashboard allSalesData → category totals.
 */

function getFinancialAccuracyScore(critical: number, minor: number): number {
  if (critical >= 2) return 0;
  if (critical === 1) return 15;
  if (minor <= 2) return 35;
  if (minor <= 5) return 30;
  return 30;
}

function getTimelinessReportScore(day: number): number {
  if (day <= 0) return 0;
  if (day <= 7) return 15;
  if (day <= 10) return 12;
  if (day <= 14) return 8;
  return 0;
}

function getTimelinessEntryScore(pct: number): number {
  if (pct >= 95) return 15;
  if (pct >= 90) return 13;
  if (pct >= 85) return 10;
  return 0;
}

function getARManagementDSOScore(days: number): number {
  if (days <= 35) return 15;
  if (days <= 45) return 13;
  if (days <= 60) return 10;
  return 0;
}

function getARManagementCollectionsScore(pct: number): number {
  if (pct >= 90) return 10;
  if (pct >= 85) return 8;
  if (pct >= 80) return 5;
  return 0;
}

function getReconciliationScore(day: number): number {
  if (day <= 0 || day > 10) return 0;
  if (day <= 5) return 10;
  if (day <= 7) return 8;
  return 5;
}

function getCostSavingsScore(pct: number): number {
  if (pct >= 7) return 25;
  if (pct >= 5) return 22;
  if (pct >= 3) return 20;
  if (pct >= 1) return 15;
  return 0;
}

function getBudgetComplianceScore(overPct: number): number {
  if (overPct <= 0) return 15;
  if (overPct <= 3) return 12;
  if (overPct <= 5) return 8;
  return 0;
}

function getVendorRatingScore(rating: number): number {
  if (rating >= 4.5) return 15;
  if (rating >= 4) return 13;
  if (rating >= 3.5) return 10;
  return 0;
}

function getDueDiligenceScore(incomplete: number): number {
  if (incomplete <= 0) return 10;
  if (incomplete === 1) return 7;
  return 0;
}

function getStockAvailabilityScore(incidents: number): number {
  if (incidents <= 0) return 10;
  if (incidents === 1) return 5;
  return 0;
}

function getPOSpeedScore(pct: number): number {
  if (pct >= 95) return 15;
  if (pct >= 90) return 13;
  if (pct >= 85) return 10;
  return 0;
}

function getPOAccuracyScore(pct: number): number {
  if (pct >= 98) return 10;
  if (pct >= 95) return 8;
  if (pct >= 90) return 6;
  return 0;
}

function getTaskCompletionScore(pct: number): number {
  if (pct >= 95) return 25;
  if (pct >= 90) return 18;
  return 0;
}

function getSLAComplianceScore(pct: number): number {
  if (pct >= 95) return 20;
  if (pct >= 90) return 17;
  if (pct >= 85) return 14;
  return 0;
}

function getErrorRateScore(pct: number): number {
  if (pct <= 2) return 20;
  if (pct <= 3) return 14;
  return 0;
}

function getDataEntryScore(pct: number): number {
  if (pct >= 99) return 15;
  if (pct >= 98) return 12;
  if (pct >= 95) return 6;
  return 0;
}

function getInternalCustomerSatisfactionScore(rating: number): number {
  if (rating >= 4.5) return 20;
  if (rating >= 4.0) return 17;
  if (rating >= 3.5) return 14;
  if (rating >= 3.0) return 10;
  return 0;
}

export function getAccountingBreakdown(checklist: Record<string, unknown>): {
  financialAccuracy: number;
  timeliness: number;
  arManagement: number;
  reconciliation: number;
} {
  const crit = Math.max(0, Number(checklist.financialAccuracyCritical) || 0);
  const minor = Math.max(0, Number(checklist.financialAccuracyMinor) || 0);
  const useErrorInputs = 'financialAccuracyCritical' in checklist || 'financialAccuracyMinor' in checklist;
  const a = useErrorInputs ? getFinancialAccuracyScore(crit, minor) : Math.min(35, Math.max(0, Number(checklist.financialAccuracy) || 0));

  const reportDay = Math.min(31, Math.max(0, Math.round(Number(checklist.timelinessReportDay) || 0)));
  const entryPct = Math.min(100, Math.max(0, Number(checklist.timelinessEntryPct) || 0));
  const useTimelinessInputs = 'timelinessReportDay' in checklist || 'timelinessEntryPct' in checklist;
  const b = useTimelinessInputs ? getTimelinessReportScore(reportDay) + getTimelinessEntryScore(entryPct) : Math.min(30, Math.max(0, Number(checklist.timeliness) || 0));

  const arDSODays = Math.max(0, Math.round(Number(checklist.arManagementDSO) || 0));
  const arCollectionsPct = Math.min(100, Math.max(0, Number(checklist.arManagementCollections) || 0));
  const useARInputs = 'arManagementDSO' in checklist || 'arManagementCollections' in checklist;
  const c = useARInputs ? getARManagementDSOScore(arDSODays) + getARManagementCollectionsScore(arCollectionsPct) : Math.min(25, Math.max(0, Number(checklist.arManagement) || 0));

  const reconciliationDay = Math.min(31, Math.max(0, Math.round(Number(checklist.reconciliationCloseDay) || 0)));
  const useReconciliationInput = 'reconciliationCloseDay' in checklist;
  const d = useReconciliationInput ? getReconciliationScore(reconciliationDay) : Math.min(10, Math.max(0, Number(checklist.reconciliation) || 0));

  return { financialAccuracy: a, timeliness: b, arManagement: c, reconciliation: d };
}

function getAccountingAggregate(checklist: Record<string, unknown>): number {
  const { financialAccuracy, timeliness, arManagement, reconciliation } = getAccountingBreakdown(checklist);
  const total = financialAccuracy + timeliness + arManagement + reconciliation;
  return Number.isFinite(total) ? total : 0;
}

export function getPurchasingBreakdown(checklist: Record<string, unknown>): {
  costSavingsBudget: number;
  vendorManagement: number;
  poProcessing: number;
} {
  const useCostSavingsInputs = 'costSavingsPct' in checklist || 'budgetOverPct' in checklist;
  const costSavingsPctVal = Math.min(100, Math.max(0, Number(checklist.costSavingsPct) || 0));
  const budgetOverPctVal = Math.max(0, Number(checklist.budgetOverPct) || 0);
  const costSavings = useCostSavingsInputs ? getCostSavingsScore(costSavingsPctVal) + getBudgetComplianceScore(budgetOverPctVal) : Math.min(40, Math.max(0, Number(checklist.costSavings) || 0));

  const useVendorInputs = 'vendorRating' in checklist || 'dueDiligenceIncomplete' in checklist || 'stockAvailabilityIncidents' in checklist;
  const vendorRatingVal = Math.min(5, Math.max(0, Number(checklist.vendorRating) || 0));
  const dueDiligenceIncompleteVal = Math.max(0, Math.round(Number(checklist.dueDiligenceIncomplete) || 0));
  const stockIncidentsVal = Math.max(0, Math.round(Number(checklist.stockAvailabilityIncidents) || 0));
  const vendorManagement = useVendorInputs ? getVendorRatingScore(vendorRatingVal) + getDueDiligenceScore(dueDiligenceIncompleteVal) + getStockAvailabilityScore(stockIncidentsVal) : Math.min(35, Math.max(0, Number(checklist.vendorManagement) || 0));

  const usePOInputs = 'poSpeedPct' in checklist || 'poAccuracyPct' in checklist;
  const poSpeedPctVal = Math.min(100, Math.max(0, Number(checklist.poSpeedPct) || 0));
  const poAccuracyPctVal = Math.min(100, Math.max(0, Number(checklist.poAccuracyPct) || 0));
  const poProcessing = usePOInputs ? getPOSpeedScore(poSpeedPctVal) + getPOAccuracyScore(poAccuracyPctVal) : Math.min(25, Math.max(0, Number(checklist.poProcessing) || 0));

  return { costSavingsBudget: costSavings, vendorManagement, poProcessing };
}

function getPurchasingAggregate(checklist: Record<string, unknown>): number {
  const { costSavingsBudget, vendorManagement, poProcessing } = getPurchasingBreakdown(checklist);
  const total = costSavingsBudget + vendorManagement + poProcessing;
  return Number.isFinite(total) ? total : 0;
}

export function getAdministrativeBreakdown(checklist: Record<string, unknown>): {
  taskCompletionSla: number;
  accuracyQuality: number;
  internalCustomerSatisfaction: number;
} {
  const useTaskSlaInputs = 'taskCompletionPct' in checklist || 'slaCompliancePct' in checklist;
  const taskCompletionPctVal = Math.min(100, Math.max(0, Number(checklist.taskCompletionPct) || 0));
  const slaCompliancePctVal = Math.min(100, Math.max(0, Number(checklist.slaCompliancePct) || 0));
  const taskCompletionSla = useTaskSlaInputs ? getTaskCompletionScore(taskCompletionPctVal) + getSLAComplianceScore(slaCompliancePctVal) : Math.min(45, Math.max(0, Number(checklist.taskCompletionSla) || 0));

  const useAccuracyInputs = 'errorRatePct' in checklist || 'dataEntryPct' in checklist;
  const errorRatePctVal = Math.min(100, Math.max(0, Number(checklist.errorRatePct) || 0));
  const dataEntryPctVal = Math.min(100, Math.max(0, Number(checklist.dataEntryPct) || 0));
  const accuracyQuality = useAccuracyInputs ? getErrorRateScore(errorRatePctVal) + getDataEntryScore(dataEntryPctVal) : Math.min(35, Math.max(0, Number(checklist.accuracyQuality) || 0));

  const useInternalSatisfactionInput = 'internalSurveyRating' in checklist;
  const internalSurveyRatingVal = Math.min(5, Math.max(0, Number(checklist.internalSurveyRating) || 0));
  const internalCustomerSatisfaction = useInternalSatisfactionInput ? getInternalCustomerSatisfactionScore(internalSurveyRatingVal) : Math.min(20, Math.max(0, Number(checklist.internalCustomerSatisfaction) || 0));

  return { taskCompletionSla, accuracyQuality, internalCustomerSatisfaction };
}

function getAdministrativeAggregate(checklist: Record<string, unknown>): number {
  const { taskCompletionSla, accuracyQuality, internalCustomerSatisfaction } = getAdministrativeBreakdown(checklist);
  const total = taskCompletionSla + accuracyQuality + internalCustomerSatisfaction;
  return Number.isFinite(total) ? total : 0;
}

function getAttendanceDisciplineAggregate(checklist: Record<string, unknown>): number {
  const t1 = (checklist.task1 || {}) as Record<string, unknown>;
  const t2 = (checklist.task2 || {}) as Record<string, unknown>;
  const t3 = (checklist.task3 || {}) as Record<string, unknown>;
  const absences = Math.max(0, Math.round(Number(t1.absences) || 0));
  const tardies = Math.max(0, Math.round(Number(t2.tardies) || 0));
  const violations = Math.max(0, Math.round(Number(t3.violations) || 0));
  const absencePts = Math.max(0, 60 - (absences * 10));
  const punctualityPts = tardies <= 3 ? 30 : Math.max(0, 30 - ((tardies - 3) * 5));
  const disciplinePts = Math.max(0, 10 - (violations * 10));
  const total = absencePts + punctualityPts + disciplinePts;
  return Number.isFinite(total) ? total : 0;
}

export function getAttendanceBreakdown(checklist: Record<string, unknown>): {
  task1: { score: number; absences: number };
  task2: { score: number; tardies: number };
  task3: { score: number; violations: number };
} {
  const t1 = (checklist.task1 || {}) as Record<string, unknown>;
  const t2 = (checklist.task2 || {}) as Record<string, unknown>;
  const t3 = (checklist.task3 || {}) as Record<string, unknown>;
  const absences = Math.max(0, Math.round(Number(t1.absences) || 0));
  const tardies = Math.max(0, Math.round(Number(t2.tardies) || 0));
  const violations = Math.max(0, Math.round(Number(t3.violations) || 0));
  const absencePts = Math.max(0, 60 - (absences * 10));
  const punctualityPts = tardies <= 3 ? 30 : Math.max(0, 30 - ((tardies - 3) * 5));
  const disciplinePts = Math.max(0, 10 - (violations * 10));
  return {
    task1: { score: absencePts, absences },
    task2: { score: punctualityPts, tardies },
    task3: { score: disciplinePts, violations },
  };
}

export interface MarketingCategoryTotals {
  campaignExecution: number;
  leadGeneration: number;
  digitalSocialMedia: number;
  additionalResponsibilities: number;
  attendanceDiscipline: number;
  administrativeExcellence: number;
}

export function getCategoryTotalsFromAllSalesData(
  allData: Record<string, { checklist?: Record<string, unknown> } | undefined>
): MarketingCategoryTotals {
  const campaignChecklist = allData['Campaign Execution & Quality']?.checklist ?? {};
  const leadChecklist = allData['Lead Generation & Sales Support']?.checklist ?? {};
  const digitalChecklist = allData['Digital & Social Media Performance']?.checklist ?? {};
  const addChecklist = allData['Additional Responsibilities']?.checklist ?? {};
  const attChecklist = allData['Attendance & Discipline']?.checklist ?? {};
  const adminExChecklist = allData['Administrative Excellence']?.checklist ?? {};

  return {
    campaignExecution: getAccountingAggregate(campaignChecklist as Record<string, unknown>),
    leadGeneration: getPurchasingAggregate(leadChecklist as Record<string, unknown>),
    digitalSocialMedia: getAdministrativeAggregate(digitalChecklist as Record<string, unknown>),
    additionalResponsibilities: Math.min(100, Math.max(0, Number(addChecklist.additionalRespValue) || 0)),
    attendanceDiscipline: getAttendanceDisciplineAggregate(attChecklist as Record<string, unknown>),
    administrativeExcellence: getAdministrativeAggregate(adminExChecklist as Record<string, unknown>),
  };
}

const MARKETING_WEIGHTS = {
  campaignExecution: 0.5,
  leadGeneration: 0.25,
  digitalSocialMedia: 0.15,
  attendanceDiscipline: 0.05,
  additionalResponsibilities: 0.03,
  administrativeExcellence: 0.02,
} as const;

export function getWeightedScoreFromTotals(totals: MarketingCategoryTotals): number {
  const sum =
    totals.campaignExecution * MARKETING_WEIGHTS.campaignExecution +
    totals.leadGeneration * MARKETING_WEIGHTS.leadGeneration +
    totals.digitalSocialMedia * MARKETING_WEIGHTS.digitalSocialMedia +
    totals.additionalResponsibilities * MARKETING_WEIGHTS.additionalResponsibilities +
    totals.attendanceDiscipline * MARKETING_WEIGHTS.attendanceDiscipline +
    totals.administrativeExcellence * MARKETING_WEIGHTS.administrativeExcellence;
  return Math.min(100, Math.max(0, Math.round(sum * 100) / 100));
}

/** Same as `getWeightedScoreFromTotals` but uses admin Department grading weights (label keys). */
export function getWeightedScoreFromCategoryWeights(
  totals: MarketingCategoryTotals,
  categoryWeights: Record<string, number>
): number {
  const w = categoryWeights;
  const sum =
    totals.campaignExecution * (w['Campaign Execution & Quality'] ?? MARKETING_WEIGHTS.campaignExecution) +
    totals.leadGeneration * (w['Lead Generation & Sales Support'] ?? MARKETING_WEIGHTS.leadGeneration) +
    totals.digitalSocialMedia * (w['Digital & Social Media Performance'] ?? MARKETING_WEIGHTS.digitalSocialMedia) +
    totals.additionalResponsibilities * (w['Additional Responsibilities'] ?? MARKETING_WEIGHTS.additionalResponsibilities) +
    totals.attendanceDiscipline * (w['Attendance & Discipline'] ?? MARKETING_WEIGHTS.attendanceDiscipline) +
    totals.administrativeExcellence * (w['Administrative Excellence'] ?? MARKETING_WEIGHTS.administrativeExcellence);
  return Math.min(100, Math.max(0, Math.round(sum * 100) / 100));
}
