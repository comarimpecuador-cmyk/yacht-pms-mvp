'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  EVENT_TYPE_ACCENT,
  EVENT_TYPE_ICON,
  EVENT_TYPE_LABELS,
  getEventSubTypeLabel,
  LogbookV2Event,
  LogbookV2EventType,
  LogbookV2Severity,
  SEVERITY_ACCENT,
  SEVERITY_LABELS,
  WORKFLOW_ACCENT,
  WORKFLOW_LABELS,
  formatDateTime,
  toInputDate,
} from '@/lib/logbook-v2';
import { useYacht } from '@/lib/yacht-context';

const EVENT_SUBTYPE_OPTIONS: Record<LogbookV2EventType, string[]> = {
  entry: ['port_arrival', 'other'],
  exit: ['port_departure', 'other'],
  service: ['guest_boarding', 'guest_disembark', 'charter_service', 'housekeeping', 'other'],
  maintenance: ['preventive_maintenance', 'corrective_maintenance', 'equipment_failure', 'other'],
  incident: ['safety_incident', 'medical_incident', 'security_incident', 'equipment_failure', 'other'],
  operation: ['bridge_watch', 'engine_watch', 'navigation_note', 'other'],
};

type CreateFormState = {
  eventType: LogbookV2EventType;
  eventSubType: string;
  severity: LogbookV2Severity;
  title: string;
  description: string;
  occurredDate: string;
  occurredTime: string;
  watchPeriod: string;
  registrationNo: string;
  homePort: string;
  yachtType: 'motor_yacht' | 'sailing_yacht' | 'catamaran' | 'support_vessel' | 'other';
  latitude: string;
  longitude: string;
  locationSource: 'gps' | 'manual' | 'port_reference';
  changeReason: string;
  evidenceUrl: string;
  evidenceName: string;
};

type ViewMode = 'day' | 'drafts';

const DEFAULT_FORM = (date: string): CreateFormState => ({
  eventType: 'operation',
  eventSubType: 'navigation_note',
  severity: 'info',
  title: '',
  description: '',
  occurredDate: date,
  occurredTime: '08:00',
  watchPeriod: '0800-1200',
  registrationNo: 'REG-PENDIENTE',
  homePort: 'Puerto base pendiente',
  yachtType: 'motor_yacht',
  latitude: '',
  longitude: '',
  locationSource: 'manual',
  changeReason: 'Registro inicial del evento',
  evidenceUrl: '',
  evidenceName: '',
});

function EventIcon({ eventType }: { eventType: LogbookV2Event['classification']['eventType'] }) {
  const icon = EVENT_TYPE_ICON[eventType];

  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-full border text-[10px] font-semibold uppercase ${EVENT_TYPE_ACCENT[eventType]}`}>
      {icon.slice(0, 3)}
    </div>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1 text-sm text-text-primary hover:bg-surface-hover"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function YachtLogbookTimelinePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const yachtId = String(params.id || '');

  const { currentYacht } = useYacht();
  const { user } = useAuth();

  const [date, setDate] = useState<string>(() => searchParams.get('date') || toInputDate());
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    searchParams.get('view') === 'drafts' ? 'drafts' : 'day',
  );
  const [events, setEvents] = useState<LogbookV2Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateFormState>(() => DEFAULT_FORM(toInputDate()));

  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);

  const role = user?.role || '';
  const canCreate = ['Captain', 'Chief Engineer', 'Admin', 'SystemAdmin'].includes(role);
  const canApproveClose = ['Captain', 'Admin', 'SystemAdmin'].includes(role);

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const aTime = new Date(a.chronology.occurredAt).getTime();
        const bTime = new Date(b.chronology.occurredAt).getTime();
        if (aTime === bTime) return b.chronology.sequenceNo - a.chronology.sequenceNo;
        return bTime - aTime;
      }),
    [events],
  );

  const loadEvents = useCallback(async () => {
    if (!yachtId) return;
    setLoading(true);
    setError(null);

    try {
      const endpoint =
        viewMode === 'drafts'
          ? `/logbook/v2/events?yachtId=${encodeURIComponent(yachtId)}&status=draft`
          : `/logbook/v2/events?yachtId=${encodeURIComponent(yachtId)}&date=${encodeURIComponent(date)}`;
      const data = await api.get<LogbookV2Event[]>(endpoint);
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la bitacora V2');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [date, viewMode, yachtId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const onOpenCreate = () => {
    const base = DEFAULT_FORM(date);
    setForm({
      ...base,
      registrationNo: `REG-${yachtId.slice(0, 8).toUpperCase()}`,
      homePort: 'Puerto base pendiente',
    });
    setCreateError(null);
    setCreateOpen(true);
  };

  const onCreateEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (form.eventType === 'incident' && form.severity === 'critical' && !form.evidenceUrl.trim()) {
      setCreateError('Incidente critico requiere evidencia (URL del archivo).');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const nowIso = new Date().toISOString();
      const occurredAt = new Date(`${form.occurredDate}T${form.occurredTime}:00`).toISOString();
      const hasLatLon = form.latitude.trim() !== '' && form.longitude.trim() !== '';

      const payload: Record<string, unknown> = {
        eventId: crypto.randomUUID(),
        yacht: {
          yachtId,
          name: currentYacht?.name || 'Yacht',
          registrationNo: form.registrationNo.trim(),
          imo: currentYacht?.imoOptional || undefined,
          yachtType: form.yachtType,
          homePort: form.homePort.trim(),
          flag: currentYacht?.flag || undefined,
        },
        chronology: {
          occurredAt,
          loggedAt: nowIso,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          watchPeriod: form.watchPeriod,
          sequenceNo: events.length + 1,
        },
        classification: {
          eventType: form.eventType,
          eventSubType: form.eventSubType,
          category:
            form.eventType === 'maintenance'
              ? 'engineering'
              : form.eventType === 'incident'
                ? 'safety'
                : form.eventType === 'service'
                  ? 'guest_ops'
                  : 'nautical',
          severity: form.severity,
          tags: ['ux_create_v2'],
        },
        workflow: {
          status: 'draft',
          approvalRequired: ['maintenance', 'incident'].includes(form.eventType),
          approvalLevel: ['maintenance', 'incident'].includes(form.eventType) ? 'captain' : 'none',
          statusReason: 'Creado desde UI V2',
        },
        responsibility: {
          reportedByUserId: user.id,
          reportedByName: user.email,
          reportedByRole: user.role,
          assignedToUserId: null,
          approvedByUserId: null,
          acknowledgedByUserIds: [],
        },
        ...(hasLatLon
          ? {
              location: {
                source: form.locationSource,
                latitude: Number(form.latitude),
                longitude: Number(form.longitude),
                area: 'No definida',
                countryCode: 'EC',
                accuracyMeters: 20,
              },
            }
          : {}),
        details: {
          title: form.title.trim(),
          description: form.description.trim(),
        },
        ...(form.evidenceUrl.trim()
          ? {
              evidence: [
                {
                  evidenceId: crypto.randomUUID(),
                  fileUrl: form.evidenceUrl.trim(),
                  fileName: form.evidenceName.trim() || 'evidence-file',
                  mimeType: form.evidenceUrl.toLowerCase().endsWith('.pdf')
                    ? 'application/pdf'
                    : 'image/jpeg',
                  uploadedAt: nowIso,
                  uploadedByUserId: user.id,
                  caption: 'Adjunto inicial',
                },
              ],
            }
          : {}),
        audit: {
          createdAt: nowIso,
          createdByUserId: user.id,
          updatedAt: nowIso,
          updatedByUserId: user.id,
          lastChangeReason: form.changeReason.trim(),
          changeHistory: [
            {
              changedAt: nowIso,
              changedByUserId: user.id,
              changeType: 'create',
              changedFields: ['details', 'classification', 'workflow'],
              reason: form.changeReason.trim(),
            },
          ],
        },
      };

      await api.post('/logbook/v2/events', payload);
      setCreateOpen(false);
      await loadEvents();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'No se pudo crear el evento');
    } finally {
      setCreateLoading(false);
    }
  };

  const onStatusChange = async (
    eventId: string,
    status: 'submitted' | 'approved' | 'closed',
  ) => {
    const promptLabel =
      status === 'submitted'
        ? 'Motivo de envio a revision'
        : status === 'approved'
          ? 'Motivo de aprobacion'
          : 'Motivo de cierre';
    const defaultReason =
      status === 'submitted'
        ? 'Enviado para revision'
        : status === 'approved'
          ? 'Aprobacion operativa'
          : 'Cierre operativo';
    const reason = window.prompt(promptLabel, defaultReason);
    if (!reason || reason.trim().length < 3) return;

    setStatusLoadingId(eventId);
    try {
      await api.patch(`/logbook/v2/events/${encodeURIComponent(eventId)}/status`, {
        status,
        statusReason: reason.trim(),
        reason: reason.trim(),
      });
      await loadEvents();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo actualizar estado');
    } finally {
      setStatusLoadingId(null);
    }
  };

  const onEditEvent = async (eventItem: LogbookV2Event) => {
    const nextTitle = window.prompt('Titulo del evento', eventItem.details.title);
    if (!nextTitle || !nextTitle.trim()) return;

    const nextDescription = window.prompt('Descripcion del evento', eventItem.details.description);
    if (!nextDescription || !nextDescription.trim()) return;

    const reason = window.prompt('Motivo de edicion', 'Actualizacion operativa');
    if (!reason || reason.trim().length < 3) return;

    setStatusLoadingId(eventItem.eventId);
    try {
      await api.patch(`/logbook/v2/events/${encodeURIComponent(eventItem.eventId)}`, {
        title: nextTitle.trim(),
        description: nextDescription.trim(),
        reason: reason.trim(),
      });
      await loadEvents();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo editar el evento');
    } finally {
      setStatusLoadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Bitacora V2</h1>
            <p className="text-sm text-text-secondary">
              Timeline diaria por yate, con severidad, estado y trazabilidad completa.
            </p>
            <p className="mt-1 text-xs text-text-muted">Yate: {currentYacht?.name ?? 'Cargando...'}</p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => setViewMode('day')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  viewMode === 'day'
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
              >
                Dia
              </button>
              <button
                type="button"
                onClick={() => setViewMode('drafts')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  viewMode === 'drafts'
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
              >
                Todos los borradores
              </button>
            </div>
            <label className="text-sm text-text-secondary" htmlFor="logbook-date">
              Fecha
            </label>
            <input
              id="logbook-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={viewMode === 'drafts'}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none ring-gold focus:ring-2"
            />
            {canCreate && (
              <button
                type="button"
                onClick={onOpenCreate}
                className="rounded-lg bg-gold px-3 py-2 text-sm font-medium text-black hover:bg-gold-hover"
              >
                Nuevo evento V2
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-surface p-5">
        {loading ? (
          <div className="py-16 text-center text-sm text-text-secondary">Cargando timeline...</div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
        ) : sortedEvents.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-text-primary">
              {viewMode === 'drafts'
                ? 'No hay borradores pendientes en este yate.'
                : 'No hay eventos para la fecha seleccionada.'}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {viewMode === 'drafts'
                ? 'Esta vista agrupa borradores V2 de cualquier fecha.'
                : 'Si existen registros legacy, se mostraran automaticamente por fallback.'}
            </p>
            {canCreate && (
              <button
                type="button"
                onClick={onOpenCreate}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold-hover"
              >
                Crear primer evento
              </button>
            )}
          </div>
        ) : (
          <div className="relative ml-4 space-y-6 border-l border-border pl-7">
            {sortedEvents.map((event) => (
              <article key={event.eventId} className="relative rounded-xl border border-border bg-background p-4">
                <div className="absolute -left-[52px] top-4">
                  <EventIcon eventType={event.classification.eventType} />
                </div>

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-text-muted">
                      {formatDateTime(event.chronology.occurredAt, event.chronology.timezone)}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-text-primary">{event.details.title}</h2>
                    <p className="mt-1 text-sm text-text-secondary">{event.details.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEVERITY_ACCENT[event.classification.severity]}`}>
                      {SEVERITY_LABELS[event.classification.severity]}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${WORKFLOW_ACCENT[event.workflow.status]}`}>
                      {WORKFLOW_LABELS[event.workflow.status]}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-text-secondary md:grid-cols-2">
                  <div>
                    <span className="text-text-muted">Tipo:</span>{' '}
                    <span className="text-text-primary">{EVENT_TYPE_LABELS[event.classification.eventType]}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Subtipo:</span>{' '}
                    <span className="text-text-primary">
                      {getEventSubTypeLabel(event.classification.eventSubType)}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted">Responsable:</span>{' '}
                    <span className="text-text-primary">{event.responsibility.reportedByName}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Ubicacion:</span>{' '}
                    <span className="text-text-primary">
                      {event.location
                        ? `${event.location.latitude.toFixed(4)}, ${event.location.longitude.toFixed(4)}`
                        : 'No registrada'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-text-muted">
                    #{event.chronology.sequenceNo} {event.legacyRefs?.legacyEntryId ? 'Legacy mirror' : 'V2 nativo'}
                  </p>
                  <div className="flex items-center gap-2">
                    {canCreate && ['draft', 'submitted', 'rejected'].includes(event.workflow.status) && (
                      <button
                        type="button"
                        disabled={statusLoadingId === event.eventId}
                        onClick={() => onEditEvent(event)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50"
                      >
                        Editar
                      </button>
                    )}
                    {canCreate && (event.workflow.status === 'draft' || event.workflow.status === 'rejected') && (
                      <button
                        type="button"
                        disabled={statusLoadingId === event.eventId}
                        onClick={() => onStatusChange(event.eventId, 'submitted')}
                        className="rounded-lg border border-blue-400/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-500/20 disabled:opacity-50"
                      >
                        Enviar a revision
                      </button>
                    )}
                    {canApproveClose && event.workflow.status !== 'approved' && event.workflow.status !== 'closed' && (
                      <button
                        type="button"
                        disabled={statusLoadingId === event.eventId}
                        onClick={() => onStatusChange(event.eventId, 'approved')}
                        className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        Aprobar
                      </button>
                    )}
                    {canApproveClose && event.workflow.status !== 'closed' && (
                      <button
                        type="button"
                        disabled={statusLoadingId === event.eventId}
                        onClick={() => onStatusChange(event.eventId, 'closed')}
                        className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                      >
                        Cerrar
                      </button>
                    )}
                    <Link
                      href={`/yachts/${encodeURIComponent(yachtId)}/logbook/${encodeURIComponent(event.eventId)}?date=${encodeURIComponent(date)}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
                    >
                      Ver detalle
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Modal open={createOpen} title="Nuevo evento V2" onClose={() => setCreateOpen(false)}>
        <form onSubmit={onCreateEvent} className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              {createError}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm text-text-secondary">
              Tipo
              <select
                value={form.eventType}
                onChange={(event) => {
                  const nextType = event.target.value as LogbookV2EventType;
                  setForm((prev) => ({
                    ...prev,
                    eventType: nextType,
                    eventSubType: EVENT_SUBTYPE_OPTIONS[nextType][0],
                  }));
                }}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-text-secondary">
              Subtipo
              <select
                value={form.eventSubType}
                onChange={(event) => setForm((prev) => ({ ...prev, eventSubType: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              >
                {EVENT_SUBTYPE_OPTIONS[form.eventType].map((subtype) => (
                  <option key={subtype} value={subtype}>
                    {getEventSubTypeLabel(subtype)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-text-secondary">
              Severidad
              <select
                value={form.severity}
                onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value as LogbookV2Severity }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              >
                <option value="info">Informativa</option>
                <option value="warn">Advertencia</option>
                <option value="critical">Critica</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-text-secondary">
              Fecha
              <input
                type="date"
                required
                value={form.occurredDate}
                onChange={(event) => setForm((prev) => ({ ...prev, occurredDate: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <label className="text-sm text-text-secondary">
              Hora
              <input
                type="time"
                required
                value={form.occurredTime}
                onChange={(event) => setForm((prev) => ({ ...prev, occurredTime: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
          </div>

          <label className="text-sm text-text-secondary">
            Titulo
            <input
              type="text"
              required
              minLength={4}
              maxLength={160}
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Descripcion
            <textarea
              required
              minLength={8}
              maxLength={4000}
              rows={4}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm text-text-secondary">
              Matricula
              <input
                required
                value={form.registrationNo}
                onChange={(event) => setForm((prev) => ({ ...prev, registrationNo: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <label className="text-sm text-text-secondary">
              Puerto base
              <input
                required
                value={form.homePort}
                onChange={(event) => setForm((prev) => ({ ...prev, homePort: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <label className="text-sm text-text-secondary">
              Tipo de yate
              <select
                value={form.yachtType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    yachtType: event.target.value as CreateFormState['yachtType'],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              >
                <option value="motor_yacht">Motor Yacht</option>
                <option value="sailing_yacht">Sailing Yacht</option>
                <option value="catamaran">Catamaran</option>
                <option value="support_vessel">Support Vessel</option>
                <option value="other">Otro</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm text-text-secondary">
              Latitud (opcional)
              <input
                type="number"
                step="0.000001"
                value={form.latitude}
                onChange={(event) => setForm((prev) => ({ ...prev, latitude: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <label className="text-sm text-text-secondary">
              Longitud (opcional)
              <input
                type="number"
                step="0.000001"
                value={form.longitude}
                onChange={(event) => setForm((prev) => ({ ...prev, longitude: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <label className="text-sm text-text-secondary">
              Fuente ubicacion
              <select
                value={form.locationSource}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    locationSource: event.target.value as CreateFormState['locationSource'],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              >
                <option value="manual">Manual</option>
                <option value="gps">GPS</option>
                <option value="port_reference">Puerto</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-text-secondary">
              Evidencia URL (requerida para incidente critico)
              <input
                value={form.evidenceUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, evidenceUrl: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <label className="text-sm text-text-secondary">
              Nombre de evidencia
              <input
                value={form.evidenceName}
                onChange={(event) => setForm((prev) => ({ ...prev, evidenceName: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
          </div>

          <label className="text-sm text-text-secondary">
            Motivo de registro (auditoria)
            <input
              required
              minLength={3}
              maxLength={400}
              value={form.changeReason}
              onChange={(event) => setForm((prev) => ({ ...prev, changeReason: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createLoading}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold-hover disabled:opacity-50"
            >
              {createLoading ? 'Guardando...' : 'Crear evento'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
