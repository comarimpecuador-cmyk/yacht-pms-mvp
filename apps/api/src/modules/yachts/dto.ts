import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateYachtDto {
  @IsString()
  name!: string;

  @IsString()
  flag!: string;

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
