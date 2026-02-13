import { Injectable } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { AlertsService } from '../../modules/alerts/alerts.service';
import { NotificationRulesService, RuleEventCandidate } from '../../modules/notifications/notification-rules.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class RuleEngineService {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationRulesService: NotificationRulesService,
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
        revokedAt: null,
        OR: [
          { roleNameOverride: 'Captain' },
          { user: { role: { name: 'Captain' }, isActive: true } },
        ],
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (captainAccess) return captainAccess.userId;

    const managementAccess = await this.prisma.userYachtAccess.findFirst({
      where: {
        yachtId,
        revokedAt: null,
        OR: [
          { roleNameOverride: 'Management/Office' },
          { user: { role: { name: 'Management/Office' }, isActive: true } },
        ],
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });

    return managementAccess?.userId || fallbackUserId || 'system';
  }

  private async detectExpiringDocuments() {
    const candidates: RuleEventCandidate[] = [];
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

        candidates.push({
          type: 'documents.expired',
          module: 'documents',
          yachtId: doc.yachtId,
          entityType: 'Document',
          entityId: doc.id,
          severity: 'critical',
          payload: {
            documentId: doc.id,
            daysLeft,
            bucket: 'expired',
          },
          assigneeUserId: responsibleUserId,
          occurredAt: now,
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

      candidates.push({
        type: 'documents.expiring',
        module: 'documents',
        yachtId: doc.yachtId,
        entityType: 'Document',
        entityId: doc.id,
        severity,
        payload: {
          documentId: doc.id,
          bucket,
          daysLeft,
        },
        assigneeUserId: responsibleUserId,
        occurredAt: now,
      });
    }

    if (candidates.length > 0) {
      await this.notificationRulesService.dispatchCandidates(candidates);
    }
  }

  private async detectMaintenanceDueOverdue() {
    const candidates: RuleEventCandidate[] = [];
    const now = new Date();
    const dueSoon = new Date(now);
    dueSoon.setDate(dueSoon.getDate() + 3);

    const tasks = await this.prisma.maintenanceTask.findMany({
      where: {
        dueDate: { lte: dueSoon },
        status: { in: ['Draft', 'Submitted', 'Approved', 'InProgress', 'Rejected'] },
      },
      select: {
        id: true,
        yachtId: true,
        title: true,
        dueDate: true,
        assignedToUserId: true,
        createdBy: true,
        priority: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    for (const task of tasks) {
      const overdue = task.dueDate.getTime() < now.getTime();
      const severity: 'warn' | 'critical' =
        overdue || task.priority === 'Critical' ? 'critical' : 'warn';
      const responsibleUserId = task.assignedToUserId
        ? task.assignedToUserId
        : await this.resolveResponsibleUserId(task.yachtId, task.createdBy);

      const dedupeKey = `maintenance-${task.id}-${overdue ? 'overdue' : 'due'}`;
      await this.alertsService.upsertAlert({
        yachtId: task.yachtId,
        module: 'maintenance',
        alertType: overdue ? 'TASK_OVERDUE' : 'TASK_DUE_SOON',
        severity,
        dueAt: task.dueDate,
        dedupeKey,
        entityId: task.id,
        assignedTo: responsibleUserId,
      });

      await this.notificationsService.createInApp({
        userId: responsibleUserId,
        yachtId: task.yachtId,
        type: overdue ? 'maintenance.overdue' : 'maintenance.due_soon',
        dedupeKey,
        payload: { taskId: task.id, title: task.title, dueDate: task.dueDate.toISOString() },
      });

      if (severity === 'critical') {
        await this.notificationsService.maybeSendEmail({
          userId: responsibleUserId,
          yachtId: task.yachtId,
          type: overdue ? 'maintenance.overdue' : 'maintenance.due_soon',
          dedupeKey,
          severity,
          payload: { taskId: task.id, title: task.title, dueDate: task.dueDate.toISOString() },
        });
      }

      candidates.push({
        type: overdue ? 'maintenance.overdue' : 'maintenance.due_soon',
        module: 'maintenance',
        yachtId: task.yachtId,
        entityType: 'MaintenanceTask',
        entityId: task.id,
        severity,
        payload: {
          taskId: task.id,
          title: task.title,
          dueDate: task.dueDate.toISOString(),
          priority: task.priority,
          overdue,
        },
        assigneeUserId: responsibleUserId,
        occurredAt: now,
      });
    }

    if (candidates.length > 0) {
      await this.notificationRulesService.dispatchCandidates(candidates);
    }
  }

  private async detectIsmPendingSignatures() {
    // ISM funcional aun no implementado: se evita crear alertas mock.
    return;
  }

  private async detectRequisitionsPendingApprovals() {
    // Requisitions funcional aun no implementado: se evita crear alertas mock.
    return;
  }
}
