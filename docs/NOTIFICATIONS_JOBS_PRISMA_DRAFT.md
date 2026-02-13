# Prisma Draft: Notifications + Jobs (Phase 1 Preview)

This file documents the planned Prisma models for phase 1. It is intentionally not applied yet as a runtime migration.

## Proposed Models

```prisma
model NotificationRule {
  id              String   @id @default(uuid())
  name            String
  module          String
  eventType       String
  scopeType       String
  yachtId         String?
  entityType      String?
  entityId        String?
  conditionsJson  Json
  cadenceMode     String
  cadenceValue    Int?
  channels        String[]
  minSeverity     String   @default("info")
  templateId      String?
  recipientPolicy Json
  active          Boolean  @default(true)
  createdBy       String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  template NotificationTemplate? @relation(fields: [templateId], references: [id])

  @@index([module, eventType, active])
  @@index([yachtId, active])
}

model NotificationTemplate {
  id        String   @id @default(uuid())
  name      String
  channel   String
  locale    String   @default("es")
  title     String
  body      String
  variables String[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  rules NotificationRule[]
}

model NotificationDispatch {
  id          String   @id @default(uuid())
  ruleId      String?
  eventType   String
  module      String
  dedupeKey   String
  yachtId     String?
  entityType  String?
  entityId    String?
  payload     Json
  severity    String
  status      String
  createdAt   DateTime @default(now())
  resolvedAt  DateTime?

  @@index([dedupeKey, createdAt])
  @@index([ruleId, createdAt])
}

model NotificationDeliveryAttempt {
  id            String   @id @default(uuid())
  dispatchId    String
  userId        String
  channel       String
  provider      String
  status        String
  providerRef   String?
  error         String?
  attemptedAt   DateTime @default(now())
  deliveredAt   DateTime?

  @@index([dispatchId, attemptedAt])
  @@index([userId, status, attemptedAt])
}

model JobDefinition {
  id                   String   @id @default(uuid())
  title                String
  module               String
  yachtId              String?
  instructionsTemplate String
  scheduleType         String
  cronExpression       String?
  intervalHours        Int?
  intervalDays         Int?
  timezone             String   @default("UTC")
  assignmentPolicy     Json
  remindersJson        Json
  status               String   @default("active")
  createdBy            String
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  runs JobRun[]

  @@index([module, status])
  @@index([yachtId, status])
}

model JobRun {
  id              String   @id @default(uuid())
  jobDefinitionId String
  scheduledAt     DateTime
  startedAt       DateTime?
  finishedAt      DateTime?
  status          String
  summaryJson     Json?
  createdAt       DateTime @default(now())

  jobDefinition JobDefinition @relation(fields: [jobDefinitionId], references: [id], onDelete: Cascade)

  @@index([jobDefinitionId, scheduledAt])
  @@index([status, scheduledAt])
}
```

## Migration Notes
- Keep existing `NotificationEvent` for inbox compatibility during transition.
- New dispatch/attempt tables provide per-channel telemetry and retry control.
- Backfill can map old `NotificationEvent` rows into `NotificationDispatch` only when needed.
