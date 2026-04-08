import React from 'react';
import { AlertTriangle } from 'lucide-react';

type Props = {
  variant?: 'light' | 'dark';
  className?: string;
};

/** Shown when admin grading config changed after the employee submitted this pending audit. */
export const GradingExpiredBadge: React.FC<Props> = ({ variant = 'light', className = '' }) => {
  const isDark = variant === 'dark';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border shrink-0 ${
        isDark
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          : 'border-amber-200 bg-amber-50 text-amber-900 dark:text-amber-300'
      } text-[8px] font-black uppercase tracking-widest ${className}`}
      title="Department grading was updated after this submission. Withdraw and resubmit under the latest grading, or confirm with your administrator."
    >
      <AlertTriangle className="w-2.5 h-2.5 shrink-0" aria-hidden />
      Grading expired
    </span>
  );
};
