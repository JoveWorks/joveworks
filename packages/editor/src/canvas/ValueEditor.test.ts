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

  it('refuses a unit of a different dimension — a range does not change what it measures', () => {
    const range = { kind: 'linear' as const, start: 10, stop: 20, points: 21, unit: mm };
    expect(() => rescaleRange(range, 'N')).toThrow(/not the same kind of unit/u);
  });
});
