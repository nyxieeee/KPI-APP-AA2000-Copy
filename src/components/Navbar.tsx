import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, SystemStats, UserRole, SystemNotification } from '../types';
import { Menu, Settings, X, Bell, Sun, Moon } from 'lucide-react';
import Logo from './Logo';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { useMobileSidenav } from '../contexts/MobileSidenavContext';
import { useRoleSidenavRail } from '../contexts/RoleSidenavRailContext';
import { useDarkMode } from '../contexts/DarkModeContext';
import ProfileSettingsOverlay from './ProfileSettingsOverlay';

interface NavbarProps {
  user: User;
  onClearLocalCache: () => void;
  validatedStats?: SystemStats;
  registry: any[];
  onUpdateRegistry: (newRegistry: any[]) => void;
  notifications?: SystemNotification[];
  onDeleteNotification?: (id: string) => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onClearLocalCache, registry, onUpdateRegistry, notifications = [], onDeleteNotification }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const mobileNav = useMobileSidenav();
  const { setRailOpen } = useRoleSidenavRail();
  const { isDark, toggle: toggleDark } = useDarkMode();

  const unreadCount = notifications.length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setIsBellOpen(false);
    };
    if (isBellOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isBellOpen]);

  useLockBodyScroll(isSettingsOpen);

  useEffect(() => {
    if (isSettingsOpen) {
      mobileNav.close();
      setRailOpen(false);
      document.body.classList.add('settings-open');
    } else {
      document.body.classList.remove('settings-open');
    }
    return () => {
      document.body.classList.remove('settings-open');
    };
  }, [isSettingsOpen, mobileNav, setRailOpen]);

  return (
    <>
      {isSettingsOpen && (
        <ProfileSettingsOverlay
          user={user}
          registry={registry}
          onUpdateRegistry={onUpdateRegistry}
          onClearLocalCache={onClearLocalCache}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      <nav className={`bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 lg:sticky lg:top-0 z-[1000] h-20 flex items-center shadow-sm dark:shadow-slate-900/50 transition-opacity duration-150 ${isSettingsOpen ? 'opacity-0 pointer-events-none select-none' : ''}`}>
        <div className="max-w-[1800px] mx-auto w-full px-4 md:px-12 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6 md:gap-10">
            <button
              type="button"
              onClick={mobileNav.toggle}
              className="lg:hidden p-2.5 rounded-2xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              aria-label="Open navigation menu"
              title="Menu"
            >
              <Menu className="w-5 h-5" aria-hidden />
            </button>
            <Link to="/dashboard" className="focus:outline-none focus:ring-2 focus:ring-blue-500/20 rounded-xl" aria-label="Go to dashboard">
              <Logo size="sm" showText={true} />
            </Link>
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={toggleDark}
              className="p-3 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-2xl transition-all"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark
                ? <Sun className="w-5 h-5 text-amber-400" />
                : <Moon className="w-5 h-5" />
              }
            </button>

            {/* Notification Bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setIsBellOpen(o => !o)}
                className="relative p-3 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-2xl transition-all"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900" />
                )}
              </button>
              {isBellOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-lg z-[2000] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => { notifications.forEach(n => onDeleteNotification?.(n.id)); }}
                        className="text-[10px] font-black text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 uppercase tracking-widest"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <Bell className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No new notifications</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="px-5 py-3.5 border-b border-slate-50 dark:border-slate-700/50 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                          <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${n.type === 'SUCCESS' ? 'bg-emerald-400' : n.type === 'ALERT' ? 'bg-red-400' : 'bg-blue-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-snug">{n.message}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{new Date(n.timestamp).toLocaleTimeString()}</p>
                          </div>
                          <button
                            onClick={() => onDeleteNotification?.(n.id)}
                            className="shrink-0 p-1 text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Settings */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-3 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white rounded-2xl transition-all"
              aria-label="Open settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            <div className="h-8 w-px bg-slate-100 dark:bg-[#0d1526] mx-1 md:mx-2"></div>

            <div className="hidden md:block text-right">
              <p className="text-xs font-black text-slate-900 dark:text-white leading-none">{user.name}</p>
              <p className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mt-1">{user.role}</p>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navbar;
