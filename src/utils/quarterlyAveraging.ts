import type { Transmission } from '../types';

export type CategoryAvg = {
  name: string;
  avgScore: number;
  weightPct: number;
};

export type QuarterlyBreakdown = {
  quarter: 1 | 2 | 3 | 4;
  submissionCount: number;
  avgFinalScore: number;
  topCategories: CategoryAvg[];
};

export type AnnualSummary = {
  year: number;
  yearAvgFinalScore: number;
  totalSubmissions: number;
  quarterly: QuarterlyBreakdown[];
  // kept for backwards compat
  yearAvgPerformance: number;
  yearAvgProficiency: number;
  yearAvgProfessionalism: number;
};

export type YearTrendRow = {
  year: number;
  performance: number;
  trend: 'up' | 'down' | 'flat';
};

function transmissionYear(t: Transmission): number | null {
  const d = new Date(t.timestamp);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

function quarterOf(d: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function isValidated(t: Transmission): boolean {
  return t.status === 'validated';
}

function topCategoriesFromGroup(txs: Transmission[]): CategoryAvg[] {
  const catMap: Record<string, { scores: number[]; weightPct: number }> = {};
  for (const t of txs) {
    const snap = t.ratings?.logDetailSnapshot;
    if (!snap?.length) continue;
    for (const entry of snap) {
      if (!entry?.name) continue;
      if (!catMap[entry.name]) catMap[entry.name] = { scores: [], weightPct: entry.weightPct ?? 0 };
      catMap[entry.name].scores.push(entry.score ?? 0);
      catMap[entry.name].weightPct = entry.weightPct ?? catMap[entry.name].weightPct;
    }
  }
  return Object.entries(catMap)
    .map(([name, { scores, weightPct }]) => ({
      name,
      avgScore: parseFloat(mean(scores).toFixed(1)),
      weightPct,
    }))
    .sort((a, b) => b.weightPct - a.weightPct)
    .slice(0, 4);
}

export function getAvailableYears(transmissions: Transmission[]): number[] {
  const years = new Set<number>();
  for (const t of transmissions) {
    if (!isValidated(t)) continue;
    const y = transmissionYear(t);
    if (y != null) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

export function calculateAnnualSummary(transmissions: Transmission[], year: number): AnnualSummary {
  const inYear = transmissions.filter((t) => isValidated(t) && transmissionYear(t) === year);
  const finals = inYear.map((t) => Number(t.ratings?.finalScore ?? 0));
  const yearAvgFinalScore = parseFloat(mean(finals).toFixed(1));

  const byQuarter: Record<1 | 2 | 3 | 4, Transmission[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const t of inYear) {
    const d = new Date(t.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    byQuarter[quarterOf(d)].push(t);
  }

  const quarterly: QuarterlyBreakdown[] = ([1, 2, 3, 4] as const)
    .map((q) => {
      const arr = byQuarter[q];
      return {
        quarter: q,
        submissionCount: arr.length,
        avgFinalScore: parseFloat(mean(arr.map((x) => Number(x.ratings?.finalScore ?? 0))).toFixed(1)),
        topCategories: topCategoriesFromGroup(arr),
      };
    })
    .filter((q) => q.submissionCount > 0);

  return {
    year,
    yearAvgFinalScore,
    totalSubmissions: inYear.length,
    quarterly,
    yearAvgPerformance: yearAvgFinalScore,
    yearAvgProficiency: yearAvgFinalScore,
    yearAvgProfessionalism: yearAvgFinalScore,
  };
}

export function compareAnnualPerformance(summaries: AnnualSummary[]): YearTrendRow[] {
  const sorted = [...summaries].sort((a, b) => a.year - b.year);
  return sorted.map((s, i) => {
    const prevPerf = i > 0 ? sorted[i - 1].yearAvgFinalScore : null;
    const perf = s.yearAvgFinalScore;
    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (prevPerf != null) {
      const delta = perf - prevPerf;
      if (delta > 0.5) trend = 'up';
      else if (delta < -0.5) trend = 'down';
    }
    return { year: s.year, performance: perf, trend };
  });
}
