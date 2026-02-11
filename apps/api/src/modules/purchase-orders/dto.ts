import {
  IsArray,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const PURCHASE_ORDER_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
] as const;

export class ListPurchaseOrdersQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(PURCHASE_ORDER_STATUSES)
  status?: (typeof PURCHASE_ORDER_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vendor?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class PurchaseOrderLineInputDto {
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  freeTextName?: string;

  @IsNumber()
  @Min(0.0001)
  quantityOrdered!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsString()
  requiredByAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;
}

export class CreatePurchaseOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  vendorName!: string;

  @IsOptional()
  @IsEmail()
  vendorEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vendorPhone?: string;

  @IsOptional()
  @IsString()
  expectedDeliveryAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineInputDto)
  lines!: PurchaseOrderLineInputDto[];
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  vendorName?: string;

  @IsOptional()
  @IsEmail()
  vendorEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vendorPhone?: string;

  @IsOptional()
  @IsString()
  expectedDeliveryAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineInputDto)
  lines?: PurchaseOrderLineInputDto[];
}

export class PurchaseOrderActionReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(400)
  reason!: string;
}

export class ReceivePurchaseOrderLineDto {
  @IsUUID()
  purchaseOrderLineId!: string;

  @IsNumber()
  @Min(0.0001)
  quantityReceived!: number;
}

export class ReceivePurchaseOrderDto {
  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(400)
  reason!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  lines!: ReceivePurchaseOrderLineDto[];
}

export class AddPurchaseOrderAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(220)
  fileKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fileUrl?: string;

  @IsString()
  @MaxLength(220)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  note?: string;
}
