import { isNumber } from 'class-validator';
import {
  decimalPlaces,
  hasMaxDecimalPlaces,
} from './max-decimal-places.validator';

describe('decimalPlaces', () => {
  it.each([
    [1.085421, 6],
    [157.3, 1],
    [100, 0],
    [0, 0],
    [0.000012, 6],
    // Below 1e-6 JS switches to exponential notation.
    [1e-7, 7],
    [5e-8, 8],
    [8.91e-9, 11],
    [1.234e-13, 16],
    [1.08542137, 8],
  ])('counts %p as %i decimal places', (value, expected) => {
    expect(decimalPlaces(value)).toBe(expected);
  });
});

describe('hasMaxDecimalPlaces', () => {
  it('accepts a value inside the column scale', () => {
    expect(hasMaxDecimalPlaces(1.0854, 6)).toBe(true);
  });

  it('accepts a value sitting exactly on the column scale', () => {
    expect(hasMaxDecimalPlaces(1e-6, 6)).toBe(true);
  });

  it('rejects a value Postgres would round away', () => {
    expect(hasMaxDecimalPlaces(1.0854217, 6)).toBe(false);
    expect(hasMaxDecimalPlaces(1e-7, 6)).toBe(false);
  });

  it('rejects non-numeric and non-finite values', () => {
    expect(hasMaxDecimalPlaces('0.1', 6)).toBe(false);
    expect(hasMaxDecimalPlaces(Number.NaN, 6)).toBe(false);
    expect(hasMaxDecimalPlaces(Number.POSITIVE_INFINITY, 6)).toBe(false);
  });

  // The reason this validator exists rather than `@IsNumber({ maxDecimalPlaces })`.
  describe('versus class-validator', () => {
    it('does not throw on an exponential value that class-validator chokes on', () => {
      expect(() => isNumber(1e-7, { maxDecimalPlaces: 8 })).toThrow(TypeError);
      expect(() => hasMaxDecimalPlaces(1e-7, 8)).not.toThrow();
      expect(hasMaxDecimalPlaces(1e-7, 8)).toBe(true);
    });

    it('counts an exponential value that class-validator undercounts', () => {
      // class-validator reads "234e-13" and calls it 7 decimal places, not 16.
      expect(isNumber(1.234e-13, { maxDecimalPlaces: 8 })).toBe(true);
      expect(hasMaxDecimalPlaces(1.234e-13, 8)).toBe(false);
    });
  });
});
