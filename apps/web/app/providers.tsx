'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { YachtProvider } from '@/lib/yacht-context';
import { I18nProvider } from '@/lib/i18n';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readThemeCookie(): Theme | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)theme=(dark|light)(?:;|$)/);
  return match ? (match[1] as Theme) : null;
}

function writeThemeCookie(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export function Providers({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = readThemeCookie();
    if (saved) {
      setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light');
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
      html.style.colorScheme = 'dark';
    } else {
      html.classList.remove('dark');
      html.style.colorScheme = 'light';
    }
    writeThemeCookie(theme);
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Prevent flash of wrong theme
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <I18nProvider>
        <AuthProvider>
          <YachtProvider>
            {children}
          </YachtProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  // Return default values during SSR/pre-render
  if (context === undefined) {
    return { theme: 'dark' as Theme, toggleTheme: () => {} };
  }
  return context;
}
