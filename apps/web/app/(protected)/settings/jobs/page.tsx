'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useYacht } from '@/lib/yacht-context';

type JobStatus = 'active' | 'paused' | 'archived';
type JobScheduleType = 'interval_hours' | 'interval_days' | 'cron';
type JobAssignmentMode = 'roles' | 'users' | 'entity_owner' | 'yacht_captain';
type JobChannel = 'in_app' | 'email' | 'push';

interface RecipientOption {
  userId: string;
  fullName: string;
  email: string;
  role: string;
}

interface JobReminder {
  offsetHours: number;
  channels: JobChannel[];
}

interface JobItem {
  id: string;
  title: string;
  module: string;
  yachtId?: string | null;
  status: JobStatus;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  instructionsTemplate: string;
  schedule: {
    type: JobScheduleType;
    expression?: string | null;
    everyHours?: number | null;
    everyDays?: number | null;
    timezone?: string | null;
  };
  assignmentPolicy: {
    mode: JobAssignmentMode;
    roles: string[];
    userIds: string[];
  };
  reminders: JobReminder[];
  updatedAt: string;
}

interface JobRunItem {
  id: string;
  status: string;
  scheduledAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  summaryJson?: unknown;
}

interface JobListResponse {
  items: JobItem[];
  total: number;
}

interface JobRunsResponse {
  items: JobRunItem[];
  total: number;
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

const CHANNEL_OPTIONS: JobChannel[] = ['in_app', 'email', 'push'];
const ASSIGNMENT_OPTIONS: JobAssignmentMode[] = ['roles', 'users', 'entity_owner', 'yacht_captain'];
const ROLE_OPTIONS = ['Admin', 'Management/Office', 'Captain', 'Chief Engineer', 'HoD', 'Crew Member', 'SystemAdmin'];
const ALLOWED_ROLES = new Set(['Captain', 'Chief Engineer', 'Management/Office', 'Admin', 'SystemAdmin']);

const DEFAULT_FORM = {
  title: '',
  module: 'maintenance',
  yachtId: '',
  instructionsTemplate: 'Ejecutar {{title}} en {{scheduledAt}}. Verificar checklist y registrar evidencia.',
  scheduleType: 'interval_days' as JobScheduleType,
  scheduleEveryHours: '24',
  scheduleEveryDays: '7',
  scheduleCron: '0 8 * * *',
  scheduleTimezone: 'UTC',
  assignmentMode: 'roles' as JobAssignmentMode,
  assignmentRoles: 'Captain,Chief Engineer',
  assignmentUserIds: [] as string[],
  reminderOffsets: '168,72,24',
  reminderChannels: ['in_app', 'email'] as JobChannel[],
  status: 'active' as JobStatus,
};

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveIntegersCsv(value: string) {
  return parseCsv(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function toFriendlyError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function JobsSettingsPage() {
  const { user } = useAuth();
  const { yachts, loadYachts } = useYacht();
  const canManage = !!user && ALLOWED_ROLES.has(user.role);

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('');
  const [yachtFilter, setYachtFilter] = useState('');

  const [form, setForm] = useState(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const [recipientOptions, setRecipientOptions] = useState<RecipientOption[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [runsByJobId, setRunsByJobId] = useState<Record<string, JobRunItem[]>>({});
  const [loadingRunsByJobId, setLoadingRunsByJobId] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadYachts().catch(() => {});
  }, [loadYachts]);

  const loadJobs = async () => {
    if (!canManage) return;
    setLoadingJobs(true);
    setJobsError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (yachtFilter) params.set('yachtId', yachtFilter);
      const query = params.toString();
      const data = await api.get<JobListResponse>(`/jobs${query ? `?${query}` : ''}`);
      setJobs(Array.isArray(data?.items) ? data.items : []);
      setJobsTotal(Number(data?.total ?? 0));
    } catch (error) {
      setJobs([]);
      setJobsTotal(0);
      setJobsError(toFriendlyError(error, 'No se pudieron cargar los trabajos'));
    } finally {
      setLoadingJobs(false);
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
    loadJobs().catch(() => {});
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    loadRecipients(form.yachtId || undefined).catch(() => {});
  }, [canManage, form.yachtId]);

  const selectedUsersLabel = useMemo(() => {
    if (form.assignmentUserIds.length === 0) return 'Sin usuarios seleccionados';
    return `${form.assignmentUserIds.length} usuario(s) seleccionado(s)`;
  }, [form.assignmentUserIds]);

  const createJob = async () => {
    setCreating(true);
    setFormError(null);
    setFormMessage(null);

    if (!form.title.trim() || !form.instructionsTemplate.trim()) {
      setFormError('Complete titulo e instrucciones.');
      setCreating(false);
      return;
    }

    const reminderOffsets = parsePositiveIntegersCsv(form.reminderOffsets);
    const reminderChannels = form.reminderChannels;

    const reminders = reminderOffsets.map((offsetHours) => ({
      offsetHours,
      channels: reminderChannels,
    }));

    let schedule: Record<string, unknown>;
    if (form.scheduleType === 'interval_hours') {
      const hours = Number(form.scheduleEveryHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        setFormError('everyHours debe ser mayor a 0.');
        setCreating(false);
        return;
      }
      schedule = {
        type: 'interval_hours',
        everyHours: hours,
        timezone: form.scheduleTimezone || 'UTC',
      };
    } else if (form.scheduleType === 'interval_days') {
      const days = Number(form.scheduleEveryDays);
      if (!Number.isFinite(days) || days <= 0) {
        setFormError('everyDays debe ser mayor a 0.');
        setCreating(false);
        return;
      }
      schedule = {
        type: 'interval_days',
        everyDays: days,
        timezone: form.scheduleTimezone || 'UTC',
      };
    } else {
      if (!form.scheduleCron.trim()) {
        setFormError('Cron expression es obligatoria para tipo cron.');
        setCreating(false);
        return;
      }
      schedule = {
        type: 'cron',
        expression: form.scheduleCron.trim(),
        timezone: form.scheduleTimezone || 'UTC',
      };
    }

    try {
      await api.post('/jobs', {
        title: form.title.trim(),
        module: form.module,
        yachtId: form.yachtId || undefined,
        instructionsTemplate: form.instructionsTemplate.trim(),
        schedule,
        assignmentPolicy: {
          mode: form.assignmentMode,
          roles: parseCsv(form.assignmentRoles),
          userIds: form.assignmentUserIds,
        },
        reminders: reminders.length > 0 ? reminders : undefined,
        status: form.status,
      });

      setFormMessage('Trabajo programado creado correctamente.');
      setForm(DEFAULT_FORM);
      loadJobs().catch(() => {});
    } catch (error) {
      setFormError(toFriendlyError(error, 'No se pudo crear el trabajo'));
    } finally {
      setCreating(false);
    }
  };

  const runNow = async (jobId: string) => {
    setRunningJobId(jobId);
    setJobsError(null);
    try {
      await api.post(`/jobs/${jobId}/run-now`, { payload: {} });
      await loadJobs();
      await loadRuns(jobId);
    } catch (error) {
      setJobsError(toFriendlyError(error, 'No se pudo ejecutar el trabajo'));
    } finally {
      setRunningJobId(null);
    }
  };

  const toggleStatus = async (job: JobItem) => {
    const nextStatus: JobStatus = job.status === 'active' ? 'paused' : 'active';
    try {
      await api.patch(`/jobs/${job.id}`, { status: nextStatus });
      loadJobs().catch(() => {});
    } catch (error) {
      setJobsError(toFriendlyError(error, 'No se pudo actualizar el estado'));
    }
  };

  const loadRuns = async (jobId: string) => {
    setLoadingRunsByJobId((current) => ({ ...current, [jobId]: true }));
    try {
      const response = await api.get<JobRunsResponse>(`/jobs/${jobId}/runs?limit=10`);
      setRunsByJobId((current) => ({ ...current, [jobId]: Array.isArray(response?.items) ? response.items : [] }));
    } catch (error) {
      setJobsError(toFriendlyError(error, 'No se pudo cargar historial de ejecuciones'));
      setRunsByJobId((current) => ({ ...current, [jobId]: [] }));
    } finally {
      setLoadingRunsByJobId((current) => ({ ...current, [jobId]: false }));
    }
  };

  if (!canManage) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-text-primary">Trabajos programados</h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          No tienes permisos para administrar trabajos. Roles permitidos: Captain, Chief Engineer, Management/Office, Admin.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Trabajos programados (Jobs)</h1>
        <p className="text-sm text-text-secondary">
          Define tareas recurrentes y recordatorios preventivos (ej. 7, 3 y 1 dia antes) con asignacion automatica.
        </p>
      </header>

      {jobsError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {jobsError}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h2 className="text-base font-semibold text-text-primary">Filtros</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as JobStatus | '')}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="paused">Pausados</option>
            <option value="archived">Archivados</option>
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
          <button type="button" className="btn-secondary" onClick={() => loadJobs().catch(() => {})} disabled={loadingJobs}>
            {loadingJobs ? 'Actualizando...' : `Actualizar (${jobsTotal})`}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <h2 className="text-base font-semibold text-text-primary">Nuevo trabajo</h2>
        {formError && <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">{formError}</div>}
        {formMessage && <div className="rounded border border-green-300 bg-green-50 p-2 text-xs text-green-700">{formMessage}</div>}

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Titulo del job"
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
            value={form.yachtId}
            onChange={(event) => setForm((current) => ({ ...current, yachtId: event.target.value }))}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            <option value="">Sin yate especifico</option>
            {yachts.map((yacht) => (
              <option key={yacht.id} value={yacht.id}>
                {yacht.name}
              </option>
            ))}
          </select>
          <select
            value={form.status}
            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as JobStatus }))}
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          >
            <option value="active">Activo</option>
            <option value="paused">Pausado</option>
            <option value="archived">Archivado</option>
          </select>
        </div>

        <textarea
          value={form.instructionsTemplate}
          onChange={(event) => setForm((current) => ({ ...current, instructionsTemplate: event.target.value }))}
          placeholder="Instrucciones para el equipo"
          className="min-h-24 w-full rounded border border-border bg-background p-2 text-sm text-text-primary"
        />

        <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-sm font-medium text-text-primary">Programacion</p>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={form.scheduleType}
              onChange={(event) => setForm((current) => ({ ...current, scheduleType: event.target.value as JobScheduleType }))}
              className="rounded border border-border bg-background p-2 text-sm text-text-primary"
            >
              <option value="interval_hours">Cada N horas</option>
              <option value="interval_days">Cada N dias</option>
              <option value="cron">Cron</option>
            </select>
            <input
              value={form.scheduleTimezone}
              onChange={(event) => setForm((current) => ({ ...current, scheduleTimezone: event.target.value }))}
              placeholder="Timezone (UTC)"
              className="rounded border border-border bg-background p-2 text-sm text-text-primary"
            />
            {form.scheduleType === 'interval_hours' && (
              <input
                value={form.scheduleEveryHours}
                onChange={(event) => setForm((current) => ({ ...current, scheduleEveryHours: event.target.value }))}
                placeholder="Cada N horas"
                className="rounded border border-border bg-background p-2 text-sm text-text-primary"
              />
            )}
            {form.scheduleType === 'interval_days' && (
              <input
                value={form.scheduleEveryDays}
                onChange={(event) => setForm((current) => ({ ...current, scheduleEveryDays: event.target.value }))}
                placeholder="Cada N dias"
                className="rounded border border-border bg-background p-2 text-sm text-text-primary"
              />
            )}
            {form.scheduleType === 'cron' && (
              <input
                value={form.scheduleCron}
                onChange={(event) => setForm((current) => ({ ...current, scheduleCron: event.target.value }))}
                placeholder="Cron (m h * * * o m h * * d)"
                className="rounded border border-border bg-background p-2 text-sm text-text-primary"
              />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-sm font-medium text-text-primary">Asignacion</p>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={form.assignmentMode}
              onChange={(event) => setForm((current) => ({ ...current, assignmentMode: event.target.value as JobAssignmentMode }))}
              className="rounded border border-border bg-background p-2 text-sm text-text-primary"
            >
              {ASSIGNMENT_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <input
              value={form.assignmentRoles}
              onChange={(event) => setForm((current) => ({ ...current, assignmentRoles: event.target.value }))}
              placeholder={`Roles (csv). Sugeridos: ${ROLE_OPTIONS.join(', ')}`}
              className="rounded border border-border bg-background p-2 text-sm text-text-primary"
            />
          </div>

          <div>
            <p className="text-xs text-text-secondary">{loadingRecipients ? 'Cargando usuarios...' : selectedUsersLabel}</p>
            <select
              multiple
              value={form.assignmentUserIds}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  assignmentUserIds: Array.from(event.target.selectedOptions).map((item) => item.value),
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
        </div>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-sm font-medium text-text-primary">Recordatorios preventivos</p>
          <input
            value={form.reminderOffsets}
            onChange={(event) => setForm((current) => ({ ...current, reminderOffsets: event.target.value }))}
            placeholder="Horas antes (csv). Ej: 168,72,24"
            className="rounded border border-border bg-background p-2 text-sm text-text-primary"
          />
          <div className="flex flex-wrap gap-3">
            {CHANNEL_OPTIONS.map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.reminderChannels.includes(channel)}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      reminderChannels: current.reminderChannels.includes(channel)
                        ? current.reminderChannels.filter((item) => item !== channel)
                        : [...current.reminderChannels, channel],
                    }))
                  }
                />
                {channel}
              </label>
            ))}
          </div>
          <p className="text-xs text-text-secondary">
            Ejemplo: 168,72,24 = 7 dias, 3 dias y 1 dia antes del vencimiento.
          </p>
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn-primary" disabled={creating} onClick={createJob}>
            {creating ? 'Guardando...' : 'Crear job'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">Jobs registrados</h2>
        {loadingJobs ? (
          <div className="rounded border border-border bg-surface p-3 text-sm text-text-secondary">Cargando jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="rounded border border-border bg-surface p-3 text-sm text-text-secondary">No hay jobs para este filtro.</div>
        ) : (
          jobs.map((job) => (
            <article key={job.id} className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{job.title}</p>
                  <p className="text-xs text-text-secondary">
                    {job.module} • {job.status} • prox: {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => toggleStatus(job)}
                  >
                    {job.status === 'active' ? 'Pausar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={runningJobId === job.id}
                    onClick={() => runNow(job.id)}
                  >
                    {runningJobId === job.id ? 'Ejecutando...' : 'Ejecutar ahora'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={loadingRunsByJobId[job.id]}
                    onClick={() => loadRuns(job.id)}
                  >
                    {loadingRunsByJobId[job.id] ? 'Cargando...' : 'Ver ejecuciones'}
                  </button>
                </div>
              </div>

              <div className="grid gap-2 text-xs text-text-secondary md:grid-cols-2">
                <p>Schedule: {job.schedule.type}</p>
                <p>Timezone: {job.schedule.timezone || 'UTC'}</p>
                <p>Asignacion: {job.assignmentPolicy.mode}</p>
                <p>Reminders: {job.reminders.map((item) => `${item.offsetHours}h`).join(', ') || 'Sin recordatorios'}</p>
              </div>

              {runsByJobId[job.id] && runsByJobId[job.id].length > 0 && (
                <div className="rounded border border-border bg-background p-3 text-xs text-text-secondary">
                  <p className="mb-2 font-medium text-text-primary">Ultimas ejecuciones</p>
                  <div className="space-y-1">
                    {runsByJobId[job.id].map((run) => (
                      <p key={run.id}>
                        {new Date(run.scheduledAt).toLocaleString()} • {run.status}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
