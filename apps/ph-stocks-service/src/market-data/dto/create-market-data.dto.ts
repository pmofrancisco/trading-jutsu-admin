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

export class CreateMarketDataDto {
  @ApiProperty({ example: 'JFC', maxLength: 20 })
  @IsString()
  @MaxLength(20)
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
