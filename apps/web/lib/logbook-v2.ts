export type LogbookV2EventType =
  | 'entry'
  | 'exit'
  | 'service'
  | 'maintenance'
  | 'incident'
  | 'operation';

export type LogbookV2Severity = 'info' | 'warn' | 'critical';
export type LogbookV2WorkflowStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'closed'
  | 'cancelled';

export interface LogbookV2Event {
  eventId: string;
  legacyRefs?: {
    legacyEntryId?: string;
    legacyObservationId?: string;
    legacySource?: 'json' | 'csv' | 'database' | 'manual';
  };
  yacht: {
    yachtId: string;
    name: string;
    registrationNo: string;
    imo?: string;
    mmsi?: string;
    callsign?: string;
    yachtType: 'motor_yacht' | 'sailing_yacht' | 'catamaran' | 'support_vessel' | 'other';
    homePort: string;
    flag?: string;
  };
  chronology: {
    occurredAt: string;
    loggedAt: string;
    timezone: string;
    watchPeriod?: string;
    sequenceNo: number;
  };
  classification: {
    eventType: LogbookV2EventType;
    eventSubType: string;
    category: string;
    severity: LogbookV2Severity;
    tags?: string[];
  };
  workflow: {
    status: LogbookV2WorkflowStatus;
    approvalRequired: boolean;
    approvalLevel?: string;
    statusReason?: string;
  };
  responsibility: {
    reportedByUserId: string;
    reportedByName: string;
    reportedByRole?: string;
    assignedToUserId?: string | null;
    approvedByUserId?: string | null;
    acknowledgedByUserIds?: string[];
  };
  location?: {
    source: 'gps' | 'manual' | 'port_reference';
    latitude: number;
    longitude: number;
    portName?: string;
    area?: string;
    countryCode?: string;
    accuracyMeters?: number;
  };
  details: {
    title: string;
    description: string;
    engineReadings?: Array<{
      engineId: string;
      engineName: string;
      hours: number;
      rpm?: number;
      temperatureC?: number;
    }>;
    maintenanceRef?: Record<string, unknown>;
    incidentRef?: Record<string, unknown>;
    serviceRef?: Record<string, unknown>;
  };
  evidence?: Array<{
    evidenceId: string;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    checksumSha256?: string;
    uploadedAt: string;
    uploadedByUserId: string;
    caption?: string;
  }>;
  audit: {
    createdAt: string;
    createdByUserId: string;
    updatedAt: string;
    updatedByUserId: string;
    lastChangeReason?: string;
    changeHistory: Array<{
      changedAt: string;
      changedByUserId: string;
      changeType: string;
      changedFields?: string[];
      reason: string;
    }>;
  };
}

export const EVENT_TYPE_LABELS: Record<LogbookV2EventType, string> = {
  entry: 'Entrada',
  exit: 'Salida',
  service: 'Servicio',
  maintenance: 'Mantenimiento',
  incident: 'Incidente',
  operation: 'Operacion',
};

export const EVENT_SUBTYPE_LABELS: Record<string, string> = {
  port_arrival: 'Arribo a puerto',
  port_departure: 'Salida de puerto',
  guest_boarding: 'Embarque de huespedes',
  guest_disembark: 'Desembarque de huespedes',
  charter_service: 'Servicio charter',
  housekeeping: 'Servicio interno',
  preventive_maintenance: 'Mantenimiento preventivo',
  corrective_maintenance: 'Mantenimiento correctivo',
  equipment_failure: 'Falla de equipo',
  safety_incident: 'Incidente de seguridad',
  medical_incident: 'Incidente medico',
  security_incident: 'Incidente de proteccion',
  bridge_watch: 'Guardia de puente',
  engine_watch: 'Guardia de maquinas',
  navigation_note: 'Nota de navegacion',
  other: 'Otro',
};

export const EVENT_CATEGORY_LABELS: Record<string, string> = {
  nautical: 'Nautica',
  engineering: 'Ingenieria',
  guest_ops: 'Operacion de huespedes',
  safety: 'Seguridad',
  security: 'Proteccion',
  admin: 'Administracion',
};

export const EVENT_TYPE_ICON: Record<LogbookV2EventType, string> = {
  entry: 'Atraque',
  exit: 'Zarpe',
  service: 'Servicio',
  maintenance: 'Taller',
  incident: 'Riesgo',
  operation: 'Bitacora',
};

export const EVENT_TYPE_ACCENT: Record<LogbookV2EventType, string> = {
  entry: 'border-sky-400 bg-sky-500/10 text-sky-400',
  exit: 'border-indigo-400 bg-indigo-500/10 text-indigo-400',
  service: 'border-teal-400 bg-teal-500/10 text-teal-400',
  maintenance: 'border-amber-400 bg-amber-500/10 text-amber-400',
  incident: 'border-red-400 bg-red-500/10 text-red-400',
  operation: 'border-violet-400 bg-violet-500/10 text-violet-400',
};

export const SEVERITY_LABELS: Record<LogbookV2Severity, string> = {
  info: 'Informativa',
  warn: 'Advertencia',
  critical: 'Critica',
};

export const SEVERITY_ACCENT: Record<LogbookV2Severity, string> = {
  info: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
  warn: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
  critical: 'bg-red-500/15 text-red-200 border border-red-500/30',
};

export const WORKFLOW_LABELS: Record<LogbookV2WorkflowStatus, string> = {
  draft: 'Borrador',
  submitted: 'Enviado',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

export const WORKFLOW_ACCENT: Record<LogbookV2WorkflowStatus, string> = {
  draft: 'bg-slate-500/15 text-slate-200 border border-slate-500/30',
  submitted: 'bg-blue-500/15 text-blue-200 border border-blue-500/30',
  approved: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
  rejected: 'bg-orange-500/15 text-orange-200 border border-orange-500/30',
  closed: 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30',
  cancelled: 'bg-zinc-500/15 text-zinc-200 border border-zinc-500/30',
};

export const LOCATION_SOURCE_LABELS: Record<string, string> = {
  gps: 'GPS',
  manual: 'Manual',
  port_reference: 'Referencia de puerto',
};

export const AUDIT_CHANGE_TYPE_LABELS: Record<string, string> = {
  create: 'Creacion',
  update: 'Actualizacion',
  status_change: 'Cambio de estado',
  approval: 'Aprobacion',
  delete: 'Eliminacion',
};

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  details: 'Detalles',
  classification: 'Clasificacion',
  workflow: 'Flujo',
  location: 'Ubicacion',
  responsibility: 'Responsabilidad',
  chronology: 'Cronologia',
  evidence: 'Evidencia',
  engineReadings: 'Lecturas de motor',
  workflowStatus: 'Estado del flujo',
  statusReason: 'Motivo de estado',
  lockedAt: 'Fecha de bloqueo',
  lockedByUserId: 'Bloqueado por',
  'workflow.status': 'Estado del flujo',
  'workflow.statusReason': 'Motivo de estado',
};

function humanizeToken(token: string) {
  return token
    .replaceAll('.', ' ')
    .replaceAll('_', ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
}

function toSentence(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function formatDateTime(value: string, timezone = 'UTC') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha invalida';

  return new Intl.DateTimeFormat('es-EC', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date);
}

export function toInputDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getEventSubTypeLabel(subType: string): string {
  return EVENT_SUBTYPE_LABELS[subType] ?? subType.replaceAll('_', ' ');
}

export function getEventCategoryLabel(category: string): string {
  return EVENT_CATEGORY_LABELS[category] ?? toSentence(humanizeToken(category));
}

export function getLocationSourceLabel(source: string): string {
  return LOCATION_SOURCE_LABELS[source] ?? toSentence(humanizeToken(source));
}

export function getAuditChangeTypeLabel(changeType: string): string {
  return AUDIT_CHANGE_TYPE_LABELS[changeType] ?? toSentence(humanizeToken(changeType));
}

export function getAuditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABELS[field] ?? toSentence(humanizeToken(field));
}
