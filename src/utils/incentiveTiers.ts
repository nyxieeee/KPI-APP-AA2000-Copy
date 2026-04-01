export interface IncentiveTier {
  status: string;
  outcome: string;
  minScore: number;
  yield: number;
  /** Optional display string for supervisor/employee Yield cards (e.g. ₱9k - ₱12k). */
  payoutRange?: string;
}

export const DEFAULT_INCENTIVE_TIERS: IncentiveTier[] = [
  { status: 'Top Performer', outcome: 'Top Tier Eligible', minScore: 90, yield: 100, payoutRange: '₱9k - ₱12k' },
  { status: 'Mid Performer', outcome: 'Mid Tier Eligible', minScore: 80, yield: 75, payoutRange: '₱6k - ₱8k' },
  { status: 'Base Performer', outcome: 'Base Tier Eligible', minScore: 70, yield: 50, payoutRange: '₱3k - ₱4.5k' },
  { status: 'Coaching Required', outcome: 'Improvement Plan', minScore: 60, yield: 0, payoutRange: '₱0' },
  { status: 'Underperformer', outcome: 'PIP / Review', minScore: 0, yield: 0, payoutRange: '₱0 (PIP)' },
];

export const INCENTIVE_TIERS_STORAGE_KEY = 'aa2000_kpi_incentive_tiers';
export const INCENTIVE_Tiers_UPDATED_EVENT = 'aa2000_kpi_incentive_tiers_updated';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeTiers(raw: any): IncentiveTier[] | null {
  if (!Array.isArray(raw)) return null;

  const tiers: IncentiveTier[] = raw
    .map((t) => ({
      status: String(t?.status ?? ''),
      outcome: String(t?.outcome ?? ''),
      minScore: clamp(Number(t?.minScore ?? 0), 0, 100),
      yield: clamp(Number(t?.yield ?? 0), 0, 100),
      payoutRange:
        typeof t?.payoutRange === 'string' && t.payoutRange.trim() ? String(t.payoutRange).trim() : undefined,
    }))
    .filter((t) => t.status.length > 0 || t.outcome.length > 0);

  if (tiers.length < 1) return null;

  // Ensure deterministic order for compute: highest threshold first.
  tiers.sort((a, b) => b.minScore - a.minScore);
  return tiers;
}

export function getIncentiveTiersFromStorage(): IncentiveTier[] {
  try {
    const raw = localStorage.getItem(INCENTIVE_TIERS_STORAGE_KEY);
    if (!raw) return DEFAULT_INCENTIVE_TIERS;
    const parsed = JSON.parse(raw);
    return normalizeTiers(parsed) ?? DEFAULT_INCENTIVE_TIERS;
  } catch {
    return DEFAULT_INCENTIVE_TIERS;
  }
}

export function saveIncentiveTiersToStorage(tiers: IncentiveTier[]) {
  try {
    localStorage.setItem(INCENTIVE_TIERS_STORAGE_KEY, JSON.stringify(tiers));
  } catch {
    // ignore
  }
}

export function computeIncentivePctFromFinal(finalScore: number, tiers: IncentiveTier[] = DEFAULT_INCENTIVE_TIERS) {
  const sorted = [...tiers].sort((a, b) => b.minScore - a.minScore);
  const safeFinal = clamp(Number(finalScore ?? 0), 0, 100);
  const selected =
    sorted.find((t) => safeFinal >= t.minScore) ??
    sorted[sorted.length - 1] ??
    { yield: 0, minScore: 0, outcome: '', status: '' };

  const pct = Number(selected.yield ?? 0) / 100;
  return clamp(pct, 0, 1);
}

/** Highest minScore first (same order as eligibility checks). */
export function getSortedIncentiveTiersDesc(tiers: IncentiveTier[]): IncentiveTier[] {
  return [...tiers].sort((a, b) => b.minScore - a.minScore);
}

/**
 * Score band label for a tier row, e.g. "90 - 100", "80 - 89", "< 60" for the bottom tier.
 * `sortedDesc` must be from `getSortedIncentiveTiersDesc`.
 */
export function formatIncentiveTierScoreRange(sortedDesc: IncentiveTier[], index: number): string {
  const t = sortedDesc[index];
  if (!t) return '';
  const lower = t.minScore;
  if (index === 0) {
    return `${lower} - 100`;
  }
  const upperBound = sortedDesc[index - 1].minScore - 1;
  if (lower === 0 && index === sortedDesc.length - 1) {
    return `< ${sortedDesc[index - 1].minScore}`;
  }
  return `${lower} - ${upperBound}`;
}

/** Which tier applies to a final score (same rule as yield %). */
export function getIncentiveTierForScore(finalScore: number, tiers: IncentiveTier[] = DEFAULT_INCENTIVE_TIERS): IncentiveTier {
  const sorted = getSortedIncentiveTiersDesc(tiers);
  const safe = clamp(Number(finalScore ?? 0), 0, 100);
  return sorted.find((t) => safe >= t.minScore) ?? sorted[sorted.length - 1];
}

/** Display line for incentive amount on Yield UI. */
export function formatIncentiveTierPayoutDisplay(tier: IncentiveTier): string {
  const pr = tier.payoutRange?.trim();
  if (pr) return pr;
  if (Number(tier.yield ?? 0) > 0) return `Yield ${tier.yield}%`;
  return '₱0';
}

/** Tailwind classes for employee tier chips (by index in sorted-desc tiers). */
export const SUPERVISOR_TIER_ROW_BUBBLE_STYLES = [
  'text-blue-700 bg-blue-50 border-blue-100',
  'text-blue-600 bg-blue-50/80 border-blue-100',
  'text-blue-600 bg-blue-50 border-blue-100',
  'text-amber-700 bg-amber-50 border-amber-100',
  'text-slate-400 bg-slate-50 border-slate-100',
  'text-blue-600 bg-blue-50 border-blue-100',
];

export function getSupervisorTierRowStyle(tierIndex: number): string {
  const i = Math.max(0, Math.min(tierIndex, SUPERVISOR_TIER_ROW_BUBBLE_STYLES.length - 1));
  return SUPERVISOR_TIER_ROW_BUBBLE_STYLES[i];
}

