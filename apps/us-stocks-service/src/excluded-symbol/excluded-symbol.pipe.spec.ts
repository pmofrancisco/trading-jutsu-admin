import { BadRequestException } from '@nestjs/common';
import { ParseExcludedSymbolPipe } from './excluded-symbol.pipe';

describe('ParseExcludedSymbolPipe', () => {
  const pipe = new ParseExcludedSymbolPipe();

  it('upper-cases and trims a symbol', () => {
    expect(pipe.transform(' zvzzt ')).toBe('ZVZZT');
  });

  // US tickers carry a class suffix written either way, so both reach this
  // route and both name a row that can exist.
  it.each(['brk.a', 'brk-b'])('accepts the class suffix in "%s"', (value) => {
    expect(pipe.transform(value)).toBe(value.toUpperCase());
  });

  it('accepts a ticker carrying digits', () => {
    expect(pipe.transform('zvv2')).toBe('ZVV2');
  });

  it('accepts a symbol at the full column width', () => {
    expect(pipe.transform('A'.repeat(20))).toBe('A'.repeat(20));
  });

  // A symbol `market_data.symbol` could not hold, or one built from characters
  // no ticker uses, is a malformed request rather than a lookup of a row that
  // happens not to exist -- 400 rather than 404.
  it.each(['', '   ', 'A'.repeat(21), 'BRK A', 'BRK_A', 'BRK/A', 'BRK$'])(
    'rejects "%s"',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );
});
