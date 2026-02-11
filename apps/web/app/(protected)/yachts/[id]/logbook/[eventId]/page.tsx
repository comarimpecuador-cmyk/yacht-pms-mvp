'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  getAuditChangeTypeLabel,
  getAuditFieldLabel,
  getEventCategoryLabel,
  getLocationSourceLabel,
  EVENT_TYPE_LABELS,
  getEventSubTypeLabel,
  LogbookV2Event,
  SEVERITY_ACCENT,
  SEVERITY_LABELS,
  WORKFLOW_ACCENT,
  WORKFLOW_LABELS,
  formatDateTime,
} from '@/lib/logbook-v2';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1 text-sm text-text-primary">{value}</p>
    </div>
  );
}

function resolveAuditUserLabel(event: LogbookV2Event, changedByUserId: string) {
  const roleSuffix = event.responsibility.reportedByRole
    ? ` (${event.responsibility.reportedByRole})`
    : '';

  if (changedByUserId === event.responsibility.reportedByUserId) {
    return `${event.responsibility.reportedByName}${roleSuffix}`;
  }

  if (event.responsibility.approvedByUserId && changedByUserId === event.responsibility.approvedByUserId) {
    return 'Usuario aprobador';
  }

  if (changedByUserId === event.audit.createdByUserId || changedByUserId === event.audit.updatedByUserId) {
    return `${event.responsibility.reportedByName}${roleSuffix}`;
  }

  return 'Usuario del sistema';
}

export default function LogbookEventDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const yachtId = String(params.id || '');
  const encodedEventId = String(params.eventId || '');
  const eventId = decodeURIComponent(encodedEventId);
  const backDate = searchParams.get('date') || '';

  const [event, setEvent] = useState<LogbookV2Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get<LogbookV2Event>(`/logbook/v2/events/${encodeURIComponent(eventId)}`);
        setEvent(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle del evento');
        setEvent(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [eventId]);

  const backHref = useMemo(
    () =>
      backDate
        ? `/yachts/${encodeURIComponent(yachtId)}/logbook?date=${encodeURIComponent(backDate)}`
        : `/yachts/${encodeURIComponent(yachtId)}/logbook`,
    [backDate, yachtId],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-5">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Detalle de evento</h1>
          <p className="text-sm text-text-secondary">Bitacora V2 con evidencia y auditoria completa.</p>
        </div>
        <Link href={backHref} className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover">
          Volver al timeline
        </Link>
      </header>

      {loading ? (
        <section className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-secondary">
          Cargando detalle...
        </section>
      ) : error ? (
        <section className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </section>
      ) : !event ? (
        <section className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-secondary">
          Evento no encontrado.
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-muted">
                  {formatDateTime(event.chronology.occurredAt, event.chronology.timezone)}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-text-primary">{event.details.title}</h2>
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

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Field label="Tipo" value={EVENT_TYPE_LABELS[event.classification.eventType]} />
              <Field label="Subtipo" value={getEventSubTypeLabel(event.classification.eventSubType)} />
              <Field label="Categoria" value={getEventCategoryLabel(event.classification.category)} />
              <Field label="Responsable" value={event.responsibility.reportedByName} />
              <Field label="Estado" value={WORKFLOW_LABELS[event.workflow.status]} />
              <Field label="Secuencia diaria" value={String(event.chronology.sequenceNo)} />
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-lg font-semibold text-text-primary">Ubicacion y referencia</h3>
              <div className="mt-4 grid gap-3 text-sm text-text-secondary">
                <Field label="Yate" value={event.yacht.name} />
                <Field label="Matricula" value={event.yacht.registrationNo} />
                <Field label="Puerto base" value={event.yacht.homePort} />
                <Field
                  label="GPS"
                  value={
                    event.location
                      ? `${event.location.latitude.toFixed(6)}, ${event.location.longitude.toFixed(6)}`
                      : 'No registrado'
                  }
                />
                <Field label="Area" value={event.location?.area || 'No registrada'} />
                <Field
                  label="Fuente de ubicacion"
                  value={event.location?.source ? getLocationSourceLabel(event.location.source) : 'No registrada'}
                />
              </div>
            </article>

            <article className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-lg font-semibold text-text-primary">Evidencias</h3>
              {event.evidence && event.evidence.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {event.evidence.map((evidence) => (
                    <li key={evidence.evidenceId} className="rounded-lg border border-border bg-background p-3">
                      <p className="text-sm font-medium text-text-primary">{evidence.fileName}</p>
                      <p className="text-xs text-text-secondary">{evidence.mimeType}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {formatDateTime(evidence.uploadedAt, event.chronology.timezone)}
                      </p>
                      {evidence.caption && <p className="mt-1 text-sm text-text-secondary">{evidence.caption}</p>}
                      <a
                        href={evidence.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs text-info hover:underline"
                      >
                        Abrir archivo
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-text-secondary">Sin evidencias adjuntas.</p>
              )}
            </article>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-lg font-semibold text-text-primary">Auditoria de cambios</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-muted">
                    <th className="px-2 py-2">Fecha</th>
                    <th className="px-2 py-2">Usuario</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Campos</th>
                    <th className="px-2 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {event.audit.changeHistory.map((change, index) => (
                    <tr key={`${change.changedAt}-${index}`} className="border-b border-border/60">
                      <td className="px-2 py-2 text-text-secondary">
                        {formatDateTime(change.changedAt, event.chronology.timezone)}
                      </td>
                      <td className="px-2 py-2 text-text-primary">
                        {resolveAuditUserLabel(event, change.changedByUserId)}
                      </td>
                      <td className="px-2 py-2 text-text-secondary">{getAuditChangeTypeLabel(change.changeType)}</td>
                      <td className="px-2 py-2 text-text-secondary">
                        {change.changedFields && change.changedFields.length > 0
                          ? change.changedFields.map((field) => getAuditFieldLabel(field)).join(', ')
                          : '-'}
                      </td>
                      <td className="px-2 py-2 text-text-primary">{change.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
