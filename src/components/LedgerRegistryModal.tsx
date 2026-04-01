import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X, Trash2, Pencil } from 'lucide-react';
import type { Transmission } from '../types';
import { GradingExpiredBadge } from './GradingExpiredBadge';
import { getSubmissionStatusLabel } from '../utils/submissionStatus';

export type LedgerRegistrySharedProps = {
  title: string;
  emptyText: string;
  records: Transmission[];
  onSelect: (t: Transmission) => void;
  /** Optional label under title */
  subtitle?: string;
  getPrimaryLine?: (t: Transmission) => string;
  getSecondaryLine?: (t: Transmission) => string;
  getInitialScore?: (t: Transmission) => number | undefined | null;
  getValidatedScore?: (t: Transmission) => number | undefined | null;
  isGradingExpired?: (t: Transmission) => boolean;
  /** Called when employee deletes a pending submission */
  onDelete?: (t: Transmission) => void;
  /** Called when employee edits a pending submission (opens re-submission flow) */
  onEdit?: (t: Transmission) => void;
};

type ModalProps = LedgerRegistrySharedProps & {
  open: boolean;
  onClose: () => void;
};

type RegistryListProps = Omit<LedgerRegistrySharedProps, 'title'> & { theme: 'dark' | 'light' };

function RegistryRecordList({
  emptyText,
  records,
  onSelect,
  getPrimaryLine,
  getSecondaryLine,
  getInitialScore,
  getValidatedScore,
  isGradingExpired,
  onDelete,
  onEdit,
  theme,
}: RegistryListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const showScores = typeof getInitialScore === 'function' || typeof getValidatedScore === 'function';
  const d = theme === 'dark';

  return (
    <div
      className={
        d
          ? 'w-full h-full min-h-0 rounded-[2rem] border border-white/10 bg-white/5 p-5 md:p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] max-h-[calc(90vh-220px)] overflow-hidden flex flex-col'
          : 'w-full flex-1 min-h-[420px] max-h-[min(70vh,720px)] rounded-[2rem] border border-slate-200 bg-slate-50/60 p-5 md:p-6 overflow-hidden flex flex-col'
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar pr-2">
        {records.length === 0 ? (
          <div
            className={
              d
                ? 'text-center py-20 opacity-40 border-2 border-dashed border-white/10 rounded-3xl'
                : 'text-center py-16 border-2 border-dashed border-slate-200 rounded-3xl bg-white/70'
            }
          >
            <p
              className={`text-xs font-black uppercase tracking-widest ${d ? 'text-slate-300' : 'text-slate-500'}`}
            >
              {emptyText}
            </p>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {records.map((t) => (
              <div
                key={t.id}
                onClick={() => onSelect(t)}
                className={
                  d
                    ? 'bg-white/5 border border-white/10 rounded-[2rem] p-6 space-y-4 hover:bg-white/10 transition-all cursor-pointer group/item'
                    : 'bg-white border border-slate-200 rounded-[2rem] p-6 space-y-4 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group/item shadow-sm'
                }
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(t);
                  }
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="overflow-hidden min-w-0 flex-1 mr-2">
                    <p
                      className={`text-xs font-black truncate uppercase tracking-tight transition-colors ${
                        d ? 'text-blue-400 group-hover/item:text-blue-300' : 'text-blue-600 group-hover/item:text-blue-700'
                      }`}
                    >
                      {t.id}
                    </p>
                    <p className={`text-[10px] font-bold uppercase ${d ? 'text-slate-500' : 'text-slate-400'}`}>
                      {new Date(t.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded uppercase shadow-sm h-fit ${
                        t.status === 'rejected'
                          ? d
                            ? 'bg-red-500/20 text-red-400 border border-red-500/20'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                          : t.status === 'validated'
                            ? d
                              ? 'bg-emerald-50/20 text-emerald-400 border border-emerald-500/20'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : t.supervisorRecommendation
                              ? d
                                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20'
                                : 'bg-orange-50 text-orange-700 border border-orange-200'
                              : d
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {getSubmissionStatusLabel(t)}
                    </span>
                    {isGradingExpired?.(t) ? (
                      <GradingExpiredBadge variant={d ? 'dark' : 'light'} className="max-w-[11rem] text-right leading-tight" />
                    ) : null}
                  </div>
                </div>

                <div className="space-y-1 min-w-0">
                  {showScores ? (
                    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 pt-1">
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${d ? 'text-slate-500' : 'text-slate-500'}`}>
                          Initial score
                        </span>
                        <span
                          className={`text-base font-black tabular-nums leading-none ${d ? 'text-slate-200' : 'text-slate-900'}`}
                        >
                          {getInitialScore != null
                            ? (() => {
                                const v = getInitialScore(t);
                                return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}%` : '—';
                              })()
                            : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${d ? 'text-slate-500' : 'text-slate-500'}`}>
                          Validated score
                        </span>
                        <span className={`text-base font-black tabular-nums leading-none ${d ? 'text-blue-400' : 'text-blue-600'}`}>
                          {getValidatedScore != null
                            ? (() => {
                                const v = getValidatedScore(t);
                                return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}%` : '—';
                              })()
                            : '—'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={`text-[11px] font-black uppercase truncate ${d ? 'text-slate-300' : 'text-slate-800'}`}>
                        {(getPrimaryLine ? getPrimaryLine(t) : t.jobType) || '—'}
                      </p>
                      <p className={`text-[10px] font-bold uppercase truncate italic ${d ? 'text-slate-500' : 'text-slate-500'}`}>
                        {(getSecondaryLine ? getSecondaryLine(t) : t.clientSite) || '—'}
                      </p>
                    </>
                  )}
                </div>

                {t.supervisorComment && (
                  <div className={`pt-3 border-t ${d ? 'border-white/5' : 'border-slate-100'}`}>
                    <p className={`text-[10px] italic leading-relaxed line-clamp-2 ${d ? 'text-slate-400' : 'text-slate-600'}`}>
                      &ldquo;{t.supervisorComment}&rdquo;
                    </p>
                  </div>
                )}

                {/* Edit / Delete — only for pending submissions (not yet validated or rejected) */}
                {!t.status && (onEdit || onDelete) && (
                  <div
                    className={`pt-3 border-t flex items-center gap-2 ${d ? 'border-white/5' : 'border-slate-100'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onEdit && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEdit(t); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-colors ${
                          d
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20'
                            : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      confirmDeleteId === t.id ? (
                        <div className="flex items-center gap-2 ml-auto">
                          <span className={`text-[10px] font-bold ${d ? 'text-slate-400' : 'text-slate-500'}`}>Delete?</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDelete(t); setConfirmDeleteId(null); }}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-colors ${
                              d ? 'bg-white/10 text-slate-300 hover:bg-white/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(t.id); }}
                          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-colors ${
                            d
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Inline ledger in the main employee card (no modal). */
export const LedgerRegistryPanel: React.FC<LedgerRegistrySharedProps & { className?: string }> = ({
  title,
  subtitle = 'Operational Log History',
  className = '',
  emptyText,
  records,
  onSelect,
  getPrimaryLine,
  getSecondaryLine,
  getInitialScore,
  getValidatedScore,
  isGradingExpired,
  onDelete,
  onEdit,
}) => {
  return (
    <section
      className={`flex flex-col min-h-0 animate-in fade-in slide-in-from-bottom-2 duration-500 ${className}`}
      aria-label={title}
    >
      <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-200 shrink-0">
        <div className="w-12 h-12 bg-blue-600/10 rounded-2xl flex items-center justify-center border border-blue-600/15">
          <Clock className="w-6 h-6 text-blue-600" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight truncate">{title}</h3>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">{subtitle}</p>
        </div>
      </div>
      <RegistryRecordList
        emptyText={emptyText}
        records={records}
        onSelect={onSelect}
        getPrimaryLine={getPrimaryLine}
        getSecondaryLine={getSecondaryLine}
        getInitialScore={getInitialScore}
        getValidatedScore={getValidatedScore}
        isGradingExpired={isGradingExpired}
        onDelete={onDelete}
        onEdit={onEdit}
        theme="light"
      />
    </section>
  );
};

export const LedgerRegistryModal: React.FC<ModalProps> = ({
  open,
  title,
  emptyText,
  records,
  onSelect,
  onClose,
  subtitle = 'Operational Log History',
  getPrimaryLine,
  getSecondaryLine,
  getInitialScore,
  getValidatedScore,
  isGradingExpired,
  onDelete,
  onEdit,
}) => {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 md:p-8 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-7xl max-h-[90vh] bg-[#0b1222] shadow-2xl p-10 overflow-hidden animate-in zoom-in-95 duration-500 rounded-[3rem] border border-white/10 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-10 sticky top-0 bg-[#0b1222] z-10 pb-4 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center border border-blue-500/20">
              <Clock className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white uppercase tracking-widest">{title}</h3>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors" type="button" aria-label="Close ledger registry">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 min-h-0">
          <RegistryRecordList
            emptyText={emptyText}
            records={records}
            onSelect={onSelect}
            getPrimaryLine={getPrimaryLine}
            getSecondaryLine={getSecondaryLine}
            getInitialScore={getInitialScore}
            getValidatedScore={getValidatedScore}
            isGradingExpired={isGradingExpired}
            onDelete={onDelete}
            onEdit={onEdit}
            theme="dark"
          />
        </div>
      </div>
    </div>,
    document.body
  );
};
