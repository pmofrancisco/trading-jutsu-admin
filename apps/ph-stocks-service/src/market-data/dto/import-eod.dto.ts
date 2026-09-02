import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ImportEodDto {
  @ApiPropertyOptional({
    example: '2026-08-07',
    description:
      'Trading date (YYYY-MM-DD) of the PSE end-of-day report to import. Defaults to the current date. Kept as a plain string and parsed as a calendar date so it is not shifted by server timezone.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
