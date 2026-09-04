import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import {
  CURRENCY_CODE_LENGTH,
  CURRENCY_CODE_MESSAGE,
  CURRENCY_CODE_REGEX,
  CURRENCY_NAME_MAX_LENGTH,
  normalizeCurrencyCode,
  trimString,
} from '../currency.constants';

export class CreateCurrencyDto {
  @ApiProperty({
    example: 'USD',
    minLength: CURRENCY_CODE_LENGTH,
    maxLength: CURRENCY_CODE_LENGTH,
    description: 'ISO 4217 code; normalized to upper case',
  })
  @Transform(({ value }) => normalizeCurrencyCode(value))
  @IsString()
  @Matches(CURRENCY_CODE_REGEX, { message: CURRENCY_CODE_MESSAGE })
  code: string;

  @ApiProperty({ example: 'US Dollar', maxLength: CURRENCY_NAME_MAX_LENGTH })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(CURRENCY_NAME_MAX_LENGTH)
  name: string;
}
