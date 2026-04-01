import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, LogOut } from 'lucide-react';
import { APP_NAV_SIDENAV_HEIGHT, APP_NAV_SIDENAV_TOP } from '../constants/navbarLayout';
import { useAuthActions } from '../contexts/AuthActionsContext';

export type RoleSidenavItem<T extends string> = {
  id: T;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: number | null;
};

interface Props<T extends string> {
  /** Used in pill + aria label. Example: "Supervisor" */
  roleLabel: string;
  /** Used for the page title in the brand block. Example: "Portal" */
  brandTitle?: string;
  items: Array<RoleSidenavItem<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Widths match AdminDashboard */
  expandedWidthClassName?: string;
  collapsedWidthClassName?: string;
  /** Shows a Sign out button in the footer */
  showSignOut?: boolean;
}

export function RoleSidenav<T extends string>({
  roleLabel,
  brandTitle = 'Portal',
  items,
  activeId,
  onSelect,
  collapsed,
  onToggleCollapsed,
  expandedWidthClassName = 'w-[272px]',
  collapsedWidthClassName = 'w-[92px]',
  showSignOut = true,
}: Props<T>) {
  void brandTitle;
  const { logout } = useAuthActions();
  return createPortal(
    <aside
      className={`fixed left-0 ${APP_NAV_SIDENAV_TOP} z-[1100] ${APP_NAV_SIDENAV_HEIGHT} border-r border-slate-200 bg-white text-slate-900 shadow-sm ${
        collapsed ? collapsedWidthClassName : expandedWidthClassName
      }`}
      aria-label={`${roleLabel} sidenav`}
    >
      <div className="h-full flex flex-col p-4 min-h-0">
        <nav
          className={`flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1 ${collapsed ? 'items-center' : ''}`}
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
                className={`group relative w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-400/40 ${
                  collapsed ? 'justify-center' : ''
                } ${active 
                  ? 'bg-blue-50 text-blue-900 border border-blue-200 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                }`}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                    active 
                      ? 'border-blue-300 bg-blue-100' 
                      : 'border-slate-200 bg-white group-hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 ${active ? 'text-blue-600' : 'text-slate-600 group-hover:text-slate-700'}`} aria-hidden />
                </span>

                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs font-semibold truncate ${active ? 'text-blue-900' : 'text-slate-700'}`}>
                      {item.label}
                    </span>
                    {item.description && (
                      <span className={`block text-[10px] font-normal mt-0.5 ${active ? 'text-blue-700' : 'text-slate-400'}`}>
                        {item.description}
                      </span>
                    )}
                    {!item.description && badge != null && badge > 0 && (
                      <span className={`block text-[10px] font-normal mt-0.5 ${active ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                        {badge} pending
                      </span>
                    )}
                  </span>
                )}

                {!collapsed && badge != null && badge > 0 && (
                  <span className={`ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md text-[9px] font-bold ${
                    active 
                      ? 'bg-blue-200 text-blue-700' 
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-3 border-t border-slate-100 space-y-2 shrink-0">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all border border-transparent ${
              collapsed ? 'justify-center' : ''
            }`}
            aria-label={collapsed ? 'Expand sidenav' : 'Collapse sidenav'}
          >
            <ChevronLeft className={`h-4.5 w-4.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} aria-hidden />
            {!collapsed && <span className="text-xs font-semibold">Collapse</span>}
          </button>
          {showSignOut && (
            <button
              type="button"
              onClick={logout}
              className={`w-full flex items-center gap-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm hover:shadow-md active:scale-95 group ${
                collapsed ? 'justify-center px-3 py-2.5' : 'justify-center px-5 py-2'
              }`}
              aria-label="Sign out"
              title={collapsed ? 'Sign out' : undefined}
            >
              <LogOut className={`h-4 w-4`} aria-hidden />
              {!collapsed && <span className="text-[11px] font-semibold">Sign out</span>}
            </button>
          )}
        </div>
      </div>
    </aside>,
    document.body
  );
}

