import {
  DocumentConfidentiality,
  DocumentStatus,
  DocumentWorkflowStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBooleanString,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsString()
  yachtId!: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsEnum(DocumentWorkflowStatus)
  workflowStatus?: DocumentWorkflowStatus;

  @IsOptional()
  @IsString()
  docType?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBooleanString()
  expiringSoon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiringInDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateDocumentVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  fileKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  fileUrl?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  fileName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  mimeType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  checksumSha256?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateDocumentDto {
  @IsOptional()
  @IsString()
  yachtId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  docType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  docSubType?: string;

  @IsOptional()
  @IsEnum(DocumentConfidentiality)
  confidentiality?: DocumentConfidentiality;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  identifier?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDocumentVersionDto)
  initialVersion?: CreateDocumentVersionDto;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  docType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  docSubType?: string;

  @IsOptional()
  @IsEnum(DocumentConfidentiality)
  confidentiality?: DocumentConfidentiality;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;
}

export class AddDocumentEvidenceDto {
  @IsString()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateDocumentRenewalDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsDateString()
  newExpiryDate?: string;
}

export class SubmitDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}

export class ApproveDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}

export class RejectDocumentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
