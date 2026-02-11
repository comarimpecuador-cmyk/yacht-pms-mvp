'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { translate } from '@/lib/i18n';

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
    <main className="min-h-screen bg-slate-100 px-4 py-10 dark:bg-[radial-gradient(circle_at_top,#233453_0%,#0A0E17_50%,#070B12_100%)]">
      <div className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-border bg-surface-light p-8 shadow-2xl backdrop-blur dark:bg-surface/95">
        <h1 className="mb-2 text-center text-3xl font-semibold text-slate-900 dark:text-text-primary">
          {translate('auth.yachtPMS')}
        </h1>
        <p className="mb-6 text-center text-sm text-slate-600 dark:text-text-secondary">
          {translate('auth.signIn')}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-text-primary">
              {translate('auth.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40 dark:border-border dark:bg-background/80 dark:text-text-primary dark:placeholder-text-muted"
              placeholder="admin@yachtpms.com"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-text-primary">
              {translate('auth.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40 dark:border-border dark:bg-background/80 dark:text-text-primary dark:placeholder-text-muted"
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
    </main>
  );
}
