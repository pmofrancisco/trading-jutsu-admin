import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateCurrencyPairDto } from './create-currency-pair.dto';

// Each pair binds 3 parameters (symbol and the two codes), so 1000 of them is
// 3000 -- well inside the Postgres 65535 ceiling, and so no chunking is needed
// here any more than in the currency upsert. An absurd batch fails as a 400
// rather than a 500.
const MAX_CURRENCY_PAIRS = 1000;

export class BulkUpsertCurrencyPairDto {
  @ApiProperty({ type: [CreateCurrencyPairDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateCurrencyPairDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CURRENCY_PAIRS)
  currencyPairs: CreateCurrencyPairDto[];
}
