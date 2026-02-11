import { MaintenanceTaskPriority, MaintenanceTaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ListMaintenanceTasksQueryDto {
  @IsString()
  yachtId!: string;

  @IsOptional()
  @IsEnum(MaintenanceTaskStatus)
  status?: MaintenanceTaskStatus;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}

export class CreateMaintenanceTaskDto {
  @IsString()
  yachtId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  engineId?: string;

  @IsOptional()
  @IsString()
  systemTag?: string;

  @IsOptional()
  @IsEnum(MaintenanceTaskPriority)
  priority?: MaintenanceTaskPriority;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}

export class UpdateMaintenanceTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  engineId?: string;

  @IsOptional()
  @IsString()
  systemTag?: string;

  @IsOptional()
  @IsEnum(MaintenanceTaskPriority)
  priority?: MaintenanceTaskPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}

export class RejectMaintenanceTaskDto {
  @IsString()
  reason!: string;
}

export class CompleteMaintenanceTaskDto {
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  workHours?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddMaintenanceEvidenceDto {
  @IsString()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
