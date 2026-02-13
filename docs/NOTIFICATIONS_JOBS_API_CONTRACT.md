# Notifications + Jobs API Contract (Phase 0 Draft)

## Scope
Draft endpoints for configurable rules and recurring jobs. This is the contract baseline before persistence implementation.

## Notifications Rules

### `GET /api/notifications/rules`
Query:
- `module?=inventory|maintenance|documents|jobs`
- `yachtId?=<uuid>`
- `status?=active|paused`

Response:
```json
{
  "items": [],
  "total": 0
}
```

### `POST /api/notifications/rules`
Create rule:
```json
{
  "name": "Low stock critical parts",
  "module": "inventory",
  "eventType": "inventory.low_stock",
  "scope": { "type": "yacht", "yachtId": "uuid" },
  "conditions": { "minPercentRemaining": 20 },
  "cadence": { "mode": "every_n_days", "value": 2 },
  "channels": ["in_app", "email"],
  "template": {
    "title": "Stock bajo: {{itemName}}",
    "message": "Quedan {{currentQty}} {{uom}}. Reordenar."
  },
  "recipientPolicy": {
    "mode": "roles",
    "roles": ["Chief Engineer", "Captain"]
  },
  "active": true
}
```

### `PATCH /api/notifications/rules/:id`
Partial update:
- `name`, `conditions`, `cadence`, `channels`, `template`, `recipientPolicy`, `active`

### `POST /api/notifications/rules/:id/test`
Dry-run request:
```json
{
  "samplePayload": {
    "itemName": "Filtro aceite",
    "currentQty": 1,
    "uom": "pcs"
  }
}
```

Response:
```json
{
  "rendered": {
    "title": "Stock bajo: Filtro aceite",
    "message": "Quedan 1 pcs. Reordenar."
  },
  "recipients": []
}
```

## Jobs

### `GET /api/jobs`
Query:
- `yachtId?=<uuid>`
- `status?=active|paused`

Response:
```json
{
  "items": [],
  "total": 0
}
```

### `POST /api/jobs`
Create recurring job:
```json
{
  "title": "Revision semanal motor principal",
  "module": "maintenance",
  "yachtId": "uuid",
  "schedule": {
    "type": "cron",
    "expression": "0 8 * * 1",
    "timezone": "America/Guayaquil"
  },
  "assignmentPolicy": {
    "mode": "roles",
    "roles": ["Chief Engineer"]
  },
  "reminders": [
    { "offsetHours": 24, "channels": ["in_app", "email"] },
    { "offsetHours": 2, "channels": ["in_app"] }
  ],
  "instructionsTemplate": "Revisar motor {{engineName}} y registrar evidencia",
  "active": true
}
```

### `PATCH /api/jobs/:id`
Partial update:
- `title`, `schedule`, `assignmentPolicy`, `reminders`, `instructionsTemplate`, `active`

### `POST /api/jobs/:id/run-now`
Trigger immediate run for operational testing.

### `GET /api/jobs/:id/runs`
Returns recent executions and notification outcomes.

## Compatibility
- Existing endpoints remain valid:
  - `/api/notifications/in-app`
  - `/api/notifications/settings`
- New rules/jobs pipeline should still write to `NotificationEvent` for inbox continuity.
