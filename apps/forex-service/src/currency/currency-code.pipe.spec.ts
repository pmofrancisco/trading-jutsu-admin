import { BadRequestException } from '@nestjs/common';
import { ParseCurrencyCodePipe } from './currency-code.pipe';

describe('ParseCurrencyCodePipe', () => {
  const pipe = new ParseCurrencyCodePipe();

  it('passes a well-formed code through', () => {
    expect(pipe.transform('XAU')).toBe('XAU');
  });

  // The DTO `@Transform` never runs on a path parameter, so `/currencies/usd`
  // would otherwise miss a row stored as USD.
  it('upper-cases and trims the code', () => {
    expect(pipe.transform(' usd ')).toBe('USD');
  });

  it.each(['US', 'USDD', 'US1', ''])('rejects %p as a bad request', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
