import { describe, expect, it } from 'vitest';

import { parseUnit } from '@mds/units';

import { converted, rescaleRange } from './ValueEditor';

const mm = parseUnit('mm');

describe('switching an input value between kinds', () => {
  it('takes the smallest limit of a range as the value, not a hardcoded guess', () => {
    const range = { kind: 'linear' as const, start: 20, stop: 60, points: 21, unit: mm };
    expect(converted(range, 'scalar')).toEqual({ kind: 'scalar', value: 20, unit: mm });

    // Bounds are not guaranteed ordered — the smallest still wins either way.
    const reversed = { kind: 'linear' as const, start: 60, stop: 20, points: 21, unit: mm };
    expect(converted(reversed, 'scalar')).toEqual({ kind: 'scalar', value: 20, unit: mm });
  });

  it('takes the smallest value of a list as the value, not the first one', () => {
    const list = { kind: 'list' as const, values: [40, 10, 25], unit: mm };
    expect(converted(list, 'scalar')).toEqual({ kind: 'scalar', value: 10, unit: mm });
  });

  it('uses the value as the low end and double it as the high end, going the other way', () => {
    const scalar = { kind: 'scalar' as const, value: 20, unit: mm };
    expect(converted(scalar, 'linear')).toEqual({
      kind: 'linear',
      start: 20,
      stop: 40,
      points: 10,
      unit: mm,
    });
    expect(converted(scalar, 'list')).toEqual({ kind: 'list', values: [20, 40], unit: mm });
  });

  it('starts a log range at 1 rather than a non-positive smallest bound', () => {
    const scalar = { kind: 'scalar' as const, value: -5, unit: mm };
    expect(converted(scalar, 'logarithmic')).toEqual({
      kind: 'logarithmic',
      start: 1,
      stop: 2,
      points: 10,
      unit: mm,
    });
  });

  it('defaults to R20 and, like a log range, refuses to start at or below zero', () => {
    const scalar = { kind: 'scalar' as const, value: -5, unit: mm };
    expect(converted(scalar, 'renard')).toEqual({
      kind: 'renard',
      series: 'R20',
      start: 1,
      stop: 2,
      unit: mm,
    });
  });

  it('takes the smallest bound of a Renard range as the value, going back to scalar', () => {
    const range = { kind: 'renard' as const, series: 'R20' as const, start: 60, stop: 20, unit: mm };
    expect(converted(range, 'scalar')).toEqual({ kind: 'scalar', value: 20, unit: mm });
  });
});

describe('typing a unit on one bound of a range', () => {
  it('re-expresses both bounds under the new unit, canonical value unchanged', () => {
    const range = { kind: 'linear' as const, start: 10, stop: 1000, points: 21, unit: mm };
    // 10 mm and 1000 mm, retyped in metres: 0.01 m and 1 m.
    expect(rescaleRange(range, 'm')).toEqual({
      kind: 'linear',
      start: 0.01,
      stop: 1,
      points: 21,
      unit: parseUnit('m'),
    });
  });

  it('adopts a unit of a different dimension outright instead of refusing it — a mistyped unit needs a way back', () => {
    const range = { kind: 'linear' as const, start: 10, stop: 20, points: 21, unit: mm };
    expect(rescaleRange(range, 'N')).toEqual({
      kind: 'linear',
      start: 10,
      stop: 20,
      points: 21,
      unit: parseUnit('N'),
    });
  });

  it('adopts the first unit typed on a still-blank range outright, no rescale', () => {
    const blank = parseUnit('');
    const range = { kind: 'linear' as const, start: 10, stop: 20, points: 21, unit: blank };
    expect(rescaleRange(range, 'm')).toEqual({
      kind: 'linear',
      start: 10,
      stop: 20,
      points: 21,
      unit: parseUnit('m'),
    });
  });

  it('goes back to blank from a real unit just as freely, no rescale', () => {
    const range = { kind: 'linear' as const, start: 10, stop: 20, points: 21, unit: mm };
    expect(rescaleRange(range, '')).toEqual({
      kind: 'linear',
      start: 10,
      stop: 20,
      points: 21,
      unit: parseUnit(''),
    });
  });

  it('rescales a Renard range the same way as a linear one', () => {
    const range = { kind: 'renard' as const, series: 'R20' as const, start: 10, stop: 1000, unit: mm };
    expect(rescaleRange(range, 'm')).toEqual({
      kind: 'renard',
      series: 'R20',
      start: 0.01,
      stop: 1,
      unit: parseUnit('m'),
    });
  });

  it('still rescales between two already-chosen dimensionless units', () => {
    const range = { kind: 'linear' as const, start: 10, stop: 50, points: 21, unit: parseUnit('%') };
    // 10% and 50%, retyped in rev: 0.1 rev and 0.5 rev.
    expect(rescaleRange(range, 'rev')).toEqual({
      kind: 'linear',
      start: 0.1,
      stop: 0.5,
      points: 21,
      unit: parseUnit('rev'),
    });
  });
});
