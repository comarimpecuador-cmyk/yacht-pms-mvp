import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MaintenanceTask,
  MaintenanceTaskPriority,
  MaintenanceTaskStatus,
  Prisma,
} from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';
import { NotificationRulesService } from '../notifications/notification-rules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma.service';
import {
  AddMaintenanceEvidenceDto,
  CompleteMaintenanceTaskDto,
  CreateMaintenanceTaskDto,
  ListMaintenanceTasksQueryDto,
  UpdateMaintenanceTaskDto,
} from './dto';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly alertsService: AlertsService,
    private readonly notificationRulesService: NotificationRulesService,
  ) {}

  private assertYachtScope(yachtId: string, yachtIds: string[]) {
    if (!yachtId) {
      throw new BadRequestException('yachtId is required');
    }
    if (!yachtIds.includes(yachtId)) {
      throw new ForbiddenException('Yacht scope violation');
    }
  }

  private async getTaskWithScope(id: string, yachtIds: string[]) {
    const task = await this.prisma.maintenanceTask.findUnique({
      where: { id },
      include: { evidences: true },
    });

    if (!task) {
      throw new NotFoundException('Maintenance task not found');
    }

    this.assertYachtScope(task.yachtId, yachtIds);
    return task;
  }

  private async createAudit(
    actorId: string,
    action: string,
    entityId: string,
    beforeJson: Prisma.InputJsonValue | null,
    afterJson: Prisma.InputJsonValue | null,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        module: 'maintenance',
        entityType: 'MaintenanceTask',
        entityId,
        action,
        actorId,
        beforeJson: beforeJson ?? Prisma.DbNull,
        afterJson: afterJson ?? Prisma.DbNull,
        source: 'api',
      },
    });
  }

  private normalizeRole(role?: string | null) {
    if (!role) return '';
    const normalized = role.trim();
    if (normalized === 'Engineer') return 'Chief Engineer';
    if (normalized === 'Steward') return 'Crew Member';
    return normalized;
  }

  private async listYachtUsersByRoles(yachtId: string, roles: string[]) {
    const targetRoles = new Set(roles.map((role) => this.normalizeRole(role)));

    const rows = await this.prisma.userYachtAccess.findMany({
      where: {
        yachtId,
        revokedAt: null,
        user: { isActive: true },
      },
      include: {
        user: {
          select: {
            id: true,
            role: {
              select: { name: true },
            },
          },
        },
      },
    });

    return rows
      .filter((row) => {
        const effectiveRole = this.normalizeRole(row.roleNameOverride || row.user.role?.name || '');
        return targetRoles.has(effectiveRole);
      })
      .map((row) => row.user.id);
  }

  private async notifyUsers(
    userIds: string[],
    yachtId: string,
    type: string,
    dedupeKeyBase: string,
    payload: Prisma.JsonObject,
  ) {
    const uniqueUsers = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUsers.length === 0) return;

    await Promise.all(
      uniqueUsers.map((userId) =>
        this.notificationsService.createInApp({
          userId,
          yachtId,
          type,
          dedupeKey: `${dedupeKeyBase}-${userId}`,
          payload,
        }),
      ),
    );

    await this.notificationRulesService.dispatchCandidates([
      {
        type,
        module: 'maintenance',
        yachtId,
        entityType: 'MaintenanceTask',
        entityId: typeof payload.taskId === 'string' ? payload.taskId : undefined,
        severity: this.resolveNotificationSeverity(type, payload),
        payload: payload as Record<string, unknown>,
        assigneeUserId: uniqueUsers[0] ?? null,
        occurredAt: new Date(),
      },
    ]);
  }

  private resolveNotificationSeverity(
    type: string,
    payload: Prisma.JsonObject,
  ): 'info' | 'warn' | 'critical' {
    const priority = typeof payload.priority === 'string' ? payload.priority : '';
    if (type.includes('overdue') || priority === 'Critical') return 'critical';
    if (type.includes('due_soon') || type.includes('rejected')) return 'warn';
    return 'info';
  }

  private getDueAlertSeverity(priority: MaintenanceTaskPriority, dueDate: Date): 'warn' | 'critical' {
    if (priority === MaintenanceTaskPriority.Critical) {
      return 'critical';
    }
    if (dueDate.getTime() < Date.now()) {
      return 'critical';
    }
    return 'warn';
  }

  private async upsertDueAlert(task: {
    id: string;
    yachtId: string;
    title: string;
    priority: MaintenanceTaskPriority;
    dueDate: Date;
    assignedToUserId: string | null;
    status: MaintenanceTaskStatus;
  }) {
    const openStatuses = new Set<MaintenanceTaskStatus>([
      MaintenanceTaskStatus.Draft,
      MaintenanceTaskStatus.Submitted,
      MaintenanceTaskStatus.Approved,
      MaintenanceTaskStatus.InProgress,
      MaintenanceTaskStatus.Rejected,
    ]);

    const dedupeKey = `maintenance-task-${task.id}-due`;
    if (!openStatuses.has(task.status)) {
      await this.alertsService.resolveByDedupeKey(dedupeKey);
      return;
    }

    await this.alertsService.upsertAlert({
      yachtId: task.yachtId,
      module: 'maintenance',
      alertType: 'due_or_overdue',
      severity: this.getDueAlertSeverity(task.priority, task.dueDate),
      dueAt: task.dueDate,
      dedupeKey,
      entityId: task.id,
      assignedTo: task.assignedToUserId || undefined,
    });
  }

  status() {
    return { module: 'maintenance', ready: true };
  }

  async listTasks(query: ListMaintenanceTasksQueryDto, yachtIds: string[]) {
    this.assertYachtScope(query.yachtId, yachtIds);

    const where: Prisma.MaintenanceTaskWhereInput = {
      yachtId: query.yachtId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.assignedTo) {
      where.assignedToUserId = query.assignedTo;
    }

    if (query.dueFrom || query.dueTo) {
      where.dueDate = {
        gte: query.dueFrom ? new Date(query.dueFrom) : undefined,
        lte: query.dueTo ? new Date(query.dueTo) : undefined,
      };
    }

    return this.prisma.maintenanceTask.findMany({
      where,
      include: {
        evidences: {
          orderBy: { uploadedAt: 'desc' },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createTask(actorId: string, dto: CreateMaintenanceTaskDto, yachtIds: string[]) {
    this.assertYachtScope(dto.yachtId, yachtIds);

    const dueDate = new Date(dto.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Invalid dueDate');
    }

    const created = await this.prisma.maintenanceTask.create({
      data: {
        yachtId: dto.yachtId,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        engineId: dto.engineId?.trim(),
        systemTag: dto.systemTag?.trim(),
        priority: dto.priority ?? 'Medium',
        dueDate,
        assignedToUserId: dto.assignedToUserId?.trim(),
        createdBy: actorId,
      },
      include: { evidences: true },
    });

    await this.createAudit(actorId, 'create_task', created.id, null, created as unknown as Prisma.JsonObject);
    await this.upsertDueAlert(created);

    if (created.assignedToUserId && created.assignedToUserId !== actorId) {
      await this.notifyUsers(
        [created.assignedToUserId],
        created.yachtId,
        'maintenance.task_assigned',
        `maintenance-task-${created.id}-assigned`,
        {
          taskId: created.id,
          title: created.title,
          status: created.status,
          dueDate: created.dueDate.toISOString(),
        },
      );
    }

    return created;
  }

  async getTask(id: string, yachtIds: string[]) {
    return this.getTaskWithScope(id, yachtIds);
  }

  async updateTask(id: string, actorId: string, dto: UpdateMaintenanceTaskDto, yachtIds: string[]) {
    const current = await this.getTaskWithScope(id, yachtIds);

    if (
      current.status === MaintenanceTaskStatus.Completed ||
      current.status === MaintenanceTaskStatus.Cancelled
    ) {
      throw new BadRequestException('Task cannot be edited in final state');
    }

    const patch: Prisma.MaintenanceTaskUpdateInput = {};
    if (dto.title !== undefined) patch.title = dto.title.trim();
    if (dto.description !== undefined) patch.description = dto.description.trim();
    if (dto.engineId !== undefined) patch.engineId = dto.engineId.trim() || null;
    if (dto.systemTag !== undefined) patch.systemTag = dto.systemTag.trim() || null;
    if (dto.priority !== undefined) patch.priority = dto.priority;
    if (dto.assignedToUserId !== undefined) patch.assignedToUserId = dto.assignedToUserId.trim() || null;
    if (dto.dueDate !== undefined) {
      const dueDate = new Date(dto.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        throw new BadRequestException('Invalid dueDate');
      }
      patch.dueDate = dueDate;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No maintenance fields to update');
    }

    const updated = await this.prisma.maintenanceTask.update({
      where: { id },
      data: patch,
      include: { evidences: true },
    });

    await this.createAudit(
      actorId,
      'update_task',
      updated.id,
      current as unknown as Prisma.JsonObject,
      updated as unknown as Prisma.JsonObject,
    );

    await this.upsertDueAlert(updated);

    if (updated.assignedToUserId && updated.assignedToUserId !== current.assignedToUserId) {
      await this.notifyUsers(
        [updated.assignedToUserId],
        updated.yachtId,
        'maintenance.task_reassigned',
        `maintenance-task-${updated.id}-reassigned`,
        {
          taskId: updated.id,
          title: updated.title,
          status: updated.status,
          dueDate: updated.dueDate.toISOString(),
        },
      );
    }

    return updated;
  }

  async submitTask(id: string, actorId: string, yachtIds: string[]) {
    const current = await this.getTaskWithScope(id, yachtIds);

    if (
      current.status !== MaintenanceTaskStatus.Draft &&
      current.status !== MaintenanceTaskStatus.Rejected
    ) {
      throw new BadRequestException('Only Draft/Rejected tasks can be submitted');
    }

    const updated = await this.prisma.maintenanceTask.update({
      where: { id },
      data: {
        status: MaintenanceTaskStatus.Submitted,
        submittedAt: new Date(),
        rejectionReason: null,
      },
      include: { evidences: true },
    });

    await this.createAudit(
      actorId,
      'submit_task',
      updated.id,
      current as unknown as Prisma.JsonObject,
      updated as unknown as Prisma.JsonObject,
    );

    await this.upsertDueAlert(updated);

    const reviewers = await this.listYachtUsersByRoles(updated.yachtId, [
      'Captain',
      'Chief Engineer',
      'Management/Office',
      'Admin',
      'SystemAdmin',
    ]);

    const assignedReviewer = reviewers.find((idCandidate) => idCandidate !== actorId);
    await this.alertsService.upsertAlert({
      yachtId: updated.yachtId,
      module: 'maintenance',
      alertType: 'pending_approval',
      severity: 'warn',
      dueAt: updated.dueDate,
      dedupeKey: `maintenance-task-${updated.id}-approval`,
      entityId: updated.id,
      assignedTo: assignedReviewer || updated.assignedToUserId || undefined,
    });

    await this.notifyUsers(
      reviewers.filter((idCandidate) => idCandidate !== actorId),
      updated.yachtId,
      'maintenance.task_submitted',
      `maintenance-task-${updated.id}-submitted`,
      {
        taskId: updated.id,
        title: updated.title,
        status: updated.status,
      },
    );

    return updated;
  }

  async approveTask(id: string, actorId: string, yachtIds: string[]) {
    const current = await this.getTaskWithScope(id, yachtIds);

    if (current.status !== MaintenanceTaskStatus.Submitted) {
      throw new BadRequestException('Only Submitted tasks can be approved');
    }

    const updated = await this.prisma.maintenanceTask.update({
      where: { id },
      data: {
        status: MaintenanceTaskStatus.Approved,
        reviewedAt: new Date(),
        reviewedBy: actorId,
        rejectionReason: null,
      },
      include: { evidences: true },
    });

    await this.createAudit(
      actorId,
      'approve_task',
      updated.id,
      current as unknown as Prisma.JsonObject,
      updated as unknown as Prisma.JsonObject,
    );

    await this.alertsService.resolveByDedupeKey(`maintenance-task-${updated.id}-approval`);
    await this.upsertDueAlert(updated);

    await this.notifyUsers(
      [updated.createdBy, updated.assignedToUserId || ''],
      updated.yachtId,
      'maintenance.task_approved',
      `maintenance-task-${updated.id}-approved`,
      {
        taskId: updated.id,
        title: updated.title,
        status: updated.status,
      },
    );

    return updated;
  }

  async rejectTask(id: string, actorId: string, reason: string, yachtIds: string[]) {
    const current = await this.getTaskWithScope(id, yachtIds);

    if (current.status !== MaintenanceTaskStatus.Submitted) {
      throw new BadRequestException('Only Submitted tasks can be rejected');
    }

    const updated = await this.prisma.maintenanceTask.update({
      where: { id },
      data: {
        status: MaintenanceTaskStatus.Rejected,
        reviewedAt: new Date(),
        reviewedBy: actorId,
        rejectionReason: reason.trim(),
      },
      include: { evidences: true },
    });

    await this.createAudit(
      actorId,
      'reject_task',
      updated.id,
      current as unknown as Prisma.JsonObject,
      updated as unknown as Prisma.JsonObject,
    );

    await this.alertsService.resolveByDedupeKey(`maintenance-task-${updated.id}-approval`);
    await this.upsertDueAlert(updated);

    await this.notifyUsers(
      [updated.createdBy, updated.assignedToUserId || ''],
      updated.yachtId,
      'maintenance.task_rejected',
      `maintenance-task-${updated.id}-rejected`,
      {
        taskId: updated.id,
        title: updated.title,
        status: updated.status,
        reason: updated.rejectionReason || '',
      },
    );

    return updated;
  }

  async completeTask(
    id: string,
    actorId: string,
    dto: CompleteMaintenanceTaskDto,
    yachtIds: string[],
  ) {
    const current = await this.getTaskWithScope(id, yachtIds);

    if (
      current.status !== MaintenanceTaskStatus.Approved &&
      current.status !== MaintenanceTaskStatus.InProgress
    ) {
      throw new BadRequestException('Only Approved/InProgress tasks can be completed');
    }

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    if (Number.isNaN(completedAt.getTime())) {
      throw new BadRequestException('Invalid completedAt');
    }

    const updated = await this.prisma.maintenanceTask.update({
      where: { id },
      data: {
        status: MaintenanceTaskStatus.Completed,
        completedAt,
        completionNotes: dto.notes?.trim(),
        workHours: dto.workHours,
      },
      include: { evidences: true },
    });

    await this.createAudit(
      actorId,
      'complete_task',
      updated.id,
      current as unknown as Prisma.JsonObject,
      updated as unknown as Prisma.JsonObject,
    );

    await this.alertsService.resolveByDedupeKey(`maintenance-task-${updated.id}-approval`);
    await this.alertsService.resolveByDedupeKey(`maintenance-task-${updated.id}-due`);

    await this.notifyUsers(
      [updated.createdBy, updated.assignedToUserId || ''],
      updated.yachtId,
      'maintenance.task_completed',
      `maintenance-task-${updated.id}-completed`,
      {
        taskId: updated.id,
        title: updated.title,
        status: updated.status,
      },
    );

    return updated;
  }

  async addEvidence(
    id: string,
    actorId: string,
    dto: AddMaintenanceEvidenceDto,
    yachtIds: string[],
  ) {
    const current = await this.getTaskWithScope(id, yachtIds);

    const evidence = await this.prisma.maintenanceEvidence.create({
      data: {
        taskId: id,
        fileUrl: dto.fileUrl.trim(),
        comment: dto.comment?.trim(),
        uploadedBy: actorId,
      },
    });

    await this.createAudit(
      actorId,
      'add_evidence',
      current.id,
      current as unknown as Prisma.JsonObject,
      { evidenceId: evidence.id } as Prisma.JsonObject,
    );

    await this.notifyUsers(
      [current.createdBy, current.assignedToUserId || ''].filter((idCandidate) => idCandidate !== actorId),
      current.yachtId,
      'maintenance.evidence_added',
      `maintenance-task-${current.id}-evidence-${evidence.id}`,
      {
        taskId: current.id,
        evidenceId: evidence.id,
        title: current.title,
      },
    );

    return evidence;
  }

  async getSummary(yachtId: string, yachtIds: string[]) {
    this.assertYachtScope(yachtId, yachtIds);

    const now = new Date();
    const openStatuses = [
      MaintenanceTaskStatus.Draft,
      MaintenanceTaskStatus.Submitted,
      MaintenanceTaskStatus.Approved,
      MaintenanceTaskStatus.InProgress,
      MaintenanceTaskStatus.Rejected,
    ];

    const [
      total,
      draft,
      submitted,
      approved,
      inProgress,
      completed,
      rejected,
      overdue,
    ] = await Promise.all([
      this.prisma.maintenanceTask.count({ where: { yachtId } }),
      this.prisma.maintenanceTask.count({ where: { yachtId, status: MaintenanceTaskStatus.Draft } }),
      this.prisma.maintenanceTask.count({
        where: { yachtId, status: MaintenanceTaskStatus.Submitted },
      }),
      this.prisma.maintenanceTask.count({
        where: { yachtId, status: MaintenanceTaskStatus.Approved },
      }),
      this.prisma.maintenanceTask.count({
        where: { yachtId, status: MaintenanceTaskStatus.InProgress },
      }),
      this.prisma.maintenanceTask.count({
        where: { yachtId, status: MaintenanceTaskStatus.Completed },
      }),
      this.prisma.maintenanceTask.count({
        where: { yachtId, status: MaintenanceTaskStatus.Rejected },
      }),
      this.prisma.maintenanceTask.count({
        where: {
          yachtId,
          dueDate: { lt: now },
          status: { in: openStatuses },
        },
      }),
    ]);

    return {
      total,
      draft,
      submitted,
      approved,
      inProgress,
      completed,
      rejected,
      overdue,
    };
  }

  async getCalendar(yachtId: string, windowDays: number, yachtIds: string[]) {
    this.assertYachtScope(yachtId, yachtIds);

    const now = new Date();
    const safeWindowDays = Number.isFinite(windowDays)
      ? Math.min(Math.max(Math.floor(windowDays), 1), 90)
      : 30;

    const end = new Date(now);
    end.setDate(end.getDate() + safeWindowDays);

    const items = await this.prisma.maintenanceTask.findMany({
      where: {
        yachtId,
        dueDate: {
          gte: now,
          lte: end,
        },
        status: {
          in: [
            MaintenanceTaskStatus.Draft,
            MaintenanceTaskStatus.Submitted,
            MaintenanceTaskStatus.Approved,
            MaintenanceTaskStatus.InProgress,
            MaintenanceTaskStatus.Rejected,
          ],
        },
      },
      orderBy: { dueDate: 'asc' },
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        priority: true,
        assignedToUserId: true,
      },
    });

    return items.map((item) => ({
      id: item.id,
      when: item.dueDate,
      module: 'maintenance',
      type: item.status,
      priority: item.priority,
      title: item.title,
      assignedToUserId: item.assignedToUserId,
    }));
  }
}
