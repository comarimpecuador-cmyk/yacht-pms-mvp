import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ListLogbookV2EventsQueryDto {
  @IsUUID()
  yachtId!: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'submitted', 'approved', 'rejected', 'closed', 'cancelled'])
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'closed' | 'cancelled';
}

export class UpdateLogbookV2StatusDto {
  @IsString()
  @IsIn(['submitted', 'approved', 'rejected', 'closed', 'cancelled'])
  status!: 'submitted' | 'approved' | 'rejected' | 'closed' | 'cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  statusReason?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(400)
  reason!: string;
}

export class UpdateLogbookV2EventDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['info', 'warn', 'critical'])
  severity?: 'info' | 'warn' | 'critical';

  @IsString()
  @MinLength(3)
  @MaxLength(400)
  reason!: string;
}
