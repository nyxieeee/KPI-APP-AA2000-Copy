import React, { useEffect } from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';

type PdfToastState = 'preparing' | 'done' | null;

interface PdfToastProps {
  state: PdfToastState;
  onDismiss: () => void;
  /** Auto-clear "done" after this ms (default 2200) */
  doneDuration?: number;
}

export const PdfToast: React.FC<PdfToastProps> = ({ state, onDismiss, doneDuration = 2200 }) => {
  useEffect(() => {
    if (state !== 'done') return;
    const t = setTimeout(onDismiss, doneDuration);
    return () => clearTimeout(t);
  }, [state, onDismiss, doneDuration]);

  if (!state) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[6000] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      {state === 'preparing' ? (
        <>
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <FileText className="w-4 h-4 text-blue-600 animate-pulse" />
          </div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Preparing PDF…</span>
        </>
      ) : (
        <>
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Download started</span>
        </>
      )}
    </div>
  );
};

export type { PdfToastState };
