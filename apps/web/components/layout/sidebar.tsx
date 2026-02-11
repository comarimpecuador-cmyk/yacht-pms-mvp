'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { translate } from '@/lib/i18n';
import { useYacht } from '@/lib/yacht-context';

const YACHT_MODULES = [
  { label: translate('nav.engines'), href: '/engines' },
  { label: translate('nav.logbook'), href: '/logbook' },
  { label: translate('nav.maintenance'), href: '/maintenance' },
  { label: translate('nav.documents'), href: '/documents' },
  { label: translate('nav.hrm'), href: '/hrm' },
  { label: 'Inventario', href: '/inventory' },
  { label: 'Ordenes de compra', href: '/purchase-orders' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentYacht, isLoading: yachtLoading } = useYacht();

  const match = pathname.match(/\/yachts\/([^/]+)/);
  const yachtId = match ? match[1] : currentYacht?.id || '';

  const settingsModules = [
    { label: translate('nav.settings'), href: '/settings' },
    { label: translate('notifications.title'), href: '/settings/notifications' },
    ...(user?.role === 'SystemAdmin' ? [{ label: 'Usuarios', href: '/settings/users' }] : []),
  ];

  const generalModules =
    user?.role === 'SystemAdmin'
      ? [
          { label: 'Dashboard global', href: '/dashboard' },
          { label: 'Seleccionar yate', href: '/yachts' },
        ]
      : [
          {
            label: currentYacht ? 'Panel del yate' : 'Panel operativo',
            href: currentYacht ? `/yachts/${currentYacht.id}/home` : '/yachts',
          },
          { label: 'Seleccionar yate', href: '/yachts' },
        ];

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/';
    }
    if (href === '/yachts') {
      return pathname === '/yachts';
    }
    if (href.startsWith('/yachts/')) {
      return pathname.startsWith(href);
    }
    if (['/engines', '/logbook', '/maintenance', '/documents', '/hrm', '/inventory', '/purchase-orders'].includes(href)) {
      return pathname.startsWith(`/yachts/${yachtId}${href}`);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-surface">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">{translate('auth.yachtPMS')}</h2>
          <ThemeToggle />
        </div>

        {yachtLoading ? (
          <div className="mt-3 h-12 animate-pulse rounded-lg bg-surface-hover" />
        ) : currentYacht ? (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-text-secondary">Yate activo</div>
            <div className="truncate text-sm font-semibold text-text-primary">{currentYacht.name}</div>
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-text-secondary">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {translate('yacht.active')}
              </div>
              <Link href="/yachts" className="text-xs text-accent hover:underline">
                Cambiar
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
            <div className="text-sm font-medium text-text-primary">Sin yate activo</div>
            <p className="mt-1 text-xs text-text-secondary">
              Selecciona un yate para habilitar motores, bitacora y documentos.
            </p>
            <Link href="/yachts" className="mt-2 inline-block text-xs text-accent hover:underline">
              Seleccionar yate
            </Link>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-4 pb-2">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
            {translate('nav.general')}
          </div>
          <ul className="space-y-1">
            {generalModules.map((item) => (
              <li key={`${item.href}-${item.label}`}>
                <Link
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive(item.href)
                      ? 'bg-accent/10 font-medium text-accent'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-4 pb-2">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
            Operacion del yate
          </div>
          {currentYacht ? (
            <>
              <Link
                href={`/yachts/${yachtId}/home`}
                className={`mb-1 block rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive(`/yachts/${yachtId}/home`)
                    ? 'bg-accent/10 font-medium text-accent'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                Dashboard del yate
              </Link>
              <ul className="space-y-1">
                {YACHT_MODULES.map((item) => {
                  const href = `/yachts/${yachtId}${item.href}`;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive(item.href)
                            ? 'bg-accent/10 font-medium text-accent'
                            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="rounded-lg border border-border bg-surface-hover px-3 py-2 text-xs text-text-secondary">
              Elige un yate para activar este menu.
            </div>
          )}
        </div>

        <div className="px-4 pb-2">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
            {translate('nav.system')}
          </div>
          <ul className="space-y-1">
            {settingsModules.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive(item.href)
                      ? 'bg-accent/10 font-medium text-accent'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {translate('system.online')}
        </div>
      </div>
    </aside>
  );
}
