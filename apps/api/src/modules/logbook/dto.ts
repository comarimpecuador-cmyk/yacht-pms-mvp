import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LogBookEngineReadingInputDto {
  @IsUUID()
  engineId!: string;

  @IsNumber()
  @Min(0)
  hours!: number;
}

export class LogBookObservationInputDto {
  @IsString()
  @MaxLength(50)
  category!: string;

  @IsString()
  @MaxLength(500)
  text!: string;
}

export class CreateLogBookEntryDto {
  @IsUUID()
  yachtId!: string;

  @IsDateString()
  entryDate!: string;

  @IsString()
  watchPeriod!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LogBookEngineReadingInputDto)
  engineReadings!: LogBookEngineReadingInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LogBookObservationInputDto)
  observations!: LogBookObservationInputDto[];
}

export class UpdateLogBookEntryDto {
  @IsOptional()
  @IsString()
  watchPeriod?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LogBookEngineReadingInputDto)
  engineReadings?: LogBookEngineReadingInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LogBookObservationInputDto)
  observations?: LogBookObservationInputDto[];
}

export class CreateEngineDto {
  @IsUUID()
  yachtId!: string;

  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsString()
  serialNo!: string;
}
