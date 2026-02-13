'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { translate } from '@/lib/i18n';
import { ThemeToggle } from '@/components/shared/theme-toggle';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const submittingRef = useRef(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submittingRef.current || isLoading) return;
    submittingRef.current = true;

    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      router.push('/yachts');
    } catch (error: any) {
      setError(error.message || translate('auth.invalidCredentials'));
      submittingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{translate('auth.yachtPMS')}</h1>
            <p className="text-[11px] uppercase tracking-wider text-text-muted">Acceso</p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-start justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl sm:p-8">
          <h2 className="mb-2 text-center text-3xl font-semibold text-text-primary">
            {translate('auth.yachtPMS')}
          </h2>
          <p className="mb-6 text-center text-sm text-text-secondary">
            {translate('auth.signIn')}
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary">
                {translate('auth.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary placeholder-text-muted focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
                placeholder="admin@yachtpms.com"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary">
                {translate('auth.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary placeholder-text-muted focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
                placeholder="********"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-lg bg-gold py-2.5 text-sm font-medium text-black transition hover:bg-gold-hover disabled:opacity-50"
            >
              {isLoading ? translate('auth.signingIn') : translate('auth.signIn')}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
