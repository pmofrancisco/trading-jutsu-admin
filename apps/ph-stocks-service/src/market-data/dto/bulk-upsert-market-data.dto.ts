import { Type } from 'class-transformer';
import { ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateMarketDataDto } from './create-market-data.dto';

export class BulkUpsertMarketDataDto {
  @ValidateNested({ each: true })
  @Type(() => CreateMarketDataDto)
  @ArrayMinSize(1)
  candles: CreateMarketDataDto[];
}
