import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CURRENCY_NAME_MAX_LENGTH,
  normalizeCurrencyCode,
  trimString,
} from '../currency.constants';

// ISO 4217 is about 180 codes, so the default page holds the entire standard.
// Paginating a reference table this small mostly risks a caller silently
// missing codes, which a market-data default of 100 would have done here.
export const DEFAULT_CURRENCY_LIMIT = 500;

const MAX_LIMIT = 1000;

export class QueryCurrencyDto {
  @ApiPropertyOptional({
    example: 'USD',
    description: 'Exact ISO 4217 code; matched case-insensitively',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeCurrencyCode(value))
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    example: 'dollar',
    description: 'Case-insensitive substring match on the name',
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(CURRENCY_NAME_MAX_LENGTH)
  search?: string;

  @ApiPropertyOptional({
    example: DEFAULT_CURRENCY_LIMIT,
    minimum: 1,
    maximum: MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
