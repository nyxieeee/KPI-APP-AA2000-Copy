import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CategoryContentItem, CategoryWeightItem } from '../../types';
import {
  scoreFromCheckboxSelections,
  scoreFromEmployeeInput,
  checkpointsForTextboxOrdinal,
  maxScoreFromCheckpointList,
  type BasicGradingSystemElement,
  type CheckboxGradingSystemElement,
  type GradingCheckpoint,
} from '../../lib/gradingCheckpoints';
import { getEmployeeCategoryIcon } from '../../utils/employeeCategoryIcons';
import {
  AUDIT_PANEL_CRITERIA_GRID_CLASS,
  AUDIT_PANEL_CRITERION_BODY_CLASS,
  AUDIT_PANEL_INPUT_GRID_CLASS,
  AUDIT_PANEL_TEXTBOX_LABEL_CLASS,
  auditPanelCriterionColSpan,
  auditPanelInputColSpan,
} from '../../utils/auditPanelRule';

/** Per-criterion state (one CategoryContentItem = one admin criterion panel). */
export type CriterionTaskState = {
  score: number;
  num?: number | '';
  /** Multiple textboxButton elements: keyed by element index in `ui.elements`. */
  numByTextbox?: Record<number, number | ''>;
  checks?: boolean[];
};

type PmTask = CriterionTaskState | boolean;

function capForCriterion(item: CategoryContentItem): number {
  return Math.max(0, Math.min(1000, Number(item.maxpoints) || 0));
}

function getElementsArray(item: CategoryContentItem): any[] {
  return Array.isArray(item.ui?.elements) ? (item.ui!.elements as any[]) : [];
}

function parseElements(item: CategoryContentItem) {
  const elements = getElementsArray(item);
  const textboxEntries = elements
    .map((el, idx) => ({ el, idx }))
    .filter((x) => x.el?.type === 'textboxButton');
  const checkboxEntries = elements
    .map((el, idx) => ({ el, idx }))
    .filter((x) => x.el?.type === 'checkbox');
  const logo = elements.find((e) => e?.type === 'logo');
  const basic = elements.find((e) => e?.type === 'basicGradingSystem') as BasicGradingSystemElement | undefined;
  const cbGrading = elements.find((e) => e?.type === 'checkboxGradingSystem') as CheckboxGradingSystemElement | undefined;
  return { elements, textboxEntries, checkboxEntries, logo, basic, cbGrading };
}

function computeCriterionScore(
  cap: number,
  task: CriterionTaskState,
  textboxEntries: { el: any; idx: number }[],
  checkboxesCount: number,
  basic: BasicGradingSystemElement | undefined,
  cbGrading: CheckboxGradingSystemElement | undefined
): number {
  const hasTextGrading =
    textboxEntries.length > 0 &&
    basic &&
    (Boolean(basic.checkpoints?.length) ||
      Boolean(basic.perTextboxCheckpoints?.some((row) => row && row.length > 0)));

  if (hasTextGrading && basic) {
    if (textboxEntries.length === 1) {
      const cps = checkpointsForTextboxOrdinal(basic, 0);
      if (!cps.length) return 0;
      const raw = task.num;
      const n = raw === '' || raw === undefined ? 0 : Number(raw);
      const subCap = maxScoreFromCheckpointList(cps);
      return Number.isFinite(n) ? Math.min(cap, scoreFromEmployeeInput(n, cps, subCap)) : 0;
    }
    let sum = 0;
    textboxEntries.forEach((entry, ord) => {
      const cps = checkpointsForTextboxOrdinal(basic, ord);
      if (!cps.length) return;
      const raw = task.numByTextbox?.[entry.idx];
      const n = raw === '' || raw === undefined ? 0 : Number(raw);
      const subCap = maxScoreFromCheckpointList(cps);
      if (Number.isFinite(n)) sum += scoreFromEmployeeInput(n, cps, subCap);
    });
    return Math.min(cap, sum);
  }
  if (checkboxesCount && cbGrading?.checkpoints?.length) {
    const checks = task.checks || [];
    const count = checks.filter(Boolean).length;
    return scoreFromEmployeeInput(count, cbGrading.checkpoints as GradingCheckpoint[], cap);
  }
  if (checkboxesCount && basic?.checkboxScores?.length) {
    const scoresArr = basic.checkboxScores as number[];
    const checks = task.checks || [];
    return scoreFromCheckboxSelections(scoresArr, checks, cap);
  }
  return typeof task.score === 'number' ? task.score : 0;
}

/** Aggregate / footer must use the same inputs as each criterion card (num, checks, etc.), not only `score`. */
function normalizePmTaskForScoring(raw: PmTask | undefined): CriterionTaskState {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const t = raw as CriterionTaskState;
    return {
      ...t,
      score: typeof t.score === 'number' ? t.score : 0,
    };
  }
  return { score: 0 };
}

export function buildDefaultPmChecklistForCategory(cat: CategoryWeightItem): Record<string, PmTask> {
  const out: Record<string, PmTask> = {};
  (cat.content || []).forEach((item, i) => {
    const key = `task${i + 1}`;
    const { textboxEntries, checkboxEntries, basic, cbGrading } = parseElements(item);
    const checkboxes = checkboxEntries.map((c) => c.el);
    const hasTextGrading =
      textboxEntries.length > 0 &&
      !!basic &&
      (!!basic.checkpoints?.length ||
        Boolean(basic.perTextboxCheckpoints?.some((row) => row && row.length > 0)));
    const hasCbCount = checkboxes.length > 0 && !!cbGrading?.checkpoints?.length;
    const hasCbScores = checkboxes.length > 0 && (basic?.checkboxScores?.length ?? 0) > 0;

    const task: CriterionTaskState = { score: 0 };

    if (hasTextGrading) {
      if (textboxEntries.length === 1) {
        task.num = '';
      } else {
        task.numByTextbox = {};
        textboxEntries.forEach(({ idx }) => {
          task.numByTextbox![idx] = '';
        });
      }
    }
    if (checkboxes.length && (hasCbCount || hasCbScores || !hasTextGrading)) {
      task.checks = checkboxes.map(() => false);
    }
    if (hasTextGrading && checkboxes.length) {
      if (!task.checks) task.checks = checkboxes.map(() => false);
    }

    if (!hasTextGrading && !task.checks?.length && !hasCbCount && !hasCbScores) {
      out[key] = { score: 0 };
    } else {
      out[key] = task;
    }
  });
  return out;
}

function sumCategoryPoints(pm: Record<string, PmTask>): number {
  return Object.values(pm).reduce((sum, t) => {
    if (typeof t === 'object' && t !== null && typeof (t as CriterionTaskState).score === 'number') {
      return sum + (t as CriterionTaskState).score;
    }
    return sum;
  }, 0);
}

/**
 * Aggregate = sum of each criterion's POINTS (computed from inputs + admin grading).
 * Weighted impact = (aggregatePts / sum of criterion maxpoints) × category weightPct from admin.
 */
export function computeCategoryAggregateMetrics(
  category: CategoryWeightItem,
  pm: Record<string, PmTask>
): { aggregatePts: number; categorymaxpoints: number; weightedImpactPct: number } {
  const items = category.content || [];
  let aggregatePts = 0;
  let categorymaxpoints = 0;
  const weightPct = Math.max(0, Math.min(100, Number(category.weightPct) || 0));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cap = capForCriterion(item);
    categorymaxpoints += cap;
    const taskKey = `task${i + 1}`;
    const task = normalizePmTaskForScoring(pm[taskKey]);
    const { textboxEntries, checkboxEntries, basic, cbGrading } = parseElements(item);
    const checkboxN = checkboxEntries.length;
    aggregatePts += computeCriterionScore(cap, task, textboxEntries, checkboxN, basic, cbGrading);
  }

  const weightedImpactPct =
    categorymaxpoints > 0 ? (aggregatePts / categorymaxpoints) * weightPct : 0;
  return { aggregatePts, categorymaxpoints, weightedImpactPct };
}

/** Per-criterion POINTS for log detail / PDF — same formula as Core audit. */
export function scoreForCriterionContentItem(item: CategoryContentItem, raw: PmTask | undefined): number {
  const cap = capForCriterion(item);
  const task = normalizePmTaskForScoring(raw);
  const { textboxEntries, checkboxEntries, basic, cbGrading } = parseElements(item);
  return computeCriterionScore(cap, task, textboxEntries, checkboxEntries.length, basic, cbGrading);
}

function criterionDefinition(item: CategoryContentItem): string {
  const u = item.ui as { definition?: string } | undefined;
  return String(u?.definition ?? (item as any).definition ?? '').trim();
}

function formatCheckpointRange(c: GradingCheckpoint): string {
  if (c.max === null || c.max === undefined) return `≥ ${c.min}`;
  return `${c.min} – ${c.max}`;
}

function formatYieldNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function CriterionLogoAndDefinition({ iconKey, definition }: { iconKey?: string; definition: string }) {
  const Icon = getEmployeeCategoryIcon(iconKey);
  return (
    <div className="relative group/def shrink-0">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-600 bg-blue-500/10 shadow-sm cursor-help"
        aria-label={definition ? 'Criterion definition' : 'Criterion icon'}
      >
        <Icon className="h-6 w-6 text-blue-600" />
      </div>
      {definition ? (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-[80] mb-2 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border-2 border-slate-700 bg-slate-900 px-4 py-3 text-left text-[10px] font-bold leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover/def:pointer-events-auto group-hover/def:opacity-100"
          role="tooltip"
        >
          <span className="mb-1 block text-blue-400 uppercase tracking-widest">Definition</span>
          {definition}
          <div className="absolute left-1/2 top-full -mt-px h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-slate-700 bg-slate-900" />
        </div>
      ) : null}
    </div>
  );
}

function YieldBlockAdminStyle({
  cap,
  score,
  mode,
  checkpoints,
  basicCheckpointSections,
  checkboxN,
  checkboxLabels,
  checkboxScoreVals,
}: {
  cap: number;
  score: number;
  mode: 'basic' | 'checkboxCount' | 'checkboxScores';
  checkpoints: GradingCheckpoint[];
  /** Multiple textboxes: one checkpoint list per section (tooltip). */
  basicCheckpointSections?: { label: string; checkpoints: GradingCheckpoint[] }[];
  checkboxN?: number;
  checkboxLabels?: string[];
  checkboxScoreVals?: number[];
}) {
  const title =
    mode === 'basic'
      ? 'Grading checkpoints'
      : mode === 'checkboxCount'
        ? 'Checklist count → points'
        : 'Points per checkbox';

  return (
    <div className="group/yield relative shrink-0 text-right">
      <div className="-my-1 -mr-1 cursor-help rounded-xl border border-transparent px-3 py-2 transition-colors group-hover/yield:border-blue-100 dark:border-blue-900/50 group-hover/yield:bg-blue-50 dark:bg-blue-900/30">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Yield</p>
        <p className="text-[11px] font-black tabular-nums text-blue-600">
          {formatYieldNumber(score)}/{cap}
        </p>
      </div>
      <div
        className="pointer-events-none invisible absolute right-0 top-full z-[200] mt-1.5 w-64 max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-left opacity-0 shadow-[0_12px_40px_rgba(15,23,42,0.12)] transition-opacity group-hover/yield:pointer-events-auto group-hover/yield:visible group-hover/yield:opacity-100"
        role="tooltip"
        onMouseDown={(e) => e.preventDefault()}
      >
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{title}</p>
        {mode === 'checkboxCount' && checkboxN != null && checkboxN > 0 ? (
          <p className="mb-2 text-[10px] font-semibold leading-snug text-slate-500 dark:text-slate-400">
            Min / Max = number of checkboxes selected (this panel has {checkboxN}).
          </p>
        ) : null}
        {mode === 'checkboxScores' && checkboxLabels?.length && checkboxScoreVals?.length ? (
          <ul className="space-y-1.5">
            {checkboxLabels.map((lbl, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                <span className="min-w-0 shrink font-semibold text-slate-600 dark:text-slate-400">{lbl}</span>
                <span className="shrink-0 font-black tabular-nums text-blue-600">+{checkboxScoreVals[i] ?? 0} pts</span>
              </li>
            ))}
          </ul>
        ) : mode === 'basic' && basicCheckpointSections && basicCheckpointSections.length > 1 ? (
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {basicCheckpointSections.map((sec, si) => (
              <div key={si}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">{sec.label}</p>
                {sec.checkpoints.length > 0 ? (
                  <ul className="space-y-1">
                    {sec.checkpoints.map((c, i) => (
                      <li key={i} className="flex items-start justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                        <span className="min-w-0 shrink text-slate-500 dark:text-slate-400">{formatCheckpointRange(c)}</span>
                        <span className="shrink-0 font-black tabular-nums text-blue-600">{c.score} pts</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">No ranges</p>
                )}
              </div>
            ))}
          </div>
        ) : checkpoints.length > 0 ? (
          <ul className="space-y-1.5">
            {checkpoints.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                <span className="min-w-0 shrink text-slate-500 dark:text-slate-400">
                  {mode === 'checkboxCount'
                    ? c.max === null
                      ? `≥ ${c.min} checked`
                      : `${c.min} – ${c.max} checked`
                    : formatCheckpointRange(c)}
                </span>
                <span className="shrink-0 font-black tabular-nums text-blue-600">{c.score} pts</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">
            {mode === 'basic'
              ? 'No checkpoint ranges are configured for this criterion.'
              : 'No grading rules are configured for this criterion.'}
          </p>
        )}
      </div>
    </div>
  );
}

export interface TechnicalCategoryAuditPanelProps {
  category: CategoryWeightItem;
  pmChecklist: Record<string, unknown>;
  setFormData: React.Dispatch<
    React.SetStateAction<{
      pmChecklist: Record<string, unknown>;
      [key: string]: unknown;
    }>
  >;
  startHold: (fn: () => void) => void;
  stopHold: () => void;
}

const TechnicalCategoryAuditPanel: React.FC<TechnicalCategoryAuditPanelProps> = ({
  category,
  pmChecklist,
  setFormData,
  startHold,
  stopHold,
}) => {
  const content = category.content || [];
  const PanelIcon = getEmployeeCategoryIcon(category.icon);

  const { aggregatePts, weightedImpactPct } = useMemo(
    () => computeCategoryAggregateMetrics(category, pmChecklist as Record<string, PmTask>),
    [category, pmChecklist]
  );

  const mergeTask = (taskKey: string, patch: Partial<CriterionTaskState>) => {
    setFormData((prev) => {
      const prevTask = (prev.pmChecklist[taskKey] as CriterionTaskState) || { score: 0 };
      const next = { ...prevTask, ...patch } as CriterionTaskState;
      return { ...prev, pmChecklist: { ...prev.pmChecklist, [taskKey]: next } };
    });
  };

  const renderCriterion = (item: CategoryContentItem, idx: number) => {
    const criteriaColSpan = auditPanelCriterionColSpan(idx, content.length);
    const taskKey = `task${idx + 1}`;
    const cap = capForCriterion(item);
    const def = criterionDefinition(item);
    const { textboxEntries, checkboxEntries, logo, basic, cbGrading } = parseElements(item);
    const checkboxN = checkboxEntries.length;
    const textboxN = textboxEntries.length;
    const task = normalizePmTaskForScoring(pmChecklist[taskKey] as PmTask | undefined);

    const score = computeCriterionScore(cap, task, textboxEntries, checkboxN, basic, cbGrading);

    const syncScore = (patch: Partial<CriterionTaskState>) => {
      setFormData((prev) => {
        const prevTask = ((prev.pmChecklist[taskKey] as CriterionTaskState) || { score: 0 }) as CriterionTaskState;
        const merged = { ...prevTask, ...patch } as CriterionTaskState;
        const s = computeCriterionScore(cap, merged, textboxEntries, checkboxN, basic, cbGrading);
        return { ...prev, pmChecklist: { ...prev.pmChecklist, [taskKey]: { ...merged, score: s } } };
      });
    };

    const getTextNum = (elIdx: number): number | '' => {
      if (textboxN <= 1) {
        const v = task.num;
        return v === '' || v === undefined ? '' : v;
      }
      const v = task.numByTextbox?.[elIdx];
      return v === '' || v === undefined ? '' : v;
    };

    const setTextNum = (elIdx: number, next: number | '') => {
      if (textboxN <= 1) {
        syncScore({ num: next });
        return;
      }
      const nb = { ...(task.numByTextbox || {}) };
      nb[elIdx] = next;
      syncScore({ numByTextbox: nb });
    };

    const bumpTextNum = (elIdx: number, delta: number) => {
      const cur = getTextNum(elIdx);
      const n = cur === '' || cur === undefined ? 0 : Number(cur);
      const nn = Math.max(0, n + delta);
      setTextNum(elIdx, nn === 0 ? '' : nn);
    };

    const hasBasicTextGrading =
      textboxN > 0 &&
      !!basic &&
      (!!basic.checkpoints?.length ||
        Boolean(basic.perTextboxCheckpoints?.some((row) => row && row.length > 0)));

    const yieldMode: 'basic' | 'checkboxCount' | 'checkboxScores' =
      hasBasicTextGrading
        ? 'basic'
        : checkboxN && cbGrading?.checkpoints?.length
          ? 'checkboxCount'
          : 'checkboxScores';

    const yieldCheckpoints: GradingCheckpoint[] =
      yieldMode === 'basic'
        ? checkpointsForTextboxOrdinal(basic, 0)
        : yieldMode === 'checkboxCount'
          ? ((cbGrading?.checkpoints as GradingCheckpoint[]) || [])
          : [];

    const basicCheckpointSections: { label: string; checkpoints: GradingCheckpoint[] }[] | undefined =
      yieldMode === 'basic' && textboxN > 1 && basic
        ? textboxEntries.map(({ el }, ord) => ({
            label: String(el?.title ?? `Value ${ord + 1}`),
            checkpoints: checkpointsForTextboxOrdinal(basic, ord),
          }))
        : undefined;

    const checks = task.checks || (checkboxN ? checkboxEntries.map(() => false) : []);
    const toggleCheck = (pos: number) => {
      const next = checks.map((c, i) => (i === pos ? !c : c));
      syncScore({ checks: next });
    };

    const checkboxLabels = checkboxEntries.map((c) => String(c.el?.label ?? 'Item'));
    const checkboxScoreVals = (basic?.checkboxScores as number[]) || [];

    const renderHeader = () => (
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CriterionLogoAndDefinition iconKey={logo?.iconKey} definition={def} />
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[13px] font-black leading-snug text-slate-900 dark:text-slate-100">{item.label}</p>
          </div>
        </div>
        <YieldBlockAdminStyle
          cap={cap}
          score={score}
          mode={yieldMode}
          checkpoints={yieldCheckpoints}
          basicCheckpointSections={basicCheckpointSections}
          checkboxN={checkboxN}
          checkboxLabels={checkboxLabels}
          checkboxScoreVals={checkboxScoreVals}
        />
      </div>
    );

    const renderCheckboxGrid = () => {
      if (checkboxN === 0) return null;
      return (
        <div className={AUDIT_PANEL_INPUT_GRID_CLASS}>
          {checkboxEntries.map(({ el, idx }, pos) => {
            const colSpan = auditPanelInputColSpan(pos, checkboxN);
            return (
              <div
                key={idx}
                className={`space-y-3 rounded-[1.75rem] border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0f1b2d] p-4 shadow-sm transition-shadow hover:shadow-md ${colSpan}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={!!checks[pos]}
                    onChange={() => toggleCheck(pos)}
                    className="h-5 w-5 shrink-0 accent-blue-600"
                    aria-label={String(el?.label ?? 'Checkbox')}
                  />
                  <span className="min-w-0 flex-1 text-[12px] font-black text-slate-900 dark:text-slate-100">{String(el?.label ?? 'Item')}</span>
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    const renderTextboxGrid = () => {
      if (textboxN === 0 || !hasBasicTextGrading) return null;
      /** One textbox: outer card header already shows criterion title + Yield — avoid repeating inside the inner panel. */
      const showInnerTextboxHeader = textboxN > 1;
      return (
        <div className={AUDIT_PANEL_INPUT_GRID_CLASS}>
          {textboxEntries.map(({ el, idx }, pos) => {
            const colSpan = auditPanelInputColSpan(pos, textboxN);
            const numRaw = getTextNum(idx);
            const n = numRaw === '' || numRaw === undefined ? 0 : Number(numRaw);
            const tbCheckpoints = checkpointsForTextboxOrdinal(basic!, pos);
            return (
              <div
                key={idx}
                className={`flex flex-col space-y-3 rounded-[1.75rem] border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0f1b2d] p-4 shadow-sm transition-shadow hover:shadow-md ${colSpan}`}
              >
                {showInnerTextboxHeader ? (
                  <div className="flex items-start justify-between gap-2">
                    <div className={AUDIT_PANEL_TEXTBOX_LABEL_CLASS}>{String(el?.title ?? 'Value')}</div>
                    {tbCheckpoints.length > 0 ? (
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Yield</p>
                        <p className="text-[11px] font-black tabular-nums text-blue-600">
                          {formatYieldNumber(
                            Number.isFinite(n)
                              ? scoreFromEmployeeInput(n, tbCheckpoints, maxScoreFromCheckpointList(tbCheckpoints))
                              : 0
                          )}
                          /{maxScoreFromCheckpointList(tbCheckpoints)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {/* Panel rule: [textbox][←][→] */}
                <div className="flex w-full items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={numRaw === '' || numRaw === undefined ? '' : String(numRaw)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^\d]/g, '');
                      if (digits === '') {
                        setTextNum(idx, '');
                        return;
                      }
                      setTextNum(idx, parseInt(digits, 10));
                    }}
                    placeholder="0"
                    className={`min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-[#0b1222] px-3 py-3 text-center text-[12px] font-black outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-400 dark:placeholder:text-slate-600 ${
                      numRaw === '' || numRaw === undefined ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'
                    }`}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={n <= 0 && numRaw === ''}
                      className="flex h-10 w-10 select-none items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                      onMouseDown={() => startHold(() => bumpTextNum(idx, -1))}
                      onMouseUp={stopHold}
                      onMouseLeave={stopHold}
                      onTouchStart={() => startHold(() => bumpTextNum(idx, -1))}
                      onTouchEnd={stopHold}
                      onTouchCancel={stopHold}
                      onBlur={stopHold}
                      aria-label="Decrement"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex h-10 w-10 select-none items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400"
                      onMouseDown={() => startHold(() => bumpTextNum(idx, 1))}
                      onMouseUp={stopHold}
                      onMouseLeave={stopHold}
                      onTouchStart={() => startHold(() => bumpTextNum(idx, 1))}
                      onTouchEnd={stopHold}
                      onTouchCancel={stopHold}
                      onBlur={stopHold}
                      aria-label="Increment"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    const hasRenderable =
      hasBasicTextGrading ||
      (checkboxN > 0 && (cbGrading?.checkpoints?.length || (basic?.checkboxScores?.length ?? 0) > 0));

    if (!hasRenderable) {
      const manualScore = typeof task.score === 'number' ? task.score : 0;
      return (
        <div
          key={taskKey}
          className={`space-y-4 rounded-[2rem] border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0f1b2d] p-4 shadow-sm backdrop-blur md:p-5 ${criteriaColSpan}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <CriterionLogoAndDefinition iconKey={logo?.iconKey} definition={def} />
              <div className="min-w-0">
                <p className="text-[13px] font-black text-slate-900 dark:text-slate-100">{item.label}</p>
              </div>
            </div>
            <YieldBlockAdminStyle cap={cap} score={manualScore} mode="basic" checkpoints={[]} />
          </div>
          <input
            type="number"
            min={0}
            max={cap}
            value={typeof task.score === 'number' && task.score !== 0 ? task.score : ''}
            placeholder="0"
            onChange={(e) => {
              const v = e.target.value === '' ? 0 : Math.max(0, Math.min(cap, parseInt(e.target.value, 10) || 0));
              mergeTask(taskKey, { score: v });
            }}
            onFocus={(e) => e.target.select()}
            className="max-w-xs rounded-xl border border-slate-200 dark:border-slate-600 px-4 py-2 font-black"
          />
        </div>
      );
    }

    return (
      <div
        key={taskKey}
        className={`space-y-4 rounded-[2rem] border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0f1b2d] p-4 shadow-sm backdrop-blur md:p-5 ${criteriaColSpan}`}
      >
        {renderHeader()}
        <div className={AUDIT_PANEL_CRITERION_BODY_CLASS}>
          {renderCheckboxGrid()}
          {renderTextboxGrid()}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-8">
      <div className="flex min-w-0 items-center gap-4 border-b border-slate-100 dark:border-slate-700 pb-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 shadow-sm">
          <PanelIcon className="h-6 w-6 text-blue-600" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">Audit: {category.label}</h3>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Department grading breakdown</p>
        </div>
      </div>

      <div className={`relative z-10 isolate ${AUDIT_PANEL_CRITERIA_GRID_CLASS}`}>
        {content.map((it, i) => renderCriterion(it, i))}
      </div>

      <div className="relative z-0 flex flex-col gap-6 overflow-hidden rounded-[2.5rem] bg-slate-900 p-8 text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between">
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-blue-500/10 blur-[60px]" />
        <div className="relative z-10">
          <h4 className="mb-1 text-base font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{category.label} — Aggregate</h4>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black tabular-nums tracking-tighter text-blue-400">
              {formatYieldNumber(aggregatePts)}
            </p>
            <p className="text-sm font-black text-slate-500 dark:text-slate-400">Yield</p>
          </div>
        </div>
        <div className="relative z-10 text-left sm:text-right">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Weighted impact (category)</p>
          <p className="text-2xl font-black tabular-nums text-blue-400">+{weightedImpactPct.toFixed(2)}%</p>
        </div>
      </div>
    </div>
  );
};

export default TechnicalCategoryAuditPanel;
export { sumCategoryPoints };
