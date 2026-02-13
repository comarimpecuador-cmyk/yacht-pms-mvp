# ADR: Notification Rules + Jobs Platform (Phase 0)

## Status
Accepted (phase 0 design baseline)

## Context
Current platform already has:
- In-app notifications (`NotificationEvent`)
- Per-user preferences (`NotificationPreference`)
- A scheduler with fixed hourly scans (documents/maintenance)
- Alert dedupe via `Alert.dedupeKey`

Current limitations:
- Rules are hardcoded in code.
- No reusable job catalog for periodic operational tasks.
- No rule builder for module-specific custom messages/frequencies.
- No centralized delivery telemetry by channel attempt.

## Decision
Introduce a configurable architecture with 4 layers:

1. **Domain Event Producers**
   - Inventory, Maintenance, Documents, HRM, Purchase Orders emit normalized events.

2. **Rule Engine (Configurable)**
   - Evaluates active rules (`module`, `trigger`, `scope`, `threshold`, `cadence`, `message template`).
   - Resolves recipients automatically (role policy + assignment fallback).

3. **Job Engine**
   - Supports recurring jobs and reminder jobs.
   - Jobs can emit events and trigger the same notification pipeline.

4. **Delivery Orchestrator**
   - Fan-out to `in_app`, `email`, `push`.
   - Deduplication, throttling, quiet windows, retries, and delivery audit.

## Initial Data Model (target)
Planned Prisma entities:
- `NotificationRule`
- `NotificationRuleTarget`
- `NotificationTemplate`
- `NotificationDispatch`
- `NotificationDeliveryAttempt`
- `JobDefinition`
- `JobAssigneePolicy`
- `JobRun`

> Phase 0 defines contracts and event map first; persistence migration is phase 1.

## Event Taxonomy (high level)
- Inventory: `inventory.low_stock`, `inventory.stockout`, `inventory.reorder_point`
- Maintenance: `maintenance.due_soon`, `maintenance.overdue`, `maintenance.task_assigned`
- Documents: `documents.expiring`, `documents.expired`, `documents.pending_approval`
- Jobs: `jobs.created`, `jobs.reminder_due`, `jobs.overdue`, `jobs.completed`

## Delivery Rules
- Deduplication key: `ruleId + scope + entityId + bucket + date-window`
- Quiet window per recipient preference
- Escalation path (example): assignee -> captain -> management
- Retries with backoff per channel

## UI/UX Constraints
- Reuse current design tokens/classes (`surface`, `border`, `kpi-*`, button patterns).
- New screens (`/settings/notifications/rules`, `/jobs`) must keep mobile/tablet/desktop parity.
- Mobile: list-first + full-screen detail for actions.

## Rollout Plan
### Phase 0 (this step)
- Architecture, event map, API contracts, DTO scaffolding.

### Phase 1
- Prisma migrations + repositories + read/write API for rules/jobs.

### Phase 2
- Rule evaluator + dispatch pipeline + delivery attempts.

### Phase 3
- UI rule builder + jobs panel + observability dashboard.

## Risks
- Rule explosion and notification spam.
- Overlapping rules for same entity.
- Email provider failures and queue lag.

## Mitigations
- Rule validation and conflict checks.
- Hard limits (max active rules per module/yacht).
- Required dry-run mode before activating new rule sets.
- Dead-letter queue and delivery status tracking.
