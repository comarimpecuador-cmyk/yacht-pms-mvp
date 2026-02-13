import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const MODULES = [
  'inventory',
  'maintenance',
  'documents',
  'jobs',
  'hrm',
  'purchase_orders',
  'logbook',
] as const;

const CHANNELS = ['in_app', 'email', 'push'] as const;
const SEVERITIES = ['info', 'warn', 'critical'] as const;
const SCOPE_TYPES = ['fleet', 'yacht', 'entity'] as const;
const CADENCE_MODES = ['once', 'hourly', 'daily', 'every_n_hours', 'every_n_days'] as const;
const RECIPIENT_MODES = ['roles', 'users', 'assignee', 'role_then_escalate'] as const;

export class NotificationRuleScopeDto {
  @IsIn(SCOPE_TYPES)
  type!: (typeof SCOPE_TYPES)[number];

  @IsOptional()
  @IsUUID()
  yachtId?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;
}

export class NotificationRuleCadenceDto {
  @IsIn(CADENCE_MODES)
  mode!: (typeof CADENCE_MODES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  value?: number;
}

export class NotificationRuleTemplateDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;
}

export class NotificationRuleRecipientPolicyDto {
  @IsIn(RECIPIENT_MODES)
  mode!: (typeof RECIPIENT_MODES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  escalationRoles?: string[];
}

export class CreateNotificationRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(MODULES)
  module!: (typeof MODULES)[number];

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @ValidateNested()
  @Type(() => NotificationRuleScopeDto)
  scope!: NotificationRuleScopeDto;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationRuleCadenceDto)
  cadence?: NotificationRuleCadenceDto;

  @IsArray()
  @IsIn(CHANNELS, { each: true })
  channels!: Array<(typeof CHANNELS)[number]>;

  @IsOptional()
  @IsIn(SEVERITIES)
  minSeverity?: (typeof SEVERITIES)[number];

  @ValidateNested()
  @Type(() => NotificationRuleTemplateDto)
  template!: NotificationRuleTemplateDto;

  @ValidateNested()
  @Type(() => NotificationRuleRecipientPolicyDto)
  recipientPolicy!: NotificationRuleRecipientPolicyDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  dedupeWindowHours?: number;
}

export class UpdateNotificationRuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationRuleScopeDto)
  scope?: NotificationRuleScopeDto;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationRuleCadenceDto)
  cadence?: NotificationRuleCadenceDto;

  @IsOptional()
  @IsArray()
  @IsIn(CHANNELS, { each: true })
  channels?: Array<(typeof CHANNELS)[number]>;

  @IsOptional()
  @IsIn(SEVERITIES)
  minSeverity?: (typeof SEVERITIES)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationRuleTemplateDto)
  template?: NotificationRuleTemplateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationRuleRecipientPolicyDto)
  recipientPolicy?: NotificationRuleRecipientPolicyDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  dedupeWindowHours?: number;
}

export class TestNotificationRuleDto {
  @IsObject()
  samplePayload!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  context?: {
    yachtId?: string;
    entityType?: string;
    entityId?: string;
    assigneeUserId?: string;
  };
}

export class ListNotificationRulesQueryDto {
  @IsOptional()
  @IsIn(MODULES)
  module?: (typeof MODULES)[number];

  @IsOptional()
  @IsUUID()
  yachtId?: string;

  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: 'active' | 'paused';
}
