import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateExcludedSymbolDto } from './create-excluded-symbol.dto';

// Seeding this list is the expected use and it runs to five figures, where
// `currency_pair` in forex-service runs to dozens -- so the cap is high enough
// to take a whole exclusion list in one request. The service chunks the batch
// to stay inside the Postgres bound-parameter ceiling, the same way the
// market-data upsert does; this cap only keeps an absurd body from being a 500.
const MAX_EXCLUDED_SYMBOLS = 20000;

export class BulkUpsertExcludedSymbolDto {
  @ApiProperty({ type: [CreateExcludedSymbolDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateExcludedSymbolDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EXCLUDED_SYMBOLS)
  excludedSymbols: CreateExcludedSymbolDto[];
}
