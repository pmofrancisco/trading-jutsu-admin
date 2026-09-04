import { CURRENCY_CODE_LENGTH } from '../currency/currency.constants';

// A pair is its two ISO 4217 codes run together, which is how every feed and
// every caller already writes it: EUR against USD is EURUSD, gold against the
// dollar XAUUSD. Six characters exactly -- the halves are fixed-width, so the
// symbol is too.
export const CURRENCY_PAIR_SYMBOL_LENGTH = CURRENCY_CODE_LENGTH * 2;

export const CURRENCY_PAIR_SYMBOL_REGEX = /^[A-Z]{6}$/;

export const CURRENCY_PAIR_SYMBOL_MESSAGE =
  'symbol must be two three-letter ISO 4217 codes such as EURUSD or XAUUSD';

// The symbol is derived rather than accepted: it is the concatenation, so
// letting a caller send one would only create a way for the two to disagree.
// A CHECK constraint enforces the same rule against direct SQL.
export function toSymbol(
  baseCurrencyCode: string,
  quoteCurrencyCode: string,
): string {
  return `${baseCurrencyCode}${quoteCurrencyCode}`;
}
