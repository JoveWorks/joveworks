import { describe, expect, it } from 'vitest';

import {
  ANGLE,
  FORCE,
  LENGTH,
  UnitError,
  assertDimensionsCompatible,
  compatibleDisplayUnits,
  convert,
  formatQuantity,
  fromCanonical,
  parseQuantity,
  parseUnit,
  prefixableAtomOf,
  siPrefixedUnit,
  stripNumberFormatting,
  toCanonical,
  toDecimalPlaces,
  toSignificantFigures,
  type NumberFormat,
} from './index.js';

describe('boundary conversion', () => {
  it('offers only compatible choices in the display-unit picker', () => {
    expect(compatibleDisplayUnits(parseUnit('Pa').dimension).map((unit) => unit.symbol)).toEqual(
      expect.arrayContaining(['Pa', 'N/mm²']),
    );
    expect(compatibleDisplayUnits(parseUnit('Pa').dimension).map((unit) => unit.symbol)).not.toContain('mm');
    expect(compatibleDisplayUnits(parseUnit('Pa').dimension).map((unit) => unit.symbol)).not.toContain('MPa');
  });

  it('offers both mm and m for a length dimension, so switching back and forth never loses one', () => {
    expect(compatibleDisplayUnits(parseUnit('mm').dimension).map((unit) => unit.symbol)).toEqual(
      expect.arrayContaining(['mm', 'm']),
    );
  });

  it('offers both W and kW for a power dimension, so a port authored in kW can be switched back', () => {
    expect(compatibleDisplayUnits(parseUnit('kW').dimension).map((unit) => unit.symbol)).toEqual(
      expect.arrayContaining(['W', 'kW']),
    );
  });

  it('converts into and out of canonical units', () => {
    expect(toCanonical(2.5, parseUnit('m'))).toBe(2500);
    expect(fromCanonical(2500, parseUnit('m'))).toBe(2.5);
    expect(toCanonical(250, parseUnit('kW'))).toBe(2.5e8); // N·mm/s
    expect(convert(1, parseUnit('MPa'), parseUnit('N/mm²'))).toBeCloseTo(1, 12);
    expect(convert(3600, parseUnit('s'), parseUnit('h'))).toBeCloseTo(1, 12);
  });

  it('keeps angles in radians internally and degrees at the boundary', () => {
    expect(toCanonical(180, parseUnit('deg'))).toBeCloseTo(Math.PI, 12);
    expect(formatQuantity(Math.PI, parseUnit('°'))).toBe('180 °');
  });

  it('refuses a conversion between different dimensions', () => {
    expect(() => convert(1, parseUnit('N'), parseUnit('mm'))).toThrow(UnitError);
  });
});

describe('display formatting', () => {
  it('rounds to significant figures, matching the 4-figure goldens', () => {
    expect(toSignificantFigures(73.3137829912024)).toBe('73.31');
    expect(toSignificantFigures(2187.4)).toBe('2187');
    expect(toSignificantFigures(0)).toBe('0');
    expect(toSignificantFigures(1 / 3, 6)).toBe('0.333333');
  });

  it('rounds to a fixed count of digits after the decimal point, not significant figures', () => {
    expect(toDecimalPlaces(73.3137829912024, 2)).toBe('73.31');
    expect(toDecimalPlaces(2187.4, 2)).toBe('2187.40');
    expect(toDecimalPlaces(0.0001234, 2)).toBe('0.00');
    expect(toDecimalPlaces(1 / 3, 0)).toBe('0');
  });

  it('prints a dimensionless value with no trailing symbol', () => {
    expect(formatQuantity(4.4444, parseUnit(''))).toBe('4.444');
  });

  it('prints a percentage in its display scale', () => {
    expect(formatQuantity(0.982, parseUnit('%'))).toBe('98.2 %');
  });
});

describe('number format settings', () => {
  const euStyle: NumberFormat = { notation: 'auto', thousands: '.', decimal: ',' };
  const grouped: NumberFormat = { notation: 'auto', thousands: ',', decimal: '.' };

  it('groups the integer part with the chosen separator', () => {
    expect(toSignificantFigures(123456, 6, grouped)).toBe('123,456');
    expect(toSignificantFigures(-123456, 6, grouped)).toBe('-123,456');
  });

  it('swaps the decimal separator, EU-style', () => {
    expect(toSignificantFigures(1234.5, 6, euStyle)).toBe('1.234,5');
  });

  it('forces fixed notation even outside the auto-exponential range', () => {
    const fixed: NumberFormat = { notation: 'fixed', thousands: '', decimal: '.' };
    expect(toSignificantFigures(1234567, 4, fixed)).toBe('1235000');
    expect(toSignificantFigures(0.0000012345, 3, fixed)).toBe('0.00000123');
  });

  it('forces scientific notation', () => {
    const scientific: NumberFormat = { notation: 'scientific', thousands: '', decimal: '.' };
    expect(toSignificantFigures(1234.5, 4, scientific)).toBe('1.235e+3');
    expect(toSignificantFigures(0.012345, 3, scientific)).toBe('1.23e-2');
  });

  it('picks an exponent that is a multiple of three for engineering notation', () => {
    const engineering: NumberFormat = { notation: 'engineering', thousands: '', decimal: '.' };
    expect(toSignificantFigures(12345, 4, engineering)).toBe('12.35e+3');
    expect(toSignificantFigures(0.0009999, 4, engineering)).toBe('999.9e-6');
    expect(toSignificantFigures(0.5, 3, engineering)).toBe('500e-3');
  });

  it('drops the exponent for engineering notation when it is zero — 400, not 400e+0', () => {
    const engineering: NumberFormat = { notation: 'engineering', thousands: '', decimal: '.' };
    expect(toSignificantFigures(400, 4, engineering)).toBe('400.0');
    expect(toSignificantFigures(1, 3, engineering)).toBe('1.00');
  });

  it('reads a formatted quantity back, grouping and decimal both undone', () => {
    expect(parseQuantity('1.234,5 N', undefined, euStyle).value).toBe(1234.5);
    expect(parseQuantity('1,234,567', undefined, grouped).value).toBe(1234567);
  });

  it('undoes EU-style punctuation: dot grouping stripped, comma decimal restored', () => {
    expect(stripNumberFormatting('1.234,5 N', euStyle)).toBe('1234.5 N');
  });
});

describe("'si' notation", () => {
  it('recognizes a bare or already-prefixed atomic symbol', () => {
    expect(prefixableAtomOf('Pa')).toBe('Pa');
    expect(prefixableAtomOf('kPa')).toBe('Pa');
    expect(prefixableAtomOf('MPa')).toBe('Pa');
  });

  it('refuses a compound unit — no unambiguous prefix for a ratio', () => {
    expect(prefixableAtomOf('N/mm²')).toBeUndefined();
    expect(prefixableAtomOf('mm/s')).toBeUndefined();
  });

  it('refuses an atom that is deliberately not prefixable', () => {
    expect(prefixableAtomOf('%')).toBeUndefined();
    expect(prefixableAtomOf('rpm')).toBeUndefined();
    expect(prefixableAtomOf('Nm')).toBeUndefined();
  });

  it('picks the prefix landing the magnitude at 1 or more, stepping by 1000', () => {
    // 250 N/mm² of canonical stress is 2.5e8 Pa = 250 MPa.
    expect(siPrefixedUnit('Pa', 250).symbol).toBe('MPa');
    expect(fromCanonical(250, siPrefixedUnit('Pa', 250))).toBeCloseTo(250, 9);
  });

  it('prints a prefixed unit with a fixed-style mantissa, no exponent', () => {
    const si: NumberFormat = { notation: 'si', thousands: '', decimal: '.' };
    expect(formatQuantity(250, parseUnit('Pa'), 4, si)).toBe('250.0 MPa');
    expect(formatQuantity(0.075, parseUnit('Pa'), 3, si)).toBe('75.0 kPa');
  });

  it('falls back to plain fixed notation for a compound display unit', () => {
    const si: NumberFormat = { notation: 'si', thousands: '', decimal: '.' };
    expect(formatQuantity(250, parseUnit('N/mm²'), 4, si)).toBe('250.0 N/mm²');
  });

  it('falls back to fixed notation for a bare number with no unit to substitute', () => {
    const si: NumberFormat = { notation: 'si', thousands: '', decimal: '.' };
    expect(toSignificantFigures(250, 4, si)).toBe('250.0');
  });
});

describe('reading a typed value', () => {
  it('reads value and unit together', () => {
    const parsed = parseQuantity('250 kW');
    expect(parsed.value).toBe(2.5e8);
    expect(parsed.unit.symbol).toBe('kW');
    expect(parseQuantity('1450 rpm').value).toBeCloseTo(24.1667, 4);
    expect(parseQuantity('-1.2e3 N').value).toBe(-1200);
  });

  it('accepts a bare number only where the port is dimensionless', () => {
    expect(parseQuantity('1.5').value).toBe(1.5);
    expect(() => parseQuantity('1450', parseUnit('rpm'))).toThrow(/has no unit/);
  });

  it('rejects a value whose unit does not match the port', () => {
    expect(() => parseQuantity('30 mm', parseUnit('N'))).toThrow(/force/);
  });

  it('rejects an unreadable value', () => {
    expect(() => parseQuantity('quite big')).toThrow(UnitError);
  });
});

describe('port typing', () => {
  it('accepts a connection between matching dimensions', () => {
    expect(() => assertDimensionsCompatible(FORCE, FORCE)).not.toThrow();
  });

  it('rejects a force output wired into a length input', () => {
    expect(() => assertDimensionsCompatible(FORCE, LENGTH, { from: 'F_t', to: 'd_1' })).toThrow(
      /cannot connect F_t of force \(N\) to d_1 of length \(mm\)/,
    );
  });

  it('rejects a dimensionless value wired into an angle input', () => {
    // Angle is tracked, not folded into dimensionless — so this is caught at
    // connect time even though SI calls the radian dimensionless.
    expect(() => assertDimensionsCompatible(parseUnit('').dimension, ANGLE)).toThrow(UnitError);
  });
});
