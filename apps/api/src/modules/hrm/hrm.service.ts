import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HrmLeaveStatus, HrmPayrollStatus, Prisma } from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';
import { NotificationRulesService } from '../notifications/notification-rules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma.service';
import {
  CreateLeaveRequestDto,
  CreateRestDeclarationDto,
  CreateScheduleDto,
  GeneratePayrollDto,
  ListLeavesQueryDto,
  ListPayrollsQueryDto,
  ListSchedulesQueryDto,
  RestHoursReportQueryDto,
  UpdateScheduleDto,
} from './dto';

@Injectable()
export class HrmService {
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

  private async createAudit(
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    beforeJson: Prisma.InputJsonValue | null,
    afterJson: Prisma.InputJsonValue | null,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        module: 'hrm',
        entityType,
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
        module: 'hrm',
        yachtId,
        entityType: 'Hrm',
        entityId:
          typeof payload.leaveId === 'string'
            ? payload.leaveId
            : typeof payload.payrollId === 'string'
              ? payload.payrollId
              : typeof payload.scheduleId === 'string'
                ? payload.scheduleId
                : undefined,
        severity: this.resolveNotificationSeverity(type),
        payload: payload as Record<string, unknown>,
        assigneeUserId: uniqueUsers[0] ?? null,
        occurredAt: new Date(),
      },
    ]);
  }

  private resolveNotificationSeverity(type: string): 'info' | 'warn' | 'critical' {
    if (type.includes('non_compliance') || type.includes('rejected')) return 'critical';
    if (type.includes('pending') || type.includes('rest_')) return 'warn';
    return 'info';
  }

  status() {
    return { module: 'hrm', ready: true };
  }

  async listCrewOptions(yachtId: string, yachtIds: string[]) {
    this.assertYachtScope(yachtId, yachtIds);

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
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      userId: row.user.id,
      name: row.user.fullName || row.user.email,
      email: row.user.email,
    }));
  }

  async listSchedules(query: ListSchedulesQueryDto, yachtIds: string[]) {
    this.assertYachtScope(query.yachtId, yachtIds);

    const where: Prisma.HrmScheduleWhereInput = {
      yachtId: query.yachtId,
      userId: query.userId,
    };

    if (query.from || query.to) {
      where.workDate = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    return this.prisma.hrmSchedule.findMany({
      where,
      orderBy: [{ workDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createSchedule(actorId: string, dto: CreateScheduleDto, yachtIds: string[]) {
    this.assertYachtScope(dto.yachtId, yachtIds);

    const created = await this.prisma.hrmSchedule.create({
      data: {
        yachtId: dto.yachtId,
        userId: dto.userId,
        workDate: new Date(dto.workDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        restHours: dto.restHours ?? 0,
        notes: dto.notes?.trim(),
        createdBy: actorId,
      },
    });

    await this.createAudit(actorId, 'create_schedule', 'HrmSchedule', created.id, null, created as unknown as Prisma.JsonObject);

    if (created.userId !== actorId) {
      await this.notifyUsers(
        [created.userId],
        created.yachtId,
        'hrm.schedule_created',
        `hrm-schedule-${created.id}-created`,
        {
          scheduleId: created.id,
          userId: created.userId,
          workDate: created.workDate.toISOString(),
        },
      );
    }

    return created;
  }

  async updateSchedule(id: string, actorId: string, dto: UpdateScheduleDto, yachtIds: string[]) {
    const current = await this.prisma.hrmSchedule.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Schedule not found');
    }
    this.assertYachtScope(current.yachtId, yachtIds);

    const patch: Prisma.HrmScheduleUpdateInput = {};
    if (dto.startTime !== undefined) patch.startTime = dto.startTime;
    if (dto.endTime !== undefined) patch.endTime = dto.endTime;
    if (dto.restHours !== undefined) patch.restHours = dto.restHours;
    if (dto.notes !== undefined) patch.notes = dto.notes.trim() || null;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No schedule fields to update');
    }

    const updated = await this.prisma.hrmSchedule.update({
      where: { id },
      data: patch,
    });

    await this.createAudit(
      actorId,
      'update_schedule',
      'HrmSchedule',
      updated.id,
      current as unknown as Prisma.JsonObject,
      updated as unknown as Prisma.JsonObject,
    );

    return updated;
  }

  async restHoursReport(query: RestHoursReportQueryDto, yachtIds: string[]) {
    this.assertYachtScope(query.yachtId, yachtIds);

    const where: Prisma.HrmRestDeclarationWhereInput = {
      yachtId: query.yachtId,
      userId: query.userId,
    };

    if (query.from || query.to) {
      where.workDate = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    const declarations = await this.prisma.hrmRestDeclaration.findMany({
      where,
      orderBy: { workDate: 'asc' },
    });

    const total = declarations.length;
    const compliant = declarations.filter((x) => x.compliant).length;
    const totalWorked = declarations.reduce((sum, x) => sum + x.workedHours, 0);
    const totalRest = declarations.reduce((sum, x) => sum + x.restHours, 0);

    return {
      items: declarations,
      summary: {
        total,
        compliant,
        nonCompliant: total - compliant,
        complianceRate: total === 0 ? 100 : Math.round((compliant / total) * 100),
        totalWorkedHours: Number(totalWorked.toFixed(2)),
        totalRestHours: Number(totalRest.toFixed(2)),
      },
    };
  }

  async createRestDeclaration(actorId: string, dto: CreateRestDeclarationDto, yachtIds: string[]) {
    this.assertYachtScope(dto.yachtId, yachtIds);
    const compliant = dto.restHours >= 10;

    const created = await this.prisma.hrmRestDeclaration.create({
      data: {
        yachtId: dto.yachtId,
        userId: dto.userId,
        workDate: new Date(dto.workDate),
        workedHours: dto.workedHours,
        restHours: dto.restHours,
        compliant,
        comment: dto.comment?.trim(),
        createdBy: actorId,
      },
    });

    await this.createAudit(
      actorId,
      'create_rest_declaration',
      'HrmRestDeclaration',
      created.id,
      null,
      created as unknown as Prisma.JsonObject,
    );

    if (!created.compliant) {
      const supervisors = await this.listYachtUsersByRoles(created.yachtId, [
        'Captain',
        'Chief Engineer',
        'Management/Office',
        'Admin',
        'SystemAdmin',
      ]);

      const dedupeKey = `hrm-rest-noncompliant-${created.userId}-${created.workDate.toISOString().slice(0, 10)}`;
      await this.alertsService.upsertAlert({
        yachtId: created.yachtId,
        module: 'hrm',
        alertType: 'rest_non_compliance',
        severity: 'warn',
        dueAt: created.workDate,
        dedupeKey,
        entityId: created.id,
        assignedTo: supervisors[0],
      });

      await this.notifyUsers(
        supervisors,
        created.yachtId,
        'hrm.rest_non_compliance',
        dedupeKey,
        {
          declarationId: created.id,
          userId: created.userId,
          restHours: created.restHours,
          workedHours: created.workedHours,
        },
      );
    }

    return created;
  }

  async listLeaves(query: ListLeavesQueryDto, yachtIds: string[]) {
    this.assertYachtScope(query.yachtId, yachtIds);

    const where: Prisma.HrmLeaveRequestWhereInput = {
      yachtId: query.yachtId,
      status: query.status,
    };

    if (query.from || query.to) {
      where.startDate = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    return this.prisma.hrmLeaveRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createLeaveRequest(actorId: string, dto: CreateLeaveRequestDto, yachtIds: string[]) {
    this.assertYachtScope(dto.yachtId, yachtIds);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid leave dates');
    }
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate cannot be earlier than startDate');
    }

    const created = await this.prisma.hrmLeaveRequest.create({
      data: {
        yachtId: dto.yachtId,
        userId: dto.userId,
        type: dto.type.trim(),
        startDate,
        endDate,
        comment: dto.comment?.trim(),
        createdBy: actorId,
      },
    });

    await this.createAudit(actorId, 'create_leave', 'HrmLeaveRequest', created.id, null, created as unknown as Prisma.JsonObject);

    const approvers = await this.listYachtUsersByRoles(created.yachtId, [
      'Captain',
      'HoD',
      'Management/Office',
      'Admin',
      'SystemAdmin',
    ]);

    await this.notifyUsers(
      approvers.filter((userId) => userId !== actorId),
      created.yachtId,
      'hrm.leave_pending_approval',
      `hrm-leave-${created.id}-pending`,
      {
        leaveId: created.id,
        userId: created.userId,
        startDate: created.startDate.toISOString(),
        endDate: created.endDate.toISOString(),
        leaveType: created.type,
      },
    );

    return created;
  }

  async approveLeave(id: string, actorId: string, yachtIds: string[]) {
    const current = await this.prisma.hrmLeaveRequest.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Leave request not found');
    }
    this.assertYachtScope(current.yachtId, yachtIds);

    if (current.status !== HrmLeaveStatus.Pending) {
      throw new ConflictException('Only pending leave requests can be approved');
    }

    const updated = await this.prisma.hrmLeaveRequest.update({
      where: { id },
      data: {
        status: HrmLeaveStatus.Approved,
        reviewedAt: new Date(),
        reviewedBy: actorId,
        rejectionReason: null,
      },
    });

    await this.createAudit(
      actorId,
      'approve_leave',
      'HrmLeaveRequest',
      updated.id,
      current as unknown as Prisma.JsonObject,
      updated as unknown as Prisma.JsonObject,
    );

    await this.notifyUsers(
      [updated.userId],
      updated.yachtId,
      'hrm.leave_approved',
      `hrm-leave-${updated.id}-approved`,
      {
        leaveId: updated.id,
        startDate: updated.startDate.toISOString(),
        endDate: updated.endDate.toISOString(),
      },
    );

    return updated;
  }

  async rejectLeave(id: string, actorId: string, reason: string | undefined, yachtIds: string[]) {
    const current = await this.prisma.hrmLeaveRequest.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Leave request not found');
    }
    this.assertYachtScope(current.yachtId, yachtIds);

    if (current.status !== HrmLeaveStatus.Pending) {
      throw new ConflictException('Only pending leave requests can be rejected');
    }

    const updated = await this.prisma.hrmLeaveRequest.update({
      where: { id },
      data: {
        status: HrmLeaveStatus.Rejected,
        reviewedAt: new Date(),
        reviewedBy: actorId,
        rejectionReason: reason?.trim() || null,
      },
    });

    await this.createAudit(
      actorId,
      'reject_leave',
      'HrmLeaveRequest',
      updated.id,
      current as unknown as Prisma.JsonObject,
      updated as unknown as Prisma.JsonObject,
    );

    await this.notifyUsers(
      [updated.userId],
      updated.yachtId,
      'hrm.leave_rejected',
      `hrm-leave-${updated.id}-rejected`,
      {
        leaveId: updated.id,
        reason: updated.rejectionReason || '',
      },
    );

    return updated;
  }

  async listPayrolls(query: ListPayrollsQueryDto, yachtIds: string[]) {
    this.assertYachtScope(query.yachtId, yachtIds);

    return this.prisma.hrmPayroll.findMany({
      where: {
        yachtId: query.yachtId,
        period: query.period,
      },
      include: {
        lines: true,
      },
      orderBy: [{ period: 'desc' }, { generatedAt: 'desc' }],
    });
  }

  async generatePayroll(actorId: string, dto: GeneratePayrollDto, yachtIds: string[]) {
    this.assertYachtScope(dto.yachtId, yachtIds);

    const existing = await this.prisma.hrmPayroll.findUnique({
      where: {
        yachtId_period: {
          yachtId: dto.yachtId,
          period: dto.period,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Payroll already exists for this yacht and period');
    }

    const crew = await this.prisma.userYachtAccess.findMany({
      where: {
        yachtId: dto.yachtId,
        revokedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    const payroll = await this.prisma.hrmPayroll.create({
      data: {
        yachtId: dto.yachtId,
        period: dto.period,
        currency: dto.currency?.trim() || 'USD',
        generatedBy: actorId,
      },
    });

    if (crew.length > 0) {
      await this.prisma.hrmPayrollLine.createMany({
        data: crew.map((member) => ({
          payrollId: payroll.id,
          userId: member.user.id,
          baseAmount: 0,
          bonusAmount: 0,
          deductionsAmount: 0,
          netAmount: 0,
        })),
      });
    }

    const detailed = await this.prisma.hrmPayroll.findUnique({
      where: { id: payroll.id },
      include: { lines: true },
    });

    await this.createAudit(
      actorId,
      'generate_payroll',
      'HrmPayroll',
      payroll.id,
      null,
      detailed as unknown as Prisma.JsonObject,
    );

    const payrollManagers = await this.listYachtUsersByRoles(payroll.yachtId, [
      'Captain',
      'Management/Office',
      'Admin',
      'SystemAdmin',
    ]);

    await this.notifyUsers(
      payrollManagers.filter((userId) => userId !== actorId),
      payroll.yachtId,
      'hrm.payroll_generated',
      `hrm-payroll-${payroll.id}-generated`,
      {
        payrollId: payroll.id,
        period: payroll.period,
        currency: payroll.currency,
      },
    );

    return detailed;
  }

  async getPayroll(id: string, yachtIds: string[]) {
    const payroll = await this.prisma.hrmPayroll.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!payroll) {
      throw new NotFoundException('Payroll not found');
    }
    this.assertYachtScope(payroll.yachtId, yachtIds);

    const userIds = Array.from(new Set(payroll.lines.map((line) => line.userId)));
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.fullName || u.email]));

    return {
      ...payroll,
      lines: payroll.lines.map((line) => ({
        ...line,
        userName: userMap.get(line.userId) || line.userId,
      })),
    };
  }

  async publishPayroll(id: string, actorId: string, yachtIds: string[]) {
    const current = await this.prisma.hrmPayroll.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Payroll not found');
    }
    this.assertYachtScope(current.yachtId, yachtIds);

    if (current.status === HrmPayrollStatus.Published) {
      return current;
    }

    const updated = await this.prisma.hrmPayroll.update({
      where: { id },
      data: {
        status: HrmPayrollStatus.Published,
        publishedAt: new Date(),
      },
      include: { lines: true },
    });

    await this.createAudit(
      actorId,
      'publish_payroll',
      'HrmPayroll',
      updated.id,
      current as unknown as Prisma.JsonObject,
      updated as unknown as Prisma.JsonObject,
    );

    await this.notifyUsers(
      updated.lines.map((line) => line.userId),
      updated.yachtId,
      'hrm.payroll_published',
      `hrm-payroll-${updated.id}-published`,
      {
        payrollId: updated.id,
        period: updated.period,
        currency: updated.currency,
      },
    );

    return updated;
  }
}
