import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { EmailProvider } from '../../notifications/channels/email/email.provider';
import { PushProvider } from '../../notifications/channels/push/push.provider';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailProvider: EmailProvider,
    private readonly pushProvider: PushProvider,
  ) {}

  async createInApp(input: {
    userId: string;
    yachtId?: string;
    type: string;
    dedupeKey: string;
    payload: Prisma.JsonObject;
  }) {
    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'in_app',
        type: input.type,
        payload: input.payload,
        status: 'sent',
        dedupeKey: input.dedupeKey,
        sentAt: new Date(),
      },
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
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const existing = await this.prisma.notificationEvent.findFirst({
      where: {
        channel: 'email',
        dedupeKey: input.dedupeKey,
        createdAt: { gte: since },
        status: 'sent',
      },
    });

    if (existing) {
      return { status: 'skipped_daily_dedupe' };
    }

    const result = await this.emailProvider.send({
      userId: input.userId,
      yachtId: input.yachtId,
      type: input.type,
      dedupeKey: input.dedupeKey,
      severity: input.severity,
      payload: input.payload,
    });

    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'email',
        type: input.type,
        payload: input.payload,
        status: result.status === 'failed' ? 'failed' : 'sent',
        dedupeKey: input.dedupeKey,
        sentAt: result.status === 'failed' ? null : new Date(),
        error: result.error,
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
    const result = await this.pushProvider.send({ ...input });

    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'push_future',
        type: input.type,
        payload: input.payload,
        status: result.status,
        dedupeKey: input.dedupeKey,
        sentAt: result.status === 'sent' ? new Date() : null,
        error: result.error,
      },
    });
  }

  async listInApp(userId: string) {
    return this.prisma.notificationEvent.findMany({
      where: { userId, channel: 'in_app' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(notificationId: string) {
    return this.prisma.notificationEvent.update({
      where: { id: notificationId },
      data: { status: 'read', readAt: new Date() },
    });
  }

  async getPreference(userId: string) {
    return this.prisma.notificationPreference.findUnique({ where: { userId } });
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
}
