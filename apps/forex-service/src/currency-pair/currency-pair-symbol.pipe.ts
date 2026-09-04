import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { normalizeCurrencyCode } from '../currency/currency.constants';
import {
  CURRENCY_PAIR_SYMBOL_MESSAGE,
  CURRENCY_PAIR_SYMBOL_REGEX,
} from './currency-pair.constants';

// A path parameter never goes through a DTO, so `/currency-pairs/eurusd` would
// otherwise reach the repository lower-cased and 404 for a row that exists.
// `normalizeCurrencyCode` trims and upper-cases the same way it does for a
// single code -- a symbol is just two of them.
@Injectable()
export class ParseCurrencyPairSymbolPipe implements PipeTransform<
  string,
  string
> {
  transform(value: string): string {
    const symbol = normalizeCurrencyCode(value);
    if (
      typeof symbol !== 'string' ||
      !CURRENCY_PAIR_SYMBOL_REGEX.test(symbol)
    ) {
      throw new BadRequestException(
        `Invalid currency pair symbol "${value}"; ${CURRENCY_PAIR_SYMBOL_MESSAGE}`,
      );
    }
    return symbol;
  }
}
