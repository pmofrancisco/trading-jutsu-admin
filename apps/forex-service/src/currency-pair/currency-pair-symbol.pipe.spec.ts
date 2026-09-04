import { BadRequestException } from '@nestjs/common';
import { ParseCurrencyPairSymbolPipe } from './currency-pair-symbol.pipe';

describe('ParseCurrencyPairSymbolPipe', () => {
  const pipe = new ParseCurrencyPairSymbolPipe();

  it('upper-cases and trims a symbol', () => {
    expect(pipe.transform(' eurusd ')).toBe('EURUSD');
  });

  it('accepts a metal pair', () => {
    expect(pipe.transform('xauusd')).toBe('XAUUSD');
  });

  // A single code reaching this route is a malformed request, not a lookup of
  // a pair that happens not to exist -- 400 rather than 404.
  it.each(['EUR', 'EURUSDX', 'EUR-USD', 'EUR1SD', ''])(
    'rejects "%s"',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );
});
