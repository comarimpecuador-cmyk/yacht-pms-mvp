'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useYacht } from '@/lib/yacht-context';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { translate } from '@/lib/i18n';
import { formatFlagLabel } from '@/lib/flags';

interface InAppNotification {
  id: string;
  yachtId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
}

interface TopBarProps {
  onMenuToggle?: () => void;
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const { currentYacht, yachts, selectYacht, loadYachts, isLoading: yachtsLoading } = useYacht();
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const [yachtDropdownOpen, setYachtDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const yachtDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Load yachts on mount
  useEffect(() => {
    loadYachts();
  }, [loadYachts]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (yachtDropdownRef.current && !yachtDropdownRef.current.contains(event.target as Node)) {
        setYachtDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) return;

    const loadNotifications = async () => {
      setNotificationsLoading(true);
      try {
        const data = await api.get<InAppNotification[]>('/notifications/in-app?limit=8');
        setNotifications(data);
      } catch {
        setNotifications([]);
      } finally {
        setNotificationsLoading(false);
      }
    };

    loadNotifications().catch(() => {});
    const interval = setInterval(() => loadNotifications().catch(() => {}), 60_000);
    return () => clearInterval(interval);
  }, [user, pathname]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [notificationsOpen]);

  const handleYachtSelect = (yachtId: string) => {
    selectYacht(yachtId);
    setYachtDropdownOpen(false);
  };

  const handleLogout = () => {
    logout();
    setUserDropdownOpen(false);
  };

  const markNotificationRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'read',
              }
            : item,
        ),
      );
    } catch {
      // noop: keep dropdown interactive even if backend fails
    }
  };

  const unreadCount = notifications.filter((item) => item.status !== 'read').length;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        {onMenuToggle ? (
          <button
            type="button"
            onClick={onMenuToggle}
            className="inline-flex h-10 w-10 items-center justify-center border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary lg:hidden"
            aria-label="Abrir menu"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        ) : null}

        {/* Yacht Selector */}
        <div className="relative min-w-0" ref={yachtDropdownRef}>
        <button
          type="button"
          onClick={() => setYachtDropdownOpen(!yachtDropdownOpen)}
          className="flex min-w-0 items-center gap-3 border border-border bg-surface px-3 py-2 hover:bg-surface-hover"
        >
          {yachtsLoading ? (
            <div className="h-6 w-32 bg-surface-hover animate-pulse rounded" />
          ) : currentYacht ? (
            <>
              <div className="flex min-w-0 flex-col items-start">
                <span className="max-w-[9rem] truncate text-sm font-medium text-text-primary sm:max-w-[16rem]">
                  {currentYacht.name}
                </span>
                <span className="text-xs text-text-secondary">
                  {formatFlagLabel(currentYacht.flag)}
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-text-secondary transition-transform ${
                  yachtDropdownOpen ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </>
          ) : (
            <span className="text-sm text-text-secondary">{translate('yacht.selectYacht')}</span>
          )}
        </button>

        {yachtDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg py-1 z-50">
            <div className="px-3 py-2 text-xs text-text-secondary border-b border-border">
              {translate('yacht.selectYacht')}
            </div>
            {yachts.map((yacht) => (
              <button
                key={yacht.id}
                onClick={() => handleYachtSelect(yacht.id)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-hover transition-colors flex items-center justify-between ${
                  currentYacht?.id === yacht.id ? 'bg-surface-hover' : ''
                }`}
              >
                <div>
                  <div className="font-medium text-text-primary">{yacht.name}</div>
                  <div className="text-xs text-text-secondary">{formatFlagLabel(yacht.flag)}</div>
                </div>
                {currentYacht?.id === yacht.id && (
                  <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              <Link
                href="/yachts"
                className="flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-surface-hover transition-colors"
                onClick={() => setYachtDropdownOpen(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {translate('nav.allYachts')}
              </Link>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Right Section: Notifications, Theme, User */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Notifications"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-surface bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="fixed inset-0 z-[90]">
              <button
                type="button"
                aria-label="Cerrar panel de notificaciones"
                className="absolute inset-0 bg-background/85 backdrop-blur-sm"
                onClick={() => setNotificationsOpen(false)}
              />
              <div className="absolute inset-0 flex items-stretch justify-center lg:items-center lg:p-8">
                <div className="flex h-full w-full flex-col bg-background shadow-xl lg:h-[min(88vh,840px)] lg:max-w-4xl lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-surface">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3 lg:px-6">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary lg:hidden"
                        aria-label="Volver"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      </button>
                      <h3 className="truncate text-base font-semibold text-text-primary lg:text-lg">
                        {translate('notifications.title')}
                      </h3>
                      {unreadCount > 0 ? (
                        <span className="hidden rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent sm:inline-flex">
                          {unreadCount} nuevas
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary lg:inline-flex"
                      aria-label="Cerrar notificaciones"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M6 18L18 6" />
                      </svg>
                    </button>
                  </div>

                  {notificationsLoading ? (
                    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
                      Cargando notificaciones...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center p-6">
                      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-8 text-center lg:px-8">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-base font-semibold text-text-primary">No hay notificaciones por ahora</p>
                          <p className="mt-1 text-sm text-text-secondary">
                          Cuando el sistema genere recordatorios para el personal, apareceran aqui.
                          </p>
                        </div>
                        <Link
                          href="/settings/notifications"
                          onClick={() => setNotificationsOpen(false)}
                          className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover"
                        >
                          Configurar notificaciones
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ul className="flex-1 divide-y divide-border overflow-y-auto px-1 lg:px-2">
                        {notifications.map((item) => {
                          const title = typeof item.payload?.title === 'string'
                            ? item.payload.title
                            : 'Notificacion';
                          const subtitle = typeof item.payload?.message === 'string'
                            ? item.payload.message
                            : typeof item.payload?.description === 'string'
                              ? item.payload.description
                            : typeof item.payload?.reason === 'string'
                              ? item.payload.reason
                              : 'Sin detalle adicional';

                          return (
                            <li key={item.id} className="px-4 py-3 lg:px-5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-text-primary">{title}</p>
                                  {subtitle && (
                                    <p className="mt-0.5 truncate text-xs text-text-secondary">{subtitle}</p>
                                  )}
                                  <p className="mt-1 text-[11px] text-text-muted">
                                    {new Date(item.createdAt).toLocaleString()}
                                  </p>
                                </div>
                                {item.status !== 'read' && (
                                  <button
                                    type="button"
                                    onClick={() => markNotificationRead(item.id)}
                                    className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-text-primary hover:bg-surface-hover"
                                  >
                                    Marcar leida
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      <div className="border-t border-border px-4 py-3 lg:px-6">
                        <Link
                          href="/settings/notifications"
                          onClick={() => setNotificationsOpen(false)}
                          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover lg:w-auto"
                        >
                          Configurar notificaciones
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User Menu */}
        <div className="relative" ref={userDropdownRef}>
          <button
            type="button"
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-surface-hover flex items-center justify-center">
              <span className="text-sm font-medium text-text-secondary">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex flex-col items-start hidden sm:block">
              <span className="text-sm font-medium text-text-primary truncate max-w-32">
                {user?.email || 'Usuario'}
              </span>
              <span className="text-xs text-text-secondary capitalize">
                {user?.role || 'Captain'}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-text-secondary transition-transform ${
                userDropdownOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {userDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg py-1 z-50">
              <Link
                href="/settings"
                className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors"
                onClick={() => setUserDropdownOpen(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {translate('common.profile')}
              </Link>
              <Link
                href="/settings/notifications"
                className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors"
                onClick={() => setUserDropdownOpen(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {translate('nav.settings')}
              </Link>
              {user?.role === 'SystemAdmin' && (
                <Link
                  href="/settings/users"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors"
                  onClick={() => setUserDropdownOpen(false)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Usuarios
                </Link>
              )}
              <div className="border-t border-border mt-1 pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {translate('auth.logout')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
