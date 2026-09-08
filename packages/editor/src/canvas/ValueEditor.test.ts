import { describe, expect, it } from 'vitest';

import { parseUnit } from '@joveworks/units';

import { converted, rescaleRange, rescaleScalarBound, roundToDecimalFigures, withScalarValue } from './ValueEditor';

const mm = parseUnit('mm');

describe('rounding slider drags', () => {
  it('treats figures as digits after the decimal point', () => {
    expect(roundToDecimalFigures(23.847291, 2)).toBe(23.85);
    expect(roundToDecimalFigures(1234.567, 2)).toBe(1234.57);
  });

  it('rounds to whole numbers when figures is zero', () => {
    expect(roundToDecimalFigures(23.847291, 0)).toBe(24);
  });
});

describe('switching an input value between kinds', () => {
  it('takes the smallest limit of a range as the value, not a hardcoded guess — remembering the high end and point count too', () => {
    const range = { kind: 'linear' as const, start: 20, stop: 60, points: 21, unit: mm };
    expect(converted(range, 'scalar')).toEqual({ kind: 'scalar', value: 20, unit: mm, bound: 60, points: 21 });

    // Bounds are not guaranteed ordered — the smallest still wins either way,
    // and the largest is still what gets remembered as the bound.
    const reversed = { kind: 'linear' as const, start: 60, stop: 20, points: 21, unit: mm };
    expect(converted(reversed, 'scalar')).toEqual({ kind: 'scalar', value: 20, unit: mm, bound: 60, points: 21 });
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

  it('takes a list’s min and max as the bounds, switching to a linear or Renard range', () => {
    const list = { kind: 'list' as const, values: [40, 10, 25], unit: mm };
    expect(converted(list, 'linear')).toEqual({
      kind: 'linear', start: 10, stop: 40, points: 10, unit: mm,
    });
    expect(converted(list, 'renard')).toEqual({
      kind: 'renard', series: 'R20', start: 10, stop: 40, unit: mm,
    });
  });

  it('falls back to doubling the smallest value when a list has only one entry or is not increasing', () => {
    const single = { kind: 'list' as const, values: [10], unit: mm };
    expect(converted(single, 'linear')).toEqual({
      kind: 'linear', start: 10, stop: 20, points: 10, unit: mm,
    });
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

  it('takes the smallest bound of a Renard range as the value, going back to scalar, and remembers the high end', () => {
    const range = { kind: 'renard' as const, series: 'R20' as const, start: 60, stop: 20, unit: mm };
    expect(converted(range, 'scalar')).toEqual({ kind: 'scalar', value: 20, unit: mm, bound: 60 });
  });

  it('uses the value as both the reading and the low end, doubled for the high end, switching to a slider', () => {
    const scalar = { kind: 'scalar' as const, value: 20, unit: mm };
    expect(converted(scalar, 'slider')).toEqual({ kind: 'slider', value: 20, min: 20, max: 40, unit: mm });
  });

  it('halves a negative value towards zero for a slider’s high end, so min still lands below max', () => {
    const scalar = { kind: 'scalar' as const, value: -20, unit: mm };
    expect(converted(scalar, 'slider')).toEqual({ kind: 'slider', value: -20, min: -20, max: -10, unit: mm });
  });

  it('gives a zero value a high end of 1, so a slider never collapses to a single point', () => {
    const scalar = { kind: 'scalar' as const, value: 0, unit: mm };
    expect(converted(scalar, 'slider')).toEqual({ kind: 'slider', value: 0, min: 0, max: 1, unit: mm });
  });

  it('takes the reading straight across, going back to scalar from a slider', () => {
    const value = { kind: 'slider' as const, value: 35, min: 20, max: 80, unit: mm };
    expect(converted(value, 'scalar')).toEqual({ kind: 'scalar', value: 35, unit: mm });
  });

  it('preserves a category when switching between one value and a categorical sweep', () => {
    const value = { kind: 'categorical' as const, value: 'H' };
    expect(converted(value, 'categoricalList')).toEqual({ kind: 'categoricalList', values: ['H'] });
    expect(converted({ kind: 'categoricalList', values: ['K', 'M'] }, 'categorical')).toEqual({
      kind: 'categorical', value: 'K',
    });
  });

  it('remembers a linear range’s high end and point count across a round trip through scalar', () => {
    const range = { kind: 'linear' as const, start: 20, stop: 60, points: 41, unit: mm };
    const asScalar = converted(range, 'scalar');
    expect(asScalar).toEqual({ kind: 'scalar', value: 20, unit: mm, bound: 60, points: 41 });
    expect(converted(asScalar, 'linear')).toEqual({ kind: 'linear', start: 20, stop: 60, points: 41, unit: mm });
  });

  it('remembers a logarithmic range the same way', () => {
    const range = { kind: 'logarithmic' as const, start: 10, stop: 1000, points: 30, unit: mm };
    const asScalar = converted(range, 'scalar');
    expect(asScalar).toEqual({ kind: 'scalar', value: 10, unit: mm, bound: 1000, points: 30 });
    expect(converted(asScalar, 'logarithmic')).toEqual({
      kind: 'logarithmic', start: 10, stop: 1000, points: 30, unit: mm,
    });
  });

  it('falls back to doubling the low end and the default point count when a value has never been a range', () => {
    const scalar = { kind: 'scalar' as const, value: 20, unit: mm };
    expect(converted(scalar, 'linear')).toEqual({ kind: 'linear', start: 20, stop: 40, points: 10, unit: mm });
  });

  it('remembers a Renard range’s high end, but not a point count it never had', () => {
    const range = { kind: 'renard' as const, series: 'R20' as const, start: 20, stop: 60, unit: mm };
    const asScalar = converted(range, 'scalar');
    expect(asScalar).toEqual({ kind: 'scalar', value: 20, unit: mm, bound: 60 });
    expect(converted(asScalar, 'renard')).toEqual({
      kind: 'renard', series: 'R20', start: 20, stop: 60, unit: mm,
    });
  });

  it('ignores a remembered bound and point count switching to a kind that cannot use them', () => {
    const scalar = { kind: 'scalar' as const, value: 20, unit: mm, bound: 60, points: 41 };
    // A list has its own values, not a bound/points pair, so this still doubles.
    expect(converted(scalar, 'list')).toEqual({ kind: 'list', values: [20, 40], unit: mm });
  });

  it('takes a slider’s own max as the high end, switching directly to a range', () => {
    const slider = { kind: 'slider' as const, value: 35, min: 20, max: 80, unit: mm };
    expect(converted(slider, 'linear')).toEqual({ kind: 'linear', start: 35, stop: 80, points: 10, unit: mm });
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

describe('retyping a scalar’s own unit', () => {
  // A scalar's own `value` is a plain relabel on unit retype, same/different
  // dimension alike — that is pre-existing scalar `setUnit` behaviour,
  // unrelated to `bound`. `bound` gets the range treatment: rescaled under a
  // same-dimension retype, dropped under a different-dimension one.
  it('re-expresses a remembered bound under the new unit, value and points untouched', () => {
    const scalar = { kind: 'scalar' as const, value: 10, unit: mm, bound: 1000, points: 41 };
    // 1000 mm, retyped in metres: 1 m.
    expect(rescaleScalarBound(scalar, 'm')).toEqual({
      kind: 'scalar',
      value: 10,
      unit: parseUnit('m'),
      bound: 1,
      points: 41,
    });
  });

  it('drops the bound on a different-dimension retype instead of carrying it forward wrong', () => {
    const scalar = { kind: 'scalar' as const, value: 10, unit: mm, bound: 60, points: 41 };
    expect(rescaleScalarBound(scalar, 'N')).toEqual({
      kind: 'scalar',
      value: 10,
      unit: parseUnit('N'),
      points: 41,
    });
  });

  it('has no bound to drop or rescale when there was never one', () => {
    const scalar = { kind: 'scalar' as const, value: 10, unit: mm };
    expect(rescaleScalarBound(scalar, 'm')).toEqual({ kind: 'scalar', value: 10, unit: parseUnit('m') });
  });
});

describe('retyping a scalar’s own number', () => {
  it('drops a remembered bound — it belonged to the old value — but keeps the point count', () => {
    const scalar = { kind: 'scalar' as const, value: 20, unit: mm, bound: 60, points: 41 };
    expect(withScalarValue(scalar, 35)).toEqual({ kind: 'scalar', value: 35, unit: mm, points: 41 });
  });

  it('stays without a bound when there was never one', () => {
    const scalar = { kind: 'scalar' as const, value: 20, unit: mm };
    expect(withScalarValue(scalar, 35)).toEqual({ kind: 'scalar', value: 35, unit: mm });
  });
});
