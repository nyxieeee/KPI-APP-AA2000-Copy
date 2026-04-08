import React, { useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import type { SystemNotification } from '../types';

interface Props {
  notifications: SystemNotification[];
  onDismiss?: (id: string) => void; // kept for API compatibility; banner dismisses locally only
}

const iconFor = (type: SystemNotification['type']) => {
  if (type === 'SUCCESS') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
  if (type === 'ALERT')   return <XCircle      className="w-4 h-4 text-red-500    shrink-0 mt-0.5" />;
  return                         <Info          className="w-4 h-4 text-blue-500   shrink-0 mt-0.5" />;
};

const bgFor = (type: SystemNotification['type']) => {
  if (type === 'SUCCESS') return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-700/50';
  if (type === 'ALERT')   return 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-700/50';
  return                         'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-700/50';
};

const textFor = (type: SystemNotification['type']) => {
  if (type === 'SUCCESS') return 'text-emerald-800 dark:text-emerald-300';
  if (type === 'ALERT')   return 'text-red-800 dark:text-red-300';
  return                         'text-blue-800 dark:text-blue-300';
};

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

/**
 * Inline dismissible notification banners at the top of an employee dashboard.
 * Only shows submission approval/rejection notices (SUCCESS or ALERT mentioning "finalized").
 *
 * Dismissing hides the banner locally only — the notification stays in the
 * Navbar bell so the employee can still reference it there.
 */
const DashboardNotificationBanner: React.FC<Props> = ({ notifications }) => {
  // Track locally-dismissed IDs — does NOT remove from global state,
  // so the notification remains visible in the Navbar bell.
  const [locallyDismissed, setLocallyDismissed] = useState<Set<string>>(new Set());

  const dismiss = (id: string) => {
    setLocallyDismissed(prev => new Set([...prev, id]));
  };

  const relevant = notifications.filter(
    n =>
      (n.type === 'SUCCESS' || n.type === 'ALERT') &&
      n.message.toLowerCase().includes('finalized') &&
      !locallyDismissed.has(n.id)
  );

  if (relevant.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 w-full pt-0.5">
      {relevant.map(n => (
        <div
          key={n.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${bgFor(n.type)} shadow-sm animate-in slide-in-from-top-2 fade-in duration-300`}
        >
          {iconFor(n.type)}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold leading-snug ${textFor(n.type)}`}>{n.message}</p>
            <p className={`text-xs mt-0.5 opacity-60 ${textFor(n.type)}`}>{timeAgo(n.timestamp)}</p>
          </div>
          <button
            onClick={() => dismiss(n.id)}
            className={`ml-2 p-1 rounded-md hover:bg-black/5 transition-colors ${textFor(n.type)} opacity-60 hover:opacity-100`}
            aria-label="Dismiss banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default DashboardNotificationBanner;
