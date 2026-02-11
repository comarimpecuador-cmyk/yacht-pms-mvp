import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const INVENTORY_CATEGORIES = [
  'engineering',
  'deck',
  'safety',
  'housekeeping',
  'galley',
  'admin',
  'other',
] as const;

const MOVEMENT_TYPES = ['in', 'out', 'adjustment', 'transfer_in', 'transfer_out'] as const;

export class ListInventoryItemsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(INVENTORY_CATEGORIES)
  category?: (typeof INVENTORY_CATEGORIES)[number];

  @IsOptional()
  @IsIn(['true', 'false', '1', '0'])
  lowStock?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  description?: string;

  @IsString()
  @IsIn(INVENTORY_CATEGORIES)
  category!: (typeof INVENTORY_CATEGORIES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unit!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentStock?: number;

  @IsOptional()
  @IsUUID()
  engineId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(INVENTORY_CATEGORIES)
  category?: (typeof INVENTORY_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsUUID()
  engineId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateInventoryMovementDto {
  @IsString()
  @IsIn(MOVEMENT_TYPES)
  type!: (typeof MOVEMENT_TYPES)[number];

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsString()
  @IsIn(['po', 'maintenance', 'manual', 'logbook', 'other'])
  referenceType?: 'po' | 'maintenance' | 'manual' | 'logbook' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceId?: string;

  @IsOptional()
  @IsUUID()
  maintenanceTaskId?: string;

  @IsOptional()
  @IsUUID()
  engineId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['increase', 'decrease'])
  direction?: 'increase' | 'decrease';

  @IsOptional()
  @IsString()
  occurredAt?: string;
}

export class ListInventoryMovementsQueryDto {
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsString()
  @IsIn(MOVEMENT_TYPES)
  type?: (typeof MOVEMENT_TYPES)[number];

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
