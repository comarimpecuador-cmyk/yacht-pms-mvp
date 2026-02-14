import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { EmailProvider } from '../../notifications/channels/email/email.provider';
import { PushProvider } from '../../notifications/channels/push/push.provider';

type ProviderResult =
  | { status: 'sent' }
  | { status: 'skipped'; reason?: string }
  | { status: 'failed'; error: string };

type SeverityLevel = 'info' | 'warn' | 'critical';
type ChannelKind = 'in_app' | 'email' | 'push_future';

type ResolvedPreference = {
  timezone: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushFuture: boolean;
  windowStart: string;
  windowEnd: string;
  minSeverity: SeverityLevel;
  yachtsScope: string[];
};

type TestEmailScenario =
  | 'inventory_low_stock'
  | 'maintenance_due_this_week'
  | 'documents_renewal_due'
  | 'purchase_order_pending'
  | 'engines_service_due';

type ScenarioEmailRecipient = {
  email: string;
  name?: string;
};

type EmailScenarioDetails = {
  moduleLabel: string;
  type: string;
  severity: SeverityLevel;
  title: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
  dueText: string;
  nextSteps: string[];
  highlights: Array<{ label: string; value: string }>;
};

type ResponsibleContact = {
  userId?: string;
  fullName: string;
  email?: string;
  role: string;
  source: 'manual' | 'assignment' | 'fallback';
};

function normalizeResult(result: any): ProviderResult {
  if (!result || typeof result !== 'object') return { status: 'failed', error: 'provider_returned_invalid_result' };

  const status = result.status;
  if (status === 'sent') return { status: 'sent' };
  if (status === 'failed') return { status: 'failed', error: String(result.error ?? 'unknown_error') };
  if (status === 'skipped') return { status: 'skipped', reason: result.reason ? String(result.reason) : undefined };

  // fallback seguro
  return { status: 'failed', error: `unknown_status:${String(status)}` };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailProvider: EmailProvider,
    private readonly pushProvider: PushProvider,
  ) {}

  private isPrivilegedRole(role: string) {
    return ['SystemAdmin', 'Admin', 'Management/Office'].includes(role);
  }

  private assertUserAccess(actorId: string, actorRole: string, targetUserId: string) {
    if (actorId === targetUserId) return;
    if (this.isPrivilegedRole(actorRole)) return;
    throw new ForbiddenException('Forbidden user scope');
  }

  async createInApp(input: {
    userId: string;
    yachtId?: string;
    type: string;
    dedupeKey: string;
    payload: Prisma.JsonObject;
  }) {
    const normalizedPayload = this.normalizeInAppPayload(input.type, input.payload, input.yachtId);

    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'in_app',
        type: input.type,
        payload: normalizedPayload,
        status: 'sent',
        dedupeKey: input.dedupeKey,
        sentAt: new Date(),
      },
    });
  }

  async maybeSendInApp(input: {
    userId: string;
    yachtId?: string;
    type: string;
    dedupeKey: string;
    severity: SeverityLevel;
    payload: Prisma.JsonObject;
    dedupeWindowHours?: number;
  }) {
    const preference = await this.resolvePreference(input.userId);
    const blockedReason = this.getChannelBlockReason(preference, input.severity, input.yachtId, 'in_app');

    if (blockedReason) {
      return this.createSkippedEvent({
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'in_app',
        type: input.type,
        dedupeKey: input.dedupeKey,
        payload: input.payload,
        reason: blockedReason,
      });
    }

    const dedupeWindowHours = Math.max(1, Math.min(input.dedupeWindowHours ?? 24, 24 * 7));
    const since = new Date(Date.now() - dedupeWindowHours * 60 * 60 * 1000);

    const existing = await this.prisma.notificationEvent.findFirst({
      where: {
        userId: input.userId,
        channel: 'in_app',
        dedupeKey: input.dedupeKey,
        createdAt: { gte: since },
        status: { in: ['sent', 'read'] },
      },
      select: { id: true },
    });

    if (existing) {
      return { status: 'skipped' as const, reason: 'dedupe_window' };
    }

    return this.createInApp({
      userId: input.userId,
      yachtId: input.yachtId,
      type: input.type,
      dedupeKey: input.dedupeKey,
      payload: input.payload,
    });
  }

  async maybeSendEmail(input: {
    userId: string;
    yachtId?: string;
    type: string;
    dedupeKey: string;
    severity: 'info' | 'warn' | 'critical';
    payload: Prisma.JsonObject;
  }) {
    const preference = await this.resolvePreference(input.userId);
    const blockedReason = this.getChannelBlockReason(preference, input.severity, input.yachtId, 'email');

    if (blockedReason) {
      return this.createSkippedEvent({
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'email',
        type: input.type,
        dedupeKey: input.dedupeKey,
        payload: input.payload,
        reason: blockedReason,
      });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const existing = await this.prisma.notificationEvent.findFirst({
      where: {
        userId: input.userId,
        channel: 'email',
        dedupeKey: input.dedupeKey,
        createdAt: { gte: since },
        status: 'sent',
      },
    });

    if (existing) {
      return { status: 'skipped' as const, reason: 'dedupe_window' };
    }

    const raw = await this.emailProvider.send({
      userId: input.userId,
      yachtId: input.yachtId,
      type: input.type,
      dedupeKey: input.dedupeKey,
      severity: input.severity,
      payload: input.payload,
    });

    const result = normalizeResult(raw);

    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'email',
        type: input.type,
        payload: input.payload,
        status: result.status === 'failed' ? 'failed' : result.status === 'sent' ? 'sent' : 'skipped',
        dedupeKey: input.dedupeKey,
        sentAt: result.status === 'sent' ? new Date() : null,
        error:
          result.status === 'failed'
            ? result.error
            : result.status === 'skipped'
              ? result.reason ?? null
              : null,
      },
    });
  }

  async maybeSendPushFuture(input: {
    userId: string;
    yachtId?: string;
    type: string;
    dedupeKey: string;
    severity: 'info' | 'warn' | 'critical';
    payload: Prisma.JsonObject;
  }) {
    const preference = await this.resolvePreference(input.userId);
    const blockedReason = this.getChannelBlockReason(preference, input.severity, input.yachtId, 'push_future');

    if (blockedReason) {
      return this.createSkippedEvent({
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'push_future',
        type: input.type,
        dedupeKey: input.dedupeKey,
        payload: input.payload,
        reason: blockedReason,
      });
    }

    const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const existing = await this.prisma.notificationEvent.findFirst({
      where: {
        userId: input.userId,
        channel: 'push_future',
        dedupeKey: input.dedupeKey,
        createdAt: { gte: since },
        status: 'sent',
      },
      select: { id: true },
    });

    if (existing) {
      return { status: 'skipped' as const, reason: 'dedupe_window' };
    }

    const raw = await this.pushProvider.send({ ...input });
    const result = normalizeResult(raw);

    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'push_future',
        type: input.type,
        payload: input.payload,
        status: result.status === 'failed' ? 'failed' : result.status === 'sent' ? 'sent' : 'skipped',
        dedupeKey: input.dedupeKey,
        sentAt: result.status === 'sent' ? new Date() : null,
        error:
          result.status === 'failed'
            ? result.error
            : result.status === 'skipped'
              ? result.reason ?? null
              : null,
      },
    });
  }

  async sendScenarioEmails(input: {
    toEmail?: string;
    toName?: string;
    recipients?: ScenarioEmailRecipient[];
    yachtId?: string;
    scenarios?: TestEmailScenario[];
    dueAt?: string;
    responsibleUserId?: string;
    responsibleName?: string;
    responsibleEmail?: string;
    responsibleRole?: string;
  }) {
    const recipients = this.normalizeScenarioRecipients(input.toEmail, input.toName, input.recipients);
    if (recipients.length === 0) {
      throw new BadRequestException('Se requiere al menos un destinatario de correo');
    }

    const yacht = input.yachtId
      ? await this.prisma.yacht.findUnique({
          where: { id: input.yachtId },
          select: { id: true, name: true, flag: true },
        })
      : await this.prisma.yacht.findFirst({
          where: { isActive: true },
          select: { id: true, name: true, flag: true },
          orderBy: { createdAt: 'asc' },
        });

    const yachtName = yacht?.name ?? 'Yate no definido';
    const yachtId = yacht?.id;
    const baseUrl = process.env.API_PUBLIC_BASE_URL?.trim() || 'https://yacht.reinotierra.com';
    const scenarios =
      input.scenarios && input.scenarios.length > 0
        ? input.scenarios
        : ([
            'inventory_low_stock',
            'maintenance_due_this_week',
            'documents_renewal_due',
            'purchase_order_pending',
          ] as TestEmailScenario[]);

    const results: Array<{
      recipient: ScenarioEmailRecipient;
      sent: number;
      failed: number;
      skipped: number;
      scenarios: Array<{
        scenario: TestEmailScenario;
        status: 'sent' | 'failed' | 'skipped';
        eventId: string | null;
        responsible?: { fullName: string; role: string; email?: string };
        error?: string;
      }>;
    }> = [];

    for (const recipient of recipients) {
      const scenarioResults: Array<{
        scenario: TestEmailScenario;
        status: 'sent' | 'failed' | 'skipped';
        eventId: string | null;
        responsible?: { fullName: string; role: string; email?: string };
        error?: string;
      }> = [];

      for (const scenario of scenarios) {
        const responsible = await this.resolveScenarioResponsible({
          scenario,
          yachtId,
          responsibleUserId: input.responsibleUserId,
          responsibleName: input.responsibleName,
          responsibleEmail: input.responsibleEmail,
          responsibleRole: input.responsibleRole,
        });

        const baseDetails = this.buildScenarioDetails(scenario, baseUrl, yachtId, yachtName);
        const withResponsible = this.attachResponsibleToScenario(baseDetails, responsible);
        const dueInfo = this.resolveDueInfo(withResponsible.dueText, input.dueAt);
        const details: EmailScenarioDetails = {
          ...withResponsible,
          dueText: dueInfo.dueText,
          highlights: dueInfo.remainingLabel
            ? [{ label: 'Tiempo restante', value: dueInfo.remainingLabel }, ...withResponsible.highlights]
            : withResponsible.highlights,
        };

        const htmlContent = this.buildScenarioEmailHtml({
          yachtName,
          yachtFlag: yacht?.flag ?? 'N/A',
          recipientName: recipient.name,
          details,
          responsible,
        });

        const payload: Prisma.JsonObject = {
          title: details.title,
          message: details.message,
          htmlContent,
          module: details.moduleLabel,
          scenario,
          yachtName,
          yachtId: yachtId ?? null,
          dueText: details.dueText,
          dueAt: dueInfo.dueAtIso ?? null,
          remainingTime: dueInfo.remainingLabel ?? null,
          responsibleName: responsible?.fullName ?? null,
          responsibleEmail: responsible?.email ?? null,
          responsibleRole: responsible?.role ?? null,
          destinationEmail: recipient.email,
          destinationName: recipient.name ?? null,
          nextSteps: details.nextSteps,
          highlights: details.highlights.map((item) => `${item.label}: ${item.value}`),
        };

        const providerResult = normalizeResult(
          await this.emailProvider.sendDirect({
            toEmail: recipient.email,
            toName: recipient.name,
            type: details.type,
            payload,
          }),
        );

        const event = await this.prisma.notificationEvent.create({
          data: {
            userId: null,
            yachtId: yachtId ?? null,
            channel: 'email',
            type: details.type,
            payload,
            status:
              providerResult.status === 'failed'
                ? 'failed'
                : providerResult.status === 'sent'
                  ? 'sent'
                  : 'skipped',
            dedupeKey: `scenario-email:${scenario}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
            sentAt: providerResult.status === 'sent' ? new Date() : null,
            error:
              providerResult.status === 'failed'
                ? providerResult.error
                : providerResult.status === 'skipped'
                  ? providerResult.reason ?? null
                  : null,
          },
        });

        scenarioResults.push({
          scenario,
          status: providerResult.status,
          eventId: event.id,
          responsible: responsible
            ? {
                fullName: responsible.fullName,
                role: responsible.role,
                email: responsible.email,
              }
            : undefined,
          error:
            providerResult.status === 'failed'
              ? providerResult.error
              : providerResult.status === 'skipped'
                ? providerResult.reason
                : undefined,
        });
      }

      results.push({
        recipient,
        sent: scenarioResults.filter((item) => item.status === 'sent').length,
        failed: scenarioResults.filter((item) => item.status === 'failed').length,
        skipped: scenarioResults.filter((item) => item.status === 'skipped').length,
        scenarios: scenarioResults,
      });
    }

    return {
      recipients,
      yacht: yacht ? { id: yacht.id, name: yacht.name, flag: yacht.flag } : null,
      sent: results.reduce((sum, item) => sum + item.sent, 0),
      failed: results.reduce((sum, item) => sum + item.failed, 0),
      skipped: results.reduce((sum, item) => sum + item.skipped, 0),
      results,
    };
  }

  async sendScenarioTestEmails(input: {
    toEmail?: string;
    toName?: string;
    recipients?: ScenarioEmailRecipient[];
    yachtId?: string;
    scenarios?: TestEmailScenario[];
    dueAt?: string;
    responsibleUserId?: string;
    responsibleName?: string;
    responsibleEmail?: string;
    responsibleRole?: string;
  }) {
    return this.sendScenarioEmails(input);
  }

  async listEmailRecipients(yachtId?: string) {
    if (!yachtId) {
      const users = await this.prisma.user.findMany({
        where: { isActive: true },
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: { select: { name: true } },
        },
      });

      return users.map((user) => ({
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role?.name ?? 'Unknown',
      }));
    }

    const accesses = await this.prisma.userYachtAccess.findMany({
      where: {
        yachtId,
        revokedAt: null,
        user: { isActive: true },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: { select: { name: true } },
          },
        },
      },
    });

    const unique = new Map<string, { userId: string; fullName: string; email: string; role: string }>();
    for (const access of accesses) {
      if (!access.user) continue;
      if (!unique.has(access.user.id)) {
        unique.set(access.user.id, {
          userId: access.user.id,
          fullName: access.user.fullName,
          email: access.user.email,
          role: access.roleNameOverride || access.user.role?.name || 'Unknown',
        });
      }
    }

    return Array.from(unique.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async listEmailLogs(input?: {
    limit?: number;
    status?: string;
    yachtId?: string;
    recipient?: string;
  }) {
    const safeLimit = Number.isFinite(input?.limit)
      ? Math.min(Math.max(Number(input?.limit), 1), 200)
      : 40;

    const normalizedStatus = input?.status?.trim().toLowerCase();
    const allowedStatuses = new Set(['sent', 'failed', 'skipped', 'read']);
    if (normalizedStatus && !allowedStatuses.has(normalizedStatus)) {
      throw new BadRequestException('Estado de correo invalido');
    }

    const recipientFilter = input?.recipient?.trim().toLowerCase() ?? '';

    const rows = await this.prisma.notificationEvent.findMany({
      where: {
        channel: 'email',
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
        ...(input?.yachtId ? { yachtId: input.yachtId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(safeLimit * 4, safeLimit), 500),
      include: {
        yacht: {
          select: { id: true, name: true, flag: true },
        },
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    const mapped = rows.map((row) => {
      const payload = this.asRecord(row.payload);
      const highlightsValue = payload.highlights;
      const highlights = Array.isArray(highlightsValue)
        ? highlightsValue
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .slice(0, 15)
        : [];

      const recipientEmail =
        this.pickText(payload, ['destinationEmail', 'toEmail', 'recipientEmail', 'email']) ??
        row.user?.email ??
        null;
      const recipientName =
        this.pickText(payload, ['destinationName', 'toName', 'recipientName']) ??
        row.user?.fullName ??
        null;
      const subject = this.pickText(payload, ['subject', 'title']) ?? null;
      const message = this.pickText(payload, ['message', 'description', 'detail']) ?? null;
      const moduleLabel = this.pickText(payload, ['module']) ?? this.resolveModuleLabelFromType(row.type);
      const dueText = this.pickText(payload, ['dueText']) ?? null;
      const responsibleName = this.pickText(payload, ['responsibleName']) ?? null;
      const responsibleEmail = this.pickText(payload, ['responsibleEmail']) ?? null;
      const responsibleRole = this.pickText(payload, ['responsibleRole']) ?? null;
      const htmlContent = this.pickText(payload, ['htmlContent', 'html']) ?? null;
      const plainContent = this.pickText(payload, ['content', 'text']) ?? null;

      return {
        id: row.id,
        channel: row.channel,
        type: row.type,
        status: row.status,
        statusLabel: this.mapEmailStatusLabel(row.status),
        createdAt: row.createdAt,
        sentAt: row.sentAt,
        error: row.error,
        yacht: row.yacht
          ? {
              id: row.yacht.id,
              name: row.yacht.name,
              flag: row.yacht.flag,
            }
          : null,
        recipient: {
          email: recipientEmail,
          name: recipientName,
        },
        subject,
        message,
        moduleLabel,
        dueText,
        responsible: {
          name: responsibleName,
          email: responsibleEmail,
          role: responsibleRole,
        },
        highlights,
        content: {
          html: htmlContent,
          text: plainContent,
          preview: this.buildEmailContentPreview(message, htmlContent, plainContent),
        },
      };
    });

    const filtered = recipientFilter
      ? mapped.filter((item) => {
          const email = item.recipient.email?.toLowerCase() ?? '';
          const name = item.recipient.name?.toLowerCase() ?? '';
          return email.includes(recipientFilter) || name.includes(recipientFilter);
        })
      : mapped;

    return filtered.slice(0, safeLimit);
  }

  async listInApp(userId: string) {
    const rows = await this.prisma.notificationEvent.findMany({
      where: { userId, channel: 'in_app' },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.withPresentation(row));
  }

  async listInAppForActor(actorId: string, actorRole: string, targetUserId: string, limit = 20) {
    this.assertUserAccess(actorId, actorRole, targetUserId);

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 20;
    const rows = await this.prisma.notificationEvent.findMany({
      where: { userId: targetUserId, channel: 'in_app' },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });

    return rows.map((row) => this.withPresentation(row));
  }

  async markRead(notificationId: string) {
    return this.prisma.notificationEvent.update({
      where: { id: notificationId },
      data: { status: 'read', readAt: new Date() },
    });
  }

  async markReadForActor(notificationId: string, actorId: string, actorRole: string) {
    const existing = await this.prisma.notificationEvent.findUnique({
      where: { id: notificationId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }
    if (existing.userId && existing.userId !== actorId && !this.isPrivilegedRole(actorRole)) {
      throw new ForbiddenException('Forbidden notification scope');
    }

    return this.markRead(notificationId);
  }

  async getPreference(userId: string) {
    return this.prisma.notificationPreference.findUnique({ where: { userId } });
  }

  async getPreferenceForActor(actorId: string, actorRole: string, targetUserId: string) {
    this.assertUserAccess(actorId, actorRole, targetUserId);
    return this.getPreference(targetUserId);
  }

  async upsertPreference(
    userId: string,
    input: {
      timezone: string;
      inAppEnabled: boolean;
      emailEnabled: boolean;
      pushFuture: boolean;
      windowStart: string;
      windowEnd: string;
      minSeverity: 'info' | 'warn' | 'critical';
      yachtsScope: string[];
    },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    });
  }

  async upsertPreferenceForActor(
    actorId: string,
    actorRole: string,
    targetUserId: string,
    input: {
      timezone: string;
      inAppEnabled: boolean;
      emailEnabled: boolean;
      pushFuture: boolean;
      windowStart: string;
      windowEnd: string;
      minSeverity: 'info' | 'warn' | 'critical';
      yachtsScope: string[];
    },
  ) {
    this.assertUserAccess(actorId, actorRole, targetUserId);
    return this.upsertPreference(targetUserId, input);
  }

  private withPresentation(row: NotificationEvent) {
    return {
      ...row,
      payload: this.normalizeInAppPayload(row.type, row.payload, row.yachtId ?? undefined),
    };
  }

  private normalizeInAppPayload(
    type: string,
    payload: Prisma.JsonValue,
    yachtId?: string,
  ): Prisma.JsonObject {
    const data = this.asRecord(payload);
    const defaults = this.buildPresentation(type, data, yachtId);

    const title = this.pickText(data, ['title']) ?? defaults.title;
    const message =
      this.pickText(data, ['message', 'detail', 'statusText']) ?? defaults.message;
    const description =
      this.pickText(data, ['description']) ?? defaults.description ?? message;

    const merged: Prisma.JsonObject = {
      ...data,
      title,
      message,
      description,
    };

    if (!this.pickText(data, ['module']) && defaults.module) {
      merged.module = defaults.module;
    }

    if (!this.pickText(data, ['actionUrl']) && defaults.actionUrl) {
      merged.actionUrl = defaults.actionUrl;
    }

    return merged;
  }

  private buildPresentation(
    type: string,
    payload: Record<string, unknown>,
    yachtId?: string,
  ): { title: string; message: string; description?: string; module?: string; actionUrl?: string } {
    const module = type.split('.')[0] || 'sistema';
    const taskTitle = this.pickText(payload, ['title']) ?? 'tarea';
    const docType = this.pickText(payload, ['docType']) ?? 'documento';
    const daysLeft = this.pickNumber(payload, ['daysLeft']);
    const leaveType = this.pickText(payload, ['leaveType']) ?? 'solicitud';
    const reason = this.pickText(payload, ['reason']);
    const period = this.pickText(payload, ['period']);
    const status = this.pickText(payload, ['status']);
    const eventType = this.pickText(payload, ['eventType']);
    const eventTitle = this.pickText(payload, ['title']) ?? 'evento';
    const itemName = this.pickText(payload, ['itemName']) ?? 'item';
    const poNumber = this.pickText(payload, ['poNumber']) ?? 'PO';
    const vendorName = this.pickText(payload, ['vendorName']) ?? 'proveedor';

    if (type === 'documents.created') {
      return {
        module: 'documents',
        title: 'Documento creado',
        message: `Se registro un documento de tipo ${docType}.`,
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.updated') {
      return {
        module: 'documents',
        title: 'Documento actualizado',
        message: `Se actualizo un documento de tipo ${docType}${status ? ` (${status})` : ''}.`,
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.version_uploaded') {
      return {
        module: 'documents',
        title: 'Nueva version de documento',
        message: `Se subio una nueva version de ${docType}.`,
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.submitted') {
      return {
        module: 'documents',
        title: 'Documento enviado a aprobacion',
        message: reason
          ? `Documento pendiente de aprobacion. Motivo: ${reason}`
          : 'Documento pendiente de aprobacion.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.approved') {
      return {
        module: 'documents',
        title: 'Documento aprobado',
        message: reason ? `Aprobado. Motivo: ${reason}` : 'Documento aprobado y bloqueado.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.rejected') {
      return {
        module: 'documents',
        title: 'Documento rechazado',
        message: reason ? `Rechazado. Motivo: ${reason}` : 'Documento rechazado.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.archived') {
      return {
        module: 'documents',
        title: 'Documento archivado',
        message: `Se archivo un documento de tipo ${docType}.`,
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.deleted') {
      return {
        module: 'documents',
        title: 'Documento eliminado',
        message: 'Un documento fue eliminado del sistema.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.evidence_added') {
      return {
        module: 'documents',
        title: 'Evidencia agregada',
        message: 'Se adjunto una nueva evidencia a un documento.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.renewal_started') {
      return {
        module: 'documents',
        title: 'Renovacion iniciada',
        message: 'Se inicio el proceso de renovacion de un documento.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.renewal_completed') {
      return {
        module: 'documents',
        title: 'Renovacion completada',
        message: 'La renovacion del documento fue completada.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.renewal_updated') {
      return {
        module: 'documents',
        title: 'Renovacion actualizada',
        message: 'Se actualizo el estado de una renovacion documental.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.expiring') {
      return {
        module: 'documents',
        title: 'Documento por vencer',
        message:
          daysLeft !== null
            ? `Un documento vence en ${Math.max(daysLeft, 0)} dia(s).`
            : 'Un documento requiere atencion por vencimiento.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.expired') {
      return {
        module: 'documents',
        title: 'Documento vencido',
        message: 'Un documento ha vencido y requiere accion inmediata.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'logbook_v2.created') {
      const eventTypeLabel = this.mapLogbookEventTypeLabel(eventType);
      return {
        module: 'logbook',
        title: `${eventTypeLabel} registrado`,
        message: `Se registro "${eventTitle}" en la bitacora.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'logbook'),
      };
    }

    if (type === 'logbook_v2.updated') {
      const eventTypeLabel = this.mapLogbookEventTypeLabel(eventType);
      return {
        module: 'logbook',
        title: `${eventTypeLabel} modificado`,
        message: `Se actualizaron datos del evento "${eventTitle}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'logbook'),
      };
    }

    if (type === 'logbook_v2.status_updated') {
      const eventTypeLabel = this.mapLogbookEventTypeLabel(eventType);
      const statusLabel = this.mapLogbookStatusLabel(status);
      return {
        module: 'logbook',
        title: `${eventTypeLabel} actualizado`,
        message: statusLabel
          ? `El evento cambio a estado ${statusLabel}.`
          : `Se actualizo el estado de "${eventTitle}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'logbook'),
      };
    }

    if (type === 'inventory.item_created') {
      return {
        module: 'inventory',
        title: 'Item de inventario creado',
        message: `Se creo el item "${itemName}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.item_updated') {
      return {
        module: 'inventory',
        title: 'Item de inventario actualizado',
        message: `Se actualizaron los datos de "${itemName}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.movement_created') {
      const movementType = this.pickText(payload, ['type']) ?? 'movimiento';
      return {
        module: 'inventory',
        title: 'Movimiento de inventario',
        message: `Se registro ${movementType} para "${itemName}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.adjustment') {
      return {
        module: 'inventory',
        title: 'Ajuste de inventario',
        message: `Se realizo un ajuste manual para "${itemName}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.low_stock') {
      return {
        module: 'inventory',
        title: 'Stock bajo',
        message: `El item "${itemName}" alcanzo su stock minimo.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.stockout') {
      return {
        module: 'inventory',
        title: 'Stock agotado',
        message: `El item "${itemName}" quedo en cero.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'po.created') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} creada`,
        message: `Nueva orden de compra para ${vendorName}.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.updated') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} actualizada`,
        message: `Se actualizo la orden de compra (${vendorName}).`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.submitted') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} enviada`,
        message: 'Pendiente de aprobacion.',
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.approved') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} aprobada`,
        message: 'La orden fue aprobada y bloqueada para cambios.',
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.ordered') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} emitida`,
        message: `Compra enviada al proveedor ${vendorName}.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.received') {
      const receiptId = this.pickText(payload, ['receiptId']);
      return {
        module: 'purchase_orders',
        title: `Recepcion de ${poNumber}`,
        message: receiptId
          ? `Se registro recepcion (${receiptId}) para la orden.`
          : 'Se registro recepcion de mercaderia.',
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.cancelled') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} cancelada`,
        message: reason ? `Motivo: ${reason}` : 'La orden de compra fue cancelada.',
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'maintenance.task_assigned') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento asignado',
        message: `Se le asigno la tarea "${taskTitle}".`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_reassigned') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento reasignado',
        message: `La tarea "${taskTitle}" fue reasignada.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_submitted') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento enviado',
        message: `La tarea "${taskTitle}" esta pendiente de aprobacion.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_approved') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento aprobado',
        message: `La tarea "${taskTitle}" fue aprobada.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_rejected') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento rechazado',
        message: reason ? `Motivo: ${reason}` : `La tarea "${taskTitle}" fue rechazada.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_completed') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento completado',
        message: `La tarea "${taskTitle}" se completo correctamente.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.evidence_added') {
      return {
        module: 'maintenance',
        title: 'Evidencia de mantenimiento',
        message: `Se adjunto evidencia en la tarea "${taskTitle}".`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.overdue') {
      return {
        module: 'maintenance',
        title: 'Tarea vencida',
        message: `La tarea "${taskTitle}" esta fuera de plazo.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.due_soon') {
      return {
        module: 'maintenance',
        title: 'Tarea por vencer',
        message: `La tarea "${taskTitle}" vence pronto.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'hrm.schedule_created') {
      return {
        module: 'hrm',
        title: 'Horario actualizado',
        message: 'Se registro o actualizo su horario de trabajo.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.rest_non_compliance') {
      return {
        module: 'hrm',
        title: 'Incumplimiento de descanso',
        message: 'Se detecto una declaracion de descanso no conforme.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.leave_pending_approval') {
      return {
        module: 'hrm',
        title: 'Permiso pendiente de aprobacion',
        message: `Existe una solicitud de ${leaveType} pendiente de revision.`,
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.leave_approved') {
      return {
        module: 'hrm',
        title: 'Permiso aprobado',
        message: 'Su solicitud de permiso fue aprobada.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.leave_rejected') {
      return {
        module: 'hrm',
        title: 'Permiso rechazado',
        message: reason ? `Motivo: ${reason}` : 'Su solicitud de permiso fue rechazada.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.payroll_generated') {
      return {
        module: 'hrm',
        title: 'Nomina generada',
        message: period ? `Se genero la nomina del periodo ${period}.` : 'Se genero una nueva nomina.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.payroll_published') {
      return {
        module: 'hrm',
        title: 'Nomina publicada',
        message: period ? `La nomina del periodo ${period} fue publicada.` : 'La nomina fue publicada.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    return {
      module,
      title: `Notificacion de ${module.toUpperCase()}`,
      message: this.pickText(payload, ['reason']) ?? 'Se registro una actualizacion en la plataforma.',
    };
  }

  private buildYachtUrl(yachtId: string | undefined, section: string): string | undefined {
    if (!yachtId) return undefined;
    return `/yachts/${yachtId}/${section}`;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private pickText(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0 && trimmed.toLowerCase() !== 'undefined') {
          return trimmed;
        }
      }
    }
    return null;
  }

  private pickNumber(source: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }
    return null;
  }

  private mapLogbookEventTypeLabel(eventType: string | null): string {
    if (eventType === 'entry') return 'Ingreso';
    if (eventType === 'exit') return 'Egreso';
    if (eventType === 'service') return 'Servicio';
    if (eventType === 'maintenance') return 'Mantenimiento';
    if (eventType === 'incident') return 'Incidente';
    if (eventType === 'operation') return 'Operacion';
    return 'Evento';
  }

  private mapLogbookStatusLabel(status: string | null): string | null {
    if (status === 'draft') return 'Borrador';
    if (status === 'submitted') return 'Pendiente de revision';
    if (status === 'approved') return 'Aprobado';
    if (status === 'rejected') return 'Rechazado';
    if (status === 'closed') return 'Cerrado';
    if (status === 'cancelled') return 'Cancelado';
    return null;
  }

  private mapEmailStatusLabel(status: string): string {
    if (status === 'sent') return 'Enviado';
    if (status === 'failed') return 'Fallido';
    if (status === 'skipped') return 'Omitido';
    if (status === 'read') return 'Leido';
    return status;
  }

  private resolveModuleLabelFromType(type: string): string | null {
    if (type.startsWith('inventory.')) return 'Inventario';
    if (type.startsWith('maintenance.')) return 'Mantenimiento';
    if (type.startsWith('documents.')) return 'Documentos';
    if (type.startsWith('po.')) return 'Ordenes de compra';
    if (type.startsWith('logbook.')) return 'Bitacora';
    if (type.startsWith('logbook_v2.')) return 'Bitacora';
    if (type.startsWith('hrm.')) return 'RRHH';
    return null;
  }

  private buildEmailContentPreview(
    message: string | null,
    htmlContent: string | null,
    plainContent: string | null,
  ): string | null {
    if (message) return message;
    if (plainContent) return plainContent.slice(0, 600);
    if (!htmlContent) return null;

    const withoutTags = htmlContent
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return withoutTags ? withoutTags.slice(0, 600) : null;
  }

  private normalizeScenarioRecipients(
    toEmail?: string,
    toName?: string,
    recipients?: ScenarioEmailRecipient[],
  ): ScenarioEmailRecipient[] {
    const draft: ScenarioEmailRecipient[] = [];

    const normalizedSingleEmail = toEmail?.trim();
    if (normalizedSingleEmail) {
      draft.push({
        email: normalizedSingleEmail.toLowerCase(),
        name: toName?.trim() || undefined,
      });
    }

    if (Array.isArray(recipients)) {
      for (const recipient of recipients) {
        const email = recipient?.email?.trim().toLowerCase();
        if (!email) continue;
        draft.push({
          email,
          name: recipient.name?.trim() || undefined,
        });
      }
    }

    const unique = new Map<string, ScenarioEmailRecipient>();
    for (const recipient of draft) {
      if (!unique.has(recipient.email)) {
        unique.set(recipient.email, recipient);
      }
    }

    return Array.from(unique.values());
  }

  private buildScenarioDetails(
    scenario: TestEmailScenario,
    baseUrl: string,
    yachtId: string | undefined,
    yachtName: string,
  ): EmailScenarioDetails {
    const safeBaseUrl = baseUrl.replace(/\/+$/, '');
    const sectionPath = (section: string) =>
      yachtId ? `/yachts/${yachtId}/${section}` : '/dashboard';

    if (scenario === 'inventory_low_stock') {
      const productName = 'Filtro de aceite principal';
      const currentUnits = 2;
      const minUnits = 5;
      const suggestedOrderQty = 12;

      return {
        moduleLabel: 'Inventario',
        type: 'inventory.low_stock',
        severity: 'warn',
        title: `Stock bajo detectado en ${yachtName}`,
        message: `El producto "${productName}" tiene ${currentUnits} unidades disponibles (minimo configurado: ${minUnits}).`,
        actionLabel: 'Revisar inventario',
        actionUrl: `${safeBaseUrl}${sectionPath('inventory')}`,
        dueText: 'Atender hoy para evitar quiebre de stock.',
        nextSteps: [
          `Generar requisicion por ${suggestedOrderQty} unidades del producto.`,
          'Validar stock fisico en bodega (Sala de maquinas - Rack A2).',
          'Confirmar fecha de entrega con proveedor antes de cerrar jornada.',
        ],
        highlights: [
          { label: 'Producto', value: productName },
          { label: 'Unidades disponibles', value: `${currentUnits}` },
          { label: 'Minimo configurado', value: `${minUnits}` },
          { label: 'Ubicacion', value: 'Sala de maquinas - Rack A2' },
        ],
      };
    }

    if (scenario === 'maintenance_due_this_week') {
      const taskName = 'Revision del sistema de enfriamiento del motor principal';

      return {
        moduleLabel: 'Mantenimiento',
        type: 'maintenance.due_soon',
        severity: 'warn',
        title: `Mantenimiento programado esta semana - ${yachtName}`,
        message: `La tarea "${taskName}" vence esta semana y debe ejecutarse segun plan de mantenimiento.`,
        actionLabel: 'Ver mantenimiento',
        actionUrl: `${safeBaseUrl}${sectionPath('maintenance')}`,
        dueText: 'Vence en 3 dias.',
        nextSteps: [
          'Confirmar repuestos y herramientas requeridas.',
          'Asignar tecnico y bloquear ventana operativa en calendario.',
          'Registrar evidencia al completar la tarea.',
        ],
        highlights: [
          { label: 'Mantenimiento', value: taskName },
          { label: 'Prioridad', value: 'Alta' },
          { label: 'Frecuencia', value: 'Semanal' },
          { label: 'Vencimiento', value: 'Esta semana (3 dias)' },
        ],
      };
    }

    if (scenario === 'documents_renewal_due') {
      const documentName = 'Certificado de navegacion';

      return {
        moduleLabel: 'Documentos',
        type: 'documents.expiring',
        severity: 'critical',
        title: `Renovacion documental cercana - ${yachtName}`,
        message: `El documento "${documentName}" vence pronto y requiere iniciar la renovacion.`,
        actionLabel: 'Ir a documentos',
        actionUrl: `${safeBaseUrl}${sectionPath('documents')}`,
        dueText: 'Vence en 7 dias.',
        nextSteps: [
          'Iniciar renovacion y cargar formulario de solicitud.',
          'Adjuntar soporte actualizado y validar vigencia.',
          'Confirmar fecha de entrega con la autoridad maritima.',
        ],
        highlights: [
          { label: 'Documento', value: documentName },
          { label: 'Numero', value: 'NAV-EC-2026-014' },
          { label: 'Fecha de vencimiento', value: 'En 7 dias' },
          { label: 'Estado', value: 'Por vencer' },
          { label: 'Accion', value: 'Iniciar renovacion' },
        ],
      };
    }

    if (scenario === 'purchase_order_pending') {
      const orderNumber = 'PO-2026-0042';

      return {
        moduleLabel: 'Ordenes de compra',
        type: 'po.submitted',
        severity: 'info',
        title: `Orden de compra pendiente de aprobacion - ${yachtName}`,
        message: `La orden ${orderNumber} fue enviada y esta pendiente de aprobacion.`,
        actionLabel: 'Revisar ordenes',
        actionUrl: `${safeBaseUrl}${sectionPath('purchase-orders')}`,
        dueText: 'Pendiente de aprobacion desde hoy.',
        nextSteps: [
          'Revisar cotizacion y prioridad operativa de la orden.',
          'Aprobar o rechazar con observacion para compras.',
          'Notificar al solicitante una vez resuelta la orden.',
        ],
        highlights: [
          { label: 'Orden de compra', value: orderNumber },
          { label: 'Proveedor', value: 'Marine Parts Supply' },
          { label: 'Concepto', value: 'Repuestos de motor principal' },
          { label: 'Monto', value: 'USD 3,240' },
        ],
      };
    }

    const engineName = 'Motor principal #1';
    return {
      moduleLabel: 'Motores',
      type: 'maintenance.due_soon',
      severity: 'warn',
      title: `Revision de motores programada - ${yachtName}`,
      message: `Se recomienda ejecutar la revision preventiva de ${engineName} esta semana.`,
      actionLabel: 'Ir a motores',
      actionUrl: `${safeBaseUrl}${sectionPath('engines')}`,
      dueText: 'Recomendado dentro de los proximos 5 dias.',
      nextSteps: [
        'Programar revision preventiva del motor en ventana segura.',
        'Preparar checklist tecnico y repuestos criticos.',
        'Actualizar horas de motor y cerrar actividad en bitacora.',
      ],
      highlights: [
        { label: 'Motor', value: engineName },
        { label: 'Horas actuales', value: '1,248 h' },
        { label: 'Proximo servicio', value: '1,250 h' },
        { label: 'Ultima revision', value: 'Hace 28 dias' },
      ],
    };
  }

  private attachResponsibleToScenario(
    details: EmailScenarioDetails,
    _responsible: ResponsibleContact | null,
  ): EmailScenarioDetails {
    return details;
  }

  private async resolveScenarioResponsible(input: {
    scenario: TestEmailScenario;
    yachtId?: string;
    responsibleUserId?: string;
    responsibleName?: string;
    responsibleEmail?: string;
    responsibleRole?: string;
  }): Promise<ResponsibleContact | null> {
    if (input.responsibleUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: input.responsibleUserId },
        select: {
          id: true,
          fullName: true,
          email: true,
          isActive: true,
          role: { select: { name: true } },
        },
      });

      if (user?.isActive) {
        return {
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role?.name ?? input.responsibleRole ?? 'Responsable',
          source: 'manual',
        };
      }
    }

    if (input.responsibleName || input.responsibleEmail) {
      return {
        fullName: input.responsibleName?.trim() || 'Responsable',
        email: input.responsibleEmail?.trim() || undefined,
        role: input.responsibleRole?.trim() || 'Responsable',
        source: 'manual',
      };
    }

    const preferredRoles = this.getPreferredRolesForScenario(input.scenario);
    const candidate = await this.findResponsibleByRoles(preferredRoles, input.yachtId);
    if (candidate) return candidate;

    return null;
  }

  private getPreferredRolesForScenario(scenario: TestEmailScenario): string[] {
    if (scenario === 'inventory_low_stock') {
      return ['Chief Engineer', 'Captain', 'Management/Office', 'Admin'];
    }
    if (scenario === 'maintenance_due_this_week' || scenario === 'engines_service_due') {
      return ['Chief Engineer', 'Captain', 'Management/Office'];
    }
    if (scenario === 'documents_renewal_due') {
      return ['Captain', 'Management/Office', 'Admin'];
    }
    if (scenario === 'purchase_order_pending') {
      return ['Management/Office', 'Captain', 'Admin'];
    }
    return ['Captain', 'Management/Office', 'Admin'];
  }

  private async findResponsibleByRoles(
    roles: string[],
    yachtId?: string,
  ): Promise<ResponsibleContact | null> {
    if (roles.length === 0) return null;

    if (yachtId) {
      for (const roleName of roles) {
        const access = await this.prisma.userYachtAccess.findFirst({
          where: {
            yachtId,
            revokedAt: null,
            user: { isActive: true },
            OR: [
              { roleNameOverride: roleName },
              { user: { role: { name: roleName } } },
            ],
          },
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                role: { select: { name: true } },
              },
            },
          },
        });

        if (access?.user) {
          return {
            userId: access.user.id,
            fullName: access.user.fullName,
            email: access.user.email,
            role: access.roleNameOverride || access.user.role?.name || roleName,
            source: 'assignment',
          };
        }
      }
    }

    for (const roleName of roles) {
      const user = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          role: { name: roleName },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: { select: { name: true } },
        },
      });

      if (user) {
        return {
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role?.name || roleName,
          source: 'fallback',
        };
      }
    }

    return null;
  }

  private resolveDueInfo(defaultDueText: string, dueAtRaw?: string): {
    dueText: string;
    dueAtIso?: string;
    remainingLabel?: string;
  } {
    if (!dueAtRaw) {
      return { dueText: defaultDueText };
    }

    const dueDate = new Date(dueAtRaw);
    if (Number.isNaN(dueDate.getTime())) {
      return { dueText: defaultDueText };
    }

    const now = new Date();
    const diffMs = dueDate.getTime() - now.getTime();
    const absMs = Math.abs(diffMs);
    const minutes = Math.ceil(absMs / (60 * 1000));
    const hours = Math.ceil(absMs / (60 * 60 * 1000));
    const days = Math.ceil(absMs / (24 * 60 * 60 * 1000));

    let remainingLabel: string;
    if (diffMs >= 0) {
      if (minutes < 60) {
        remainingLabel = `Faltan ${minutes} minuto(s)`;
      } else if (hours < 24) {
        remainingLabel = `Faltan ${hours} hora(s)`;
      } else {
        remainingLabel = `Faltan ${days} dia(s)`;
      }
    } else if (minutes < 60) {
      remainingLabel = `Vencido hace ${minutes} minuto(s)`;
    } else if (hours < 24) {
      remainingLabel = `Vencido hace ${hours} hora(s)`;
    } else {
      remainingLabel = `Vencido hace ${days} dia(s)`;
    }

    return {
      dueText: `${remainingLabel} - ${this.formatDateLabel(diffMs >= 0 ? 'Vence' : 'Vencio', dueDate)}`,
      dueAtIso: dueDate.toISOString(),
      remainingLabel,
    };
  }

  private formatDateLabel(prefix: string, date: Date) {
    const formatted = new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
    return `${prefix} ${formatted}`;
  }

  private buildScenarioEmailHtml(input: {
    yachtName: string;
    yachtFlag: string;
    recipientName?: string;
    details: EmailScenarioDetails;
    responsible?: ResponsibleContact | null;
  }) {
    const severityColor =
      input.details.severity === 'critical'
        ? '#ef4444'
        : input.details.severity === 'warn'
          ? '#f59e0b'
          : '#38bdf8';
    const severityLabel =
      input.details.severity === 'critical'
        ? 'Critica'
        : input.details.severity === 'warn'
          ? 'Atencion'
          : 'Informativa';

    const highlightsHtml = input.details.highlights
      .map(
        (item) => `
          <tr>
            <td class="pms-grid-label" style="padding:6px 0;color:#94a3b8;font-size:13px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">${this.escapeHtml(item.label)}</td>
            <td class="pms-grid-value" style="padding:6px 0;color:#e2e8f0;font-size:13px;text-align:right;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">${this.escapeHtml(item.value)}</td>
          </tr>
        `,
      )
      .join('');
    const nextStepsHtml = input.details.nextSteps
      .map(
        (step, index) => `
          <tr>
            <td style="padding:6px 0;color:#e2e8f0;font-size:13px;line-height:1.5;">
              <span style="display:inline-block;min-width:18px;color:#93c5fd;font-weight:700;">${index + 1}.</span>
              ${this.escapeHtml(step)}
            </td>
          </tr>
        `,
      )
      .join('');

    const responsibleHtml = input.responsible
      ? `
          <tr>
            <td class="pms-grid-label" style="color:#94a3b8;font-size:12px;padding-top:6px;vertical-align:top;">Responsable</td>
            <td class="pms-grid-value" style="color:#f8fafc;font-size:12px;text-align:right;padding-top:6px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
              ${this.escapeHtml(input.responsible.fullName)} - ${this.escapeHtml(input.responsible.role)}
            </td>
          </tr>
          ${
            input.responsible.email
              ? `
          <tr>
            <td class="pms-grid-label" style="color:#94a3b8;font-size:12px;padding-top:6px;vertical-align:top;">Correo responsable</td>
            <td class="pms-grid-value" style="color:#f8fafc;font-size:12px;text-align:right;padding-top:6px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
              ${this.escapeHtml(input.responsible.email)}
            </td>
          </tr>
          `
              : ''
          }
        `
      : '';

    return `
      <style>
        @media only screen and (max-width: 640px) {
          .pms-wrapper { padding: 12px !important; }
          .pms-card { border-radius: 12px !important; }
          .pms-cell { padding: 16px !important; }
          .pms-title { font-size: 20px !important; line-height: 1.25 !important; }
          .pms-btn { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
          .pms-grid-label, .pms-grid-value { display: block !important; width: 100% !important; text-align: left !important; padding-top: 4px !important; }
        }
      </style>
      <div class="pms-wrapper" style="margin:0;padding:24px;background:#020617;font-family:Inter,Segoe UI,Arial,sans-serif;">
        <table class="pms-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;margin:0 auto;background:#0b1220;border:1px solid #1e293b;border-radius:14px;overflow:hidden;">
          <tr>
            <td class="pms-cell" style="padding:20px 24px;border-bottom:1px solid #1e293b;">
              <div style="font-size:20px;color:#f8fafc;font-weight:700;">Yacht PMS</div>
              <div style="font-size:12px;color:#94a3b8;letter-spacing:.06em;text-transform:uppercase;">Notificacion operativa</div>
            </td>
          </tr>
          <tr>
            <td class="pms-cell" style="padding:20px 24px;">
              <div style="display:inline-block;background:${severityColor};color:#0b1220;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;text-transform:uppercase;">
                ${this.escapeHtml(severityLabel)}
              </div>
              <h1 class="pms-title" style="margin:14px 0 6px 0;color:#f8fafc;font-size:22px;line-height:1.3;word-break:break-word;overflow-wrap:anywhere;">${this.escapeHtml(input.details.title)}</h1>
              <p style="margin:0 0 16px 0;color:#cbd5e1;font-size:14px;line-height:1.6;word-break:break-word;overflow-wrap:anywhere;">
                ${this.escapeHtml(input.recipientName ? `Hola ${input.recipientName}, ` : '')}${this.escapeHtml(input.details.message)}
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px;">
                <tr>
                  <td class="pms-grid-label" style="color:#94a3b8;font-size:12px;vertical-align:top;">Yate</td>
                  <td class="pms-grid-value" style="color:#f8fafc;font-size:12px;text-align:right;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">${this.escapeHtml(input.yachtName)} (${this.escapeHtml(input.yachtFlag)})</td>
                </tr>
                <tr>
                  <td class="pms-grid-label" style="color:#94a3b8;font-size:12px;padding-top:6px;vertical-align:top;">Modulo</td>
                  <td class="pms-grid-value" style="color:#f8fafc;font-size:12px;text-align:right;padding-top:6px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">${this.escapeHtml(input.details.moduleLabel)}</td>
                </tr>
                <tr>
                  <td class="pms-grid-label" style="color:#94a3b8;font-size:12px;padding-top:6px;vertical-align:top;">Recordatorio</td>
                  <td class="pms-grid-value" style="color:#f8fafc;font-size:12px;text-align:right;padding-top:6px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">${this.escapeHtml(input.details.dueText)}</td>
                </tr>
                ${responsibleHtml}
                ${highlightsHtml}
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;background:#111827;border:1px solid #1e293b;border-radius:10px;padding:14px;">
                <tr>
                  <td style="color:#f8fafc;font-size:13px;font-weight:700;padding-bottom:6px;">Que debes hacer ahora</td>
                </tr>
                ${nextStepsHtml}
              </table>

              <div style="margin-top:18px;">
                <a class="pms-btn" href="${this.escapeHtml(input.details.actionUrl)}" style="display:inline-block;background:#1d4ed8;color:#eff6ff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 14px;border-radius:8px;word-break:break-word;">
                  ${this.escapeHtml(input.details.actionLabel)}
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td class="pms-cell" style="padding:14px 24px;border-top:1px solid #1e293b;color:#64748b;font-size:12px;word-break:break-word;overflow-wrap:anywhere;">
              Mensaje generado automaticamente por Yacht PMS.
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  private escapeHtml(input: string) {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async createSkippedEvent(input: {
    userId: string;
    yachtId?: string;
    channel: ChannelKind;
    type: string;
    dedupeKey: string;
    payload: Prisma.JsonObject;
    reason: string;
  }) {
    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: input.channel,
        type: input.type,
        payload: input.payload,
        status: 'skipped',
        dedupeKey: input.dedupeKey,
        error: input.reason,
      },
    });
  }

  private async resolvePreference(userId: string): Promise<ResolvedPreference> {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        timezone: true,
        inAppEnabled: true,
        emailEnabled: true,
        pushFuture: true,
        windowStart: true,
        windowEnd: true,
        minSeverity: true,
        yachtsScope: true,
      },
    });

    if (!preference) {
      return {
        timezone: 'UTC',
        inAppEnabled: true,
        emailEnabled: false,
        pushFuture: false,
        windowStart: '00:00',
        windowEnd: '23:59',
        minSeverity: 'info',
        yachtsScope: [],
      };
    }

    return {
      timezone: preference.timezone || 'UTC',
      inAppEnabled: preference.inAppEnabled,
      emailEnabled: preference.emailEnabled,
      pushFuture: preference.pushFuture,
      windowStart: preference.windowStart || '00:00',
      windowEnd: preference.windowEnd || '23:59',
      minSeverity: this.normalizeSeverity(preference.minSeverity),
      yachtsScope: preference.yachtsScope ?? [],
    };
  }

  private getChannelBlockReason(
    preference: ResolvedPreference,
    severity: SeverityLevel,
    yachtId: string | undefined,
    channel: ChannelKind,
  ): string | null {
    if (channel === 'in_app' && !preference.inAppEnabled) {
      return 'channel_disabled_in_app';
    }
    if (channel === 'email' && !preference.emailEnabled) {
      return 'channel_disabled_email';
    }
    if (channel === 'push_future' && !preference.pushFuture) {
      return 'channel_disabled_push';
    }

    if (this.severityRank(severity) < this.severityRank(preference.minSeverity)) {
      return 'severity_below_preference';
    }

    if (preference.yachtsScope.length > 0 && yachtId && !preference.yachtsScope.includes(yachtId)) {
      return 'yacht_out_of_scope';
    }

    if (!this.isWithinDeliveryWindow(preference.timezone, preference.windowStart, preference.windowEnd)) {
      return 'outside_delivery_window';
    }

    return null;
  }

  private isWithinDeliveryWindow(timezone: string, windowStart: string, windowEnd: string) {
    const now = this.getNowInTimezone(timezone);
    const currentMinutes = now.hours * 60 + now.minutes;
    const startMinutes = this.parseTimeToMinutes(windowStart);
    const endMinutes = this.parseTimeToMinutes(windowEnd);

    if (startMinutes === null || endMinutes === null) return true;
    if (startMinutes === endMinutes) return true;

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  private parseTimeToMinutes(value: string): number | null {
    if (!value || typeof value !== 'string') return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  private getNowInTimezone(timezone: string): { hours: number; minutes: number } {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone || 'UTC',
      });
      const parts = formatter.formatToParts(new Date());
      const hourPart = parts.find((part) => part.type === 'hour')?.value;
      const minutePart = parts.find((part) => part.type === 'minute')?.value;
      const hours = Number(hourPart);
      const minutes = Number(minutePart);
      if (Number.isFinite(hours) && Number.isFinite(minutes)) {
        return { hours, minutes };
      }
    } catch {
      // fallback UTC
    }
    const now = new Date();
    return { hours: now.getUTCHours(), minutes: now.getUTCMinutes() };
  }

  private normalizeSeverity(value: string | null | undefined): SeverityLevel {
    if (value === 'critical') return 'critical';
    if (value === 'warn') return 'warn';
    return 'info';
  }

  private severityRank(value: SeverityLevel) {
    if (value === 'critical') return 3;
    if (value === 'warn') return 2;
    return 1;
  }
}
