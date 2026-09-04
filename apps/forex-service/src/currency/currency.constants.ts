// ISO 4217 assigns every code exactly three letters, metals included: USD for
// the dollar, XAU for a troy ounce of gold. Codes are stored and compared
// upper-cased, so `usd` from a path or a query string is the same currency.
export const CURRENCY_CODE_LENGTH = 3;

export const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;

export const CURRENCY_CODE_MESSAGE =
  'code must be a three-letter ISO 4217 code such as USD or XAU';

// The longest ISO 4217 name is under 50 characters ("Bond Markets Unit European
// Composite Unit (EURCO)"); 100 leaves room without inviting prose.
export const CURRENCY_NAME_MAX_LENGTH = 100;

// Both take and return `unknown` rather than `string`: a `@Transform` runs
// before validation, so the value may still be anything the caller sent, and a
// non-string is passed through for `@IsString` to reject.
export function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function normalizeCurrencyCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}
