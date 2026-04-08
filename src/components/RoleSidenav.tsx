import React from 'react';
import { createPortal } from 'react-dom';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { APP_NAV_SIDENAV_HEIGHT, APP_NAV_SIDENAV_TOP } from '../constants/navbarLayout';
import { useAuthActions } from '../contexts/AuthActionsContext';
import { useRoleSidenavRail } from '../contexts/RoleSidenavRailContext';

export type RoleSidenavItem<T extends string> = {
  id: T;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: number | null;
};

interface Props<T extends string> {
  roleLabel: string;
  brandTitle?: string;
  items: Array<RoleSidenavItem<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  showSignOut?: boolean;
}

export function RoleSidenav<T extends string>({
  roleLabel,
  brandTitle = 'Portal',
  items,
  activeId,
  onSelect,
  showSignOut = true,
}: Props<T>) {
  void brandTitle;
  const { logout } = useAuthActions();
  const { railOpen, toggleRail } = useRoleSidenavRail();

  return createPortal(
    <aside
      className={`hidden lg:flex flex-col fixed left-0 ${APP_NAV_SIDENAV_TOP} z-[1100] ${APP_NAV_SIDENAV_HEIGHT} overflow-hidden border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm transition-[width] duration-200 ease-out ${
        railOpen ? 'w-[272px]' : 'w-[76px]'
      }`}
      aria-label={`${roleLabel} sidenav`}
    >
      <div className="flex h-full min-h-0 flex-col">
        <nav
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 pt-3 pb-2"
          aria-label={`${roleLabel} navigation`}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeId === item.id;
            const badge = item.badge ?? null;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                title={!railOpen ? item.label : undefined}
                className={`group relative flex w-full min-w-0 items-center justify-start rounded-lg border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400/40 gap-3 px-2 py-2 text-left ${
                  active
                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 shadow-sm'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:border-slate-100 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    active
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-100 dark:bg-blue-900/60'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 group-hover:bg-slate-100 dark:group-hover:bg-slate-700'
                  }`}
                >
                  <Icon className={`h-[17px] w-[17px] ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} aria-hidden />
                </span>

                {railOpen && (
                  <span className="min-w-0 flex-1 pt-0.5 text-left">
                    <span className={`block text-xs font-semibold leading-tight ${active ? 'text-blue-900 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>
                      {item.label}
                    </span>
                    {item.description && (
                      <span className={`mt-0.5 block text-[10px] font-normal leading-snug ${active ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        {item.description}
                      </span>
                    )}
                  </span>
                )}

                {railOpen && badge != null && badge > 0 && (
                  <span
                    className={`ml-1 shrink-0 self-center rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                      active ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200' : 'bg-slate-100 dark:bg-[#0d1526] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}

                {!railOpen && badge != null && badge > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className={`shrink-0 ${railOpen ? 'px-3 pb-2' : 'px-2 pb-2'}`}>
          <button
            type="button"
            onClick={toggleRail}
            title={!railOpen ? 'Expand sidebar' : undefined}
            className={`flex w-full items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400/40 ${
              railOpen ? 'gap-2 px-3 py-2' : 'p-2'
            }`}
            aria-expanded={railOpen}
            aria-label={railOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {railOpen
              ? <><ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden /><span className="text-[11px] font-semibold">Collapse</span></>
              : <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            }
          </button>
        </div>

        {showSignOut && (
          <div className={`shrink-0 border-t border-slate-100 dark:border-slate-800 pt-3 pb-4 ${railOpen ? 'px-3' : 'px-2'}`}>
            <button
              type="button"
              onClick={logout}
              title={!railOpen ? 'Sign out' : undefined}
              className={`flex w-full items-center justify-center rounded-lg bg-blue-600 dark:bg-blue-700 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400/40 ${railOpen ? 'gap-2 px-4 py-2.5' : 'p-2'}`}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              {railOpen && 'Sign out'}
            </button>
          </div>
        )}
      </div>
    </aside>,
    document.body
  );
}
