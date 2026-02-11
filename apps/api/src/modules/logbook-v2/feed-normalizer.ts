import { LogBookStatus, LogbookEventV2Status, LogbookEventV2Type, Prisma } from '@prisma/client';

type LogbookV2EventLike = {
  id: string;
  yachtId: string;
  eventType: LogbookEventV2Type;
  title: string;
  description: string;
  severity: 'info' | 'warn' | 'critical';
  workflowStatus: LogbookEventV2Status;
  occurredAt: Date;
  createdAt: Date;
  reportedByName: string;
  reportedByRole: string | null;
  rawJson: Prisma.JsonValue;
};

type LegacyEntryLike = {
  id: string;
  watchPeriod: string;
  status: LogBookStatus;
  entryDate: Date;
  createdAt: Date;
};

export type NormalizedLogbookFeedItem = {
  id: string;
  type: 'logbook';
  subtype: string;
  title: string;
  description: string;
  occurredAt: string;
  createdAt: string;
  actorName?: string;
  actorRole?: string;
  actor?: string;
  yachtId: string;
  severity: 'info' | 'warn' | 'critical';
  status: LogbookEventV2Status;
  statusLabel: string;
  source: 'logbook_v2' | 'legacy';
  link: string;
  when: string;
  module: 'logbook';
  dedupeKey: string;
  timestamp: string;
};

export function truncateSafe(text: string | null | undefined, maxLength = 140): string {
  const normalized = (text || '').trim();
  if (!normalized) return 'Sin descripcion';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

export function mapLegacyStatusToWorkflowStatus(status: LogBookStatus): LogbookEventV2Status {
  if (status === LogBookStatus.Draft) return 'draft';
  if (status === LogBookStatus.Submitted) return 'submitted';
  if (status === LogBookStatus.Locked) return 'closed';
  if (status === LogBookStatus.Corrected) return 'submitted';
  return 'submitted';
}

export function workflowStatusLabelEs(status: LogbookEventV2Status): string {
  if (status === 'draft') return 'Borrador';
  if (status === 'submitted') return 'Pendiente de revision';
  if (status === 'approved') return 'Aprobado';
  if (status === 'closed') return 'Cerrado';
  if (status === 'rejected') return 'Rechazado';
  if (status === 'cancelled') return 'Cancelado';
  return status;
}

function logbookTypePrefix(type: LogbookEventV2Type): string {
  if (type === 'incident') return 'Incidente';
  if (type === 'maintenance') return 'Mantenimiento';
  if (type === 'entry') return 'Arribo';
  if (type === 'exit') return 'Zarpe';
  if (type === 'service') return 'Servicio';
  return 'Operacion';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function pickAuditCreatedAt(rawJson: Prisma.JsonValue, fallback: Date): string {
  const root = asRecord(rawJson);
  const audit = asRecord(root.audit);
  const createdAt = audit.createdAt;
  if (typeof createdAt !== 'string') {
    return fallback.toISOString();
  }

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return fallback.toISOString();
  }
  return parsed.toISOString();
}

export function normalizeLogbookV2FeedItem(event: LogbookV2EventLike): NormalizedLogbookFeedItem {
  const prefix = logbookTypePrefix(event.eventType);
  const titleBase = event.title.trim() || 'Evento sin titulo';
  const title = titleBase.toLowerCase().startsWith(prefix.toLowerCase())
    ? titleBase
    : `${prefix}: ${titleBase}`;

  const statusLabel = workflowStatusLabelEs(event.workflowStatus);
  const detail = truncateSafe(event.description);
  const description = `[${statusLabel}] ${detail}`;
  const createdAt = pickAuditCreatedAt(event.rawJson, event.createdAt);

  return {
    id: `logbook:${event.id}`,
    type: 'logbook',
    subtype: event.eventType,
    title,
    description,
    occurredAt: event.occurredAt.toISOString(),
    createdAt,
    actorName: event.reportedByName,
    actorRole: event.reportedByRole || undefined,
    actor: event.reportedByRole
      ? `${event.reportedByName} (${event.reportedByRole})`
      : event.reportedByName,
    yachtId: event.yachtId,
    severity: event.severity,
    status: event.workflowStatus,
    statusLabel,
    source: 'logbook_v2',
    link: `/yachts/${event.yachtId}/logbook/${event.id}`,
    when: event.occurredAt.toISOString(),
    module: 'logbook',
    dedupeKey: `logbook-v2-${event.id}`,
    timestamp: event.occurredAt.toISOString(),
  };
}

export function normalizeLegacyLogbookFeedItem(
  entry: LegacyEntryLike,
  yachtId: string,
): NormalizedLogbookFeedItem {
  const status = mapLegacyStatusToWorkflowStatus(entry.status);
  const statusLabel = workflowStatusLabelEs(status);

  return {
    id: `logbook:legacy:${entry.id}`,
    type: 'logbook',
    subtype: 'legacy_watch',
    title: 'Bitacora legacy',
    description: `[${statusLabel}] Guardia ${entry.watchPeriod}`,
    occurredAt: entry.entryDate.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    actorName: 'Sistema legacy',
    actorRole: 'Legacy',
    actor: 'Sistema legacy',
    yachtId,
    severity: status === 'submitted' ? 'warn' : 'info',
    status,
    statusLabel,
    source: 'legacy',
    link: `/yachts/${yachtId}/logbook`,
    when: entry.entryDate.toISOString(),
    module: 'logbook',
    dedupeKey: `logbook-legacy-${entry.id}`,
    timestamp: entry.entryDate.toISOString(),
  };
}

