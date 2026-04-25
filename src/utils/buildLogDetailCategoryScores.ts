import type { Transmission } from '../types';
import type { CategoryScoreForPdf } from './logDetailToPdf';
import type { DepartmentWeights } from '../types';

const TECH_CHECKLIST_CONTENT: Record<string, string[]> = {
  'Project Execution Quality': [
    'Zero Back-Job Rate (25 points)',
    'First-Time Fix Quality (12 points)',
    'Technical Compliance & Standards (7 points)',
    'Schedule Adherence (6 points)',
  ],
  'Client Satisfaction & Turnover': [
    'Client Satisfaction Score - CSAT (15 points)',
    'Smooth Turnover Rate (5 points)',
    'Zero Client Complaints/Escalations (5 points)',
  ],
  'Team Leadership & Accountability': [
    'Team Performance Under Supervision (7 points)',
    'Safety Record - Zero Incidents (4 points) - CRITICAL',
    'Accountability & Ownership (4 points)',
  ],
  'Administrative Excellence': ['Report Submission Timeliness (1 point)', 'Report Accuracy (1 point)'],
  'Additional Responsibilities': ['Additional tasks & coverage (3 points)'],
  'Attendance & Discipline': ['Absence (3 points)', 'Punctuality (1 point)', 'Unpreparedness (1 point)'],
};

const SALES_PANEL_NAMES: Record<string, string[]> = {
  'Revenue Achievement': ['Monthly Revenue'],
  'Revenue Score': ['Monthly Revenue'],
  'End-User Accounts Closed': ['Accounts Closed'],
  'Accounts Score': ['Accounts Closed'],
  'Sales Activities': ['Quotations', 'Meetings', 'Follow-up Calls'],
  'Activities Score': ['Quotations', 'Meetings', 'Follow-up Calls'],
  'Quotation Management': ['On-time Delivery', 'Error-free', 'Followed Up'],
  'Quotation Mgmt': ['On-time Delivery', 'Error-free', 'Followed Up'],
  'Attendance & Discipline': ['Attendance', 'Punctuality', 'Discipline'],
  'Attendance': ['Attendance', 'Punctuality', 'Discipline'],
  'Additional Responsibilities': ['Additional Responsibilities'],
  'Additional Responsibility': ['Additional Responsibilities'],
  'Administrative Excellence': ['Process & documentation', 'Compliance'],
};

const MARKETING_PANEL_NAMES: Record<string, string[]> = {
  'Campaign Execution & Quality': ['Campaign quality', 'Creative & delivery', 'Objectives met'],
  'Lead Generation & Sales Support': ['Lead volume', 'Sales enablement', 'Handoff quality'],
  'Digital & Social Media Performance': ['Engagement', 'Follower growth', 'Channel health'],
  'Additional Responsibilities': ['Additional Responsibilities'],
  'Attendance & Discipline': ['Attendance', 'Punctuality', 'Discipline'],
  'Administrative Excellence': ['Reporting & budget admin', 'Stakeholder updates'],
};

const ACCOUNTING_PANEL_NAMES: Record<string, string[]> = {
  'Accounting Excellence': [
    'Financial Accuracy & Compliance',
    'Timeliness — Reports & Entries',
    'Accounts Receivable Management',
    'Reconciliation & Month-End Close',
  ],
  'Purchasing Excellence': ['Cost Savings & Budget Compliance', 'Vendor Management & Quality', 'PO Processing & Accuracy'],
  'Purchasing/Admin Excellence': ['PO coordination', 'Admin & documentation'],
  'Administrative Excellence': ['Task Completion & SLA', 'Accuracy & Quality', 'Internal Customer Satisfaction'],
  'Attendance & Discipline': ['Attendance', 'Punctuality', 'Discipline'],
  'Additional Responsibilities': ['Additional Responsibilities'],
};

function getMaxFromLabels(labels: string[]): number {
  return labels.reduce((sum, l) => {
    const m = l.match(/\((\d+)\s*points?\)/i);
    return sum + (m ? parseInt(m[1], 10) : 0);
  }, 0);
}

function cleanLabel(label: string): string {
  return label.replace(/\s*\(\d+\s*points?\)\s*$/i, '').replace(/\s*-\s*CRITICAL\s*$/i, '').trim();
}

function coerceTaskScore(task: unknown, maxpoints: number): number {
  if (task && typeof task === 'object' && (task as any).score !== undefined) return Number((task as any).score) || 0;
  if (task === true) return maxpoints;
  if (typeof task === 'number') return task;
  return 0;
}

function buildTechnicalPanelItems(log: Transmission, categoryName: string): { panelItems: { name: string; score: number }[]; maxScore: number } {
  const labels = TECH_CHECKLIST_CONTENT[categoryName] || [];
  const maxScore = getMaxFromLabels(labels);
  const checklist = (log.allSalesData as any)?.[categoryName]?.checklist || {};
  const panelItems = labels.map((label, idx) => {
    const key = `task${idx + 1}`;
    const maxpoints = (() => {
      const m = label.match(/\((\d+)\s*points?\)/i);
      return m ? parseInt(m[1], 10) : 0;
    })();
    const score = coerceTaskScore((checklist as any)[key], maxpoints);
    return { name: cleanLabel(label), score };
  });
  return { panelItems, maxScore };
}

function sumCategoryScoreFromAllSalesData(catData: any): number {
  if (!catData) return 0;
  if (catData.revenue != null) return 0; // handled by Sales-specific logic
  if (catData.accountsClosed != null) return 0; // handled by Sales-specific logic
  const checklist = catData.checklist || {};
  let total = 0;
  Object.values(checklist).forEach((val: any) => {
    if (val && typeof val === 'object' && val.score !== undefined) total += Number(val.score) || 0;
    else if (typeof val === 'number') total += val;
  });
  if (typeof checklist.score === 'number') return Number(checklist.score) || total;
  return total;
}

// Mirrors the scoring logic used in SalesDashboard's log detail PDF generation (fallback path).
function computeSalesCategoryScore(name: string, data: any): number {
  const REVENUE_TARGET = 1500000, ACCOUNTS_TARGET = 10;
  const getRevenueScore = (r: number) => Math.min(100, Math.round((r / REVENUE_TARGET) * 100));
  const getAccountsScore = (a: number) => Math.min(100, Math.round((a / ACCOUNTS_TARGET) * 100));
  const getActivitiesScore = (act: any) => {
    if (!act) return 0;
    const q = act.quotations ?? 0, m = act.meetings ?? 0, c = act.calls ?? 0;
    const qNorm = Math.min(1, q / 20) * 33.33, mNorm = Math.min(1, m / 15) * 33.33, cNorm = Math.min(1, c / 30) * 33.34;
    return Math.min(100, Math.round((qNorm + mNorm + cNorm) * 10) / 10);
  };
  const getQuotationScore = (q: any) => {
    if (!q || q.total === 0) return 0;
    const slaScore = (q.onTime / q.total) * 100 * 0.50;
    const accuracyRate = (q.errorFree / q.total) * 100;
    const accuracyScore = accuracyRate >= 95 ? 30 : accuracyRate >= 90 ? 25 : accuracyRate >= 85 ? 20 : 0;
    return slaScore + accuracyScore + (q.followedUp / q.total) * 100 * 0.20;
  };
  const getAttendanceScore = (a: any) => {
    if (!a) return 0;
    const abs = typeof a.days === 'number' ? a.days : Number(a.days) || 0;
    const late = typeof a.late === 'number' ? a.late : Number(a.late) || 0;
    const viol = typeof a.violations === 'number' ? a.violations : Number(a.violations) || 0;
    const aScore = a.days === '' ? 0 : Math.max(0, 50 - abs * 10);
    const pScore = a.late === '' ? 0 : Math.max(0, 30 - Math.max(0, late - 2) * 15);
    const dScore = a.violations === '' ? 0 : (viol === 0 ? 20 : Math.max(0, 20 - viol * 20));
    return Math.min(100, aScore + pScore + dScore);
  };

  if (name === 'Revenue Achievement' || name === 'Revenue Score')
    return getRevenueScore(Number(data?.revenue ?? 0));
  if (name === 'End-User Accounts Closed' || name === 'Accounts Score')
    return getAccountsScore(Number(data?.accountsClosed ?? 0));
  if (name === 'Sales Activities' || name === 'Activities Score') return getActivitiesScore(data?.activities);
  if (name === 'Quotation Management' || name === 'Quotation Mgmt') return getQuotationScore(data?.quotationMgmt);
  if (name === 'Attendance & Discipline' || name === 'Attendance') return getAttendanceScore(data?.attendance);
  if (name === 'Additional Responsibilities' || name === 'Additional Responsibility')
    return Number(data?.additionalRespValue) || 0;
  if (name === 'Administrative Excellence') {
    const v = (data as { administrativeExcellence?: number })?.administrativeExcellence;
    return v != null && Number.isFinite(Number(v)) ? Math.min(100, Math.max(0, Number(v))) : 0;
  }
  return 0;
}

export function buildLogDetailCategoryScores(
  log: Transmission,
  department: string,
  departmentWeights?: DepartmentWeights
): CategoryScoreForPdf[] | undefined {
  const snapshot = log.ratings?.logDetailSnapshot;
  const baseFromSnapshot =
    Array.isArray(snapshot) && snapshot.length > 0
      ? snapshot.map((s) => ({ name: s.name, score: s.score, weightPct: s.weightPct }))
      : undefined;

  // If we don't have snapshot, fall back to what's in allSalesData (best effort).
  const categories = baseFromSnapshot?.map((c) => c.name) || Object.keys((log.allSalesData as any) || {});
  if (!categories || categories.length === 0) return baseFromSnapshot as any;

  return categories.map((name) => {
    const snap = baseFromSnapshot?.find((c) => c.name === name);
    const weightPct =
      snap?.weightPct ??
      departmentWeights?.[department]?.find((w) => w.label === name)?.weightPct ??
      undefined;

    const catData = (log.allSalesData as any)?.[name];
    const score =
      snap?.score ??
      (department === 'Sales'
        ? computeSalesCategoryScore(name, catData)
        : department === 'Technical'
          ? (() => {
              const { panelItems } = buildTechnicalPanelItems(log, name);
              return panelItems.reduce((sum, p) => sum + (Number(p.score) || 0), 0);
            })()
          : sumCategoryScoreFromAllSalesData(catData));

    if (department === 'Technical') {
      const { panelItems, maxScore } = buildTechnicalPanelItems(log, name);
      return { name, score, weightPct, maxScore: maxScore || undefined, panelItems };
    }

    if (department === 'Sales') {
      const scoreRounded = Math.round(Number(score) * 10) / 10;
      const catCfg = departmentWeights?.['Sales']?.find((w) => w.label === name);
      const maxScore = catCfg?.content?.reduce((s, item) => s + (Number(item.maxpoints) || 0), 0) || undefined;
      return { name, score: scoreRounded, weightPct, maxScore, panelNames: SALES_PANEL_NAMES[name] || [] };
    }

    if (department === 'Marketing') {
      const catCfg = departmentWeights?.['Marketing']?.find((w) => w.label === name);
      const maxScore = catCfg?.content?.reduce((s, item) => s + (Number(item.maxpoints) || 0), 0) || undefined;
      return { name, score, weightPct, maxScore, panelNames: MARKETING_PANEL_NAMES[name] || [] };
    }

    if (department === 'Accounting') {
      const catCfg = departmentWeights?.['Accounting']?.find((w) => w.label === name);
      const maxScore = catCfg?.content?.reduce((s, item) => s + (Number(item.maxpoints) || 0), 0) || undefined;
      return { name, score, weightPct, maxScore, panelNames: ACCOUNTING_PANEL_NAMES[name] || [] };
    }

    return { name, score, weightPct };
  });
}

