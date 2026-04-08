import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface DarkModeContextValue {
  isDark: boolean;
  toggle: () => void;
}

const DarkModeContext = createContext<DarkModeContextValue>({
  isDark: false,
  toggle: () => {},
});

function getDarkModeKey(userId: string | null | undefined): string {
  return userId ? `aa2000-dark-mode-${userId}` : 'aa2000-dark-mode-guest';
}

interface DarkModeProviderProps {
  children: React.ReactNode;
  userId?: string | null;
}

export function DarkModeProvider({ children, userId }: DarkModeProviderProps) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(getDarkModeKey(userId)) === '1';
    } catch {
      return false;
    }
  });

  // When userId changes (login/logout/switch user), reload that user's preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(getDarkModeKey(userId));
      setIsDark(saved === '1');
    } catch {
      setIsDark(false);
    }
  }, [userId]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(getDarkModeKey(userId), isDark ? '1' : '0');
    } catch {}
  }, [isDark, userId]);

  const toggle = useCallback(() => setIsDark(d => !d), []);

  return (
    <DarkModeContext.Provider value={{ isDark, toggle }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  return useContext(DarkModeContext);
}
