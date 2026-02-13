export const INVENTORY_EVENT_TYPES = [
  'inventory.item_created',
  'inventory.item_updated',
  'inventory.movement_created',
  'inventory.low_stock',
  'inventory.stockout',
  'inventory.reorder_point_crossed',
] as const;

export const MAINTENANCE_EVENT_TYPES = [
  'maintenance.task_assigned',
  'maintenance.task_reassigned',
  'maintenance.task_submitted',
  'maintenance.task_approved',
  'maintenance.task_rejected',
  'maintenance.task_completed',
  'maintenance.due_soon',
  'maintenance.overdue',
] as const;

export const DOCUMENT_EVENT_TYPES = [
  'documents.created',
  'documents.updated',
  'documents.submitted',
  'documents.approved',
  'documents.rejected',
  'documents.expiring',
  'documents.expired',
  'documents.pending_approval',
] as const;

export const JOB_EVENT_TYPES = [
  'jobs.created',
  'jobs.assignment_changed',
  'jobs.reminder_due',
  'jobs.overdue',
  'jobs.completed',
  'jobs.skipped',
] as const;

export const CORE_NOTIFICATION_EVENT_TYPES = [
  ...INVENTORY_EVENT_TYPES,
  ...MAINTENANCE_EVENT_TYPES,
  ...DOCUMENT_EVENT_TYPES,
  ...JOB_EVENT_TYPES,
] as const;

export type CoreNotificationEventType = (typeof CORE_NOTIFICATION_EVENT_TYPES)[number];
