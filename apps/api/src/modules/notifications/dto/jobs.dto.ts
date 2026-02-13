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

const JOB_SCHEDULE_TYPES = ['interval_hours', 'interval_days', 'cron'] as const;
const JOB_STATUSES = ['active', 'paused', 'archived'] as const;
const ASSIGNMENT_MODES = ['roles', 'users', 'entity_owner', 'yacht_captain'] as const;
const JOB_CHANNELS = ['in_app', 'email', 'push'] as const;

export class JobScheduleDto {
  @IsIn(JOB_SCHEDULE_TYPES)
  type!: (typeof JOB_SCHEDULE_TYPES)[number];

  @IsOptional()
  @IsString()
  expression?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  everyHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  everyDays?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class JobAssignmentPolicyDto {
  @IsIn(ASSIGNMENT_MODES)
  mode!: (typeof ASSIGNMENT_MODES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  userIds?: string[];
}

export class JobReminderDto {
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  offsetHours!: number;

  @IsArray()
  @IsIn(JOB_CHANNELS, { each: true })
  channels!: Array<(typeof JOB_CHANNELS)[number]>;
}

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsIn(MODULES)
  module!: (typeof MODULES)[number];

  @IsOptional()
  @IsUUID()
  yachtId?: string;

  @IsString()
  @IsNotEmpty()
  instructionsTemplate!: string;

  @ValidateNested()
  @Type(() => JobScheduleDto)
  schedule!: JobScheduleDto;

  @ValidateNested()
  @Type(() => JobAssignmentPolicyDto)
  assignmentPolicy!: JobAssignmentPolicyDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobReminderDto)
  reminders?: JobReminderDto[];

  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];
}

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  instructionsTemplate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => JobScheduleDto)
  schedule?: JobScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => JobAssignmentPolicyDto)
  assignmentPolicy?: JobAssignmentPolicyDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobReminderDto)
  reminders?: JobReminderDto[];

  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];
}

export class ListJobsQueryDto {
  @IsOptional()
  @IsUUID()
  yachtId?: string;

  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];
}

export class JobTestRunRequestDto {
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
