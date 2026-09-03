import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';

export const MAX_DECIMAL_PLACES = 'maxDecimalPlaces';

// class-validator's own `@IsNumber({ maxDecimalPlaces })` reads the digits after
// the '.' of `value.toString()`, which breaks on exponential notation: JS renders
// anything below 1e-6 that way, so `1e-7` has no '.' at all and the check throws
// a TypeError -- turning a bad request into a 500 -- while `1.234e-13` is
// miscounted as 4 decimals rather than 16 and slips through. Forex sits right on
// that boundary: a rate quoted against a hyperinflated currency falls below 1e-6,
// and any caller can send such a number. Going through `toExponential()` gives
// the exponent explicitly, so both forms are counted the same way.
export function decimalPlaces(value: number): number {
  const [mantissa, exponent] = value.toExponential().split('e');
  const fractionDigits = mantissa.split('.')[1]?.length ?? 0;
  return Math.max(0, fractionDigits - Number(exponent));
}

export function hasMaxDecimalPlaces(value: unknown, max: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    decimalPlaces(value) <= max
  );
}

// Rejects a value that Postgres would silently round to fit the column's scale.
export function MaxDecimalPlaces(
  max: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: MAX_DECIMAL_PLACES,
      constraints: [max],
      validator: {
        validate: (value, args) =>
          hasMaxDecimalPlaces(value, args?.constraints[0] as number),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must not have more than $constraint1 decimal places`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
