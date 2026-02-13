import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationRule, Prisma } from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';
import { PrismaService } from '../../prisma.service';
import { NotificationsService } from './notifications.service';
import {
  CreateNotificationRuleDto,
  ListNotificationRulesQueryDto,
  TestNotificationRuleDto,
  UpdateNotificationRuleDto,
} from './dto/notification-rules.dto';

type CandidateSeverity = 'info' | 'warn' | 'critical';

export interface RuleEventCandidate {
  type: string;
  module: string;
  yachtId?: string;
  entityType?: string;
  entityId?: string;
  severity: CandidateSeverity;
  payload: Record<string, unknown>;
  assigneeUserId?: string | null;
  occurredAt?: Date;
}

@Injectable()
export class NotificationRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly alertsService: AlertsService,
  ) {}

  async listRules(query: ListNotificationRulesQueryDto) {
    const where: Prisma.NotificationRuleWhereInput = {
      module: query.module,
      yachtId: query.yachtId,
      isActive:
        query.status === 'active'
          ? true
          : query.status === 'paused'
            ? false
            : undefined,
    };

    return this.prisma.notificationRule.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createRule(actorUserId: string, dto: CreateNotificationRuleDto) {
    return this.prisma.notificationRule.create({
      data: {
        name: dto.name.trim(),
        module: dto.module,
        eventType: dto.eventType.trim(),
        scopeType: dto.scope.type,
        yachtId: dto.scope.yachtId,
        entityType: dto.scope.entityType,
        entityId: dto.scope.entityId,
        conditionsJson: (dto.conditions ?? {}) as Prisma.InputJsonValue,
        cadenceMode: dto.cadence?.mode ?? 'daily',
        cadenceValue: dto.cadence?.value,
        channels: dto.channels,
        minSeverity: dto.minSeverity ?? 'info',
        templateTitle: dto.template.title.trim(),
        templateMessage: dto.template.message.trim(),
        recipientMode: dto.recipientPolicy.mode,
        recipientRoles: dto.recipientPolicy.roles ?? [],
        recipientUserIds: dto.recipientPolicy.userIds ?? [],
        escalationRoles: dto.recipientPolicy.escalationRoles ?? [],
        dedupeWindowHours: dto.dedupeWindowHours ?? 24,
        isActive: dto.active ?? true,
        createdByUserId: actorUserId,
      },
    });
  }

  async updateRule(ruleId: string, dto: UpdateNotificationRuleDto) {
    const existing = await this.prisma.notificationRule.findUnique({
      where: { id: ruleId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Notification rule not found');
    }

    return this.prisma.notificationRule.update({
      where: { id: ruleId },
      data: {
        name: dto.name?.trim(),
        scopeType: dto.scope?.type,
        yachtId: dto.scope?.yachtId,
        entityType: dto.scope?.entityType,
        entityId: dto.scope?.entityId,
        conditionsJson: dto.conditions as Prisma.InputJsonValue | undefined,
        cadenceMode: dto.cadence?.mode,
        cadenceValue: dto.cadence?.value,
        channels: dto.channels,
        minSeverity: dto.minSeverity,
        templateTitle: dto.template?.title?.trim(),
        templateMessage: dto.template?.message?.trim(),
        recipientMode: dto.recipientPolicy?.mode,
        recipientRoles: dto.recipientPolicy?.roles,
        recipientUserIds: dto.recipientPolicy?.userIds,
        escalationRoles: dto.recipientPolicy?.escalationRoles,
        dedupeWindowHours: dto.dedupeWindowHours,
        isActive: dto.active,
      },
    });
  }

  async testRule(ruleId: string, dto: TestNotificationRuleDto) {
    const rule = await this.prisma.notificationRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException('Notification rule not found');
    }

    const candidate: RuleEventCandidate = {
      type: rule.eventType,
      module: rule.module,
      yachtId: dto.context?.yachtId ?? rule.yachtId ?? undefined,
      entityType: dto.context?.entityType ?? rule.entityType ?? undefined,
      entityId: dto.context?.entityId ?? rule.entityId ?? undefined,
      severity: this.normalizeSeverity(this.pickText(dto.samplePayload, 'severity') ?? rule.minSeverity),
      payload: dto.samplePayload,
      assigneeUserId: dto.context?.assigneeUserId ?? null,
      occurredAt: new Date(),
    };

    const recipients = await this.resolveRecipients(rule, candidate);
    const variables = this.buildTemplateVariables(candidate);

    return {
      rendered: {
        title: this.renderTemplate(rule.templateTitle, variables),
        message: this.renderTemplate(rule.templateMessage, variables),
      },
      recipients,
      conditionMatch: this.matchesConditions(rule, candidate),
    };
  }

  async dispatchCandidates(candidates: RuleEventCandidate[]) {
    if (candidates.length === 0) {
      return { processed: 0, dispatched: 0 };
    }

    const eventTypes = Array.from(new Set(candidates.map((candidate) => candidate.type)));
    const rules = await this.prisma.notificationRule.findMany({
      where: {
        isActive: true,
        eventType: { in: eventTypes },
      },
      orderBy: { updatedAt: 'desc' },
    });

    let processed = 0;
    let dispatched = 0;

    for (const candidate of candidates) {
      const candidateRules = rules.filter((rule) => this.matchesRuleScope(rule, candidate));
      if (candidateRules.length === 0) {
        continue;
      }

      for (const rule of candidateRules) {
        processed += 1;

        if (!this.matchesConditions(rule, candidate)) {
          continue;
        }

        const ruleSeverity = this.normalizeSeverity(rule.minSeverity);
        if (this.severityRank(candidate.severity) < this.severityRank(ruleSeverity)) {
          continue;
        }

        const recipients = await this.resolveRecipients(rule, candidate);
        if (recipients.length === 0) {
          continue;
        }

        const variables = this.buildTemplateVariables(candidate);
        const title = this.renderTemplate(rule.templateTitle, variables);
        const message = this.renderTemplate(rule.templateMessage, variables);
        const basePayload: Record<string, unknown> = {
          ...candidate.payload,
          title,
          message,
          module: rule.module,
          eventType: candidate.type,
        };

        const sentByRule = await this.dispatchToRecipients(rule, candidate, recipients, basePayload);
        if (!sentByRule) {
          continue;
        }

        dispatched += sentByRule;
        await this.prisma.notificationRule.update({
          where: { id: rule.id },
          data: { lastTriggeredAt: new Date() },
        });

        if (candidate.yachtId && this.severityRank(candidate.severity) >= this.severityRank('warn')) {
          const alertDedupeKey = `rule-alert:${this.buildDedupeKey(rule, candidate)}`;
          await this.alertsService.upsertAlert({
            yachtId: candidate.yachtId,
            module: rule.module,
            alertType: candidate.type,
            severity: candidate.severity,
            dedupeKey: alertDedupeKey,
            dueAt: candidate.occurredAt,
            entityId: candidate.entityId,
            assignedTo: recipients[0],
          });
        }
      }
    }

    return { processed, dispatched };
  }

  private async dispatchToRecipients(
    rule: NotificationRule,
    candidate: RuleEventCandidate,
    recipients: string[],
    payload: Record<string, unknown>,
  ) {
    let sent = 0;

    for (const userId of recipients) {
      const dedupeKey = `${this.buildDedupeKey(rule, candidate)}:user:${userId}`;

      for (const channel of rule.channels) {
        if (channel === 'in_app') {
          const result = await this.notificationsService.maybeSendInApp({
            userId,
            yachtId: candidate.yachtId,
            type: candidate.type,
            dedupeKey,
            severity: candidate.severity,
            payload: payload as Prisma.JsonObject,
            dedupeWindowHours: rule.dedupeWindowHours,
          });

          if (result?.status === 'sent') {
            sent += 1;
          }
          continue;
        }

        if (channel === 'email') {
          const result = await this.notificationsService.maybeSendEmail({
            userId,
            yachtId: candidate.yachtId,
            type: candidate.type,
            dedupeKey,
            severity: candidate.severity,
            payload: payload as Prisma.JsonObject,
          });

          if (result?.status === 'sent') {
            sent += 1;
          }
          continue;
        }

        if (channel === 'push') {
          const result = await this.notificationsService.maybeSendPushFuture({
            userId,
            yachtId: candidate.yachtId,
            type: candidate.type,
            dedupeKey,
            severity: candidate.severity,
            payload: payload as Prisma.JsonObject,
          });

          if (result?.status === 'sent') {
            sent += 1;
          }
        }
      }
    }

    return sent;
  }

  private async resolveRecipients(rule: NotificationRule, candidate: RuleEventCandidate) {
    if (rule.recipientMode === 'users') {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: rule.recipientUserIds }, isActive: true },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    }

    if (rule.recipientMode === 'assignee') {
      if (candidate.assigneeUserId) {
        const user = await this.prisma.user.findUnique({
          where: { id: candidate.assigneeUserId },
          select: { id: true, isActive: true },
        });
        if (user?.isActive) return [user.id];
      }
      return this.resolveUsersByRoles(['Captain', 'Management/Office'], candidate.yachtId);
    }

    if (rule.recipientMode === 'role_then_escalate') {
      const primary = candidate.assigneeUserId ? [candidate.assigneeUserId] : [];
      const roleUsers = await this.resolveUsersByRoles(rule.recipientRoles, candidate.yachtId);
      const escalation = await this.resolveUsersByRoles(rule.escalationRoles, candidate.yachtId);
      return Array.from(new Set([...primary, ...roleUsers, ...escalation]));
    }

    return this.resolveUsersByRoles(rule.recipientRoles, candidate.yachtId);
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
        OR: [
          { roleNameOverride: { in: roles } },
          { user: { role: { name: { in: roles } }, isActive: true } },
        ],
      },
      select: { userId: true },
    });

    return Array.from(new Set(rows.map((row) => row.userId)));
  }

  private matchesRuleScope(rule: NotificationRule, candidate: RuleEventCandidate) {
    if (rule.scopeType === 'fleet') {
      return true;
    }

    if (rule.scopeType === 'yacht') {
      return !!candidate.yachtId && rule.yachtId === candidate.yachtId;
    }

    if (rule.scopeType === 'entity') {
      const matchesYacht = rule.yachtId ? rule.yachtId === candidate.yachtId : true;
      const matchesEntityType = rule.entityType ? rule.entityType === candidate.entityType : true;
      const matchesEntityId = rule.entityId ? rule.entityId === candidate.entityId : true;
      return matchesYacht && matchesEntityType && matchesEntityId;
    }

    return false;
  }

  private matchesConditions(rule: NotificationRule, candidate: RuleEventCandidate) {
    const conditions = this.asRecord(rule.conditionsJson);
    if (Object.keys(conditions).length === 0) return true;

    const allClauses = Array.isArray(conditions.all) ? conditions.all : null;
    if (allClauses) {
      return allClauses.every((clause) => this.evaluateClause(this.asRecord(clause), candidate));
    }

    return Object.entries(conditions).every(([key, value]) => {
      const actual = this.getPathValue(candidate.payload, key);
      return actual === value;
    });
  }

  private evaluateClause(clause: Record<string, unknown>, candidate: RuleEventCandidate) {
    const field = typeof clause.field === 'string' ? clause.field : '';
    const op = typeof clause.op === 'string' ? clause.op : 'eq';
    const expected = clause.value;
    if (!field) return true;

    const actual = this.getPathValue(candidate.payload, field);

    if (op === 'eq') return actual === expected;
    if (op === 'neq') return actual !== expected;

    const actualNumber = this.asNumber(actual);
    const expectedNumber = this.asNumber(expected);

    if (op === 'gt') return actualNumber !== null && expectedNumber !== null && actualNumber > expectedNumber;
    if (op === 'gte') return actualNumber !== null && expectedNumber !== null && actualNumber >= expectedNumber;
    if (op === 'lt') return actualNumber !== null && expectedNumber !== null && actualNumber < expectedNumber;
    if (op === 'lte') return actualNumber !== null && expectedNumber !== null && actualNumber <= expectedNumber;

    if (op === 'in' && Array.isArray(expected)) return expected.includes(actual);
    if (op === 'not_in' && Array.isArray(expected)) return !expected.includes(actual);

    if (op === 'contains' && typeof actual === 'string' && typeof expected === 'string') {
      return actual.toLowerCase().includes(expected.toLowerCase());
    }

    return false;
  }

  private buildTemplateVariables(candidate: RuleEventCandidate) {
    return {
      ...candidate.payload,
      yachtId: candidate.yachtId ?? '',
      entityType: candidate.entityType ?? '',
      entityId: candidate.entityId ?? '',
      severity: candidate.severity,
      occurredAt: candidate.occurredAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  private renderTemplate(template: string, variables: Record<string, unknown>) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
      const value = this.getPathValue(variables, key);
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
  }

  private buildDedupeKey(rule: NotificationRule, candidate: RuleEventCandidate) {
    const scope = candidate.entityId ?? candidate.yachtId ?? 'fleet';
    const bucket = typeof candidate.payload.bucket === 'string' ? candidate.payload.bucket : 'default';
    return `rule:${rule.id}:event:${candidate.type}:scope:${scope}:bucket:${bucket}`;
  }

  private getPathValue(source: Record<string, unknown>, path: string): unknown {
    const segments = path.split('.');
    let current: unknown = source;
    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private asNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  }

  private pickText(source: Record<string, unknown>, key: string) {
    const value = source[key];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeSeverity(value: unknown): CandidateSeverity {
    if (value === 'critical') return 'critical';
    if (value === 'warn') return 'warn';
    return 'info';
  }

  private severityRank(value: CandidateSeverity) {
    if (value === 'critical') return 3;
    if (value === 'warn') return 2;
    return 1;
  }
}
