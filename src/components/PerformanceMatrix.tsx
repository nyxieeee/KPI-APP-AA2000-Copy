import React from 'react';
import { AlertCircle, Clock, Download, Sparkles, Trophy } from 'lucide-react';
import type { QuarterlyPerformanceStats } from '../utils/performanceMatrix';

type Props = {
  title: string;
  isValidated: boolean;
  hasUserPending: boolean;
  displayScore: number;
  dash: number;
  ringOffset: number;
  quarterlyStats: QuarterlyPerformanceStats | null;
  onDownloadPdf: () => void;
  suggestion: { headline: string; message: string; variant: 'excellent' | 'good' | 'solid' | 'progress' | 'growth' | 'empty' };
  variantStyles: Record<string, string>;
};

export const PerformanceMatrix: React.FC<Props> = ({
  title,
  isValidated,
  hasUserPending,
  displayScore,
  dash,
  ringOffset,
  quarterlyStats,
  onDownloadPdf,
  suggestion,
  variantStyles,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in zoom-in-95 duration-700">
      <div className="lg:col-span-12 bg-white dark:bg-slate-800 rounded-[3rem] p-10 border border-slate-100 dark:border-slate-700 shadow-xl relative overflow-visible flex flex-col gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px] -mr-32 -mt-32" />

        <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-[#0b1222]/90 overflow-hidden shadow-sm shrink-0">
          <div className="flex items-center gap-5 px-6 py-5">
            <div className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm ${isValidated ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 ring-2 ring-amber-200/50' : 'bg-slate-100 dark:bg-[#0d1526] border-slate-200 dark:border-slate-600'}`}>
              <Trophy className={`w-7 h-7 ${isValidated ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`} />
            </div>
            <div className="flex-1 min-w-0 border-l-4 border-blue-500/80 pl-5">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-[0.2em] mb-0.5">KPI Overview</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{title}</h3>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDownloadPdf();
              }}
              className="shrink-0 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-sm hover:bg-blue-700 active:scale-[0.99] transition"
              title="Download yearly scorecard PDF"
            >
              <Download className="w-[18px] h-[18px]" />
              PDF
            </button>
          </div>
          <div className="h-1 w-full bg-gradient-to-r from-blue-500/25 via-blue-500/10 to-transparent" />
        </div>

        <div className="flex flex-col lg:flex-row items-stretch gap-6 flex-1 min-h-0">
          <div className="relative shrink-0 flex flex-col items-center justify-center">
            <svg className="w-40 h-40 lg:w-48 lg:h-48" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--ring-track)" strokeWidth="10" />
              {isValidated ? (
                <>
                  <circle cx="50" cy="50" r="40" fill="none" stroke="url(#blue-grad)" strokeWidth="10" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={ringOffset} transform="rotate(-90 50 50)" />
                  <defs>
                    <linearGradient id="blue-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  <text x="50" y="52" className="text-2xl font-black text-slate-900 dark:text-slate-100" textAnchor="middle" fill="currentColor" dominantBaseline="middle">
                    {Math.round(displayScore)}%
                  </text>
                </>
              ) : hasUserPending ? (
                <>
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#2563eb" strokeWidth="10" strokeOpacity="0.2" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#2563eb" strokeWidth="10" strokeLinecap="round" strokeDasharray="40 211.33" strokeDashoffset="0" transform="rotate(-90 50 50)">
                    <animate attributeName="stroke-dashoffset" from="0" to="251.33" dur="2.2s" repeatCount="indefinite" calcMode="linear" />
                  </circle>
                  <foreignObject x="30" y="30" width="40" height="40">
                    <div className="w-full h-full flex items-center justify-center">
                      <Clock className="w-8 h-8 text-blue-600 animate-pulse" />
                    </div>
                  </foreignObject>
                </>
              ) : (
                <>
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--ring-track)" strokeWidth="10" strokeDasharray="4 4" />
                  <foreignObject x="30" y="30" width="40" height="40">
                    <div className="w-full h-full flex items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-slate-300" />
                    </div>
                  </foreignObject>
                </>
              )}
            </svg>
            <p className="mt-3 text-[10px] font-black text-blue-600 uppercase tracking-[0.4em]">{isValidated ? 'KPI POINTS' : hasUserPending ? 'Audit Active' : 'Standby Mode'}</p>
          </div>

          {quarterlyStats ? (
            <div className="grid grid-cols-1 gap-6 flex-1 min-w-0 min-h-0">
              <div className="bg-slate-50 dark:bg-[#0b1222]/50 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700 flex flex-col justify-center relative overflow-hidden">
                <div className="relative z-10 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className={`w-5 h-5 shrink-0 ${variantStyles[suggestion.variant] || 'text-slate-600 dark:text-slate-400 dark:text-slate-400'}`} />
                    <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Suggestions for you</p>
                  </div>
                  <h4 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">{suggestion.headline}</h4>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 dark:text-slate-400 leading-relaxed">{suggestion.message}</p>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0 bg-slate-50 dark:bg-[#0b1222]/80 rounded-[2.5rem] p-10 border border-dashed border-slate-200 dark:border-slate-600 flex flex-col items-center justify-center text-center space-y-3">
              <p className="text-xs font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-widest">{hasUserPending ? 'Your logs are being audited for compliance' : 'No operational data found for the current cycle'}</p>
              <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 max-w-md leading-relaxed italic">{hasUserPending ? 'Please wait for your supervisor to finalize your grading matrix.' : 'Initiate a log transmission using the Terminal below to activate your performance grading.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

