import { ReactNode, createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LoginRequest, MeResponse } from '../../types/auth';
import { bootstrapSession, loginWithPassword, logoutSession, refreshSessionTokens } from './authService';
import { getMe } from '../../repositories/authRepository';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: MeResponse | null;
  error: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateAuthenticatedState = useCallback(
    (nextUser: MeResponse) => {
      setUser(nextUser);
      setStatus('authenticated');
      setError(null);
      queryClient.setQueryData(['auth', 'me'], nextUser);
    },
    [queryClient],
  );

  const updateUnauthenticatedState = useCallback(() => {
    setUser(null);
    setStatus('unauthenticated');
    queryClient.removeQueries();
  }, [queryClient]);

  const bootstrap = useCallback(async () => {
    setStatus('loading');

    try {
      const currentUser = await bootstrapSession();
      if (currentUser) {
        updateAuthenticatedState(currentUser);
        return;
      }

      updateUnauthenticatedState();
    } catch (bootstrapError) {
      updateUnauthenticatedState();
      setError(bootstrapError instanceof Error ? bootstrapError.message : 'Error bootstrap session');
    }
  }, [updateAuthenticatedState, updateUnauthenticatedState]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const login = useCallback(
    async (payload: LoginRequest) => {
      setStatus('loading');
      setError(null);
      try {
        const currentUser = await loginWithPassword(payload);
        updateAuthenticatedState(currentUser);
      } catch (loginError) {
        updateUnauthenticatedState();
        setError(loginError instanceof Error ? loginError.message : 'Error de autenticacion');
        throw loginError;
      }
    },
    [updateAuthenticatedState, updateUnauthenticatedState],
  );

  const logout = useCallback(async () => {
    setError(null);
    await logoutSession();
    updateUnauthenticatedState();
  }, [updateUnauthenticatedState]);

  const refresh = useCallback(async () => {
    await refreshSessionTokens();
    const currentUser = await getMe();
    updateAuthenticatedState(currentUser);
  }, [updateAuthenticatedState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      isAuthenticated: status === 'authenticated',
      login,
      logout,
      refresh,
    }),
    [status, user, error, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
