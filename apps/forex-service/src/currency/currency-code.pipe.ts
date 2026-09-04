import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import {
  CURRENCY_CODE_MESSAGE,
  CURRENCY_CODE_REGEX,
  normalizeCurrencyCode,
} from './currency.constants';

// A path parameter never goes through a DTO, so the `@Transform` that
// upper-cases a code in a request body does not reach `/currencies/usd`. This
// applies the same normalization and check to the param, turning a malformed
// code into a 400 rather than a 404 for a row that could not exist.
@Injectable()
export class ParseCurrencyCodePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const code = normalizeCurrencyCode(value);
    if (typeof code !== 'string' || !CURRENCY_CODE_REGEX.test(code)) {
      throw new BadRequestException(
        `Invalid currency code "${value}"; ${CURRENCY_CODE_MESSAGE}`,
      );
    }
    return code;
  }
}
