import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { normalizeCurrencyCode } from '../../currency/currency.constants';

// Sized like the currency default for the same reason: the pairs a service
// actually tracks number in the dozens, so one page holds the lot and a caller
// listing them cannot silently miss any.
export const DEFAULT_CURRENCY_PAIR_LIMIT = 500;

const MAX_LIMIT = 1000;

export class QueryCurrencyPairDto {
  @ApiPropertyOptional({
    example: 'EURUSD',
    description: 'Exact pair symbol; matched case-insensitively',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeCurrencyCode(value))
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({
    example: 'EUR',
    description:
      'Every pair with this base currency, such as EURUSD and EURJPY',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeCurrencyCode(value))
  @IsString()
  baseCurrencyCode?: string;

  @ApiPropertyOptional({
    example: 'USD',
    description:
      'Every pair priced in this currency, such as EURUSD and GBPUSD',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeCurrencyCode(value))
  @IsString()
  quoteCurrencyCode?: string;

  @ApiPropertyOptional({
    example: DEFAULT_CURRENCY_PAIR_LIMIT,
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
