# Notifications + Jobs Event Map (Phase 0)

## Purpose
Define a single event vocabulary so all modules can trigger configurable rules without hardcoding notification logic per module.

## Canonical Event Envelope
```json
{
  "eventId": "uuid",
  "type": "inventory.low_stock",
  "module": "inventory",
  "occurredAt": "2026-02-13T12:00:00.000Z",
  "yachtId": "uuid",
  "entityType": "InventoryItem",
  "entityId": "uuid",
  "severity": "warn",
  "actorId": "uuid",
  "payload": {}
}
```

## Module Event Catalog

### Inventory
- `inventory.item_created`
- `inventory.item_updated`
- `inventory.movement_created`
- `inventory.low_stock`
- `inventory.stockout`
- `inventory.reorder_point_crossed`

Key payload fields:
- `itemId`, `itemName`, `currentQty`, `minQty`, `uom`, `location`

### Maintenance
- `maintenance.task_assigned`
- `maintenance.task_reassigned`
- `maintenance.task_submitted`
- `maintenance.task_approved`
- `maintenance.task_rejected`
- `maintenance.task_completed`
- `maintenance.due_soon`
- `maintenance.overdue`

Key payload fields:
- `taskId`, `title`, `engineId`, `priority`, `dueDate`, `assignedToUserId`

### Documents
- `documents.created`
- `documents.updated`
- `documents.submitted`
- `documents.approved`
- `documents.rejected`
- `documents.expiring`
- `documents.expired`
- `documents.pending_approval`

Key payload fields:
- `documentId`, `docType`, `expiryDate`, `daysLeft`, `workflowStatus`

### Jobs (new)
- `jobs.created`
- `jobs.assignment_changed`
- `jobs.reminder_due`
- `jobs.overdue`
- `jobs.completed`
- `jobs.skipped`

Key payload fields:
- `jobDefinitionId`, `jobRunId`, `title`, `cadence`, `nextRunAt`, `assigneeUserIds`

## Rule Trigger Mapping
Each rule maps:
- `event.type` + optional payload conditions
- scope (`fleet`, `yacht`, `entity`, `role`)
- channels (`in_app`, `email`, `push`)
- template and cadence policy

Example:
- Trigger: `documents.expiring` with `daysLeft <= 7`
- Channels: `in_app,email`
- Cadence: every 24h until resolved

## Dedupe Strategy
`dedupeKey = <ruleId>:<eventType>:<entityId>:<bucket>:<yyyy-mm-dd>`

Where `bucket` is contextual:
- Documents: `30d|14d|7d|3d|1d|expired`
- Maintenance: `due_soon|overdue`
- Inventory: `low_stock|min_breach|stockout`

## Ownership
- Event producers: each module service.
- Rule evaluation: notifications rule engine.
- Delivery fan-out: notifications orchestrator.
- Audit trail: notification delivery attempts + `AuditEvent`.
