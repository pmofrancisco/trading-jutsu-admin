import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsPositive,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { SYMBOL_MAX_LENGTH, normalizeSymbol } from '../market-data.constants';

export class CreateMarketDataDto {
  @ApiProperty({
    example: 'JFC',
    maxLength: SYMBOL_MAX_LENGTH,
    description: 'Ticker or index symbol; normalized to upper case',
  })
  @Transform(({ value }) => normalizeSymbol(value))
  @IsString()
  @MaxLength(SYMBOL_MAX_LENGTH)
  symbol: string;

  @ApiProperty({ example: '2026-08-04T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  timestamp: Date;

  @ApiProperty({ example: 250.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  open: number;

  @ApiProperty({ example: 255 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  high: number;

  @ApiProperty({ example: 248.2 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  low: number;

  @ApiProperty({ example: 252.8 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  close: number;

  @ApiProperty({ example: 1250000 })
  @IsNumber()
  @Min(0)
  volume: number;

  @ApiProperty({ example: 315000000 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  turnover: number;
}
