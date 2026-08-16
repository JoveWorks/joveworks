import { describe, expect, it } from 'vitest';

import {
  ANGLE,
  AREA,
  DENSITY,
  DIMENSIONLESS,
  FORCE,
  FREQUENCY,
  LENGTH,
  MASS,
  POWER,
  STRESS,
  TORQUE,
  UnitError,
  VELOCITY,
  dimensionsEqual,
  dimension,
  parseUnit,
  parseUnitTag,
} from './index.js';

const expectUnit = (text: string, dim: typeof LENGTH, factor: number) => {
  const parsed = parseUnit(text);
  expect(dimensionsEqual(parsed.dimension, dim), `${text} dimension`).toBe(true);
  expect(parsed.factor, `${text} factor`).toBeCloseTo(factor, 15);
};

describe('unit parsing', () => {
  it('reads the canonical base as factor 1', () => {
    expectUnit('mm', LENGTH, 1);
    expectUnit('N', FORCE, 1);
    expectUnit('s', dimension({ time: 1 }), 1);
    expectUnit('rad', ANGLE, 1);
    expectUnit('K', dimension({ temperature: 1 }), 1);
  });

  it('applies SI prefixes', () => {
    expectUnit('m', LENGTH, 1000);
    expectUnit('cm', LENGTH, 10);
    expectUnit('dm', LENGTH, 100);
    expectUnit('km', LENGTH, 1e6);
    expectUnit('µm', LENGTH, 1e-3);
    expectUnit('kN', FORCE, 1000);
    expectUnit('kW', POWER, 1e6);
    expectUnit('MPa', STRESS, 1);
  });

  it('prefers an exact symbol over a prefix reading', () => {
    // 'min' is a minute, not milli-inch; 'm' is a metre, not a stray prefix.
    expectUnit('min', dimension({ time: 1 }), 60);
    expectUnit('m', LENGTH, 1000);
  });

  it('accepts every exponent spelling in the corpus', () => {
    expectUnit('mm²', AREA, 1);
    expectUnit('mm**2', AREA, 1);
    expectUnit('mm^2', AREA, 1);
    expectUnit('mm2', AREA, 1);
    expectUnit('s-1', FREQUENCY, 1);
    expectUnit('s⁻¹', FREQUENCY, 1);
    expectUnit('min-1', FREQUENCY, 1 / 60);
  });

  it('accepts every separator spelling', () => {
    expectUnit('N*m', TORQUE, 1000);
    expectUnit('N·m', TORQUE, 1000);
    expectUnit('N m', TORQUE, 1000);
    expectUnit('Nm', TORQUE, 1000);
    expectUnit('Nmm', TORQUE, 1);
  });

  it('binds a solidus to the single term that follows it', () => {
    // N/mm/s is N/(mm·s) — 1/s² would mean the other reading had been taken.
    expectUnit('N/mm/s', dimension({ force: 1, length: -1, time: -1 }), 1);
    expectUnit('1/min', FREQUENCY, 1 / 60);
  });

  it('treats [] as declared-dimensionless', () => {
    expectUnit('', DIMENSIONLESS, 1);
    expect(parseUnitTag('[] transmission ratio').unit.factor).toBe(1);
  });

  it('carries a display scale on dimensionless quantities', () => {
    expectUnit('%', DIMENSIONLESS, 0.01);
    expectUnit('rev', DIMENSIONLESS, 1);
  });

  it('converts revolutions per minute to a frequency', () => {
    expectUnit('rpm', FREQUENCY, 1 / 60);
  });

  it('reads degrees as a display unit of the radian', () => {
    expectUnit('deg', ANGLE, Math.PI / 180);
    expectUnit('°', ANGLE, Math.PI / 180);
  });

  it('reads mass in tonnes and density in t/mm³', () => {
    expectUnit('t', MASS, 1);
    expectUnit('kg', MASS, 1e-3);
    expectUnit('kg/dm³', DENSITY, 1e-9);
    expectUnit('t/mm³', DENSITY, 1);
  });

  it('keeps the symbol as written, for display', () => {
    expect(parseUnit(' N/mm² ').symbol).toBe('N/mm²');
  });

  describe('rejections', () => {
    it('rejects an unknown symbol rather than guessing', () => {
      expect(() => parseUnit('__O')).toThrow(UnitError);
      expect(() => parseUnit('1E6rotatons')).toThrow(UnitError);
      expect(() => parseUnit('furlong')).toThrow(/unknown unit symbol/);
    });

    it('rejects a numeral that is not the 1 of 1/min', () => {
      expect(() => parseUnit('100/min')).toThrow(/only '1' may appear/);
    });

    it('rejects malformed expressions', () => {
      expect(() => parseUnit('/s')).toThrow(/cannot start/);
      expect(() => parseUnit('N/')).toThrow(/trailing/);
      expect(() => parseUnit('N#m')).toThrow(/unexpected character/);
    });
  });
});

describe('symbol tags', () => {
  it('splits a [unit] description tag', () => {
    const tag = parseUnitTag('[N] the minimal frictional force needed');
    expect(tag.unit.symbol).toBe('N');
    expect(dimensionsEqual(tag.unit.dimension, FORCE)).toBe(true);
    expect(tag.description).toBe('the minimal frictional force needed');
  });

  it('handles a tag with no description', () => {
    expect(parseUnitTag('[m/s]').description).toBe('');
    expect(dimensionsEqual(parseUnitTag('[m/s]').unit.dimension, VELOCITY)).toBe(true);
  });

  it('treats a missing bracket as an undeclared unit, which is a hard error', () => {
    expect(() => parseUnitTag('belt velocity')).toThrow(/undeclared unit/);
  });
});
