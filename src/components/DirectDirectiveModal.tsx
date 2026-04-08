import React from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, X } from 'lucide-react';
import type { Announcement } from '../types';

type Props = {
  open: boolean;
  items: Announcement[];
  acknowledgedIds: string[];
  latestBroadcast: Announcement | null;
  onAcknowledge: () => void;
  onClose: () => void;
};

export const DirectDirectiveModal: React.FC<Props> = ({
  open,
  items,
  acknowledgedIds,
  latestBroadcast,
  onAcknowledge,
  onClose,
}) => {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[6000] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[2.5rem] w-full max-w-lg h-[80vh] flex flex-col shadow-2xl relative animate-in zoom-in-95 duration-500 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Team announcements"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-16 -mt-16" aria-hidden />
        <button
          onClick={onClose}
          className="absolute top-8 right-8 p-3 text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-2xl transition-all z-10"
          type="button"
          aria-label="Close Direct Directive"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="p-10 pb-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
              <Megaphone className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Announcements from your supervisor</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Newest messages appear first.</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 px-10 pb-4 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-4 pr-1">
            {items.length === 0 ? (
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 italic py-8">No directives yet.</p>
            ) : (
              items.map((a, idx) => (
                <div
                  key={a.id}
                  className={`p-6 rounded-2xl border transition-all ${
                    idx === 0 && !acknowledgedIds.includes(a.id)
                      ? 'bg-amber-50/80 border-amber-200 ring-2 ring-amber-300/50'
                      : 'bg-slate-50/50 border-slate-100 dark:border-slate-700'
                  }`}
                >
                  {idx === 0 && !acknowledgedIds.includes(a.id) ? (
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-2">Latest</p>
                  ) : null}
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supervisor: {a.senderName}</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed italic whitespace-pre-wrap mt-2">"{a.message}"</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase mt-3">{new Date(a.timestamp).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {latestBroadcast && !acknowledgedIds.includes(latestBroadcast.id) ? (
          <div className="p-10 pt-4 flex-shrink-0 border-t border-slate-100 dark:border-slate-700">
            <button
              onClick={onAcknowledge}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all"
              type="button"
            >
              Mark as read
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
};

