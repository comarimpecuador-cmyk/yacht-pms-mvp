import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateYachtDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(10)
  flag!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  imoOptional?: string;
}

export class GrantYachtAccessDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsString()
  roleNameOverride?: string;
}

export class UpdateYachtDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  flag?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  imoOptional?: string;
}

export class UpdateYachtAccessDto {
  @IsOptional()
  @IsString()
  roleNameOverride?: string;
}
