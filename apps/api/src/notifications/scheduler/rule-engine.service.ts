import { Injectable } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { AlertsService } from '../../modules/alerts/alerts.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class RuleEngineService {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  async runHourly() {
    await Promise.all([
      this.detectExpiringDocuments(),
      this.detectMaintenanceDueOverdue(),
      this.detectIsmPendingSignatures(),
      this.detectRequisitionsPendingApprovals(),
    ]);

    return { ranAt: new Date().toISOString(), status: 'ok' };
  }

  private async resolveResponsibleUserId(yachtId: string, fallbackUserId: string | null) {
    const captainAccess = await this.prisma.userYachtAccess.findFirst({
      where: {
        yachtId,
        OR: [
          { roleNameOverride: 'Captain' },
          { user: { role: { name: 'Captain' } } },
        ],
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (captainAccess) return captainAccess.userId;

    const managementAccess = await this.prisma.userYachtAccess.findFirst({
      where: {
        yachtId,
        OR: [
          { roleNameOverride: 'Management/Office' },
          { user: { role: { name: 'Management/Office' } } },
        ],
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });

    return managementAccess?.userId || fallbackUserId || 'system';
  }

  private async detectExpiringDocuments() {
    const checkpoints = [30, 14, 7, 3, 1];
    const now = new Date();

    const docs = await this.prisma.document.findMany({
      where: {
        expiryDate: { not: null },
        status: { notIn: [DocumentStatus.Archived, DocumentStatus.Renewed] },
      },
      select: {
        id: true,
        yachtId: true,
        expiryDate: true,
        assignedToUserId: true,
        createdBy: true,
      },
    });

    for (const doc of docs) {
      if (!doc.expiryDate) continue;
      const daysLeft = Math.ceil((doc.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const responsibleUserId = doc.assignedToUserId
        ? doc.assignedToUserId
        : await this.resolveResponsibleUserId(doc.yachtId, doc.createdBy);

      if (daysLeft < 0) {
        const dedupeKey = `document-${doc.id}-expired`;
        await this.alertsService.upsertAlert({
          yachtId: doc.yachtId,
          module: 'documents',
          alertType: 'DOC_EXPIRED',
          severity: 'critical',
          dueAt: doc.expiryDate,
          dedupeKey,
          entityId: doc.id,
          assignedTo: responsibleUserId,
        });

        await this.notificationsService.createInApp({
          userId: responsibleUserId,
          yachtId: doc.yachtId,
          type: 'documents.expired',
          dedupeKey,
          payload: { documentId: doc.id, daysLeft },
        });

        await this.notificationsService.maybeSendEmail({
          userId: responsibleUserId,
          yachtId: doc.yachtId,
          type: 'documents.expired',
          dedupeKey,
          severity: 'critical',
          payload: { documentId: doc.id },
        });
        continue;
      }

      const bucket = checkpoints.find((c) => daysLeft <= c);
      if (!bucket) continue;

      const severity = bucket <= 3 ? 'critical' : 'warn';
      const dedupeKey = `document-${doc.id}-expiring-${bucket}`;

      await this.alertsService.upsertAlert({
        yachtId: doc.yachtId,
        module: 'documents',
        alertType: 'DOC_EXPIRING',
        severity,
        dueAt: doc.expiryDate,
        dedupeKey,
        entityId: doc.id,
        assignedTo: responsibleUserId,
      });

      await this.notificationsService.createInApp({
        userId: responsibleUserId,
        yachtId: doc.yachtId,
        type: 'documents.expiring',
        dedupeKey,
        payload: { documentId: doc.id, bucket, daysLeft },
      });

      if (severity === 'critical') {
        await this.notificationsService.maybeSendEmail({
          userId: responsibleUserId,
          yachtId: doc.yachtId,
          type: 'documents.expiring',
          dedupeKey,
          severity,
          payload: { documentId: doc.id, bucket, daysLeft },
        });
      }
    }
  }

  private async detectMaintenanceDueOverdue() {
    const yachtId = 'mock-yacht';
    const userId = 'mock-chief-engineer';
    const dedupeKey = `maintenance-due-${yachtId}`;
    const dueAt = new Date();

    await this.alertsService.upsertAlert({
      yachtId,
      module: 'maintenance',
      alertType: 'due_or_overdue',
      severity: 'warn',
      dueAt,
      dedupeKey,
      assignedTo: userId,
    });

    await this.notificationsService.createInApp({
      userId,
      yachtId,
      type: 'maintenance.due',
      dedupeKey,
      payload: { yachtId },
    });
  }

  private async detectIsmPendingSignatures() {
    const yachtId = 'mock-yacht';
    const userId = 'mock-captain';
    const dedupeKey = `ism-pending-signature-${yachtId}`;

    await this.alertsService.upsertAlert({
      yachtId,
      module: 'ism',
      alertType: 'pending_signature',
      severity: 'warn',
      dueAt: new Date(),
      dedupeKey,
      assignedTo: userId,
    });

    await this.notificationsService.createInApp({
      userId,
      yachtId,
      type: 'ism.pending_signature',
      dedupeKey,
      payload: { yachtId },
    });
  }

  private async detectRequisitionsPendingApprovals() {
    const levels = ['hod', 'captain', 'management'];
    const yachtId = 'mock-yacht';

    for (const level of levels) {
      const dedupeKey = `requisitions-pending-${yachtId}-${level}`;
      const userId = `mock-${level}`;

      await this.alertsService.upsertAlert({
        yachtId,
        module: 'requisitions',
        alertType: `pending_${level}_approval`,
        severity: level === 'management' ? 'critical' : 'warn',
        dueAt: new Date(),
        dedupeKey,
        assignedTo: userId,
      });

      await this.notificationsService.createInApp({
        userId,
        yachtId,
        type: 'requisitions.pending_approval',
        dedupeKey,
        payload: { level },
      });

      if (level === 'management') {
        await this.notificationsService.maybeSendEmail({
          userId,
          yachtId,
          type: 'requisitions.pending_approval',
          dedupeKey,
          severity: 'critical',
          payload: { level },
        });
      }
    }
  }
}
