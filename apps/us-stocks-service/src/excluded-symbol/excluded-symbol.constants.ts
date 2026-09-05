// The tickers this service refuses to store. `market_data.symbol` is
// varchar(20), so an excluded symbol is sized to match: a string the candle
// column could not hold is one no candle can ever carry, and storing it would
// only be a row that never matches anything.
export const EXCLUDED_SYMBOL_MAX_LENGTH = 20;

// US tickers are upper-case letters, sometimes with a class suffix written as
// a dot or a hyphen -- BRK.A, BRK-B -- and a handful of test tickers carry
// digits. Anything outside that is not a ticker the feed will ever quote.
export const EXCLUDED_SYMBOL_REGEX = /^[A-Z0-9.-]{1,20}$/;

export const EXCLUDED_SYMBOL_MESSAGE =
  'symbol must be 1-20 upper-case letters, digits, dots or hyphens, such as AAPL or BRK.A';

// The longest reason worth storing is a sentence, not a paragraph: this column
// exists so a symbol on an 11k-row list can be explained, not annotated.
export const EXCLUDED_SYMBOL_REASON_MAX_LENGTH = 200;

// Stored and compared upper-cased. A denylist that `aapl` slips past is not a
// denylist, so the comparison side normalizes too -- see `isExcluded` and the
// import filter, both of which run an incoming symbol through this first.
//
// The two below take and return `unknown` rather than `string`: a `@Transform`
// runs before validation, so the value may still be anything the caller sent,
// and a non-string is passed through for `@IsString` to reject.
export function normalizeSymbol(value: unknown): unknown {
  return typeof value === 'string' ? normalizeSymbolString(value) : value;
}

export function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

// The string form, for the comparison paths that already hold a `string` and
// have no use for the `unknown` pass-through a `@Transform` needs.
export function normalizeSymbolString(symbol: string): string {
  return symbol.trim().toUpperCase();
}
