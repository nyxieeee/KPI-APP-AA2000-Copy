import React, { useMemo } from 'react';
import { Trophy, Star, Activity, AlertCircle, Info, type LucideIcon } from 'lucide-react';
import type { IncentiveTier } from '../utils/incentiveTiers';
import {
  getSortedIncentiveTiersDesc,
  formatIncentiveTierScoreRange,
  formatIncentiveTierPayoutDisplay,
} from '../utils/incentiveTiers';

const TIER_ICONS: LucideIcon[] = [Trophy, Star, Activity, AlertCircle, Info];

/** Visual accent per card index (matches standard 5-tier layout). */
const CARD_ACCENTS = [
  {
    iconWrap: 'bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/50/90 shadow-sm shadow-blue-500/5',
    icon: 'text-blue-700 dark:text-blue-400',
    payout: 'text-blue-900 dark:text-blue-300',
    title: 'text-slate-500 dark:text-slate-400 dark:text-slate-400',
  },
  {
    iconWrap: 'bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/50/90 shadow-sm shadow-blue-500/5',
    icon: 'text-blue-700 dark:text-blue-400',
    payout: 'text-blue-900 dark:text-blue-300',
    title: 'text-slate-500 dark:text-slate-400 dark:text-slate-400',
  },
  {
    iconWrap: 'bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/50/90 shadow-sm shadow-blue-500/5',
    icon: 'text-blue-700 dark:text-blue-400',
    payout: 'text-blue-900 dark:text-blue-300',
    title: 'text-slate-500 dark:text-slate-400 dark:text-slate-400',
  },
  {
    iconWrap: 'bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800/50/80 shadow-sm shadow-amber-500/5',
    icon: 'text-amber-700',
    payout: 'text-amber-800',
    title: 'text-slate-500 dark:text-slate-400 dark:text-slate-400',
  },
  {
    iconWrap: 'bg-slate-100 dark:bg-[#0d1526] border border-slate-100 dark:border-slate-700/50',
    icon: 'text-slate-500 dark:text-slate-400 dark:text-slate-400',
    payout: 'text-slate-600 dark:text-slate-400 dark:text-slate-400',
    title: 'text-slate-500 dark:text-slate-400 dark:text-slate-400',
  },
];

type Props = {
  tiers: IncentiveTier[];
  /** e.g. "Technical" — shown in the subtitle for department context */
  departmentLabel?: string;
  className?: string;
};

/**
 * Shared incentive tier cards for all department supervisors.
 * Data is driven by the admin Incentive eligibility matrix (localStorage + live event).
 */
export const SupervisorIncentiveMatrixPanel: React.FC<Props> = ({
  tiers,
  departmentLabel,
  className = '',
}) => {
  const sorted = useMemo(() => getSortedIncentiveTiersDesc(tiers), [tiers]);

  const cards = useMemo(
    () =>
      sorted.map((row, i) => {
        const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
        const Icon = TIER_ICONS[i % TIER_ICONS.length];
        return {
          key: `${row.status}-${row.minScore}-${i}`,
          tier: row,
          range: formatIncentiveTierScoreRange(sorted, i),
          amount: formatIncentiveTierPayoutDisplay(row),
          accent,
          Icon,
        };
      }),
    [sorted]
  );

  if (cards.length === 0) return null;

  return (
    <section
      className={`rounded-[2rem] border border-slate-200 dark:border-slate-600/90 bg-white dark:bg-[#0d1526] p-6 md:p-8 shadow-sm ${className}`}
      aria-label="Incentive eligibility matrix"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
        <div className="min-w-0">
          <p className="text-[10px] font-black tracking-[0.28em] text-slate-400 dark:text-slate-500 uppercase">Incentive eligibility matrix</p>
          <h3 className="mt-1.5 text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Performance tiers</h3>
          <p className="mt-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-widest max-w-xl leading-relaxed">
            Mirrors admin <span className="text-blue-600">Grading standards</span> for incentive tiers — min score, POINTS %, and payout
            labels apply to every department supervisor view.
            {departmentLabel ? (
              <>
                {' '}
                <span className="text-slate-600 dark:text-slate-400 dark:text-slate-400">Current view: {departmentLabel}.</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600/90 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 dark:text-slate-400 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live admin sync
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map(({ key, tier, range, amount, accent, Icon }) => (
          <article
            key={key}
            className="group flex flex-col rounded-[1.75rem] border border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800 p-5 md:p-6 min-h-[12rem] shadow-[0_2px_24px_rgba(15,23,42,0.045)] transition-all duration-200 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md"
          >
            <div className="flex justify-between items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent.iconWrap}`}
                aria-hidden
              >
                <Icon className={`h-5 w-5 ${accent.icon}`} strokeWidth={2} />
              </div>
              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right leading-snug max-w-[9rem]">
                <span className="text-slate-500 dark:text-slate-400 dark:text-slate-400">{range}</span>{' '}
                <span className="text-slate-400 dark:text-slate-500">PTS</span>
              </p>
            </div>

            <h4 className={`mt-5 text-[10px] font-black uppercase tracking-[0.22em] ${accent.title} line-clamp-2`}>
              {tier.status}
            </h4>

            <p className={`mt-3 text-lg md:text-xl font-black tracking-tight leading-snug ${accent.payout}`}>{amount}</p>

            {tier.outcome?.trim() ? (
              <p className="mt-3 text-[9px] font-semibold text-slate-400 dark:text-slate-500 leading-snug line-clamp-2 border-t border-slate-100 dark:border-slate-700/60 pt-3 mt-auto">
                {tier.outcome}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};
