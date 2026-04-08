import React from 'react';
import { Download, FileCheck, Wrench } from 'lucide-react';
import type { Transmission, DepartmentWeights, CategoryWeightItem } from '../types';
import {
  computeCategoryAggregateMetrics,
  scoreForCriterionContentItem,
} from './employee/TechnicalCategoryAuditPanel';
import { getEmployeeCategoryIcon } from '../utils/employeeCategoryIcons';
import { resolveSalesCategoryWeightItem, getSalesWeightedCategoryOrderDynamic } from '../utils/technicalWeightedKpi';
import { getGradeForScore, getGradeColorClasses } from '../utils/gradingSystem';

type ClassificationRow = {
  name: string;
  weight: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When set (e.g. Sales admin label), shown instead of canonical `name`. */
  displayLabel?: string;
};

type DeptKey = 'Technical' | 'Sales' | 'Accounting' | 'Marketing' | 'IT';

type Props = {
  selectedLog: Transmission;
  /** Which slice of `departmentWeights` to use (default Technical). */
  departmentKey?: DeptKey;
  departmentWeights?: DepartmentWeights;
  CLASSIFICATIONS: ClassificationRow[];
  CHECKLIST_CONTENT?: Record<string, string[]>;
  getReviewTotalScoreLegacy: (category: string, checklist: unknown) => number;
  handleDownload: (file: { name: string; data?: string }) => void;
};

function CriterionDetailFields({ value }: { value: Record<string, unknown> }) {
  return (
    <div className="space-y-1.5">
      {value.backJobs !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Back-jobs:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.backJobs)}</span>
        </div>
      )}
      {value.fixTime !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Fix Time:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.fixTime)} hrs</span>
        </div>
      )}
      {value.projectsCompleted !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Projects:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.projectsCompleted)}</span>
        </div>
      )}
      {value.requiresBackJob !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Req. Back-job:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.requiresBackJob)}</span>
        </div>
      )}
      {value.percentage !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Success Rate:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.percentage)}%</span>
        </div>
      )}
      {value.totalProjects !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Total Projects:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.totalProjects)}</span>
        </div>
      )}
      {value.onTimeProjects !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>On-Time:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.onTimeProjects)}</span>
        </div>
      )}
      {value.csatRating !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>CSAT:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.csatRating)}</span>
        </div>
      )}
      {value.complaints !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Complaints:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.complaints)}</span>
        </div>
      )}
      {value.severity !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Severity:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.severity)}</span>
        </div>
      )}
      {value.visits !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Visits / month:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.visits)}</span>
        </div>
      )}
      {value.conversionRate !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Conversion rate:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.conversionRate)}%</span>
        </div>
      )}
      {value.rating !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Rating:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.rating)}</span>
        </div>
      )}
      {value.num !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Value:</span>{' '}
          <span className="font-bold text-slate-900 dark:text-slate-100">{value.num === '' ? '—' : String(value.num)}</span>
        </div>
      )}
      {Array.isArray(value.checks) && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Checked:</span>{' '}
          <span className="font-bold text-slate-900 dark:text-slate-100">
            {(value.checks as boolean[]).filter(Boolean).length} / {(value.checks as boolean[]).length}
          </span>
        </div>
      )}
      {value.rate !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Rate:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.rate)}%</span>
        </div>
      )}
      {value.absences !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Absences:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.absences)}</span>
        </div>
      )}
      {value.tardies !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Tardies:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.tardies)}</span>
        </div>
      )}
      {value.violations !== undefined && (
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>Violations:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{String(value.violations)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Renders category/criterion breakdown from `allSalesData` using admin Department grading breakdown
 * when present; otherwise legacy CHECKLIST_CONTENT + checklist parsing.
 */
export function TechnicalLogDetailAuditReview({
  selectedLog,
  departmentKey = 'Technical',
  departmentWeights,
  CLASSIFICATIONS,
  CHECKLIST_CONTENT = {},
  getReviewTotalScoreLegacy,
  handleDownload,
}: Props) {
  const allData = selectedLog.allSalesData || {};
  const deptWeightsList =
    departmentKey === 'Sales'
      ? undefined
      : (departmentWeights?.[departmentKey] as CategoryWeightItem[] | undefined);
  const categoryOrder =
    departmentKey === 'Sales'
      ? getSalesWeightedCategoryOrderDynamic(departmentWeights)
      : deptWeightsList?.length
        ? deptWeightsList.map((c) => c.label)
        : Object.keys(allData);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <FileCheck className="w-4 h-4 text-white" />
        </div>
        <p className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">Detailed Audit Review</p>
      </div>
      {categoryOrder.map((category) => {
        const catData = allData[category] || { checklist: {} };
        const checklist = (catData.checklist || {}) as Record<string, unknown>;
        const catCfg =
          departmentKey === 'Sales'
            ? resolveSalesCategoryWeightItem(category, departmentWeights)
            : deptWeightsList?.find((w) => w.label === category);
        const displayCategoryName =
          departmentKey === 'Sales'
            ? CLASSIFICATIONS.find((c) => c.name === category)?.displayLabel ?? category
            : category;
        const Icon = getEmployeeCategoryIcon(catCfg?.icon);
        const snapshotEntry = selectedLog.ratings?.logDetailSnapshot?.find((s) => s.name === category);
        const weightPct =
          snapshotEntry?.weightPct ??
          catCfg?.weightPct ??
          parseInt(CLASSIFICATIONS.find((c) => c.name === category)?.weight || '0', 10) ??
          0;

        if (catCfg?.content?.length) {
          const m = computeCategoryAggregateMetrics(catCfg, checklist as any);
          const weightedDisplay = `+${m.weightedImpactPct.toFixed(2)}%`;
          const aggLabel = `${Number.isInteger(m.aggregatePts) ? m.aggregatePts : m.aggregatePts.toFixed(1)} / ${m.categorymaxpoints} pts`;

          return (
            <div key={category} className="bg-slate-50 dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-600/50 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{displayCategoryName}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Category Weight: {weightPct}% · Aggregate: {aggLabel}
                    </p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Weighted impact</p>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-black text-blue-600">{weightedDisplay}</p>
                    {(() => {
                      const pct = m.categorymaxpoints > 0 ? (m.aggregatePts / m.categorymaxpoints) * 100 : 0;
                      const gradeInfo = getGradeForScore(pct);
                      const cls = getGradeColorClasses(gradeInfo.color);
                      return (
                        <div className={`px-3 py-1 rounded-full border ${cls.bg} ${cls.text} ${cls.border} flex flex-col items-center leading-none`}>
                          <span className="text-sm font-black">{gradeInfo.letter}</span>
                          <span className="text-[7px] uppercase font-bold tracking-tighter">{gradeInfo.label}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catCfg.content.map((criterionItem, taskIdx) => {
                  const key = `task${taskIdx + 1}`;
                  const value = checklist[key];
                  const rowScore = scoreForCriterionContentItem(criterionItem, value as any);
                  const maxPts = Math.max(0, Number(criterionItem.maxpoints) || 0);
                  const mainText = criterionItem.label;

                  return (
                    <div
                      key={key}
                      className="bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-700 flex flex-col justify-between gap-3 hover:border-blue-200 dark:hover:border-blue-700 transition-colors shadow-sm"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight leading-tight">{mainText}</span>
                          <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-blue-100 text-blue-600">
                            {rowScore} / {maxPts}
                          </span>
                        </div>
                        {typeof value === 'object' && value != null ? <CriterionDetailFields value={value as Record<string, unknown>} /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        const labels = CHECKLIST_CONTENT[category] || [];
        const totalScore = getReviewTotalScoreLegacy(category, checklist);
        const weightedScore = (totalScore * (weightPct / 100)).toFixed(2);
        const FallbackIcon = CLASSIFICATIONS.find((c) => c.name === category)?.icon || Wrench;

        return (
          <div key={category} className="bg-slate-50 dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-600/50 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FallbackIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{displayCategoryName}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category Weight: {weightPct}%</p>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Weighted score</p>
                <div className="flex items-center gap-3">
                  <p className="text-2xl font-black text-blue-600">{weightedScore}%</p>
                  {(() => {
                    const gradeInfo = getGradeForScore(totalScore);
                    const cls = getGradeColorClasses(gradeInfo.color);
                    return (
                      <div className={`px-3 py-1 rounded-full border ${cls.bg} ${cls.text} ${cls.border} flex flex-col items-center leading-none`}>
                        <span className="text-sm font-black">{gradeInfo.letter}</span>
                        <span className="text-[7px] uppercase font-bold tracking-tighter">{gradeInfo.label}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {labels.map((label, taskIdx) => {
                const key = `task${taskIdx + 1}`;
                const value = checklist[key];
                if (!value) return null;

                const cleanLabel = label.replace(' - CRITICAL METRIC', '');
                const [mainText, pointsStr] = cleanLabel.split(' (');
                const maxpoints = pointsStr ? parseInt(pointsStr.replace(' points)', ''), 10) : 0;
                const score =
                  typeof value === 'object' && value != null && !Array.isArray(value)
                    ? (value as { score?: number }).score
                    : undefined;
                const numScore = typeof score === 'number' ? score : value === true ? maxpoints : 0;

                return (
                  <div
                    key={key}
                    className="bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-700 flex flex-col justify-between gap-3 hover:border-blue-200 dark:hover:border-blue-700 transition-colors shadow-sm"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight leading-tight">{mainText}</span>
                        <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-blue-100 text-blue-600">
                          {numScore} / {maxpoints}
                        </span>
                      </div>
                      {typeof value === 'object' && value != null ? (
                        <CriterionDetailFields value={value as Record<string, unknown>} />
                      ) : null}
                    </div>

                    {typeof value === 'object' && value != null && (value as { file?: { name: string } }).file && (
                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600/50">
                        <div className="flex items-center gap-2 text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-xl border border-blue-100 dark:border-blue-900/50 w-fit">
                          <FileCheck className="w-3 h-3 shrink-0" />
                          <span className="text-[9px] font-bold truncate max-w-[150px]">
                            {(value as { file: { name: string } }).file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownload((value as { file: { name: string; data?: string } }).file)}
                            className="text-blue-700 hover:text-blue-800 ml-2"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
