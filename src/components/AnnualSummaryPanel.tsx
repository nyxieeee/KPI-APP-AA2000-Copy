import React, { useMemo } from 'react';
import { Transmission } from '../types';
import { calculateAnnualSummary, getAvailableYears, compareAnnualPerformance } from '../utils/quarterlyAveraging';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

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

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-base font-black uppercase tracking-wide text-slate-900">Year-End Summary</h3>
        <p className="text-xs text-slate-500 mt-0.5">Quarterly performance breakdown and year-over-year trends</p>
      </div>

      {/* Year Selection */}
      {availableYears.length > 0 ? (
        <>
          <div className="flex gap-2 flex-wrap">
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                  selectedYear === year
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {year}
              </button>
            ))}
          </div>

          {/* Annual Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
              <p className="text-xs font-semibold text-blue-700">Avg Performance</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{summary.yearAvgPerformance.toFixed(1)}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-indigo-50 border border-indigo-200">
              <p className="text-xs font-semibold text-indigo-700">Avg Proficiency</p>
              <p className="text-2xl font-bold text-indigo-900 mt-1">{summary.yearAvgProficiency.toFixed(1)}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-purple-50 border border-purple-200">
              <p className="text-xs font-semibold text-purple-700">Avg Professionalism</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">{summary.yearAvgProfessionalism.toFixed(1)}</p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-xs font-semibold text-green-700">Final Score</p>
              <p className="text-2xl font-bold text-green-900 mt-1">{summary.yearAvgFinalScore.toFixed(1)}</p>
            </div>
          </div>

          {/* Total submissions */}
          <p className="text-xs text-slate-500">
            Based on <span className="font-semibold text-slate-700">{summary.totalSubmissions}</span> validated submission{summary.totalSubmissions !== 1 ? 's' : ''} in {selectedYear}
          </p>

          {/* Quarterly Breakdown */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Quarterly Performance</h4>
            {summary.quarterly.length === 0 ? (
              <div className="p-6 rounded-lg border border-slate-200 bg-slate-50 text-center text-sm text-slate-500">
                No validated submissions for {selectedYear}.
              </div>
            ) : (
              <div className="space-y-2">
                {summary.quarterly.map(q => (
                  <div key={q.quarter} className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-900">Q{q.quarter}</span>
                      <span className="text-sm font-bold text-slate-700">{q.submissionCount} submission{q.submissionCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-slate-600">Performance</p>
                        <p className="font-bold text-slate-900">{q.avgPerformance.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Proficiency</p>
                        <p className="font-bold text-slate-900">{q.avgProficiency.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Professionalism</p>
                        <p className="font-bold text-slate-900">{q.avgProfessionalism.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Final</p>
                        <p className="font-bold text-slate-900">{q.avgFinalScore.toFixed(1)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Year-over-Year Trends */}
          {trends.length > 1 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Year-over-Year Trends</h4>
              <div className="space-y-2">
                {trends.map(trend => (
                  <div key={trend.year} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="font-semibold text-slate-900">{trend.year}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">{trend.performance.toFixed(1)}</span>
                      {trend.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-600" />}
                      {trend.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-600" />}
                      {trend.trend === 'flat' && <Minus className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-8 rounded-lg border border-slate-200 bg-slate-50 text-center text-sm text-slate-500">
          No validated submissions found. Year-end summary will appear once reports have been validated.
        </div>
      )}
    </div>
  );
};

export default AnnualSummaryPanel;
