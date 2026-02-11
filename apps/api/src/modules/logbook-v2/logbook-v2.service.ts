import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ErrorObject, ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { LogBookStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { classifyLegacyText } from './classification';
import {
  ListLogbookV2EventsQueryDto,
  UpdateLogbookV2EventDto,
  UpdateLogbookV2StatusDto,
} from './dto';
import { LOGBOOK_V2_SCHEMA } from './logbook-v2.schema';
import type {
  LogbookV2EventPayload,
  WatchPeriod,
  WorkflowStatus,
} from './logbook-v2.types';

type AuthActor = {
  userId: string;
  role: string;
  yachtIds?: string[];
};

type EvidenceItem = NonNullable<LogbookV2EventPayload['evidence']>[number];
type LocationSource = NonNullable<LogbookV2EventPayload['location']>['source'];
type LegacySource = NonNullable<
  NonNullable<LogbookV2EventPayload['legacyRefs']>['legacySource']
>;

type LegacyMirrorResult =
  | {
      mode: 'created';
      legacyEntryId: string;
      reason: string;
    }
  | {
      mode: 'linked';
      legacyEntryId: string;
      reason: string;
    }
  | {
      mode: 'conflict';
      legacyEntryId?: string;
      reason: string;
      details: Record<string, unknown>;
    };

type EventWithRelations = Prisma.LogbookEventV2GetPayload<{
  include: {
    yacht: {
      select: {
        id: true;
        name: true;
        flag: true;
        imoOptional: true;
      };
    };
    evidences: true;
    audits: true;
  };
}>;

type LegacyEntryWithRelations = Prisma.LogBookEntryGetPayload<{
  include: {
    yacht: true;
    creator: {
      select: {
        id: true;
        fullName: true;
        email: true;
      };
    };
    observations: true;
    engineReadings: {
      include: {
        engine: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class LogbookV2Service {
  private readonly validator: ValidateFunction<unknown>;

  private readonly eventInclude = {
    yacht: {
      select: {
        id: true,
        name: true,
        flag: true,
        imoOptional: true,
      },
    },
    evidences: true,
    audits: true,
  } satisfies Prisma.LogbookEventV2Include;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validator = ajv.compile(LOGBOOK_V2_SCHEMA);
  }

  async createEventForActor(actor: AuthActor, payloadUnknown: unknown) {
    this.assertV2Role(actor.role);
    const payload = this.validatePayload(payloadUnknown);

    this.assertYachtScope(payload.yacht.yachtId, actor.yachtIds ?? [], actor.role);
    this.assertCreateAuthorization(actor, payload);

    const existing = await this.prisma.logbookEventV2.findUnique({
      where: { id: payload.eventId },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('eventId already exists');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const createdV2 = await tx.logbookEventV2.create({
        data: this.toV2CreateInput(payload, actor.userId),
        include: this.eventInclude,
      });

      let legacyMirror: LegacyMirrorResult | null = null;
      if (
        this.isEnabled('LOGBOOK_V2_WRITE_DOUBLE_ENABLED', true) &&
        this.isEnabled('LOGBOOK_LEGACY_WRITE_ENABLED', true)
      ) {
        legacyMirror = await this.writeLegacyMirror(tx, payload);
      }

      if (legacyMirror && legacyMirror.mode === 'conflict') {
        await tx.auditEvent.create({
          data: {
            module: 'logbook_v2',
            entityType: 'LogbookEventV2',
            entityId: createdV2.id,
            action: 'legacy_conflict',
            actorId: actor.userId,
            beforeJson: Prisma.JsonNull,
            afterJson: legacyMirror as unknown as Prisma.InputJsonValue,
            source: 'api',
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          module: 'logbook_v2',
          entityType: 'LogbookEventV2',
          entityId: createdV2.id,
          action: 'create',
          actorId: actor.userId,
          beforeJson: Prisma.JsonNull,
          afterJson: {
            payload,
            legacyMirror,
          } as unknown as Prisma.InputJsonValue,
          source: 'api',
        },
      });

      return createdV2;
    });

    await this.notifyLogbookMovement(created, 'created', actor.userId, payload.audit.lastChangeReason);

    return this.toApiEvent(created);
  }

  async listEventsForActor(actor: AuthActor, query: ListLogbookV2EventsQueryDto) {
    this.assertV2Role(actor.role);
    this.assertYachtScope(query.yachtId, actor.yachtIds ?? [], actor.role);

    if (this.isEnabled('LOGBOOK_V2_READ_ENABLED', true)) {
      const where: Prisma.LogbookEventV2WhereInput = { yachtId: query.yachtId };

      if (query.date) {
        const start = this.startOfDayUtc(query.date);
        const end = this.endOfDayUtc(start);
        where.occurredAt = { gte: start, lte: end };
      }

      if (query.status) {
        where.workflowStatus = query.status;
      }

      const events = await this.prisma.logbookEventV2.findMany({
        where,
        include: this.eventInclude,
        orderBy: [{ occurredAt: 'asc' }, { sequenceNo: 'asc' }],
      });

      if (events.length > 0 || !this.isEnabled('LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED', true)) {
        return events.map((event) => this.toApiEvent(event));
      }
    }

    if (!this.isEnabled('LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED', true)) {
      return [];
    }

    const fallback = await this.listLegacyFallbackEvents(query.yachtId, query.date);
    if (!query.status) return fallback;
    return fallback.filter((event) => event.workflow.status === query.status);
  }

  async getEventForActor(actor: AuthActor, eventId: string) {
    this.assertV2Role(actor.role);

    if (this.isEnabled('LOGBOOK_V2_READ_ENABLED', true) && !eventId.startsWith('legacy:')) {
      const event = await this.prisma.logbookEventV2.findUnique({
        where: { id: eventId },
        include: this.eventInclude,
      });

      if (event) {
        this.assertYachtScope(event.yachtId, actor.yachtIds ?? [], actor.role);
        return this.toApiEvent(event);
      }
    }

    if (!this.isEnabled('LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED', true)) {
      throw new NotFoundException('Logbook V2 event not found');
    }

    const fallback = await this.getLegacyFallbackEventById(eventId);
    if (!fallback) {
      throw new NotFoundException('Logbook V2 event not found');
    }

    this.assertYachtScope(fallback.yacht.yachtId, actor.yachtIds ?? [], actor.role);
    return fallback;
  }

  async updateEventForActor(
    actor: AuthActor,
    eventId: string,
    dto: UpdateLogbookV2EventDto,
  ) {
    this.assertV2Role(actor.role);

    if (eventId.startsWith('legacy:')) {
      throw new BadRequestException('Legacy fallback events cannot be updated');
    }

    const current = await this.prisma.logbookEventV2.findUnique({
      where: { id: eventId },
      include: this.eventInclude,
    });

    if (!current) {
      throw new NotFoundException('Logbook V2 event not found');
    }

    this.assertYachtScope(current.yachtId, actor.yachtIds ?? [], actor.role);

    const role = this.normalizeRole(actor.role);
    const isAdminLike = role === 'Admin' || role === 'SystemAdmin';
    if (current.lockedAt && !isAdminLike) {
      throw new ForbiddenException('Event is locked. Only Admin/SystemAdmin can modify it');
    }

    const editableStatuses = new Set(['draft', 'submitted', 'rejected']);
    if (!editableStatuses.has(current.workflowStatus) && !isAdminLike) {
      throw new ForbiddenException('Only draft/submitted/rejected events can be edited');
    }

    const patch: Prisma.LogbookEventV2UpdateInput = {};
    const changedFields: string[] = [];

    if (dto.title !== undefined) {
      const nextTitle = dto.title.trim();
      if (!nextTitle) {
        throw new BadRequestException('title cannot be empty');
      }
      if (nextTitle !== current.title) {
        patch.title = nextTitle;
        changedFields.push('details.title');
      }
    }

    if (dto.description !== undefined) {
      const nextDescription = dto.description.trim();
      if (!nextDescription) {
        throw new BadRequestException('description cannot be empty');
      }
      if (nextDescription !== current.description) {
        patch.description = nextDescription;
        changedFields.push('details.description');
      }
    }

    if (dto.severity !== undefined && dto.severity !== current.severity) {
      patch.severity = dto.severity;
      changedFields.push('classification.severity');
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No editable fields were changed');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const event = await tx.logbookEventV2.update({
        where: { id: eventId },
        data: patch,
        include: this.eventInclude,
      });

      const raw = this.asObject(event.rawJson);
      const rawDetails = this.asObject(raw.details);
      const rawClassification = this.asObject(raw.classification);
      const rawAudit = this.asObject(raw.audit);
      const currentHistory = Array.isArray(rawAudit.changeHistory) ? rawAudit.changeHistory : [];

      const rawPatch = {
        ...raw,
        details: {
          ...rawDetails,
          title: event.title,
          description: event.description,
        },
        classification: {
          ...rawClassification,
          severity: event.severity,
        },
        audit: {
          ...rawAudit,
          updatedAt: new Date().toISOString(),
          updatedByUserId: actor.userId,
          lastChangeReason: dto.reason,
          changeHistory: [
            ...currentHistory,
            {
              changedAt: new Date().toISOString(),
              changedByUserId: actor.userId,
              changeType: 'update',
              changedFields,
              reason: dto.reason,
            },
          ],
        },
      };

      await tx.logbookEventV2.update({
        where: { id: event.id },
        data: {
          rawJson: rawPatch as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.logbookEventAuditV2.create({
        data: {
          eventId: event.id,
          changedAt: new Date(),
          changedByUserId: actor.userId,
          changeType: 'update',
          changedFields,
          reason: dto.reason,
        },
      });

      await tx.auditEvent.create({
        data: {
          module: 'logbook_v2',
          entityType: 'LogbookEventV2',
          entityId: event.id,
          action: 'update',
          actorId: actor.userId,
          beforeJson: current.rawJson as Prisma.InputJsonValue,
          afterJson: rawPatch as unknown as Prisma.InputJsonValue,
          source: 'api',
        },
      });

      return event;
    });

    await this.notifyLogbookMovement(updated, 'updated', actor.userId, dto.reason);

    return this.toApiEvent(updated);
  }

  async updateEventStatusForActor(
    actor: AuthActor,
    eventId: string,
    dto: UpdateLogbookV2StatusDto,
  ) {
    const role = this.normalizeRole(actor.role);
    if (!['Captain', 'Admin', 'SystemAdmin'].includes(role)) {
      throw new ForbiddenException('Only Captain/Admin/SystemAdmin can approve or close events');
    }

    if (eventId.startsWith('legacy:')) {
      throw new BadRequestException('Legacy fallback events cannot be updated');
    }

    const current = await this.prisma.logbookEventV2.findUnique({
      where: { id: eventId },
      include: this.eventInclude,
    });
    if (!current) {
      throw new NotFoundException('Logbook V2 event not found');
    }

    this.assertYachtScope(current.yachtId, actor.yachtIds ?? [], actor.role);

    const isAdminLike = role === 'Admin' || role === 'SystemAdmin';
    if (current.lockedAt && !isAdminLike) {
      throw new ForbiddenException('Event is locked. Only Admin/SystemAdmin can modify it');
    }

    if ((dto.status === 'approved' || dto.status === 'closed') && !['Captain', 'Admin', 'SystemAdmin'].includes(role)) {
      throw new ForbiddenException('Only Captain/Admin/SystemAdmin can approve or close events');
    }

    const nextLockedAt = dto.status === 'closed' ? new Date() : current.lockedAt;
    const nextLockedBy = dto.status === 'closed' ? actor.userId : current.lockedByUserId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const event = await tx.logbookEventV2.update({
        where: { id: eventId },
        data: {
          workflowStatus: dto.status,
          statusReason: dto.statusReason?.trim() || null,
          approvedByUserId: dto.status === 'approved' || dto.status === 'closed' ? actor.userId : current.approvedByUserId,
          lockedAt: nextLockedAt,
          lockedByUserId: nextLockedBy,
        },
        include: this.eventInclude,
      });

      await tx.logbookEventAuditV2.create({
        data: {
          eventId: event.id,
          changedAt: new Date(),
          changedByUserId: actor.userId,
          changeType: dto.status === 'approved' ? 'approval' : 'status_change',
          changedFields: ['workflowStatus', 'statusReason', ...(dto.status === 'closed' ? ['lockedAt', 'lockedByUserId'] : [])],
          reason: dto.reason,
        },
      });

      const raw = this.asObject(event.rawJson);
      const rawAudit = this.asObject(raw.audit);
      const rawWorkflow = this.asObject(raw.workflow);
      const currentHistory = Array.isArray(rawAudit.changeHistory) ? rawAudit.changeHistory : [];

      const rawPatch = {
        ...raw,
        workflow: {
          ...rawWorkflow,
          status: dto.status,
          statusReason: dto.statusReason?.trim() || null,
        },
        audit: {
          ...rawAudit,
          updatedAt: new Date().toISOString(),
          updatedByUserId: actor.userId,
          lastChangeReason: dto.reason,
          changeHistory: [
            ...currentHistory,
            {
              changedAt: new Date().toISOString(),
              changedByUserId: actor.userId,
              changeType: dto.status === 'approved' ? 'approval' : 'status_change',
              changedFields: ['workflow.status', 'workflow.statusReason'],
              reason: dto.reason,
            },
          ],
        },
      };

      await tx.logbookEventV2.update({
        where: { id: event.id },
        data: {
          rawJson: rawPatch as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.auditEvent.create({
        data: {
          module: 'logbook_v2',
          entityType: 'LogbookEventV2',
          entityId: event.id,
          action: 'status_update',
          actorId: actor.userId,
          beforeJson: current.rawJson as Prisma.InputJsonValue,
          afterJson: rawPatch as unknown as Prisma.InputJsonValue,
          source: 'api',
        },
      });

      return event;
    });

    await this.notifyLogbookMovement(updated, 'status_updated', actor.userId, dto.reason);

    return this.toApiEvent(updated);
  }

  private async notifyLogbookMovement(
    event: EventWithRelations,
    action: 'created' | 'updated' | 'status_updated',
    actorUserId: string,
    reason?: string | null,
  ) {
    const recipients = await this.resolveNotificationRecipients(event.yachtId);
    if (recipients.length === 0) return;

    const payload: Prisma.JsonObject = {
      eventId: event.id,
      yachtId: event.yachtId,
      eventType: event.eventType,
      eventSubType: event.eventSubType,
      title: event.title,
      description: event.description,
      severity: event.severity,
      status: event.workflowStatus,
      reportedByName: event.reportedByName,
      reportedByRole: event.reportedByRole ?? '',
      actorUserId,
      reason: (reason || '').trim() || null,
      actionUrl: `/yachts/${event.yachtId}/logbook/${event.id}`,
    };

    await Promise.all(
      recipients.map((userId) =>
        this.notificationsService.createInApp({
          userId,
          yachtId: event.yachtId,
          type: `logbook_v2.${action}`,
          dedupeKey: `logbook-v2-${action}-${event.id}-${userId}-${event.updatedAt.getTime()}`,
          payload,
        }),
      ),
    );
  }

  private async resolveNotificationRecipients(yachtId: string): Promise<string[]> {
    const [yachtAccessUsers, systemAdmins] = await Promise.all([
      this.prisma.userYachtAccess.findMany({
        where: {
          yachtId,
          revokedAt: null,
          user: { isActive: true },
        },
        select: { userId: true },
      }),
      this.prisma.user.findMany({
        where: {
          isActive: true,
          role: { name: 'SystemAdmin' },
        },
        select: { id: true },
      }),
    ]);

    return Array.from(new Set([...yachtAccessUsers.map((row) => row.userId), ...systemAdmins.map((row) => row.id)]));
  }

  private validatePayload(payloadUnknown: unknown): LogbookV2EventPayload {
    if (!this.validator(payloadUnknown)) {
      throw new BadRequestException(this.formatValidationErrors(this.validator.errors));
    }

    const payload = payloadUnknown as LogbookV2EventPayload;

    const occurredAt = new Date(payload.chronology.occurredAt);
    const loggedAt = new Date(payload.chronology.loggedAt);
    if (Number.isNaN(occurredAt.getTime()) || Number.isNaN(loggedAt.getTime())) {
      throw new BadRequestException('chronology.occurredAt and chronology.loggedAt must be valid dates');
    }
    if (occurredAt.getTime() > loggedAt.getTime()) {
      throw new BadRequestException('chronology.occurredAt cannot be after chronology.loggedAt');
    }

    if (payload.location) {
      if (payload.location.latitude < -90 || payload.location.latitude > 90) {
        throw new BadRequestException('location.latitude out of range');
      }
      if (payload.location.longitude < -180 || payload.location.longitude > 180) {
        throw new BadRequestException('location.longitude out of range');
      }
    }

    if (
      payload.classification.eventType === 'incident' &&
      payload.classification.severity === 'critical' &&
      (!payload.evidence || payload.evidence.length === 0)
    ) {
      throw new BadRequestException('Critical incidents require at least one evidence file');
    }

    if (!payload.audit.changeHistory || payload.audit.changeHistory.length === 0) {
      throw new BadRequestException('audit.changeHistory requires at least one change');
    }

    const invalidReason = payload.audit.changeHistory.find(
      (change) => !change.reason || change.reason.trim().length < 3,
    );
    if (invalidReason) {
      throw new BadRequestException('audit.changeHistory.reason is mandatory for all changes');
    }

    return payload;
  }

  private toV2CreateInput(
    payload: LogbookV2EventPayload,
    actorUserId: string,
  ): Prisma.LogbookEventV2CreateInput {
    const isClosed = payload.workflow.status === 'closed';
    const evidenceRows = payload.evidence ?? [];
    const auditRows = payload.audit.changeHistory ?? [];

    return {
      id: payload.eventId,
      yacht: {
        connect: {
          id: payload.yacht.yachtId,
        },
      },
      occurredAt: new Date(payload.chronology.occurredAt),
      loggedAt: new Date(payload.chronology.loggedAt),
      timezone: payload.chronology.timezone,
      watchPeriod: payload.chronology.watchPeriod,
      sequenceNo: payload.chronology.sequenceNo,
      eventType: payload.classification.eventType,
      eventSubType: payload.classification.eventSubType,
      category: payload.classification.category,
      severity: payload.classification.severity,
      workflowStatus: payload.workflow.status,
      approvalRequired: payload.workflow.approvalRequired,
      approvalLevel: payload.workflow.approvalLevel ?? null,
      statusReason: payload.workflow.statusReason ?? null,
      title: payload.details.title,
      description: payload.details.description,
      locationSource: payload.location?.source ?? null,
      latitude: payload.location?.latitude ?? null,
      longitude: payload.location?.longitude ?? null,
      portName: payload.location?.portName ?? null,
      area: payload.location?.area ?? null,
      countryCode: payload.location?.countryCode ?? null,
      accuracyMeters: payload.location?.accuracyMeters ?? null,
      reportedByUserId: payload.responsibility.reportedByUserId,
      reportedByName: payload.responsibility.reportedByName,
      reportedByRole: payload.responsibility.reportedByRole ?? null,
      assignedToUserId: payload.responsibility.assignedToUserId ?? null,
      approvedByUserId: payload.responsibility.approvedByUserId ?? null,
      acknowledgedByUserIds: payload.responsibility.acknowledgedByUserIds ?? [],
      legacyEntryId: payload.legacyRefs?.legacyEntryId ?? null,
      rawJson: payload as unknown as Prisma.InputJsonValue,
      lockedAt: isClosed ? new Date(payload.audit.updatedAt) : null,
      lockedByUserId: isClosed ? actorUserId : null,
      evidences:
        evidenceRows.length > 0
          ? {
              create: evidenceRows.map((evidence) => ({
                id: evidence.evidenceId,
                fileUrl: evidence.fileUrl,
                fileName: evidence.fileName,
                mimeType: evidence.mimeType,
                checksumSha256: evidence.checksumSha256 ?? null,
                uploadedByUserId: evidence.uploadedByUserId,
                uploadedAt: new Date(evidence.uploadedAt),
                caption: evidence.caption ?? null,
              })),
            }
          : undefined,
      audits: {
        create: auditRows.map((change) => ({
          changedAt: new Date(change.changedAt),
          changedByUserId: change.changedByUserId,
          changeType: change.changeType,
          changedFields: change.changedFields ?? [],
          reason: change.reason,
        })),
      },
    };
  }

  private assertCreateAuthorization(actor: AuthActor, payload: LogbookV2EventPayload) {
    const role = this.normalizeRole(actor.role);
    const isCaptainOrAdmin = this.isCaptainOrAdmin(role);

    if (!isCaptainOrAdmin && (payload.workflow.status === 'approved' || payload.workflow.status === 'closed')) {
      throw new ForbiddenException('Only Captain/Admin can set approved or closed status');
    }

    if (!isCaptainOrAdmin && payload.responsibility.reportedByUserId !== actor.userId) {
      throw new ForbiddenException('Chief Engineer can only report events in own name');
    }

    if (!isCaptainOrAdmin && payload.audit.createdByUserId !== actor.userId) {
      throw new ForbiddenException('Chief Engineer can only create own audit trail');
    }

    if (!isCaptainOrAdmin && payload.audit.updatedByUserId !== actor.userId) {
      throw new ForbiddenException('Chief Engineer can only update own audit trail');
    }

    const invalidChangeOwner = payload.audit.changeHistory.find(
      (change) => !isCaptainOrAdmin && change.changedByUserId !== actor.userId,
    );

    if (invalidChangeOwner) {
      throw new ForbiddenException('Chief Engineer can only submit changes created by own user');
    }
  }

  private async writeLegacyMirror(
    tx: Prisma.TransactionClient,
    payload: LogbookV2EventPayload,
  ): Promise<LegacyMirrorResult> {
    const entryDate = this.toLegacyEntryDate(payload.chronology.occurredAt);
    const legacyStatus = this.mapToLegacyStatus(payload.workflow.status);
    const watchPeriod = this.toLegacyWatchPeriod(payload.chronology.watchPeriod);

    const requestedLegacyEntryId = payload.legacyRefs?.legacyEntryId?.trim() || null;

    let entry = await tx.logBookEntry.findUnique({
      where: {
        yachtId_entryDate: {
          yachtId: payload.yacht.yachtId,
          entryDate,
        },
      },
    });

    if (requestedLegacyEntryId) {
      const explicitEntry = await tx.logBookEntry.findUnique({
        where: { id: requestedLegacyEntryId },
      });

      if (!explicitEntry) {
        return {
          mode: 'conflict',
          reason: 'legacyEntryId referenced in payload was not found',
          details: {
            requestedLegacyEntryId,
            yachtId: payload.yacht.yachtId,
          },
        };
      }

      if (explicitEntry.yachtId !== payload.yacht.yachtId) {
        return {
          mode: 'conflict',
          legacyEntryId: explicitEntry.id,
          reason: 'legacyEntryId belongs to a different yacht',
          details: {
            requestedLegacyEntryId,
            expectedYachtId: payload.yacht.yachtId,
            foundYachtId: explicitEntry.yachtId,
          },
        };
      }

      const explicitEntryDate = new Date(
        Date.UTC(
          explicitEntry.entryDate.getUTCFullYear(),
          explicitEntry.entryDate.getUTCMonth(),
          explicitEntry.entryDate.getUTCDate(),
        ),
      );

      if (explicitEntryDate.getTime() !== entryDate.getTime()) {
        return {
          mode: 'conflict',
          legacyEntryId: explicitEntry.id,
          reason: 'legacyEntryId date differs from occurredAt day',
          details: {
            requestedLegacyEntryId,
            occurredAtDate: entryDate.toISOString(),
            legacyEntryDate: explicitEntryDate.toISOString(),
          },
        };
      }

      if (entry && entry.id !== explicitEntry.id) {
        return {
          mode: 'conflict',
          legacyEntryId: entry.id,
          reason: 'yachtId+entryDate points to a different legacy entry than legacyEntryId',
          details: {
            requestedLegacyEntryId: explicitEntry.id,
            byDateEntryId: entry.id,
          },
        };
      }

      entry = explicitEntry;
    }

    if (!entry) {
      const createdEntry = await tx.logBookEntry.create({
        data: {
          yachtId: payload.yacht.yachtId,
          entryDate,
          watchPeriod,
          status: legacyStatus,
          createdBy: payload.responsibility.reportedByUserId,
        },
      });

      if (payload.details.engineReadings?.length) {
        for (const reading of payload.details.engineReadings) {
          await tx.logBookEngineReading.upsert({
            where: {
              logbookId_engineId: {
                logbookId: createdEntry.id,
                engineId: reading.engineId,
              },
            },
            update: {
              hours: reading.hours,
            },
            create: {
              logbookId: createdEntry.id,
              engineId: reading.engineId,
              hours: reading.hours,
            },
          });
        }
      }

      const observationText = payload.details.description.trim();
      if (observationText) {
        await tx.logBookObservation.create({
          data: {
            logbookId: createdEntry.id,
            category: this.toLegacyObservationCategory(payload),
            text: observationText.slice(0, 500),
          },
        });
      }

      return {
        mode: 'created',
        legacyEntryId: createdEntry.id,
        reason: 'Legacy mirror created for new operational day entry',
      };
    }

    const conflictFields: Array<{ field: string; legacyValue: string; requestedValue: string }> = [];
    if (entry.watchPeriod !== watchPeriod) {
      conflictFields.push({
        field: 'watchPeriod',
        legacyValue: entry.watchPeriod,
        requestedValue: watchPeriod,
      });
    }
    if (entry.status !== legacyStatus) {
      conflictFields.push({
        field: 'status',
        legacyValue: entry.status,
        requestedValue: legacyStatus,
      });
    }

    if (conflictFields.length > 0) {
      return {
        mode: 'conflict',
        legacyEntryId: entry.id,
        reason: 'Existing legacy entry differs; legacy preserved as historical source',
        details: {
          conflictFields,
          yachtId: entry.yachtId,
          entryDate: entry.entryDate.toISOString(),
        },
      };
    }

    if (entry.status === LogBookStatus.Locked) {
      return {
        mode: 'linked',
        legacyEntryId: entry.id,
        reason: 'Legacy entry already locked; no mutation applied',
      };
    }

    // Existing legacy entry matches key fields; do not mutate historical row.
    return {
      mode: 'linked',
      legacyEntryId: entry.id,
      reason: 'Legacy entry exists and was preserved without mutation',
    };
  }

  private async listLegacyFallbackEvents(yachtId: string, date?: string) {
    const where: Prisma.LogBookEntryWhereInput = { yachtId };

    if (date) {
      const start = this.startOfDayUtc(date);
      const end = this.endOfDayUtc(start);
      where.entryDate = {
        gte: start,
        lte: end,
      };
    }

    const entries = await this.prisma.logBookEntry.findMany({
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
      orderBy: { entryDate: 'asc' },
    });

    return entries.flatMap((entry) => this.mapLegacyEntryToFallbackEvents(entry));
  }

  private async getLegacyFallbackEventById(eventId: string) {
    const parsed = this.parseLegacyVirtualEventId(eventId);
    const legacyEntryId = parsed?.entryId ?? eventId;
    const sequenceNo = parsed?.sequenceNo ?? 1;

    const entry = await this.prisma.logBookEntry.findUnique({
      where: { id: legacyEntryId },
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
    });

    if (!entry) return null;
    const events = this.mapLegacyEntryToFallbackEvents(entry);
    return events.find((event) => event.chronology.sequenceNo === sequenceNo) ?? events[0] ?? null;
  }

  private mapLegacyEntryToFallbackEvents(entry: LegacyEntryWithRelations): LogbookV2EventPayload[] {
    const observations = entry.observations.length > 0
      ? entry.observations
      : [{ id: `legacy-${entry.id}-obs`, category: 'General', text: 'Entrada migrada sin observaciones' }];

    return observations.map((observation, index) => {
      const classification = classifyLegacyText(observation.category, observation.text);
      const workflowStatus = this.mapLegacyToV2Status(entry.status);
      const sequenceNo = index + 1;
      const watchPeriod = this.fromLegacyWatchPeriod(entry.watchPeriod);

      return {
        eventId: `legacy:${entry.id}:${sequenceNo}`,
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
          watchPeriod,
          sequenceNo,
        },
        classification: {
          ...classification,
          tags: ['legacy_fallback'],
        },
        workflow: {
          status: workflowStatus,
          approvalRequired: workflowStatus !== 'draft',
          approvalLevel: workflowStatus === 'closed' ? 'captain' : 'none',
          statusReason: 'Evento legado renderizado en fallback de lectura',
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
          lastChangeReason: 'Fallback legacy',
          changeHistory: [
            {
              changedAt: entry.createdAt.toISOString(),
              changedByUserId: entry.createdBy,
              changeType: 'create',
              changedFields: ['details', 'classification', 'workflow.status'],
              reason: 'Evento derivado desde LogBookEntry legacy',
            },
          ],
        },
      };
    });
  }

  private toApiEvent(event: EventWithRelations): LogbookV2EventPayload {
    const raw = this.asObject(event.rawJson);
    const rawYacht = this.asObject(raw.yacht);
    const rawClassification = this.asObject(raw.classification);
    const rawWorkflow = this.asObject(raw.workflow);
    const rawDetails = this.asObject(raw.details);
    const rawLocation = this.asObject(raw.location);
    const rawAudit = this.asObject(raw.audit);
    const rawLegacyRefs = this.asObject(raw.legacyRefs);

    const sortedEvidence = [...event.evidences].sort(
      (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime(),
    );
    const sortedAudit = [...event.audits].sort(
      (a, b) => a.changedAt.getTime() - b.changedAt.getTime(),
    );

    const fallbackCreatedBy = sortedAudit[0]?.changedByUserId ?? event.reportedByUserId;
    const fallbackUpdatedBy = sortedAudit[sortedAudit.length - 1]?.changedByUserId ?? event.reportedByUserId;

    const eventPayload: LogbookV2EventPayload = {
      eventId: event.id,
      legacyRefs: {
        legacyEntryId: event.legacyEntryId ?? this.readOptionalString(rawLegacyRefs.legacyEntryId) ?? undefined,
        legacyObservationId: this.readOptionalString(rawLegacyRefs.legacyObservationId) ?? undefined,
        legacySource: this.readLegacySource(rawLegacyRefs.legacySource),
      },
      yacht: {
        yachtId: event.yachtId,
        name: this.readOptionalString(rawYacht.name) ?? event.yacht.name,
        registrationNo:
          this.readOptionalString(rawYacht.registrationNo) ??
          `REG-${event.yachtId.slice(0, 8).toUpperCase()}`,
        imo: this.readOptionalString(rawYacht.imo) ?? event.yacht.imoOptional ?? undefined,
        mmsi: this.readOptionalString(rawYacht.mmsi) ?? undefined,
        callsign: this.readOptionalString(rawYacht.callsign) ?? undefined,
        yachtType: this.readYachtType(rawYacht.yachtType),
        homePort: this.readOptionalString(rawYacht.homePort) ?? 'No definido',
        flag: this.readOptionalString(rawYacht.flag) ?? event.yacht.flag,
      },
      chronology: {
        occurredAt: event.occurredAt.toISOString(),
        loggedAt: event.loggedAt.toISOString(),
        timezone: event.timezone,
        watchPeriod: this.readWatchPeriod(event.watchPeriod),
        sequenceNo: event.sequenceNo,
      },
      classification: {
        eventType: event.eventType,
        eventSubType: event.eventSubType as LogbookV2EventPayload['classification']['eventSubType'],
        category: event.category as LogbookV2EventPayload['classification']['category'],
        severity: event.severity,
        tags: this.readStringArray(rawClassification.tags),
      },
      workflow: {
        status: event.workflowStatus,
        approvalRequired: event.approvalRequired,
        approvalLevel: this.readApprovalLevel(event.approvalLevel ?? rawWorkflow.approvalLevel),
        statusReason: event.statusReason ?? this.readOptionalString(rawWorkflow.statusReason) ?? undefined,
      },
      responsibility: {
        reportedByUserId: event.reportedByUserId,
        reportedByName: event.reportedByName,
        reportedByRole: event.reportedByRole ?? undefined,
        assignedToUserId: event.assignedToUserId ?? null,
        approvedByUserId: event.approvedByUserId ?? null,
        acknowledgedByUserIds: event.acknowledgedByUserIds ?? [],
      },
      details: {
        title: event.title,
        description: event.description,
        engineReadings: this.readEngineReadings(rawDetails.engineReadings),
        maintenanceRef: this.readObject(rawDetails.maintenanceRef),
        incidentRef: this.readObject(rawDetails.incidentRef),
        serviceRef: this.readObject(rawDetails.serviceRef),
      },
      evidence: sortedEvidence.map((evidence) => ({
        evidenceId: evidence.id,
        fileUrl: evidence.fileUrl,
        fileName: evidence.fileName,
        mimeType: evidence.mimeType as EvidenceItem['mimeType'],
        checksumSha256: evidence.checksumSha256 ?? undefined,
        uploadedAt: evidence.uploadedAt.toISOString(),
        uploadedByUserId: evidence.uploadedByUserId,
        caption: evidence.caption ?? undefined,
      })),
      audit: {
        createdAt: this.readOptionalString(rawAudit.createdAt) ?? event.createdAt.toISOString(),
        createdByUserId: this.readOptionalString(rawAudit.createdByUserId) ?? fallbackCreatedBy,
        updatedAt: this.readOptionalString(rawAudit.updatedAt) ?? event.updatedAt.toISOString(),
        updatedByUserId: this.readOptionalString(rawAudit.updatedByUserId) ?? fallbackUpdatedBy,
        lastChangeReason:
          this.readOptionalString(rawAudit.lastChangeReason) ?? event.statusReason ?? undefined,
        changeHistory:
          sortedAudit.length > 0
            ? sortedAudit.map((change) => ({
                changedAt: change.changedAt.toISOString(),
                changedByUserId: change.changedByUserId,
                changeType: change.changeType as LogbookV2EventPayload['audit']['changeHistory'][number]['changeType'],
                changedFields: change.changedFields,
                reason: change.reason,
              }))
            : [
                {
                  changedAt: event.createdAt.toISOString(),
                  changedByUserId: fallbackCreatedBy,
                  changeType: 'create',
                  changedFields: ['details', 'classification', 'workflow'],
                  reason: 'Evento migrado a formato V2',
                },
              ],
      },
    };

    const hasLocationFromColumns = event.latitude !== null && event.longitude !== null;
    if (hasLocationFromColumns) {
      eventPayload.location = {
        source:
          (event.locationSource as LocationSource) ??
          'manual',
        latitude: event.latitude as number,
        longitude: event.longitude as number,
        portName: event.portName ?? undefined,
        area: event.area ?? undefined,
        countryCode: event.countryCode ?? undefined,
        accuracyMeters: event.accuracyMeters ?? undefined,
      };
    } else {
      const fallbackLat = this.readOptionalNumber(rawLocation.latitude);
      const fallbackLon = this.readOptionalNumber(rawLocation.longitude);
      if (fallbackLat !== null && fallbackLon !== null) {
        eventPayload.location = {
          source: this.readLocationSource(rawLocation.source),
          latitude: fallbackLat,
          longitude: fallbackLon,
          portName: this.readOptionalString(rawLocation.portName) ?? undefined,
          area: this.readOptionalString(rawLocation.area) ?? undefined,
          countryCode: this.readOptionalString(rawLocation.countryCode) ?? undefined,
          accuracyMeters: this.readOptionalNumber(rawLocation.accuracyMeters) ?? undefined,
        };
      }
    }

    return eventPayload;
  }

  private mapToLegacyStatus(status: WorkflowStatus): LogBookStatus {
    if (status === 'draft') return LogBookStatus.Draft;
    if (status === 'submitted') return LogBookStatus.Submitted;
    if (status === 'approved') return LogBookStatus.Submitted;
    if (status === 'closed') return LogBookStatus.Locked;
    if (status === 'rejected') return LogBookStatus.Corrected;
    return LogBookStatus.Corrected;
  }

  private mapLegacyToV2Status(status: LogBookStatus): WorkflowStatus {
    if (status === LogBookStatus.Draft) return 'draft';
    if (status === LogBookStatus.Submitted) return 'submitted';
    if (status === LogBookStatus.Locked) return 'closed';
    return 'submitted';
  }

  private toLegacyWatchPeriod(period?: WatchPeriod): string {
    if (!period || period === 'custom') return '08-12';
    return `${period.slice(0, 2)}-${period.slice(5, 7)}`;
  }

  private fromLegacyWatchPeriod(period: string): WatchPeriod {
    const normalized = period.trim();
    if (normalized === '00-04') return '0000-0400';
    if (normalized === '04-08') return '0400-0800';
    if (normalized === '08-12') return '0800-1200';
    if (normalized === '12-16') return '1200-1600';
    if (normalized === '16-20') return '1600-2000';
    if (normalized === '20-24') return '2000-0000';
    return 'custom';
  }

  private toLegacyObservationCategory(payload: LogbookV2EventPayload): string {
    const type = payload.classification.eventType;
    if (type === 'maintenance') return 'Maintenance';
    if (type === 'incident') return 'Safety';
    if (type === 'service') return 'Service';
    if (type === 'entry' || type === 'exit') return 'Navigation';
    return 'General';
  }

  private toLegacyEntryDate(occurredAt: string): Date {
    const source = new Date(occurredAt);
    if (Number.isNaN(source.getTime())) {
      throw new BadRequestException('chronology.occurredAt is invalid');
    }
    return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  }

  private parseLegacyVirtualEventId(eventId: string): { entryId: string; sequenceNo: number } | null {
    const match = /^legacy:([^:]+):(\d+)$/.exec(eventId);
    if (!match) return null;
    return {
      entryId: match[1],
      sequenceNo: Number(match[2]),
    };
  }

  private startOfDayUtc(date: string): Date {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('date must be a valid date');
    }
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }

  private endOfDayUtc(startOfDay: Date): Date {
    const end = new Date(startOfDay);
    end.setUTCHours(23, 59, 59, 999);
    return end;
  }

  private assertYachtScope(yachtId: string, yachtIds: string[], role?: string) {
    if (!yachtId) {
      throw new BadRequestException('yachtId is required');
    }
    if (this.normalizeRole(role) === 'SystemAdmin') {
      return;
    }
    if (!yachtIds.includes(yachtId)) {
      throw new ForbiddenException('Yacht scope violation');
    }
  }

  private assertV2Role(role?: string) {
    const normalized = this.normalizeRole(role);
    if (!['Captain', 'Chief Engineer', 'Admin', 'SystemAdmin'].includes(normalized)) {
      throw new ForbiddenException('Role not allowed for logbook v2');
    }
  }

  private isCaptainOrAdmin(role?: string): boolean {
    const normalized = this.normalizeRole(role);
    return normalized === 'Captain' || normalized === 'Admin' || normalized === 'SystemAdmin';
  }

  private normalizeRole(role?: string | null): string {
    if (!role) return '';
    const normalized = role.trim();
    if (normalized === 'Engineer') return 'Chief Engineer';
    if (normalized === 'Steward') return 'Crew Member';
    return normalized;
  }

  private isEnabled(key: string, defaultValue: boolean): boolean {
    const raw = this.configService.get<string | boolean | undefined>(key);
    if (raw === undefined || raw === null) return defaultValue;
    if (typeof raw === 'boolean') return raw;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  private formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
    if (!errors || errors.length === 0) return 'Invalid logbook v2 payload';
    return errors
      .map((error) => {
        const path = error.instancePath || error.schemaPath || 'payload';
        return `${path} ${error.message ?? 'invalid'}`.trim();
      })
      .join('; ');
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private readObject(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private readEngineReadings(value: unknown): NonNullable<LogbookV2EventPayload['details']['engineReadings']> {
    if (!Array.isArray(value)) return [];

    const rows: NonNullable<LogbookV2EventPayload['details']['engineReadings']> = [];
    for (const entry of value) {
      const item = this.asObject(entry);
      const engineId = this.readOptionalString(item.engineId);
      const engineName = this.readOptionalString(item.engineName);
      const hours = this.readOptionalNumber(item.hours);

      if (!engineId || !engineName || hours === null) {
        continue;
      }

      const row: NonNullable<LogbookV2EventPayload['details']['engineReadings']>[number] = {
        engineId,
        engineName,
        hours,
      };

      const rpm = this.readOptionalNumber(item.rpm);
      if (rpm !== null) {
        row.rpm = rpm;
      }

      const temperatureC = this.readOptionalNumber(item.temperatureC);
      if (temperatureC !== null) {
        row.temperatureC = temperatureC;
      }

      rows.push(row);
    }

    return rows;
  }

  private readOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readOptionalNumber(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    return value;
  }

  private readLocationSource(value: unknown): LocationSource {
    if (value === 'gps' || value === 'manual' || value === 'port_reference') {
      return value;
    }
    return 'manual';
  }

  private readWatchPeriod(value: string | null): WatchPeriod {
    if (
      value === '0000-0400' ||
      value === '0400-0800' ||
      value === '0800-1200' ||
      value === '1200-1600' ||
      value === '1600-2000' ||
      value === '2000-0000' ||
      value === 'custom'
    ) {
      return value;
    }
    return 'custom';
  }

  private readApprovalLevel(value: unknown): LogbookV2EventPayload['workflow']['approvalLevel'] {
    if (
      value === 'none' ||
      value === 'captain' ||
      value === 'chief_engineer' ||
      value === 'management_office' ||
      value === 'system_admin'
    ) {
      return value;
    }
    return undefined;
  }

  private readYachtType(value: unknown): LogbookV2EventPayload['yacht']['yachtType'] {
    if (
      value === 'motor_yacht' ||
      value === 'sailing_yacht' ||
      value === 'catamaran' ||
      value === 'support_vessel' ||
      value === 'other'
    ) {
      return value;
    }
    return 'other';
  }

  private readLegacySource(
    value: unknown,
  ): LegacySource | undefined {
    if (value === 'json' || value === 'csv' || value === 'database' || value === 'manual') {
      return value;
    }
    return undefined;
  }
}
