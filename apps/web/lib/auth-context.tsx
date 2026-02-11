'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { login as apiLogin, refresh as apiRefresh, api } from './api';
import { translate } from './i18n';

interface User {
  id: string;
  email: string;
  role: string;
  yachtIds: string[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshFailureCount = useRef(0);
  const pathname = usePathname();

  const logout = useCallback(() => {
    setUser(null);
    api.post('/api/auth/logout', {}).catch(() => {});
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Clear previous session to avoid cookie mix when switching users.
      await api.post('/api/auth/logout', {}).catch(() => {});
      setUser(null);

      await apiLogin(email, password);
      const userData = await api.get<User>('/api/auth/me');
      setUser(userData);
    } catch (error) {
      const message = error instanceof Error ? error.message : translate('auth.loginFailed');
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // En /login evitamos bootstrap de sesion para no generar 401 esperados en consola.
    if (pathname === '/login') {
      setIsLoading(false);
      return;
    }

    const checkAuth = async () => {
      try {
        const userData = await api.get<User>('/api/auth/me');
        setUser(userData);
        refreshFailureCount.current = 0;
      } catch {
        try {
          await apiRefresh();
          const userData = await api.get<User>('/api/auth/me');
          setUser(userData);
          refreshFailureCount.current = 0;
        } catch {
          setUser(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [pathname]);

  useEffect(() => {
    if (!user) return;

    const refreshTokens = async () => {
      try {
        await apiRefresh();
        refreshFailureCount.current = 0;
      } catch {
        refreshFailureCount.current += 1;

        // Evita cerrar sesion por un fallo transitorio (red/tab en segundo plano).
        if (refreshFailureCount.current < 3) {
          return;
        }

        try {
          const userData = await api.get<User>('/api/auth/me');
          setUser(userData);
          refreshFailureCount.current = 0;
        } catch {
          logout();
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshTokens();
      }
    };

    const intervalId = setInterval(() => void refreshTokens(), 10 * 60 * 1000);
    window.addEventListener('focus', refreshTokens);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', refreshTokens);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, logout]);

  useEffect(() => {
    const handleLogout = () => logout();
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      logout,
      isAuthenticated: !!user,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return {
      user: null,
      isLoading: true,
      login: async () => {},
      logout: () => {},
      isAuthenticated: false,
    };
  }
  return context;
}
