import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JobDefinition, JobRunStatus, JobScheduleType, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { NotificationRulesService, RuleEventCandidate } from './notification-rules.service';
import { NotificationsService } from './notifications.service';
import {
  CreateJobDto,
  JobTestRunRequestDto,
  JobReminderDto,
  ListJobsQueryDto,
  UpdateJobDto,
} from './dto/jobs.dto';

type ReminderPolicy = { offsetHours: number; channels: Array<'in_app' | 'email' | 'push'> };

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationRulesService: NotificationRulesService,
  ) {}

  async listJobs(query: ListJobsQueryDto) {
    const where: Prisma.JobDefinitionWhereInput = {
      yachtId: query.yachtId,
      status: query.status,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobDefinition.findMany({
        where,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.jobDefinition.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toJobResponse(item)),
      total,
    };
  }

  async createJob(actorUserId: string, dto: CreateJobDto) {
    const schedule = this.normalizeSchedule(dto.schedule);
    const reminders = this.normalizeReminders(dto.reminders);
    const nextRunAt = dto.status === 'paused' || dto.status === 'archived'
      ? null
      : this.computeNextRunAt(schedule, new Date());

    const created = await this.prisma.jobDefinition.create({
      data: {
        title: dto.title.trim(),
        module: dto.module,
        yachtId: dto.yachtId,
        instructionsTemplate: dto.instructionsTemplate.trim(),
        scheduleType: schedule.type,
        cronExpression: schedule.cronExpression,
        intervalHours: schedule.intervalHours,
        intervalDays: schedule.intervalDays,
        timezone: schedule.timezone,
        assignmentMode: dto.assignmentPolicy.mode,
        assignmentRoles: dto.assignmentPolicy.roles ?? [],
        assignmentUserIds: dto.assignmentPolicy.userIds ?? [],
        remindersJson: reminders as Prisma.InputJsonValue,
        status: (dto.status ?? 'active') as JobStatus,
        nextRunAt,
        createdByUserId: actorUserId,
      },
    });

    await this.dispatchRuleCandidates([
      {
        type: 'jobs.created',
        module: 'jobs',
        yachtId: created.yachtId ?? undefined,
        entityType: 'JobDefinition',
        entityId: created.id,
        severity: 'info',
        payload: {
          jobDefinitionId: created.id,
          title: created.title,
          module: created.module,
          nextRunAt: created.nextRunAt?.toISOString() ?? null,
        },
      },
    ]);

    return this.toJobResponse(created);
  }

  async updateJob(jobId: string, dto: UpdateJobDto) {
    const existing = await this.prisma.jobDefinition.findUnique({
      where: { id: jobId },
    });

    if (!existing) {
      throw new NotFoundException('Job not found');
    }

    const currentSchedule = this.toScheduleConfig(existing);
    const schedule = dto.schedule ? this.normalizeSchedule(dto.schedule) : currentSchedule;
    const reminders = dto.reminders ? this.normalizeReminders(dto.reminders) : this.parseReminders(existing.remindersJson);
    const nextStatus = (dto.status ?? existing.status) as JobStatus;

    const nextRunAt =
      nextStatus !== 'active'
        ? null
        : existing.nextRunAt
          ? existing.nextRunAt
          : this.computeNextRunAt(schedule, new Date());

    const updated = await this.prisma.jobDefinition.update({
      where: { id: jobId },
      data: {
        title: dto.title?.trim(),
        instructionsTemplate: dto.instructionsTemplate?.trim(),
        scheduleType: schedule.type,
        cronExpression: schedule.cronExpression,
        intervalHours: schedule.intervalHours,
        intervalDays: schedule.intervalDays,
        timezone: schedule.timezone,
        ...(dto.assignmentPolicy
          ? {
              assignmentMode: dto.assignmentPolicy.mode,
              assignmentRoles: dto.assignmentPolicy.roles ?? [],
              assignmentUserIds: dto.assignmentPolicy.userIds ?? [],
            }
          : {}),
        remindersJson: reminders as Prisma.InputJsonValue,
        status: nextStatus,
        nextRunAt,
      },
    });

    await this.dispatchRuleCandidates([
      {
        type: 'jobs.assignment_changed',
        module: 'jobs',
        yachtId: updated.yachtId ?? undefined,
        entityType: 'JobDefinition',
        entityId: updated.id,
        severity: 'info',
        payload: {
          jobDefinitionId: updated.id,
          title: updated.title,
          status: updated.status,
          nextRunAt: updated.nextRunAt?.toISOString() ?? null,
        },
      },
    ]);

    return this.toJobResponse(updated);
  }

  async runNow(jobId: string, actorUserId: string, body: JobTestRunRequestDto) {
    const job = await this.getJobOrThrow(jobId);
    const scheduledAt = new Date();
    const trigger = 'manual';
    return this.executeJobRun(job, scheduledAt, trigger, body.payload ?? {}, actorUserId);
  }

  async listRuns(jobId: string, limit = 20) {
    await this.getJobOrThrow(jobId);
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.jobRun.findMany({
        where: { jobDefinitionId: jobId },
        orderBy: { scheduledAt: 'desc' },
        take: safeLimit,
      }),
      this.prisma.jobRun.count({ where: { jobDefinitionId: jobId } }),
    ]);

    return {
      items,
      total,
    };
  }

  async tick() {
    const now = new Date();
    const [dueResult, remindersResult] = await Promise.all([
      this.processDueJobs(now),
      this.processReminders(now),
    ]);

    return {
      at: now.toISOString(),
      dueRuns: dueResult,
      reminders: remindersResult,
    };
  }

  private async processDueJobs(now: Date) {
    const dueJobs = await this.prisma.jobDefinition.findMany({
      where: {
        status: 'active',
        nextRunAt: { lte: now },
      },
      orderBy: { nextRunAt: 'asc' },
      take: 50,
    });

    let executed = 0;
    let failed = 0;

    for (const job of dueJobs) {
      try {
        await this.executeJobRun(job, job.nextRunAt ?? now, 'scheduler');
        executed += 1;
      } catch {
        failed += 1;
      }
    }

    return { executed, failed, total: dueJobs.length };
  }

  private async processReminders(now: Date) {
    const ahead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const jobs = await this.prisma.jobDefinition.findMany({
      where: {
        status: 'active',
        nextRunAt: {
          gte: now,
          lte: ahead,
        },
      },
      orderBy: { nextRunAt: 'asc' },
      take: 100,
    });

    let sent = 0;
    for (const job of jobs) {
      if (!job.nextRunAt) continue;

      const reminders = this.parseReminders(job.remindersJson);
      if (reminders.length === 0) continue;

      const assignees = await this.resolveAssignees(job);
      if (assignees.length === 0) continue;

      for (const reminder of reminders) {
        const reminderAt = new Date(job.nextRunAt.getTime() - reminder.offsetHours * 60 * 60 * 1000);
        if (reminderAt > now) {
          continue;
        }

        const bucket = `${job.id}:${job.nextRunAt.toISOString()}:offset:${reminder.offsetHours}`;
        const dedupeKeyBase = `job-reminder:${bucket}`;

        for (const userId of assignees) {
          const payload: Prisma.JsonObject = {
            jobDefinitionId: job.id,
            title: job.title,
            module: job.module,
            nextRunAt: job.nextRunAt.toISOString(),
            reminderOffsetHours: reminder.offsetHours,
            instructionsTemplate: job.instructionsTemplate,
          };

          for (const channel of reminder.channels) {
            const dedupeKey = `${dedupeKeyBase}:user:${userId}:channel:${channel}`;
            if (channel === 'in_app') {
              const result = await this.notificationsService.maybeSendInApp({
                userId,
                yachtId: job.yachtId ?? undefined,
                type: 'jobs.reminder_due',
                dedupeKey,
                severity: 'warn',
                payload,
                dedupeWindowHours: 24,
              });
              if (result?.status === 'sent') sent += 1;
            } else if (channel === 'email') {
              const result = await this.notificationsService.maybeSendEmail({
                userId,
                yachtId: job.yachtId ?? undefined,
                type: 'jobs.reminder_due',
                dedupeKey,
                severity: 'warn',
                payload,
              });
              if (result?.status === 'sent') sent += 1;
            } else if (channel === 'push') {
              const result = await this.notificationsService.maybeSendPushFuture({
                userId,
                yachtId: job.yachtId ?? undefined,
                type: 'jobs.reminder_due',
                dedupeKey,
                severity: 'warn',
                payload,
              });
              if (result?.status === 'sent') sent += 1;
            }
          }
        }

        await this.dispatchRuleCandidates([
          {
            type: 'jobs.reminder_due',
            module: 'jobs',
            yachtId: job.yachtId ?? undefined,
            entityType: 'JobDefinition',
            entityId: job.id,
            severity: 'warn',
            payload: {
              jobDefinitionId: job.id,
              title: job.title,
              module: job.module,
              nextRunAt: job.nextRunAt.toISOString(),
              reminderOffsetHours: reminder.offsetHours,
            },
          },
        ]);
      }
    }

    return { sent };
  }

  private async executeJobRun(
    job: JobDefinition,
    scheduledAt: Date,
    trigger: 'scheduler' | 'manual',
    payload: Record<string, unknown> = {},
    actorUserId?: string,
  ) {
    const run = await this.prisma.jobRun.create({
      data: {
        jobDefinitionId: job.id,
        scheduledAt,
        status: 'pending',
        dedupeKey: `job-run:${job.id}:${scheduledAt.toISOString()}`,
      },
    });

    try {
      await this.prisma.jobRun.update({
        where: { id: run.id },
        data: {
          status: JobRunStatus.running,
          startedAt: new Date(),
        },
      });

      const assignees = await this.resolveAssignees(job);
      const severity = scheduledAt.getTime() < Date.now() - 30 * 60 * 1000 ? 'critical' : 'info';
      const eventType = severity === 'critical' ? 'jobs.overdue' : 'jobs.reminder_due';
      const nowIso = new Date().toISOString();
      const renderedInstructions = this.renderTemplate(job.instructionsTemplate, {
        ...(payload ?? {}),
        title: job.title,
        module: job.module,
        scheduledAt: scheduledAt.toISOString(),
        trigger,
      });

      let delivered = 0;
      for (const userId of assignees) {
        const dedupeKey = `job-run:${job.id}:${scheduledAt.toISOString()}:user:${userId}`;
        const eventPayload: Prisma.JsonObject = {
          ...(payload as Prisma.JsonObject),
          jobDefinitionId: job.id,
          jobRunId: run.id,
          title: job.title,
          module: job.module,
          instructions: renderedInstructions,
          scheduledAt: scheduledAt.toISOString(),
          trigger,
          actorUserId: actorUserId ?? null,
        };

        const result = await this.notificationsService.maybeSendInApp({
          userId,
          yachtId: job.yachtId ?? undefined,
          type: eventType,
          dedupeKey,
          severity,
          payload: eventPayload,
          dedupeWindowHours: 24,
        });

        if (result?.status === 'sent') delivered += 1;
      }

      await this.dispatchRuleCandidates([
        {
          type: eventType,
          module: 'jobs',
          yachtId: job.yachtId ?? undefined,
          entityType: 'JobDefinition',
          entityId: job.id,
          severity,
          payload: {
            jobDefinitionId: job.id,
            jobRunId: run.id,
            title: job.title,
            module: job.module,
            scheduledAt: scheduledAt.toISOString(),
            delivered,
            assigneeUserIds: assignees,
            trigger,
            ranAt: nowIso,
          },
        },
      ]);

      const nextRunAt = this.computeNextRunAt(this.toScheduleConfig(job), scheduledAt);

      const summary: Prisma.JsonObject = {
        delivered,
        assignees,
        trigger,
        renderedInstructions,
      };

      const [updatedRun, updatedJob] = await this.prisma.$transaction([
        this.prisma.jobRun.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            finishedAt: new Date(),
            summaryJson: summary,
          },
        }),
        this.prisma.jobDefinition.update({
          where: { id: job.id },
          data: {
            lastRunAt: new Date(),
            nextRunAt,
          },
        }),
      ]);

      return {
        run: updatedRun,
        job: this.toJobResponse(updatedJob),
        delivered,
      };
    } catch (error) {
      await this.prisma.jobRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          summaryJson: {
            error: error instanceof Error ? error.message : 'unknown_error',
          },
        },
      });
      throw error;
    }
  }

  private normalizeSchedule(schedule: CreateJobDto['schedule'] | UpdateJobDto['schedule']) {
    if (!schedule) {
      throw new BadRequestException('schedule is required');
    }

    const timezone = schedule.timezone?.trim() || 'UTC';

    if (schedule.type === 'interval_hours') {
      if (!schedule.everyHours || schedule.everyHours < 1) {
        throw new BadRequestException('schedule.everyHours must be >= 1');
      }

      return {
        type: JobScheduleType.interval_hours,
        intervalHours: schedule.everyHours,
        intervalDays: null as number | null,
        cronExpression: null as string | null,
        timezone,
      };
    }

    if (schedule.type === 'interval_days') {
      if (!schedule.everyDays || schedule.everyDays < 1) {
        throw new BadRequestException('schedule.everyDays must be >= 1');
      }

      return {
        type: JobScheduleType.interval_days,
        intervalHours: null as number | null,
        intervalDays: schedule.everyDays,
        cronExpression: null as string | null,
        timezone,
      };
    }

    if (!schedule.expression || !this.isSupportedCronExpression(schedule.expression)) {
      throw new BadRequestException('cron expression must be `m h * * *` or `m h * * d`');
    }

    return {
      type: JobScheduleType.cron,
      intervalHours: null as number | null,
      intervalDays: null as number | null,
      cronExpression: schedule.expression.trim(),
      timezone,
    };
  }

  private normalizeReminders(reminders: JobReminderDto[] | undefined): ReminderPolicy[] {
    if (!reminders || reminders.length === 0) {
      return [];
    }

    const normalized: ReminderPolicy[] = reminders.map((item) => ({
      offsetHours: item.offsetHours,
      channels: item.channels,
    }));

    const seen = new Set<number>();
    for (const item of normalized) {
      if (seen.has(item.offsetHours)) {
        throw new BadRequestException(`duplicate reminder offsetHours: ${item.offsetHours}`);
      }
      seen.add(item.offsetHours);
    }

    return normalized.sort((a, b) => b.offsetHours - a.offsetHours);
  }

  private parseReminders(value: Prisma.JsonValue): ReminderPolicy[] {
    if (!Array.isArray(value)) return [];

    const reminders: ReminderPolicy[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const offsetHours = this.toNumber(record.offsetHours);
      const channelsRaw = Array.isArray(record.channels) ? record.channels : [];
      const channels = channelsRaw
        .filter((channel): channel is 'in_app' | 'email' | 'push' => {
          return channel === 'in_app' || channel === 'email' || channel === 'push';
        });
      if (!offsetHours || channels.length === 0) continue;
      reminders.push({ offsetHours, channels });
    }
    return reminders;
  }

  private toScheduleConfig(job: JobDefinition) {
    return {
      type: job.scheduleType,
      intervalHours: job.intervalHours,
      intervalDays: job.intervalDays,
      cronExpression: job.cronExpression,
      timezone: job.timezone || 'UTC',
    };
  }

  private computeNextRunAt(
    schedule: {
      type: JobScheduleType;
      intervalHours: number | null;
      intervalDays: number | null;
      cronExpression: string | null;
      timezone: string;
    },
    fromDate: Date,
  ): Date | null {
    if (schedule.type === JobScheduleType.interval_hours && schedule.intervalHours) {
      return new Date(fromDate.getTime() + schedule.intervalHours * 60 * 60 * 1000);
    }

    if (schedule.type === JobScheduleType.interval_days && schedule.intervalDays) {
      return new Date(fromDate.getTime() + schedule.intervalDays * 24 * 60 * 60 * 1000);
    }

    if (schedule.type === JobScheduleType.cron && schedule.cronExpression) {
      return this.computeNextCronRun(schedule.cronExpression, fromDate);
    }

    return null;
  }

  private computeNextCronRun(expression: string, fromDate: Date): Date {
    const parsed = this.parseSimpleCron(expression);
    if (!parsed) {
      throw new BadRequestException('Unsupported cron expression');
    }

    const candidate = new Date(fromDate);
    candidate.setUTCSeconds(0, 0);
    candidate.setUTCMinutes(parsed.minute);
    candidate.setUTCHours(parsed.hour);

    if (parsed.dayOfWeek === null) {
      if (candidate.getTime() <= fromDate.getTime()) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
      }
      return candidate;
    }

    const currentDow = candidate.getUTCDay();
    let delta = (parsed.dayOfWeek - currentDow + 7) % 7;
    if (delta === 0 && candidate.getTime() <= fromDate.getTime()) {
      delta = 7;
    }
    candidate.setUTCDate(candidate.getUTCDate() + delta);
    return candidate;
  }

  private isSupportedCronExpression(expression: string) {
    return !!this.parseSimpleCron(expression);
  }

  private parseSimpleCron(expression: string): { minute: number; hour: number; dayOfWeek: number | null } | null {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const [minutePart, hourPart, dayOfMonthPart, monthPart, dayOfWeekPart] = parts;
    if (dayOfMonthPart !== '*' || monthPart !== '*') return null;

    const minute = this.toNumber(minutePart);
    const hour = this.toNumber(hourPart);
    if (minute === null || minute < 0 || minute > 59) return null;
    if (hour === null || hour < 0 || hour > 23) return null;

    if (dayOfWeekPart === '*') {
      return { minute, hour, dayOfWeek: null };
    }

    const dayOfWeek = this.toNumber(dayOfWeekPart);
    if (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6) return null;

    return { minute, hour, dayOfWeek };
  }

  private async resolveAssignees(job: JobDefinition) {
    if (job.assignmentMode === 'users') {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: job.assignmentUserIds }, isActive: true },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    }

    if (job.assignmentMode === 'yacht_captain') {
      const captains = await this.resolveUsersByRoles(['Captain'], job.yachtId ?? undefined);
      if (captains.length > 0) return captains;
      return this.resolveUsersByRoles(['Management/Office', 'Admin'], job.yachtId ?? undefined);
    }

    if (job.assignmentMode === 'entity_owner') {
      const explicit = await this.resolveUsersByRoles(job.assignmentRoles, job.yachtId ?? undefined);
      if (explicit.length > 0) return explicit;
      return this.resolveUsersByRoles(['Captain', 'Chief Engineer'], job.yachtId ?? undefined);
    }

    return this.resolveUsersByRoles(job.assignmentRoles, job.yachtId ?? undefined);
  }

  private async resolveUsersByRoles(roles: string[], yachtId?: string) {
    if (!roles || roles.length === 0) return [];

    if (!yachtId) {
      const rows = await this.prisma.user.findMany({
        where: {
          isActive: true,
          role: { name: { in: roles } },
        },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    }

    const rows = await this.prisma.userYachtAccess.findMany({
      where: {
        yachtId,
        revokedAt: null,
        user: { isActive: true },
        OR: [
          { roleNameOverride: { in: roles } },
          { user: { role: { name: { in: roles } } } },
        ],
      },
      select: { userId: true },
    });

    return Array.from(new Set(rows.map((row) => row.userId)));
  }

  private async getJobOrThrow(jobId: string) {
    const job = await this.prisma.jobDefinition.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  private toJobResponse(item: JobDefinition) {
    return {
      ...item,
      schedule: {
        type: item.scheduleType,
        expression: item.cronExpression,
        everyHours: item.intervalHours,
        everyDays: item.intervalDays,
        timezone: item.timezone,
      },
      assignmentPolicy: {
        mode: item.assignmentMode,
        roles: item.assignmentRoles,
        userIds: item.assignmentUserIds,
      },
      reminders: this.parseReminders(item.remindersJson),
    };
  }

  private renderTemplate(template: string, variables: Record<string, unknown>) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
      const value = variables[key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  }

  private async dispatchRuleCandidates(candidates: RuleEventCandidate[]) {
    if (candidates.length === 0) return;
    await this.notificationRulesService.dispatchCandidates(candidates);
  }
}
