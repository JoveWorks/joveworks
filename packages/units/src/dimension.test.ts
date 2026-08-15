import { describe, expect, it } from 'vitest';

import {
  AREA,
  DENSITY,
  DIMENSIONLESS,
  FORCE,
  FREQUENCY,
  LENGTH,
  MASS,
  POWER,
  STRESS,
  TIME,
  TORQUE,
  VELOCITY,
  describeDimension,
  dimension,
  dimensionsEqual,
  divideDimensions,
  formatDimension,
  multiplyDimensions,
  namedUnit,
  powerDimension,
} from './index.js';

describe('dimension algebra', () => {
  it('multiplies and divides by adding exponents', () => {
    expect(dimensionsEqual(multiplyDimensions(LENGTH, LENGTH), AREA)).toBe(true);
    expect(dimensionsEqual(divideDimensions(LENGTH, TIME), VELOCITY)).toBe(true);
    expect(dimensionsEqual(divideDimensions(FORCE, AREA), STRESS)).toBe(true);
  });

  it('raises to a power', () => {
    expect(dimensionsEqual(powerDimension(LENGTH, 3), dimension({ length: 3 }))).toBe(true);
    expect(dimensionsEqual(powerDimension(LENGTH, 0), DIMENSIONLESS)).toBe(true);
  });

  it('derives mass from force, so mass is the tonne', () => {
    // F = m·a, so m = F/a = N·s²/mm. Nothing in the system stores kilograms.
    const acceleration = divideDimensions(LENGTH, powerDimension(TIME, 2));
    expect(dimensionsEqual(divideDimensions(FORCE, acceleration), MASS)).toBe(true);
    expect(formatDimension(MASS)).toBe('N·s²/mm');
  });

  it('derives density as mass per volume', () => {
    const volume = powerDimension(LENGTH, 3);
    expect(dimensionsEqual(divideDimensions(MASS, volume), DENSITY)).toBe(true);
    expect(formatDimension(DENSITY)).toBe('N·s²/mm⁴');
  });

  it('formats in canonical base units', () => {
    expect(formatDimension(DIMENSIONLESS)).toBe('—');
    expect(formatDimension(STRESS)).toBe('N/mm²');
    expect(formatDimension(POWER)).toBe('N·mm/s');
    expect(formatDimension(dimension({ time: -1 }))).toBe('1/s');
  });

  it('prefers a named unit for a dimension that has exactly one', () => {
    expect(namedUnit(POWER)?.symbol).toBe('W');
    expect(namedUnit(STRESS)?.symbol).toBe('Pa');
  });

  it('stays a bare base symbol rather than a named unit that is not canonical', () => {
    // LENGTH has a named atom too (`m`), but the base symbol is already `mm`
    // (S5) — naming it here would silently swap the display unit.
    expect(namedUnit(LENGTH)).toBeUndefined();
    expect(namedUnit(FORCE)).toBeUndefined();
  });

  it('does not guess between two names for one dimension', () => {
    // Torque and energy are both TORQUE here (`Nm`/`Nmm` vs `J`); frequency
    // has the same problem (`Hz` vs `rpm`). Dimension alone cannot tell which
    // physical quantity is meant, so this stays unnamed rather than wrong.
    expect(namedUnit(TORQUE)).toBeUndefined();
    expect(namedUnit(FREQUENCY)).toBeUndefined();
  });

  it('names the dimensions that have familiar names', () => {
    expect(describeDimension(FORCE)).toBe('force (N)');
    expect(describeDimension(DENSITY)).toBe('density (N·s²/mm⁴)');
    expect(describeDimension(dimension({ force: 3, angle: -2 }))).toBe('N³/rad²');
  });
});
