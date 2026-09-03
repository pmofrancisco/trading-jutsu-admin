import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { MaxDecimalPlaces } from './max-decimal-places.validator';

// Mirrors the scale of the matching market_data columns, so a value Postgres
// would silently round is rejected at the edge instead.
const PRICE_DECIMALS = 6;
const VOLUME_DECIMALS = 8;
const TURNOVER_DECIMALS = 6;

export class CreateMarketDataDto {
  @ApiProperty({ example: 'EURUSD', maxLength: 20 })
  @IsString()
  @MaxLength(20)
  symbol: string;

  @ApiProperty({ example: '2026-08-04T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  timestamp: Date;

  @ApiProperty({ example: 1.085421 })
  @IsNumber()
  @MaxDecimalPlaces(PRICE_DECIMALS)
  @IsPositive()
  open: number;

  @ApiProperty({ example: 1.089734 })
  @IsNumber()
  @MaxDecimalPlaces(PRICE_DECIMALS)
  @IsPositive()
  high: number;

  @ApiProperty({ example: 1.083012 })
  @IsNumber()
  @MaxDecimalPlaces(PRICE_DECIMALS)
  @IsPositive()
  low: number;

  @ApiProperty({ example: 1.088256 })
  @IsNumber()
  @MaxDecimalPlaces(PRICE_DECIMALS)
  @IsPositive()
  close: number;

  // Spot forex has no central tape, so both of these are absent from most
  // feeds. Omitting them stores null rather than a fabricated zero.
  @ApiPropertyOptional({
    example: 48213,
    nullable: true,
    description: 'Tick count or lots traded, when the feed reports one',
  })
  @IsOptional()
  @IsNumber()
  @MaxDecimalPlaces(VOLUME_DECIMALS)
  @Min(0)
  volume?: number | null;

  @ApiPropertyOptional({
    example: 5240100.25,
    nullable: true,
    description: 'Quote-currency value traded, when the feed reports one',
  })
  @IsOptional()
  @IsNumber()
  @MaxDecimalPlaces(TURNOVER_DECIMALS)
  @Min(0)
  turnover?: number | null;
}
