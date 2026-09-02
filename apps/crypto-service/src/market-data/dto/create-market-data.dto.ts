import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsPositive,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { MaxDecimalPlaces } from './max-decimal-places.validator';

// Mirrors the scale of the matching market_data columns, so a value Postgres
// would silently round is rejected at the edge instead.
const PRICE_DECIMALS = 12;
const VOLUME_DECIMALS = 12;
const TURNOVER_DECIMALS = 8;

export class CreateMarketDataDto {
  @ApiProperty({ example: 'BTC', maxLength: 20 })
  @IsString()
  @MaxLength(20)
  symbol: string;

  @ApiProperty({ example: '2026-08-04T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  timestamp: Date;

  @ApiProperty({ example: 104523.87 })
  @IsNumber()
  @MaxDecimalPlaces(PRICE_DECIMALS)
  @IsPositive()
  open: number;

  @ApiProperty({ example: 105980.12 })
  @IsNumber()
  @MaxDecimalPlaces(PRICE_DECIMALS)
  @IsPositive()
  high: number;

  @ApiProperty({ example: 103410.55 })
  @IsNumber()
  @MaxDecimalPlaces(PRICE_DECIMALS)
  @IsPositive()
  low: number;

  @ApiProperty({ example: 105204.3 })
  @IsNumber()
  @MaxDecimalPlaces(PRICE_DECIMALS)
  @IsPositive()
  close: number;

  @ApiProperty({ example: 12843.00341, description: 'Base-asset units traded' })
  @IsNumber()
  @MaxDecimalPlaces(VOLUME_DECIMALS)
  @Min(0)
  volume: number;

  @ApiProperty({
    example: 1348920455.31,
    description: 'Quote-currency value traded',
  })
  @IsNumber()
  @MaxDecimalPlaces(TURNOVER_DECIMALS)
  @Min(0)
  turnover: number;
}
