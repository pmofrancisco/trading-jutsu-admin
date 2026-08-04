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
  @IsString()
  @MaxLength(20)
  symbol: string;

  @Type(() => Date)
  @IsDate()
  timestamp: Date;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  open: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  high: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  low: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  close: number;

  @IsNumber()
  @Min(0)
  volume: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  turnover: number;
}
