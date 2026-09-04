import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import {
  CURRENCY_CODE_LENGTH,
  CURRENCY_CODE_MESSAGE,
  CURRENCY_CODE_REGEX,
  normalizeCurrencyCode,
} from '../../currency/currency.constants';

// No `symbol` field: it is the concatenation of the two codes, so the service
// derives it. Accepting one would only create a way for a caller to send
// EURUSD with a base of GBP.
export class CreateCurrencyPairDto {
  @ApiProperty({
    example: 'EUR',
    minLength: CURRENCY_CODE_LENGTH,
    maxLength: CURRENCY_CODE_LENGTH,
    description:
      'ISO 4217 code of the currency being bought; normalized to upper case',
  })
  @Transform(({ value }) => normalizeCurrencyCode(value))
  @IsString()
  @Matches(CURRENCY_CODE_REGEX, { message: CURRENCY_CODE_MESSAGE })
  baseCurrencyCode: string;

  @ApiProperty({
    example: 'USD',
    minLength: CURRENCY_CODE_LENGTH,
    maxLength: CURRENCY_CODE_LENGTH,
    description:
      'ISO 4217 code the pair is priced in; normalized to upper case',
  })
  @Transform(({ value }) => normalizeCurrencyCode(value))
  @IsString()
  @Matches(CURRENCY_CODE_REGEX, { message: CURRENCY_CODE_MESSAGE })
  quoteCurrencyCode: string;
}
