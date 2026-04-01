import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useAuthActions } from './AuthActionsContext';

export type MobileSidenavItem<T extends string = string> = {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: number | null;
};

export type MobileSidenavConfig<T extends string = string> = {
  ariaLabel: string;
  items: Array<MobileSidenavItem<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  showSignOut?: boolean;
};

type Ctx = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  config: MobileSidenavConfig | null;
  setConfig: (cfg: MobileSidenavConfig | null) => void;
};

const MobileSidenavContext = createContext<Ctx | null>(null);

export function MobileSidenavProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<MobileSidenavConfig | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo(
    () => ({ isOpen, open, close, toggle, config, setConfig }),
    [isOpen, open, close, toggle, config]
  );

  return (
    <MobileSidenavContext.Provider value={value}>
      {children}
      <MobileSidenavDrawer />
    </MobileSidenavContext.Provider>
  );
}

export function useMobileSidenav(): Ctx {
  const ctx = useContext(MobileSidenavContext);
  if (!ctx) throw new Error('useMobileSidenav must be used within MobileSidenavProvider');
  return ctx;
}

function MobileSidenavDrawer() {
  const ctx = useContext(MobileSidenavContext);
  const { logout } = useAuthActions();
  if (!ctx) return null;

  const { isOpen, close, config } = ctx;
  const canShow = isOpen && !!config;
  if (!canShow) return null;

  const showSignOut = config?.showSignOut !== false;

  return (
    <div className="lg:hidden fixed inset-0 z-[4000]" role="dialog" aria-modal="true" aria-label={config.ariaLabel}>
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]"
        onClick={close}
        aria-label="Close navigation"
      />

      <aside className="absolute left-0 top-0 h-full w-[290px] bg-white border-r border-slate-200 shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="h-20 px-4 flex items-center justify-between border-b border-slate-100">
          <p className="text-[12px] font-black tracking-tight text-slate-900">Menu</p>
          <button
            type="button"
            onClick={close}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="p-3 flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-1">
            {config.items.map((item) => {
              const Icon = item.icon;
              const active = item.id === config.activeId;
              const badge = item.badge ?? null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    config.onSelect(item.id);
                    close();
                  }}
                  className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                    active ? 'bg-blue-900 text-white shadow-lg' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm ${
                      active ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-white' : 'text-slate-700'}`} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[11px] font-black uppercase tracking-widest truncate ${active ? 'text-white' : 'text-slate-900'}`}>
                      {item.label}
                    </span>
                    {badge != null && badge > 0 ? (
                      <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                        active ? 'bg-white/15 text-white' : 'bg-blue-50 text-blue-700 border border-blue-100'
                      }`}>
                        {badge} pending
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {showSignOut && (
          <div className="mt-auto p-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                close();
                logout();
              }}
              className="w-full flex items-center justify-center gap-3 rounded-2xl px-4 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

