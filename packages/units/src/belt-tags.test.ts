import { describe, expect, it } from 'vitest';

import {
  DENSITY,
  DIMENSIONLESS,
  FORCE,
  FREQUENCY,
  LENGTH,
  POWER,
  STRESS,
  TORQUE,
  VELOCITY,
  dimension,
  dimensionsEqual,
  formatQuantity,
  multiplyDimensions,
  parseUnit,
  powerDimension,
  toCanonical,
} from './index.js';

/**
 * The tag set milestone 1 actually has to read: every distinct `[unit]` in the
 * belt chapter of the predecessor package. Names and descriptions are omitted —
 * this is the unit vocabulary, not textbook content.
 */
const BELT_TAGS: ReadonlyArray<readonly [string, ReturnType<typeof dimension>, number]> = [
  ['', DIMENSIONLESS, 1],
  ['%', DIMENSIONLESS, 0.01],
  ['kg/dm³', DENSITY, 1e-9],
  ['m', LENGTH, 1000],
  ['mm', LENGTH, 1],
  ['mm²', dimension({ length: 2 }), 1],
  ['m/s', VELOCITY, 1000],
  ['N', FORCE, 1],
  ['Nm', TORQUE, 1000],
  ['N/mm', dimension({ force: 1, length: -1 }), 1],
  ['N/mm²', STRESS, 1],
  ['Nm/mm', FORCE, 1000],
  ['rpm', FREQUENCY, 1 / 60],
  ['s-1', FREQUENCY, 1],
  ['W', POWER, 1000],
  ['W/mm', dimension({ force: 1, time: -1 }), 1000],
];

describe('the belt chapter tag set', () => {
  it.each(BELT_TAGS)('reads [%s]', (text, dim, factor) => {
    const parsed = parseUnit(text);
    expect(dimensionsEqual(parsed.dimension, dim)).toBe(true);
    expect(parsed.factor).toBeCloseTo(factor, 15);
  });

  it('round-trips a bending frequency for display', () => {
    // The belt golden f_B = 6.464 s⁻¹ (PLAN.md). s-1 is canonical, so this is a
    // formatting check rather than a conversion one.
    expect(formatQuantity(6.464, parseUnit('s-1'))).toBe('6.464 s-1');
  });

  it('shows a rotational speed in rpm while storing it per second', () => {
    const rpm = parseUnit('rpm');
    expect(toCanonical(1450, rpm)).toBeCloseTo(24.1667, 4);
    expect(formatQuantity(toCanonical(1450, rpm), rpm)).toBe('1450 rpm');
  });
});

describe('the density trap', () => {
  // Density is where an mm-N-s base bites: mass is the tonne, so a belt density
  // of 1.25 kg/dm³ is 1.25e-9 in canonical units — nine orders of magnitude from
  // the number on the page. The predecessor package worked around this by
  // writing the conversion into the expression itself (`* 1E-6 * 1E3`, PLAN.md);
  // here it happens once, at the boundary.
  const areaMm2 = 96;
  const densityKgPerDm3 = 1.25;
  const velocityMPerS = 7.069;

  it('converts kg/dm³ to canonical density', () => {
    expect(toCanonical(densityKgPerDm3, parseUnit('kg/dm³'))).toBeCloseTo(1.25e-9, 18);
  });

  it('gives density × area × velocity² the dimension of a force', () => {
    const product = multiplyDimensions(
      multiplyDimensions(DENSITY, dimension({ length: 2 })),
      powerDimension(VELOCITY, 2),
    );
    expect(dimensionsEqual(product, FORCE)).toBe(true);
  });

  it('rejects the same product with one velocity factor missing', () => {
    const product = multiplyDimensions(
      multiplyDimensions(DENSITY, dimension({ length: 2 })),
      VELOCITY,
    );
    expect(dimensionsEqual(product, FORCE)).toBe(false);
  });

  it('reproduces the hand-rolled 1e-6 · 1e3 by converting at the boundary', () => {
    const canonical =
      toCanonical(areaMm2, parseUnit('mm²')) *
      toCanonical(densityKgPerDm3, parseUnit('kg/dm³')) *
      toCanonical(velocityMPerS, parseUnit('m/s')) ** 2;

    // What the predecessor computed, in raw display numbers with the constants
    // inlined. Identical — which is the point: those constants were a unit
    // conversion in disguise, and the expression itself is just ρ·A·v².
    const asFudged = areaMm2 * 1e-6 * 1e3 * densityKgPerDm3 * velocityMPerS ** 2;

    expect(canonical).toBeCloseTo(asFudged, 12);
    expect(formatQuantity(canonical, parseUnit('N'))).toBe('5.996 N');
  });

  it('is off by a factor of 1e9 if the density conversion is skipped', () => {
    const skipped =
      toCanonical(areaMm2, parseUnit('mm²')) *
      densityKgPerDm3 *
      toCanonical(velocityMPerS, parseUnit('m/s')) ** 2;
    const canonical =
      toCanonical(areaMm2, parseUnit('mm²')) *
      toCanonical(densityKgPerDm3, parseUnit('kg/dm³')) *
      toCanonical(velocityMPerS, parseUnit('m/s')) ** 2;

    expect(skipped / canonical).toBeCloseTo(1e9, 0);
  });
});
