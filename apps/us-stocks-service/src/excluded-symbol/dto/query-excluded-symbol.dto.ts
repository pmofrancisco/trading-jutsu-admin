import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { normalizeSymbol } from '../excluded-symbol.constants';

// Smaller than the table: this list runs to five figures, so a caller paging
// through it is the normal case rather than a sign of misuse, and one page is
// never going to hold the lot the way it does for `currency_pair`.
export const DEFAULT_EXCLUDED_SYMBOL_LIMIT = 100;

const MAX_LIMIT = 1000;

export class QueryExcludedSymbolDto {
  @ApiPropertyOptional({
    example: 'ZVZZT',
    description: 'Exact symbol; matched case-insensitively',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeSymbol(value))
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({
    example: DEFAULT_EXCLUDED_SYMBOL_LIMIT,
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
