'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function SettingsPage() {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === 'SystemAdmin';
  const canManageAutomation = !!user && ['Captain', 'Chief Engineer', 'Management/Office', 'Admin', 'SystemAdmin'].includes(user.role);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Configuracion</h1>
        <p className="text-sm text-text-secondary">
          Ajustes del sistema y administracion de acceso.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <Link
          href="/settings/notifications"
          className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
        >
          <p className="text-base font-medium text-text-primary">Notificaciones</p>
          <p className="mt-1 text-sm text-text-secondary">
            Preferencias de alertas y ventanas de envio.
          </p>
        </Link>

        <Link
          href="/settings/users"
          className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
        >
          <p className="text-base font-medium text-text-primary">Usuarios</p>
          <p className="mt-1 text-sm text-text-secondary">
            {isSystemAdmin
              ? 'Crear usuarios, activar/desactivar y asignar yates.'
              : 'Vista de usuarios y accesos por yate.'}
          </p>
        </Link>

        {canManageAutomation && (
          <>
            <Link
              href="/settings/notification-rules"
              className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
            >
              <p className="text-base font-medium text-text-primary">Reglas personalizadas</p>
              <p className="mt-1 text-sm text-text-secondary">
                Define eventos, destinatarios y canales de alertas preventivas por modulo.
              </p>
            </Link>

            <Link
              href="/settings/jobs"
              className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
            >
              <p className="text-base font-medium text-text-primary">Trabajos programados</p>
              <p className="mt-1 text-sm text-text-secondary">
                Crea tareas recurrentes y recordatorios (dias/horas antes) con asignacion automatica.
              </p>
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
