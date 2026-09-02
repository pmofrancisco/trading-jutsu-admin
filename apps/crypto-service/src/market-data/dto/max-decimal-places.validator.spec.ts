import { isNumber } from 'class-validator';
import {
  decimalPlaces,
  hasMaxDecimalPlaces,
} from './max-decimal-places.validator';

describe('decimalPlaces', () => {
  it.each([
    [104523.87, 2],
    [105204.3, 1],
    [100, 0],
    [0, 0],
    [0.00000891, 8],
    // Below 1e-6 JS switches to exponential notation.
    [1e-7, 7],
    [5e-8, 8],
    [8.91e-9, 11],
    [1.234e-13, 16],
    [12843.00341, 5],
  ])('counts %p as %i decimal places', (value, expected) => {
    expect(decimalPlaces(value)).toBe(expected);
  });
});

describe('hasMaxDecimalPlaces', () => {
  it('accepts a value inside the column scale', () => {
    expect(hasMaxDecimalPlaces(0.00000000891, 12)).toBe(true);
  });

  it('accepts a value sitting exactly on the column scale', () => {
    expect(hasMaxDecimalPlaces(1e-12, 12)).toBe(true);
  });

  it('rejects a value Postgres would round away', () => {
    expect(hasMaxDecimalPlaces(1.234e-13, 12)).toBe(false);
  });

  it('rejects non-numeric and non-finite values', () => {
    expect(hasMaxDecimalPlaces('0.1', 12)).toBe(false);
    expect(hasMaxDecimalPlaces(Number.NaN, 12)).toBe(false);
    expect(hasMaxDecimalPlaces(Number.POSITIVE_INFINITY, 12)).toBe(false);
  });

  // The reason this validator exists rather than `@IsNumber({ maxDecimalPlaces })`.
  describe('versus class-validator', () => {
    it('does not throw on an exponential value that class-validator chokes on', () => {
      expect(() => isNumber(1e-7, { maxDecimalPlaces: 12 })).toThrow(TypeError);
      expect(() => hasMaxDecimalPlaces(1e-7, 12)).not.toThrow();
      expect(hasMaxDecimalPlaces(1e-7, 12)).toBe(true);
    });

    it('counts an exponential value that class-validator undercounts', () => {
      // class-validator reads "234e-13" and calls it 4 decimal places.
      expect(isNumber(1.234e-13, { maxDecimalPlaces: 12 })).toBe(true);
      expect(hasMaxDecimalPlaces(1.234e-13, 12)).toBe(false);
    });
  });
});
