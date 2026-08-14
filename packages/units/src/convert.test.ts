import { describe, expect, it } from 'vitest';

import {
  ANGLE,
  FORCE,
  LENGTH,
  UnitError,
  assertDimensionsCompatible,
  convert,
  formatQuantity,
  fromCanonical,
  parseQuantity,
  parseUnit,
  toCanonical,
  toSignificantFigures,
} from './index.js';

describe('boundary conversion', () => {
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

  it('prints a dimensionless value with no trailing symbol', () => {
    expect(formatQuantity(4.4444, parseUnit(''))).toBe('4.444');
  });

  it('prints a percentage in its display scale', () => {
    expect(formatQuantity(0.982, parseUnit('%'))).toBe('98.2 %');
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
