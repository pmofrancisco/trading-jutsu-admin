// `market_data.symbol` is varchar(20); every symbol is stored upper-cased so a
// candle written as `jfc` and one written as `JFC` land on the same row rather
// than splitting the (symbol, timestamp) unique index in two.
//
// PSE's Daily Quotation Report is the reason this exists: it relabelled the
// index row from `PSEI` to `PSEi` between the August 13 and August 14, 2026
// reports, and the case-sensitive parser silently stopped importing it.
export const SYMBOL_MAX_LENGTH = 20;

// Takes and returns `unknown` rather than `string`: a `@Transform` runs before
// validation, so the value may still be anything the caller sent, and a
// non-string is passed through for `@IsString` to reject.
export function normalizeSymbol(value: unknown): unknown {
  return typeof value === 'string' ? normalizeSymbolString(value) : value;
}

// The string form, for the paths that already hold a `string` -- the EOD
// parser -- and have no use for the `unknown` pass-through above.
export function normalizeSymbolString(symbol: string): string {
  return symbol.trim().toUpperCase();
}
