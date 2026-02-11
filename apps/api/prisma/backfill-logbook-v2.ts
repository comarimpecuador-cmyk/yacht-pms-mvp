import { randomUUID } from 'crypto';
import { LogBookStatus, Prisma, PrismaClient } from '@prisma/client';
import { classifyLegacyText } from '../src/modules/logbook-v2/classification';

const prisma = new PrismaClient();

type CliOptions = {
  yachtId?: string;
  from?: string;
  to?: string;
  dryRun: boolean;
  limit?: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--yachtId' && next) {
      options.yachtId = next;
      i += 1;
      continue;
    }
    if (arg === '--from' && next) {
      options.from = next;
      i += 1;
      continue;
    }
    if (arg === '--to' && next) {
      options.to = next;
      i += 1;
      continue;
    }
    if (arg === '--limit' && next) {
      options.limit = Number(next);
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function mapLegacyStatus(status: LogBookStatus) {
  if (status === LogBookStatus.Draft) return 'draft' as const;
  if (status === LogBookStatus.Submitted) return 'submitted' as const;
  if (status === LogBookStatus.Locked) return 'closed' as const;
  return 'submitted' as const;
}

function mapLegacyWatchPeriod(period: string) {
  const normalized = period.trim();
  if (normalized === '00-04') return '0000-0400';
  if (normalized === '04-08') return '0400-0800';
  if (normalized === '08-12') return '0800-1200';
  if (normalized === '12-16') return '1200-1600';
  if (normalized === '16-20') return '1600-2000';
  if (normalized === '20-24') return '2000-0000';
  return 'custom';
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  const where = {
    ...(options.yachtId ? { yachtId: options.yachtId } : {}),
    ...(options.from || options.to
      ? {
          entryDate: {
            ...(options.from ? { gte: new Date(options.from) } : {}),
            ...(options.to ? { lte: new Date(options.to) } : {}),
          },
        }
      : {}),
  };

  const entries = await prisma.logBookEntry.findMany({
    where,
    include: {
      yacht: true,
      creator: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      observations: true,
      engineReadings: {
        include: {
          engine: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    ...(options.limit && Number.isFinite(options.limit) ? { take: options.limit } : {}),
  });

  let createdCount = 0;
  let skippedCount = 0;

  for (const entry of entries) {
    const existingRows = await prisma.logbookEventV2.findMany({
      where: { legacyEntryId: entry.id },
      select: { sequenceNo: true },
    });
    const existingSequence = new Set(existingRows.map((row) => row.sequenceNo));

    const observations = entry.observations.length > 0
      ? entry.observations
      : [{ id: `legacy-${entry.id}-obs`, category: 'General', text: 'Entrada legacy sin observaciones' }];

    for (let index = 0; index < observations.length; index += 1) {
      const sequenceNo = index + 1;
      if (existingSequence.has(sequenceNo)) {
        skippedCount += 1;
        continue;
      }

      const observation = observations[index];
      const classification = classifyLegacyText(observation.category, observation.text);
      const workflowStatus = mapLegacyStatus(entry.status);
      const eventId = randomUUID();
      const eventType = classification.eventType;

      const payload = {
        eventId,
        legacyRefs: {
          legacyEntryId: entry.id,
          legacyObservationId: observation.id,
          legacySource: 'database',
        },
        yacht: {
          yachtId: entry.yachtId,
          name: entry.yacht.name,
          registrationNo: `LEG-${entry.yachtId.slice(0, 8).toUpperCase()}`,
          imo: entry.yacht.imoOptional ?? undefined,
          yachtType: 'other',
          homePort: 'No definido',
          flag: entry.yacht.flag,
        },
        chronology: {
          occurredAt: entry.entryDate.toISOString(),
          loggedAt: entry.createdAt.toISOString(),
          timezone: 'UTC',
          watchPeriod: mapLegacyWatchPeriod(entry.watchPeriod),
          sequenceNo,
        },
        classification: {
          ...classification,
          tags: ['legacy_backfill'],
        },
        workflow: {
          status: workflowStatus,
          approvalRequired: workflowStatus !== 'draft',
          approvalLevel: workflowStatus === 'closed' ? 'captain' : 'none',
          statusReason: 'Backfill desde logbook legacy',
        },
        responsibility: {
          reportedByUserId: entry.createdBy,
          reportedByName: entry.creator?.fullName ?? entry.creator?.email ?? 'Usuario legado',
          reportedByRole: 'Legacy',
          assignedToUserId: null,
          approvedByUserId: null,
          acknowledgedByUserIds: [],
        },
        details: {
          title: `${observation.category} - ${entry.watchPeriod}`.slice(0, 160),
          description: observation.text,
          engineReadings: entry.engineReadings.map((reading) => ({
            engineId: reading.engineId,
            engineName: reading.engine.name,
            hours: reading.hours,
          })),
        },
        audit: {
          createdAt: entry.createdAt.toISOString(),
          createdByUserId: entry.createdBy,
          updatedAt: entry.updatedAt.toISOString(),
          updatedByUserId: entry.createdBy,
          lastChangeReason: 'Backfill inicial',
          changeHistory: [
            {
              changedAt: entry.createdAt.toISOString(),
              changedByUserId: entry.createdBy,
              changeType: 'create',
              changedFields: ['details', 'classification', 'workflow.status'],
              reason: 'Migracion inicial desde LogBookEntry legacy',
            },
          ],
        },
      } as const;

      if (options.dryRun) {
        createdCount += 1;
        continue;
      }

      await prisma.logbookEventV2.create({
        data: {
          id: eventId,
          yachtId: entry.yachtId,
          occurredAt: entry.entryDate,
          loggedAt: entry.createdAt,
          timezone: 'UTC',
          watchPeriod: mapLegacyWatchPeriod(entry.watchPeriod),
          sequenceNo,
          eventType: classification.eventType,
          eventSubType: classification.eventSubType,
          category: classification.category,
          severity: classification.severity,
          workflowStatus,
          approvalRequired: workflowStatus !== 'draft',
          approvalLevel: workflowStatus === 'closed' ? 'captain' : 'none',
          statusReason: 'Backfill desde logbook legacy',
          title: `${observation.category} - ${entry.watchPeriod}`.slice(0, 160),
          description: observation.text,
          reportedByUserId: entry.createdBy,
          reportedByName: entry.creator?.fullName ?? entry.creator?.email ?? 'Usuario legado',
          reportedByRole: 'Legacy',
          assignedToUserId: null,
          approvedByUserId: null,
          acknowledgedByUserIds: [],
          legacyEntryId: entry.id,
          rawJson: payload,
          lockedAt: workflowStatus === 'closed' ? entry.updatedAt : null,
          lockedByUserId: workflowStatus === 'closed' ? entry.createdBy : null,
          audits: {
            create: [
              {
                changedAt: entry.createdAt,
                changedByUserId: entry.createdBy,
                changeType: 'create',
                changedFields: ['details', 'classification', 'workflowStatus'],
                reason: 'Migracion inicial desde LogBookEntry legacy',
              },
            ],
          },
        },
      });

      if (eventType === 'maintenance' || eventType === 'incident') {
        await prisma.auditEvent.create({
          data: {
            module: 'logbook_v2_backfill',
            entityType: 'LogbookEventV2',
            entityId: eventId,
            action: 'backfill_create',
            actorId: entry.createdBy,
            beforeJson: Prisma.JsonNull,
            afterJson: payload,
            source: 'script',
          },
        });
      }

      createdCount += 1;
    }
  }

  console.log('[logbook-v2 backfill] completed');
  console.log(`  entries scanned: ${entries.length}`);
  console.log(`  events created: ${createdCount}`);
  console.log(`  events skipped (already migrated): ${skippedCount}`);
  console.log(`  dry-run: ${options.dryRun ? 'yes' : 'no'}`);
}

run()
  .catch((error) => {
    console.error('[logbook-v2 backfill] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
