import React, { useMemo } from 'react';
import { Transmission } from '../types';
import { calculateAnnualSummary, getAvailableYears, compareAnnualPerformance } from '../utils/quarterlyAveraging';
import { TrendingUp, TrendingDown, Minus, CalendarCheck, BarChart3, Trophy } from 'lucide-react';

interface AnnualSummaryPanelProps {
  transmissions: Transmission[];
  selectedUser?: string;
}

export const AnnualSummaryPanel: React.FC<AnnualSummaryPanelProps> = ({
  transmissions,
  selectedUser
}) => {
  const availableYears = useMemo(() => getAvailableYears(transmissions), [transmissions]);
  const [selectedYear, setSelectedYear] = React.useState(availableYears[0] || new Date().getFullYear());

  const userTransmissions = useMemo(() => {
    if (!selectedUser) return transmissions;
    return transmissions.filter(tx => tx.userName === selectedUser);
  }, [transmissions, selectedUser]);

  const summary = useMemo(
    () => calculateAnnualSummary(userTransmissions, selectedYear),
    [userTransmissions, selectedYear]
  );

  const trends = useMemo(() => {
    const allYearSummaries = availableYears.map(year => calculateAnnualSummary(userTransmissions, year));
    return compareAnnualPerformance(allYearSummaries);
  }, [userTransmissions, availableYears]);

  const scoreColor = (score: number) =>
    score >= 90 ? 'text-emerald-600 dark:text-emerald-400' :
    score >= 75 ? 'text-blue-600 dark:text-blue-400' :
    score >= 60 ? 'text-amber-600 dark:text-amber-400' :
    score > 0   ? 'text-red-600 dark:text-red-400' :
                  'text-slate-400 dark:text-slate-500';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
          <CalendarCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">
            Year-End Summary
          </h3>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-0.5">
            Quarterly performance breakdown and year-over-year trends
          </p>
        </div>
      </div>

      {availableYears.length > 0 ? (
        <>
          {/* Year selector */}
          <div className="flex gap-2 flex-wrap">
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all ${
                  selectedYear === year
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {year}
              </button>
            ))}
          </div>

          {/* Annual KPI card */}
          <div className="bg-slate-900 dark:bg-[#0b1222] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Annual Average · {selectedYear}
              </p>
              <p className={`text-5xl font-black tabular-nums ${scoreColor(summary.yearAvgFinalScore)}`}>
                {summary.yearAvgFinalScore.toFixed(1)}%
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Submissions</p>
                <p className="text-xl font-black text-white mt-0.5">{summary.totalSubmissions}</p>
              </div>
              <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Quarters</p>
                <p className="text-xl font-black text-white mt-0.5">{summary.quarterly.length}</p>
              </div>
            </div>
          </div>

          {/* Quarterly breakdown */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <h4 className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                Quarterly Performance
              </h4>
            </div>

            {summary.quarterly.length === 0 ? (
              <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-center">
                <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  No validated submissions for {selectedYear}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {summary.quarterly.map(q => (
                  <div
                    key={q.quarter}
                    className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm"
                  >
                    {/* Quarter header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest">
                          Q{q.quarter}
                        </span>
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                          {q.submissionCount} submission{q.submissionCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className={`text-2xl font-black tabular-nums ${scoreColor(q.avgFinalScore)}`}>
                        {q.avgFinalScore.toFixed(1)}%
                      </span>
                    </div>

                    {/* Score bar */}
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-none"
                        style={{ width: `${Math.min(100, q.avgFinalScore)}%` }}
                      />
                    </div>

                    {/* Top category breakdown if available */}
                    {q.topCategories.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        {q.topCategories.map(cat => (
                          <div key={cat.name}>
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide truncate">
                              {cat.name}
                            </p>
                            <p className={`text-sm font-black mt-0.5 ${scoreColor(cat.avgScore)}`}>
                              {cat.avgScore.toFixed(1)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Year-over-Year Trends */}
          {trends.length > 1 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-slate-400" />
                <h4 className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  Year-over-Year Trends
                </h4>
              </div>
              <div className="space-y-2">
                {trends.map(trend => (
                  <div
                    key={trend.year}
                    className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600"
                  >
                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                      {trend.year}
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${Math.min(100, trend.performance)}%` }}
                        />
                      </div>
                      <span className={`text-sm font-black tabular-nums w-14 text-right ${scoreColor(trend.performance)}`}>
                        {trend.performance.toFixed(1)}%
                      </span>
                      {trend.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />}
                      {trend.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />}
                      {trend.trend === 'flat' && <Minus className="w-4 h-4 text-slate-400 shrink-0" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-10 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-center">
          <CalendarCheck className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            No data yet
          </p>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
            Year-end summary appears once submissions have been validated by admin.
          </p>
        </div>
      )}
    </div>
  );
};

export default AnnualSummaryPanel;
