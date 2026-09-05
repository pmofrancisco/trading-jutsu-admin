import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  EXCLUDED_SYMBOL_MAX_LENGTH,
  EXCLUDED_SYMBOL_MESSAGE,
  EXCLUDED_SYMBOL_REASON_MAX_LENGTH,
  EXCLUDED_SYMBOL_REGEX,
  normalizeSymbol,
  trimString,
} from '../excluded-symbol.constants';

export class CreateExcludedSymbolDto {
  @ApiProperty({
    example: 'ZVZZT',
    maxLength: EXCLUDED_SYMBOL_MAX_LENGTH,
    description: 'Ticker to exclude from imports; normalized to upper case',
  })
  @Transform(({ value }) => normalizeSymbol(value))
  @IsString()
  @Matches(EXCLUDED_SYMBOL_REGEX, { message: EXCLUDED_SYMBOL_MESSAGE })
  symbol: string;

  @ApiPropertyOptional({
    example: 'NASDAQ test ticker',
    maxLength: EXCLUDED_SYMBOL_REASON_MAX_LENGTH,
    description: 'Why the symbol is excluded',
  })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(EXCLUDED_SYMBOL_REASON_MAX_LENGTH)
  reason?: string;
}
