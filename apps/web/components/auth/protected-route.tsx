'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const initialized = useRef(false);

  useEffect(() => {
    if (isLoading || initialized.current) return;

    // 🍪 MIGRACIÓN HTTP-ONLY: Simplificado - solo necesita isAuthenticated
    if (!isAuthenticated && !isLoading) {
      initialized.current = true;
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // 🍪 MIGRACIÓN: 100% estable con cookies
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  // Si no está autenticado después de loading, return null (React lo maneja)
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
