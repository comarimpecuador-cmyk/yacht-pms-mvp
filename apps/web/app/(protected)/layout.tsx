'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/topbar';
import { ProtectedRoute } from '@/components/auth/protected-route';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <div className="flex min-h-screen">
          <div className="hidden shrink-0 lg:block">
            <div className="sticky top-0 h-screen">
              <Sidebar />
            </div>
          </div>

          {mobileMenuOpen ? (
            <button
              type="button"
              aria-label="Cerrar menu"
              className="fixed inset-0 z-40 bg-black/45 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
          ) : null}

          <div
            className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:hidden ${
              mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <Sidebar showMobileHeader onNavigate={() => setMobileMenuOpen(false)} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar onMenuToggle={() => setMobileMenuOpen(true)} />
            <main className="flex-1 overflow-auto bg-background px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
              <div className="app-page">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
