import React, { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface SupervisorToastProps {
  message: string;
  onDismiss: () => void;
  /** Auto-dismiss after this ms (default 4000); set 0 to disable */
  autoHideMs?: number;
}

export const SupervisorToast: React.FC<SupervisorToastProps> = ({
  message,
  onDismiss,
  autoHideMs = 4000,
}) => {
  useEffect(() => {
    if (autoHideMs <= 0) return;
    const t = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(t);
  }, [onDismiss, autoHideMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-24 right-8 z-[9999] animate-in slide-in-from-right-full fade-in duration-500 flex items-center gap-4 bg-[#0b1222] text-white px-6 py-4 rounded-[1.5rem] shadow-2xl border border-emerald-500/30"
    >
      <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shrink-0">
        <CheckCircle2 className="w-6 h-6 text-white" aria-hidden />
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest mb-1">Status Update</p>
        <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-tighter">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white dark:hover:bg-slate-800/10 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-[#0b1222] transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
};
