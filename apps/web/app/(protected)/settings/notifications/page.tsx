'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { translate } from '@/lib/i18n';
import { useYacht } from '@/lib/yacht-context';

type Severity = 'info' | 'warn' | 'critical';
type ScenarioKey =
  | 'inventory_low_stock'
  | 'maintenance_due_this_week'
  | 'documents_renewal_due'
  | 'purchase_order_pending'
  | 'engines_service_due';

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

interface EmailRecipientOption {
  userId: string;
  fullName: string;
  email: string;
  role: string;
}

interface ScenarioDispatchResponse {
  recipients: Array<{ email: string; name?: string }>;
  sent: number;
  failed: number;
  skipped: number;
  results: Array<{
    recipient: { email: string; name?: string };
    sent: number;
    failed: number;
    skipped: number;
  }>;
}

const SCENARIO_OPTIONS: Array<{ key: ScenarioKey; label: string; description: string }> = [
  {
    key: 'inventory_low_stock',
    label: 'Inventario bajo',
    description: 'Alerta cuando una pieza queda bajo el minimo.',
  },
  {
    key: 'maintenance_due_this_week',
    label: 'Mantenimiento cercano',
    description: 'Recordatorio de tareas que vencen esta semana.',
  },
  {
    key: 'documents_renewal_due',
    label: 'Documento por vencer',
    description: 'Aviso de renovacion documental proxima.',
  },
  {
    key: 'purchase_order_pending',
    label: 'Compra pendiente',
    description: 'Seguimiento de ordenes en espera de aprobacion.',
  },
  {
    key: 'engines_service_due',
    label: 'Revision de motores',
    description: 'Notificacion de revision preventiva de motor.',
  },
];

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
      return 'No se pudo conectar con el API. Verifique que backend este levantado.';
    }
    if (error.message.includes('Unauthorized') || error.message.includes('HTTP 401')) {
      return 'Sesion expirada o invalida. Inicie sesion nuevamente.';
    }
    return error.message;
  }
  return fallback;
}

function toIsoFromDateTimeLocal(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
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
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  const [selectedYachtId, setSelectedYachtId] = useState('');
  const [selectedRecipientUserId, setSelectedRecipientUserId] = useState('');
  const [manualToEmail, setManualToEmail] = useState('');
  const [manualToName, setManualToName] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [selectedScenarios, setSelectedScenarios] = useState<ScenarioKey[]>([
    'inventory_low_stock',
    'maintenance_due_this_week',
    'documents_renewal_due',
    'purchase_order_pending',
  ]);
  const [emailRecipients, setEmailRecipients] = useState<EmailRecipientOption[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] = useState<ScenarioDispatchResponse | null>(null);

  useEffect(() => {
    loadYachts().catch(() => {});
  }, [loadYachts]);

  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      setLoading(true);
      setSettingsError(null);
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
        setSettingsError(toFriendlyError(err, 'No se pudo cargar configuracion'));
      } finally {
        setLoading(false);
      }
    };

    loadSettings().catch(() => {});
  }, [user, yachts]);

  useEffect(() => {
    if (!user) return;
    const fetchRecipients = async () => {
      setLoadingRecipients(true);
      setEmailError(null);
      try {
        const query = selectedYachtId ? `?yachtId=${encodeURIComponent(selectedYachtId)}` : '';
        const response = await api.get<EmailRecipientOption[]>(`/notifications/email/recipients${query}`);
        setEmailRecipients(Array.isArray(response) ? response : []);
      } catch (err) {
        setEmailRecipients([]);
        setEmailError(toFriendlyError(err, 'No se pudo cargar destinatarios activos'));
      } finally {
        setLoadingRecipients(false);
      }
    };

    fetchRecipients().catch(() => {});
  }, [user, selectedYachtId]);

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

  const toggleScenario = (scenario: ScenarioKey) => {
    setSelectedScenarios((current) =>
      current.includes(scenario)
        ? current.filter((item) => item !== scenario)
        : [...current, scenario],
    );
  };

  const saveSettings = async () => {
    setSaving(true);
    setSettingsError(null);
    setSettingsMessage(null);
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
      setSettingsMessage('Preferencias guardadas');
    } catch (err) {
      setSettingsError(toFriendlyError(err, 'No se pudo guardar configuracion'));
    } finally {
      setSaving(false);
    }
  };

  const sendScenarioEmail = async () => {
    setEmailError(null);
    setEmailMessage(null);
    setDispatchResult(null);

    if (selectedScenarios.length === 0) {
      setEmailError('Seleccione al menos un escenario para enviar.');
      return;
    }

    const selectedRecipient = emailRecipients.find((userItem) => userItem.userId === selectedRecipientUserId);
    const recipients: Array<{ email: string; name?: string }> = [];

    if (selectedRecipient) {
      recipients.push({
        email: selectedRecipient.email,
        name: selectedRecipient.fullName,
      });
    }

    if (manualToEmail.trim()) {
      recipients.push({
        email: manualToEmail.trim(),
        name: manualToName.trim() || undefined,
      });
    }

    if (recipients.length === 0) {
      setEmailError('Seleccione un usuario o ingrese un correo manual.');
      return;
    }

    setSendingEmail(true);
    try {
      const response = await api.post<ScenarioDispatchResponse>('/notifications/email/scenarios/send', {
        recipients,
        yachtId: selectedYachtId || undefined,
        scenarios: selectedScenarios,
        dueAt: toIsoFromDateTimeLocal(dueAt),
        responsibleUserId: responsibleUserId || undefined,
      });
      setDispatchResult(response);
      setEmailMessage(
        `Envio finalizado: ${response.sent} enviados, ${response.failed} fallidos, ${response.skipped} omitidos.`,
      );
    } catch (err) {
      setEmailError(toFriendlyError(err, 'No se pudo enviar el correo'));
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <section className="max-w-5xl space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-text-primary">{translate('notifications.title')}</h1>
        <p className="text-sm text-slate-500">Cargando configuracion...</p>
      </section>
    );
  }

  return (
    <section className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-text-primary">{translate('notifications.title')}</h1>

      {settingsError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {settingsError}
        </div>
      )}
      {settingsMessage && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          {settingsMessage}
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-border dark:bg-surface">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-text-primary">Canales y preferencias</h2>

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
            className="btn-primary"
          >
            {saving ? 'Guardando...' : 'Guardar preferencias'}
          </button>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-border dark:bg-surface">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-text-primary">Centro de envios por correo</h2>
        <p className="text-sm text-slate-500">
          Envie notificaciones operativas con formato final para validar contenido, responsables y tiempos.
        </p>

        {emailError && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {emailError}
          </div>
        )}
        {emailMessage && (
          <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">
            {emailMessage}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600 dark:text-text-secondary">Yate</label>
          <select
            value={selectedYachtId}
            onChange={(event) => setSelectedYachtId(event.target.value)}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
          >
            <option value="">Yate activo por defecto</option>
            {yachts.map((yacht) => (
              <option key={yacht.id} value={yacht.id}>
                {yacht.name}
              </option>
            ))}
          </select>

          <label className="text-sm text-slate-600 dark:text-text-secondary">Responsable (usuario)</label>
          <select
            value={responsibleUserId}
            onChange={(event) => setResponsibleUserId(event.target.value)}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
          >
            <option value="">Resolver automaticamente</option>
            {emailRecipients.map((item) => (
              <option key={item.userId} value={item.userId}>
                {item.fullName} ({item.role})
              </option>
            ))}
          </select>

          <label className="text-sm text-slate-600 dark:text-text-secondary">Destinatario (usuario activo)</label>
          <select
            value={selectedRecipientUserId}
            onChange={(event) => setSelectedRecipientUserId(event.target.value)}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
          >
            <option value="">{loadingRecipients ? 'Cargando...' : 'Seleccione usuario'}</option>
            {emailRecipients.map((item) => (
              <option key={item.userId} value={item.userId}>
                {item.fullName} - {item.email}
              </option>
            ))}
          </select>

          <label className="text-sm text-slate-600 dark:text-text-secondary">Correo manual (opcional)</label>
          <input
            value={manualToEmail}
            onChange={(event) => setManualToEmail(event.target.value)}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
            placeholder="correo@dominio.com"
          />

          <label className="text-sm text-slate-600 dark:text-text-secondary">Nombre del correo manual</label>
          <input
            value={manualToName}
            onChange={(event) => setManualToName(event.target.value)}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
            placeholder="Nombre opcional"
          />

          <label className="text-sm text-slate-600 dark:text-text-secondary">Fecha/hora objetivo (opcional)</label>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-border dark:bg-background dark:text-text-primary"
          />
        </div>

        <div className="rounded border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-900">Escenarios a enviar</p>
          <div className="grid gap-2 md:grid-cols-2">
            {SCENARIO_OPTIONS.map((scenario) => (
              <label key={scenario.key} className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedScenarios.includes(scenario.key)}
                  onChange={() => toggleScenario(scenario.key)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium text-slate-900">{scenario.label}</span>
                  <span className="text-xs text-slate-500">{scenario.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={sendScenarioEmail}
            disabled={sendingEmail}
            className="btn-primary"
          >
            {sendingEmail ? 'Enviando...' : 'Enviar correo operativo'}
          </button>
        </div>

        {dispatchResult && (
          <div className="rounded border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-900">Resumen del ultimo envio</p>
            <p className="text-xs text-slate-500">
              Enviados: {dispatchResult.sent} | Fallidos: {dispatchResult.failed} | Omitidos: {dispatchResult.skipped}
            </p>
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              {dispatchResult.results.map((item) => (
                <p key={item.recipient.email}>
                  {item.recipient.email}: {item.sent} enviados, {item.failed} fallidos, {item.skipped} omitidos
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
