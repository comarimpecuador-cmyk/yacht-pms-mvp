import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

const SCENARIOS = [
  'inventory_low_stock',
  'maintenance_due_this_week',
  'documents_renewal_due',
  'purchase_order_pending',
  'engines_service_due',
] as const;

export class SendScenarioEmailRecipientDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class SendScenarioEmailsDto {
  @IsEmail()
  @IsOptional()
  toEmail?: string;

  @IsOptional()
  @IsString()
  toName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => SendScenarioEmailRecipientDto)
  recipients?: SendScenarioEmailRecipientDto[];

  @IsOptional()
  @IsUUID()
  yachtId?: string;

  @IsOptional()
  @IsArray()
  @IsIn(SCENARIOS, { each: true })
  scenarios?: Array<(typeof SCENARIOS)[number]>;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  responsibleName?: string;

  @IsOptional()
  @IsEmail()
  responsibleEmail?: string;

  @IsOptional()
  @IsString()
  responsibleRole?: string;
}

export class SendTestEmailsDto extends SendScenarioEmailsDto {}
