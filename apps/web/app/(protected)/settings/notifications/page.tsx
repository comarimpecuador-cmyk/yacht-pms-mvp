'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { translate } from '@/lib/i18n';
import { useYacht } from '@/lib/yacht-context';

type Severity = 'info' | 'warn' | 'critical';

interface NotificationSettingsPayload {
  timezone: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushFuture: boolean;
  windowStart: string;
  windowEnd: string;
  minSeverity: Severity;
  yachtsScope: string[];
}

function normalizeSettingsPayload(
  raw: unknown,
  fallbackYachtIds: string[],
): NotificationSettingsPayload {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const yachtsScope = Array.isArray(value.yachtsScope)
    ? value.yachtsScope.filter((item): item is string => typeof item === 'string')
    : fallbackYachtIds;

  const minSeverityRaw = value.minSeverity;
  const minSeverity: Severity =
    minSeverityRaw === 'warn' || minSeverityRaw === 'critical' ? minSeverityRaw : 'info';

  return {
    timezone: typeof value.timezone === 'string' && value.timezone.trim() ? value.timezone : 'UTC',
    inAppEnabled: typeof value.inAppEnabled === 'boolean' ? value.inAppEnabled : true,
    emailEnabled: typeof value.emailEnabled === 'boolean' ? value.emailEnabled : false,
    pushFuture: typeof value.pushFuture === 'boolean' ? value.pushFuture : false,
    windowStart: typeof value.windowStart === 'string' && value.windowStart.trim() ? value.windowStart : '08:00',
    windowEnd: typeof value.windowEnd === 'string' && value.windowEnd.trim() ? value.windowEnd : '18:00',
    minSeverity,
    yachtsScope,
  };
}

function toFriendlyError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
      return 'No se pudo conectar con el API (puerto 3001). Verifique que el backend esté levantado.';
    }
    if (error.message.includes('Unauthorized') || error.message.includes('HTTP 401')) {
      return 'Sesion expirada o invalida. Inicie sesion nuevamente.';
    }
    if (
      error.message.includes('Invalid `this.prisma.notificationPreference.upsert') ||
      error.message.includes('Unknown argument') ||
      error.message.includes('Validation error')
    ) {
      return 'Configuracion invalida para notificaciones. Revise los campos e intente nuevamente.';
    }
    return error.message;
  }
  return fallback;
}

const DEFAULT_SETTINGS: NotificationSettingsPayload = {
  timezone: 'UTC',
  inAppEnabled: true,
  emailEnabled: false,
  pushFuture: false,
  windowStart: '08:00',
  windowEnd: '18:00',
  minSeverity: 'info',
  yachtsScope: [],
};

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const { yachts, loadYachts } = useYacht();
  const [form, setForm] = useState<NotificationSettingsPayload>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadYachts().catch(() => {});
  }, [loadYachts]);

  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<unknown>('/notifications/settings');
        if (response) {
          setForm(normalizeSettingsPayload(response, yachts.map((yacht) => yacht.id)));
        } else {
          setForm({
            ...DEFAULT_SETTINGS,
            yachtsScope: yachts.map((yacht) => yacht.id),
          });
        }
      } catch (err) {
        setError(toFriendlyError(err, 'No se pudo cargar configuracion'));
      } finally {
        setLoading(false);
      }
    };

    loadSettings().catch(() => {});
  }, [user, yachts]);

  const yachtSelectionLabel = useMemo(() => {
    if (form.yachtsScope.length === 0) return 'Sin yates';
    if (form.yachtsScope.length === yachts.length && yachts.length > 0) return 'Todos los yates';
    return `${form.yachtsScope.length} yates`;
  }, [form.yachtsScope, yachts.length]);

  const toggleYacht = (yachtId: string) => {
    setForm((current) => {
      const exists = current.yachtsScope.includes(yachtId);
      return {
        ...current,
        yachtsScope: exists
          ? current.yachtsScope.filter((id) => id !== yachtId)
          : [...current.yachtsScope, yachtId],
      };
    });
  };

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: NotificationSettingsPayload = {
        timezone: form.timezone,
        inAppEnabled: form.inAppEnabled,
        emailEnabled: form.emailEnabled,
        pushFuture: form.pushFuture,
        windowStart: form.windowStart,
        windowEnd: form.windowEnd,
        minSeverity: form.minSeverity,
        yachtsScope: form.yachtsScope,
      };
      await api.post('/notifications/settings', payload);
      setMessage('Preferencias guardadas');
    } catch (err) {
      setError(toFriendlyError(err, 'No se pudo guardar configuracion'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-text-primary">{translate('notifications.title')}</h1>
        <p className="text-sm text-slate-500">Cargando configuracion...</p>
      </section>
    );
  }

  return (
    <section className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-text-primary">{translate('notifications.title')}</h1>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-border dark:bg-surface">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600 dark:text-text-secondary">Zona horaria</label>
          <input
            value={form.timezone}
            onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
            placeholder="UTC"
          />

          <label className="text-sm text-slate-600 dark:text-text-secondary">Ventana inicio</label>
          <input
            type="time"
            value={form.windowStart}
            onChange={(event) => setForm((current) => ({ ...current, windowStart: event.target.value }))}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
          />

          <label className="text-sm text-slate-600 dark:text-text-secondary">Ventana fin</label>
          <input
            type="time"
            value={form.windowEnd}
            onChange={(event) => setForm((current) => ({ ...current, windowEnd: event.target.value }))}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
          />

          <label className="text-sm text-slate-600 dark:text-text-secondary">Severidad minima</label>
          <select
            value={form.minSeverity}
            onChange={(event) => setForm((current) => ({ ...current, minSeverity: event.target.value as Severity }))}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
          >
            <option value="info">Informativa</option>
            <option value="warn">Advertencia</option>
            <option value="critical">Critica</option>
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.inAppEnabled}
              onChange={(event) => setForm((current) => ({ ...current, inAppEnabled: event.target.checked }))}
            />
            En la app
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.emailEnabled}
              onChange={(event) => setForm((current) => ({ ...current, emailEnabled: event.target.checked }))}
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.pushFuture}
              onChange={(event) => setForm((current) => ({ ...current, pushFuture: event.target.checked }))}
            />
            Push (futuro)
          </label>
        </div>

        <div className="rounded border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">Alcance de yates</p>
          <p className="mb-2 text-xs text-slate-500">{yachtSelectionLabel}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {yachts.map((yacht) => (
              <label key={yacht.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.yachtsScope.includes(yacht.id)}
                  onChange={() => toggleYacht(yacht.id)}
                />
                {yacht.name}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar preferencias'}
          </button>
        </div>
      </div>
    </section>
  );
}
