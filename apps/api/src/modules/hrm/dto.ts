import { HrmLeaveStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ListSchedulesQueryDto {
  @IsString()
  yachtId!: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class CreateScheduleDto {
  @IsString()
  yachtId!: string;

  @IsString()
  userId!: string;

  @IsDateString()
  workDate!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  restHours?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateScheduleDto {
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  restHours?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RestHoursReportQueryDto {
  @IsString()
  yachtId!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CreateRestDeclarationDto {
  @IsString()
  yachtId!: string;

  @IsString()
  userId!: string;

  @IsDateString()
  workDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  workedHours!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  restHours!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class ListLeavesQueryDto {
  @IsString()
  yachtId!: string;

  @IsOptional()
  @IsEnum(HrmLeaveStatus)
  status?: HrmLeaveStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CreateLeaveRequestDto {
  @IsString()
  yachtId!: string;

  @IsString()
  userId!: string;

  @IsString()
  type!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class ReviewLeaveRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListPayrollsQueryDto {
  @IsString()
  yachtId!: string;

  @IsOptional()
  @IsString()
  period?: string;
}

export class GeneratePayrollDto {
  @IsString()
  yachtId!: string;

  @Matches(/^\d{4}-\d{2}$/)
  period!: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class GetPayrollByIdParamsDto {
  @IsString()
  id!: string;
}
