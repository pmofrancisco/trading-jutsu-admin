import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateCurrencyDto } from './create-currency.dto';

// ISO 4217 is about 180 codes, so a cap of 1000 is generous headroom for the
// whole standard at once. It also keeps a batch at 2000 bound parameters --
// well inside the Postgres 65535 ceiling -- so unlike a market-data upsert this
// one needs no chunking, and an absurd batch fails as a 400 rather than a 500.
const MAX_CURRENCIES = 1000;

export class BulkUpsertCurrencyDto {
  @ApiProperty({ type: [CreateCurrencyDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateCurrencyDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CURRENCIES)
  currencies: CreateCurrencyDto[];
}
