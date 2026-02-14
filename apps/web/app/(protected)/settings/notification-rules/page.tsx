'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useYacht } from '@/lib/yacht-context';

type Severity = 'info' | 'warn' | 'critical';
type Channel = 'in_app' | 'email' | 'push';
type ScopeType = 'fleet' | 'yacht' | 'entity';
type CadenceMode = 'once' | 'hourly' | 'daily' | 'every_n_hours' | 'every_n_days';
type RecipientMode = 'roles' | 'users' | 'assignee' | 'role_then_escalate';

interface RuleItem {
  id: string;
  name: string;
  module: string;
  eventType: string;
  scopeType: ScopeType;
  yachtId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  channels: Channel[];
  minSeverity: Severity;
  recipientMode: RecipientMode;
  recipientRoles: string[];
  recipientUserIds: string[];
  escalationRoles: string[];
  dedupeWindowHours: number;
  cadenceMode: CadenceMode;
  cadenceValue?: number | null;
  templateTitle: string;
  templateMessage: string;
  isActive: boolean;
  lastTriggeredAt?: string | null;
  updatedAt: string;
}

interface RecipientOption {
  userId: string;
  fullName: string;
  email: string;
  role: string;
}

interface RuleTestResult {
  rendered: {
    title: string;
    message: string;
  };
  recipients: string[];
  conditionMatch: boolean;
}

const MODULE_OPTIONS = [
  'inventory',
  'maintenance',
  'documents',
  'jobs',
  'hrm',
  'purchase_orders',
  'logbook',
] as const;

const CHANNEL_OPTIONS: Channel[] = ['in_app', 'email', 'push'];
const SCOPE_OPTIONS: ScopeType[] = ['fleet', 'yacht', 'entity'];
const CADENCE_OPTIONS: CadenceMode[] = ['once', 'hourly', 'daily', 'every_n_hours', 'every_n_days'];
const RECIPIENT_MODES: RecipientMode[] = ['roles', 'users', 'assignee', 'role_then_escalate'];
const ROLE_OPTIONS = ['Admin', 'Management/Office', 'Captain', 'Chief Engineer', 'HoD', 'Crew Member', 'SystemAdmin'];
const ALLOWED_ROLES = new Set(['Captain', 'Chief Engineer', 'Management/Office', 'Admin', 'SystemAdmin']);

const DEFAULT_FORM = {
  name: '',
  module: 'maintenance',
  eventType: '',
  scopeType: 'fleet' as ScopeType,
  scopeYachtId: '',
  entityType: '',
  entityId: '',
  channels: ['in_app', 'email'] as Channel[],
  minSeverity: 'warn' as Severity,
  cadenceMode: 'daily' as CadenceMode,
  cadenceValue: '1',
  dedupeWindowHours: '24',
  templateTitle: '',
  templateMessage: '',
  recipientMode: 'roles' as RecipientMode,
  recipientRoles: 'Captain,Chief Engineer',
  recipientUserIds: [] as string[],
  escalationRoles: 'Management/Office',
  active: true,
};

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toFriendlyError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function NotificationRulesPage() {
  const { user } = useAuth();
  const { yachts, loadYachts } = useYacht();
  const canManage = !!user && ALLOWED_ROLES.has(user.role);

  const [rules, setRules] = useState<RuleItem[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [moduleFilter, setModuleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'paused' | ''>('');
  const [yachtFilter, setYachtFilter] = useState('');

  const [form, setForm] = useState(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const [recipientOptions, setRecipientOptions] = useState<RecipientOption[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, RuleTestResult>>({});

  useEffect(() => {
    loadYachts().catch(() => {});
  }, [loadYachts]);

  const loadRules = async () => {
    if (!canManage) return;
    setLoadingRules(true);
    setRulesError(null);
    try {
      const params = new URLSearchParams();
      if (moduleFilter) params.set('module', moduleFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (yachtFilter) params.set('yachtId', yachtFilter);
      const query = params.toString();
      const data = await api.get<RuleItem[]>(`/notifications/rules${query ? `?${query}` : ''}`);
      setRules(Array.isArray(data) ? data : []);
    } catch (error) {
      setRules([]);
      setRulesError(toFriendlyError(error, 'No se pudieron cargar las reglas'));
    } finally {
      setLoadingRules(false);
    }
  };

  const loadRecipients = async (yachtId?: string) => {
    if (!canManage) return;
    setLoadingRecipients(true);
    try {
      const query = yachtId ? `?yachtId=${encodeURIComponent(yachtId)}` : '';
      const data = await api.get<RecipientOption[]>(`/notifications/email/recipients${query}`);
      setRecipientOptions(Array.isArray(data) ? data : []);
    } catch {
      setRecipientOptions([]);
    } finally {
      setLoadingRecipients(false);
    }
  };

  useEffect(() => {
    if (!canManage) return;
    loadRules().catch(() => {});
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    loadRecipients(form.scopeYachtId || undefined).catch(() => {});
  }, [canManage, form.scopeYachtId]);

  const selectedRecipientSummary = useMemo(() => {
    if (form.recipientUserIds.length === 0) return 'Sin usuarios';
    return `${form.recipientUserIds.length} usuario(s) seleccionado(s)`;
  }, [form.recipientUserIds]);

  const createRule = async () => {
    setCreating(true);
    setFormError(null);
    setFormMessage(null);

    if (!form.name.trim() || !form.eventType.trim() || !form.templateTitle.trim() || !form.templateMessage.trim()) {
      setFormError('Complete nombre, tipo de evento y plantilla.');
      setCreating(false);
      return;
    }

    if (form.channels.length === 0) {
      setFormError('Seleccione al menos un canal.');
      setCreating(false);
      return;
    }

    const cadenceValueNumber = Number(form.cadenceValue);
    const cadenceNeedsValue = form.cadenceMode === 'every_n_hours' || form.cadenceMode === 'every_n_days';
    if (cadenceNeedsValue && (!Number.isFinite(cadenceValueNumber) || cadenceValueNumber <= 0)) {
      setFormError('Cadencia invalida: ingrese un valor mayor a 0.');
      setCreating(false);
      return;
    }

    try {
      const payload = {
        name: form.name.trim(),
        module: form.module,
        eventType: form.eventType.trim(),
        scope: {
          type: form.scopeType,
          yachtId: form.scopeType !== 'fleet' ? form.scopeYachtId || undefined : undefined,
          entityType: form.scopeType === 'entity' ? form.entityType.trim() || undefined : undefined,
          entityId: form.scopeType === 'entity' ? form.entityId.trim() || undefined : undefined,
        },
        cadence: {
          mode: form.cadenceMode,
          value: cadenceNeedsValue ? cadenceValueNumber : undefined,
        },
        channels: form.channels,
        minSeverity: form.minSeverity,
        template: {
          title: form.templateTitle.trim(),
          message: form.templateMessage.trim(),
        },
        recipientPolicy: {
          mode: form.recipientMode,
          roles: parseCsv(form.recipientRoles),
          userIds: form.recipientUserIds,
          escalationRoles: parseCsv(form.escalationRoles),
        },
        active: form.active,
        dedupeWindowHours: Number(form.dedupeWindowHours) || 24,
      };

      await api.post('/notifications/rules', payload);
      setFormMessage('Regla creada correctamente.');
      setForm(DEFAULT_FORM);
      loadRules().catch(() => {});
    } catch (error) {
      setFormError(toFriendlyError(error, 'No se pudo crear la regla'));
    } finally {
      setCreating(false);
    }
  };

  const toggleRuleActive = async (rule: RuleItem) => {
    try {
      await api.patch(`/notifications/rules/${rule.id}`, { active: !rule.isActive });
      loadRules().catch(() => {});
    } catch (error) {
      setRulesError(toFriendlyError(error, 'No se pudo actualizar el estado de la regla'));
    }
  };

  const testRule = async (rule: RuleItem) => {
    setTestingRuleId(rule.id);
    setRulesError(null);
    try {
      const samplePayload = {
        severity: rule.minSeverity,
        yachtName: yachts.find((item) => item.id === rule.yachtId)?.name ?? '',
        daysLeft: 7,
        quantity: 2,
        minQuantity: 5,
        title: 'Evento de prueba',
      };

      const result = await api.post<RuleTestResult>(`/notifications/rules/${rule.id}/test`, {
        samplePayload,
        context: {
          yachtId: rule.yachtId ?? undefined,
          entityType: rule.entityType ?? undefined,
          entityId: rule.entityId ?? undefined,
        },
      });
      setTestResults((current) => ({ ...current, [rule.id]: result }));
    } catch (error) {
      setRulesError(toFriendlyError(error, 'No se pudo probar la regla'));
    } finally {
      setTestingRuleId(null);
    }
  };

  if (!canManage) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-text-primary">Reglas personalizadas</h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          No tienes permisos para administrar reglas. Roles permitidos: Captain, Chief Engineer, Management/Office, Admin.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Reglas personalizadas de notificacion</h1>
        <p className="text-sm text-text-secondary">
          Configura que eventos disparan alertas, por que canal se envian y a quien se asignan.
        </p>
      </header>

      {rulesError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {rulesError}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h2 className="text-base font-semibold text-text-primary">Filtros</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            <option value="">Todos los modulos</option>
            {MODULE_OPTIONS.map((module) => (
              <option key={module} value={module}>
                {module}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'active' | 'paused' | '')}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            <option value="">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="paused">Pausadas</option>
          </select>

          <select
            value={yachtFilter}
            onChange={(event) => setYachtFilter(event.target.value)}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            <option value="">Toda la flota</option>
            {yachts.map((yacht) => (
              <option key={yacht.id} value={yacht.id}>
                {yacht.name}
              </option>
            ))}
          </select>

          <button type="button" onClick={() => loadRules().catch(() => {})} className="btn-secondary" disabled={loadingRules}>
            {loadingRules ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">Nueva regla</h2>
        {formError && <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">{formError}</div>}
        {formMessage && <div className="rounded border border-green-300 bg-green-50 p-2 text-xs text-green-700">{formMessage}</div>}

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Nombre de la regla"
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          />
          <input
            value={form.eventType}
            onChange={(event) => setForm((current) => ({ ...current, eventType: event.target.value }))}
            placeholder="Tipo de evento (ej: documents.expiring)"
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          />

          <select
            value={form.module}
            onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            {MODULE_OPTIONS.map((module) => (
              <option key={module} value={module}>
                {module}
              </option>
            ))}
          </select>

          <select
            value={form.scopeType}
            onChange={(event) => setForm((current) => ({ ...current, scopeType: event.target.value as ScopeType }))}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            {SCOPE_OPTIONS.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>

          {form.scopeType !== 'fleet' && (
            <select
              value={form.scopeYachtId}
              onChange={(event) => setForm((current) => ({ ...current, scopeYachtId: event.target.value }))}
              className="rounded border border-border bg-background p-2 text-sm text-text-primary"
            >
              <option value="">Seleccione yate</option>
              {yachts.map((yacht) => (
                <option key={yacht.id} value={yacht.id}>
                  {yacht.name}
                </option>
              ))}
            </select>
          )}

          {form.scopeType === 'entity' && (
            <>
              <input
                value={form.entityType}
                onChange={(event) => setForm((current) => ({ ...current, entityType: event.target.value }))}
                placeholder="Entity type (ej: Document)"
                className="rounded border border-border bg-background p-2 text-sm text-text-primary"
              />
              <input
                value={form.entityId}
                onChange={(event) => setForm((current) => ({ ...current, entityId: event.target.value }))}
                placeholder="Entity ID"
                className="rounded border border-border bg-background p-2 text-sm text-text-primary"
              />
            </>
          )}

          <select
            value={form.minSeverity}
            onChange={(event) => setForm((current) => ({ ...current, minSeverity: event.target.value as Severity }))}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="critical">Critical</option>
          </select>

          <input
            value={form.dedupeWindowHours}
            onChange={(event) => setForm((current) => ({ ...current, dedupeWindowHours: event.target.value }))}
            placeholder="Ventana dedupe en horas"
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={form.cadenceMode}
            onChange={(event) => setForm((current) => ({ ...current, cadenceMode: event.target.value as CadenceMode }))}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            {CADENCE_OPTIONS.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
          <input
            value={form.cadenceValue}
            onChange={(event) => setForm((current) => ({ ...current, cadenceValue: event.target.value }))}
            placeholder="Valor de cadencia (si aplica)"
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.templateTitle}
            onChange={(event) => setForm((current) => ({ ...current, templateTitle: event.target.value }))}
            placeholder="Titulo plantilla (usa {{variable}})"
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          />
          <input
            value={form.templateMessage}
            onChange={(event) => setForm((current) => ({ ...current, templateMessage: event.target.value }))}
            placeholder="Mensaje plantilla (usa {{variable}})"
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          />
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-text-primary">Canales</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {CHANNEL_OPTIONS.map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.channels.includes(channel)}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      channels: current.channels.includes(channel)
                        ? current.channels.filter((item) => item !== channel)
                        : [...current.channels, channel],
                    }))
                  }
                />
                {channel}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-sm font-medium text-text-primary">Politica de destinatarios</p>
          <select
            value={form.recipientMode}
            onChange={(event) => setForm((current) => ({ ...current, recipientMode: event.target.value as RecipientMode }))}
            className="w-full rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            {RECIPIENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
          <input
            value={form.recipientRoles}
            onChange={(event) => setForm((current) => ({ ...current, recipientRoles: event.target.value }))}
            placeholder={`Roles (csv). Sugeridos: ${ROLE_OPTIONS.join(', ')}`}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          />
          <input
            value={form.escalationRoles}
            onChange={(event) => setForm((current) => ({ ...current, escalationRoles: event.target.value }))}
            placeholder="Roles escalamiento (csv)"
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          />
          <div>
            <p className="text-xs text-text-secondary">{loadingRecipients ? 'Cargando usuarios...' : selectedRecipientSummary}</p>
            <select
              multiple
              value={form.recipientUserIds}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  recipientUserIds: Array.from(event.target.selectedOptions).map((item) => item.value),
                }))
              }
              className="mt-2 h-32 w-full rounded border border-border bg-background p-2 text-sm text-text-primary"
            >
              {recipientOptions.map((item) => (
                <option key={item.userId} value={item.userId}>
                  {item.fullName} - {item.role}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            Regla activa
          </label>
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn-primary" disabled={creating} onClick={createRule}>
            {creating ? 'Guardando...' : 'Crear regla'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">Reglas registradas</h2>
        {loadingRules ? (
          <div className="rounded border border-border bg-surface p-3 text-sm text-text-secondary">Cargando reglas...</div>
        ) : rules.length === 0 ? (
          <div className="rounded border border-border bg-surface p-3 text-sm text-text-secondary">No hay reglas para este filtro.</div>
        ) : (
          rules.map((rule) => (
            <article key={rule.id} className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{rule.name}</p>
                  <p className="text-xs text-text-secondary">
                    {rule.module} • {rule.eventType} • {rule.isActive ? 'Activa' : 'Pausada'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" onClick={() => toggleRuleActive(rule)}>
                    {rule.isActive ? 'Pausar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={testingRuleId === rule.id}
                    onClick={() => testRule(rule)}
                  >
                    {testingRuleId === rule.id ? 'Probando...' : 'Probar'}
                  </button>
                </div>
              </div>

              <div className="grid gap-2 text-xs text-text-secondary md:grid-cols-2">
                <p>Canales: {rule.channels.join(', ') || 'N/A'}</p>
                <p>Severidad: {rule.minSeverity}</p>
                <p>Destinatarios (modo): {rule.recipientMode}</p>
                <p>Dedupe: {rule.dedupeWindowHours}h</p>
                <p>Cadencia: {rule.cadenceMode}{rule.cadenceValue ? ` (${rule.cadenceValue})` : ''}</p>
                <p>Ultimo trigger: {rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).toLocaleString() : 'N/A'}</p>
              </div>

              <div className="rounded border border-border bg-background p-3 text-xs text-text-secondary">
                <p className="font-medium text-text-primary">Plantilla:</p>
                <p>Titulo: {rule.templateTitle}</p>
                <p>Mensaje: {rule.templateMessage}</p>
              </div>

              {testResults[rule.id] && (
                <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <p className="font-semibold">Resultado de prueba</p>
                  <p>Condiciones: {testResults[rule.id].conditionMatch ? 'Cumplen' : 'No cumplen'}</p>
                  <p>Titulo render: {testResults[rule.id].rendered.title}</p>
                  <p>Mensaje render: {testResults[rule.id].rendered.message}</p>
                  <p>Receptores: {testResults[rule.id].recipients.length}</p>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
