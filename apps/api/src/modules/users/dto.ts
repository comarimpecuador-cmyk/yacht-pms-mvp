import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class FindUserByEmailDto {
  @IsEmail()
  email!: string;
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  roleName!: string;
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class UserAssignmentDto {
  @IsUUID()
  yachtId!: string;

  @IsOptional()
  @IsString()
  roleNameOverride?: string;
}

export class SetUserAccessesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserAssignmentDto)
  assignments!: UserAssignmentDto[];
}
