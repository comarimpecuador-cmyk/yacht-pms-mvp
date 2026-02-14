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

interface SidebarProps {
  onNavigate?: () => void;
  showMobileHeader?: boolean;
}

export function Sidebar({ onNavigate, showMobileHeader = false }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentYacht, isLoading: yachtLoading } = useYacht();

  const match = pathname.match(/\/yachts\/([^/]+)/);
  const yachtId = match ? match[1] : currentYacht?.id || '';

  const settingsModules = [
    { label: translate('nav.settings'), href: '/settings' },
    { label: translate('notifications.title'), href: '/settings/notifications' },
    ...(user && ['Captain', 'Chief Engineer', 'Management/Office', 'Admin', 'SystemAdmin'].includes(user.role)
      ? [
          { label: 'Reglas personalizadas', href: '/settings/notification-rules' },
          { label: 'Trabajos programados', href: '/settings/jobs' },
        ]
      : []),
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

  const linkClass = (href: string) =>
    `menu-item ${
      isActive(href)
        ? 'menu-item-active'
        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
    }`;

  const handleNavigate = () => {
    onNavigate?.();
  };

  return (
    <aside className="flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-surface">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{translate('auth.yachtPMS')}</h2>
            <p className="text-[11px] uppercase tracking-wider text-text-muted">Navegacion</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {showMobileHeader ? (
              <button
                type="button"
                onClick={handleNavigate}
                className="inline-flex h-9 w-9 items-center justify-center border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary lg:hidden"
                aria-label="Cerrar menu"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            ) : null}
          </div>
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
              <Link href="/yachts" onClick={handleNavigate} className="text-xs font-medium text-accent hover:underline">
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
            <Link href="/yachts" onClick={handleNavigate} className="mt-2 inline-block text-xs font-medium text-accent hover:underline">
              Seleccionar yate
            </Link>
          </div>
        )}
      </div>

      <nav className="scrollbar-hide flex-1 overflow-y-auto py-4">
        <div className="px-4 pb-2">
          <div className="menu-section-title">{translate('nav.general')}</div>
          <ul className="space-y-1">
            {generalModules.map((item) => (
              <li key={`${item.href}-${item.label}`}>
                <Link href={item.href} onClick={handleNavigate} className={linkClass(item.href)}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-4 pb-2">
          <div className="menu-section-title">Operacion del yate</div>
          {currentYacht ? (
            <>
              <Link href={`/yachts/${yachtId}/home`} onClick={handleNavigate} className={linkClass(`/yachts/${yachtId}/home`)}>
                Dashboard del yate
              </Link>
              <ul className="space-y-1">
                {YACHT_MODULES.map((item) => {
                  const href = `/yachts/${yachtId}${item.href}`;
                  return (
                    <li key={href}>
                      <Link href={href} onClick={handleNavigate} className={linkClass(item.href)}>
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
          <div className="menu-section-title">{translate('nav.system')}</div>
          <ul className="space-y-1">
            {settingsModules.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={handleNavigate} className={linkClass(item.href)}>
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
