/**
 * The reduce-along-an-axis primitive, tested against series built by hand.
 *
 * Every value here is invented arithmetic — a ramp, a parabola, a list of
 * Renard sizes — with an analytic answer that can be checked by eye. No
 * catalogue formula is involved, because none is needed: what is under test
 * is index bookkeeping and interpolation, not any equation.
 */

import { describe, expect, it } from 'vitest';

import { KernelError } from './errors.js';
import { select } from './select.js';
import type { Axis, CategoricalSeries, NumericSeries } from './series.js';

const axis = (id: string, length: number, order: number): Axis => ({ id, label: id, length, order });

const numeric = (axes: readonly Axis[], data: readonly number[]): NumericSeries => ({
  kind: 'numeric',
  axes,
  data,
});

const categorical = (axes: readonly Axis[], data: readonly string[]): CategoricalSeries => ({
  kind: 'categorical',
  axes,
  data,
});

const d = axis('d', 5, 0);
const t = axis('T', 2, 1);

/** `d = 10, 20, 30, 40, 50` — the swept coordinate every case below searches along. */
const diameters = numeric([d], [10, 20, 30, 40, 50]);

describe('the reduce axis', () => {
  it('refuses a scalar wired into `along` with the message that says what to do', () => {
    expect(() =>
      select({ mode: 'argMin', value: numeric([d], [1, 2, 3, 4, 5]), along: numeric([], [10]), nodeId: 'pick' }),
    ).toThrow(KernelError);
    expect(() =>
      select({ mode: 'argMin', value: numeric([d], [1, 2, 3, 4, 5]), along: numeric([], [10]), nodeId: 'pick' }),
    ).toThrow(/wire the swept range into 'along'/u);
  });

  it('refuses a two-axis `along` rather than guessing which axis was meant', () => {
    const both = numeric([d, t], Array.from({ length: 10 }, (_unused, i) => i));
    expect(() =>
      select({ mode: 'argMin', value: both, along: both, nodeId: 'pick' }),
    ).toThrow(/must name exactly one/u);
  });
});

describe('crossing', () => {
  it('interpolates the crossing on a monotonic ramp, at the analytic root', () => {
    // y = 2d, so y = 50 at d = 25 — squarely between two samples, which is
    // the whole reason a crossing interpolates rather than snapping.
    const found = select({
      mode: 'crossing',
      value: numeric([d], [20, 40, 60, 80, 100]),
      along: diameters,
      threshold: 50,
      direction: 'any',
      nodeId: 'cross',
    });
    expect(found.at.axes).toEqual([]);
    expect(found.at.data[0]).toBeCloseTo(25, 10);
    expect(found.warnings).toEqual([]);
  });

  it('wires the first crossing and warns about the extras', () => {
    // A parabola dipping below the bound and coming back: two crossings, and
    // a fixed-shape series can only carry one of them.
    const found = select({
      mode: 'crossing',
      value: numeric([d], [10, -10, -20, -10, 10]),
      along: diameters,
      threshold: 0,
      direction: 'any',
      nodeId: 'cross',
    });
    expect(found.at.data[0]).toBeCloseTo(15, 10);
    expect(found.crossings[0]?.length).toBe(2);
    expect(found.crossings[0]?.[1]).toBeCloseTo(45, 10);
    expect(found.warnings.map((entry) => entry.kind)).toContain('selectExtraCrossings');
  });

  it('honours `direction`, so a falling-only search skips the rising root', () => {
    const rising = select({
      mode: 'crossing',
      value: numeric([d], [10, -10, -20, -10, 10]),
      along: diameters,
      threshold: 0,
      direction: 'rising',
      nodeId: 'cross',
    });
    expect(rising.at.data[0]).toBeCloseTo(45, 10);
    expect(rising.crossings[0]?.length).toBe(1);

    const falling = select({
      mode: 'crossing',
      value: numeric([d], [10, -10, -20, -10, 10]),
      along: diameters,
      threshold: 0,
      direction: 'falling',
      nodeId: 'cross',
    });
    expect(falling.at.data[0]).toBeCloseTo(15, 10);
  });

  it('reports a sample sitting exactly on the bound once, not twice', () => {
    const found = select({
      mode: 'crossing',
      value: numeric([d], [-2, -1, 0, 1, 2]),
      along: diameters,
      threshold: 0,
      direction: 'any',
      nodeId: 'cross',
    });
    expect(found.crossings[0]).toEqual([30]);
  });

  it('sees the bound met exactly at the last sample, which opens no interval of its own', () => {
    const found = select({
      mode: 'crossing',
      value: numeric([d], [20, 40, 60, 80, 100]),
      along: diameters,
      threshold: 100,
      direction: 'any',
      nodeId: 'cross',
    });
    expect(found.crossings[0]).toEqual([50]);
    expect(found.warnings).toEqual([]);
  });

  it('warns that a coarse sweep cannot be interpolated on, and stays quiet on a fine one', () => {
    // y = d², crossing 900 at d = 30 exactly. Four points 10 apart put the
    // root at a sample, but the *interpolation* on the bracketing interval
    // still disagrees badly with the parabola through the neighbouring one.
    const coarse = select({
      mode: 'crossing',
      value: numeric([axis('c', 4, 0)], [100, 400, 1600, 2500]),
      along: numeric([axis('c', 4, 0)], [10, 20, 40, 50]),
      threshold: 900,
      direction: 'any',
      nodeId: 'cross',
    });
    expect(coarse.warnings.map((entry) => entry.kind)).toContain('selectCoarseSweep');

    // The same curve, sampled finely enough that the straight line and the
    // parabola agree to well within the interval width.
    const fine = axis('f', 9, 0);
    const xs = Array.from({ length: 9 }, (_unused, i) => 26 + i);
    const found = select({
      mode: 'crossing',
      value: numeric([fine], xs.map((x) => x * x)),
      along: numeric([fine], xs),
      threshold: 900,
      direction: 'any',
      nodeId: 'cross',
    });
    expect(found.warnings.map((entry) => entry.kind)).not.toContain('selectCoarseSweep');
  });

  it('answers NaN and warns when nothing crosses, rather than throwing', () => {
    const found = select({
      mode: 'crossing',
      value: numeric([d], [1, 2, 3, 4, 5]),
      along: diameters,
      threshold: 900,
      direction: 'any',
      nodeId: 'cross',
    });
    expect(found.at.data[0]).toBeNaN();
    expect(found.warnings.map((entry) => entry.kind)).toEqual(['selectNoCrossing']);
  });
});

describe('firstPassing', () => {
  /** Renard R10 from 10 to 25 — the standard sizes an answer has to land on. */
  const renard = axis('size', 5, 0);
  const sizes = numeric([renard], [10, 12.5, 16, 20, 25]);

  it('lands on a sampled size, never between two of them', () => {
    const found = select({
      mode: 'firstPassing',
      value: categorical([renard], ['fail', 'fail', 'pass', 'pass', 'pass']),
      along: sizes,
      nodeId: 'first',
    });
    expect(found.at.data).toEqual([16]);
    expect(found.warnings).toEqual([]);
  });

  it('answers NaN and warns when nothing passes', () => {
    const found = select({
      mode: 'firstPassing',
      value: categorical([renard], ['fail', 'fail', 'fail', 'fail', 'fail']),
      along: sizes,
      nodeId: 'first',
    });
    expect(found.at.data[0]).toBeNaN();
    expect(found.warnings.map((entry) => entry.kind)).toEqual(['selectNothingPasses']);
  });

  it('refuses a numeric value — a verdict is what it reads', () => {
    expect(() =>
      select({ mode: 'firstPassing', value: sizes, along: sizes, nodeId: 'first' }),
    ).toThrow(/pass\/fail verdict/u);
  });
});

describe('argMin and argMax', () => {
  it('answers with the coordinate and the value there', () => {
    const value = numeric([d], [9, 4, 1, 4, 9]);
    const least = select({ mode: 'argMin', value, along: diameters, nodeId: 'pick' });
    expect(least.at.data).toEqual([30]);
    expect(least.best?.data).toEqual([1]);

    const most = select({ mode: 'argMax', value, along: diameters, nodeId: 'pick' });
    expect(most.at.data).toEqual([10]);
    expect(most.best?.data).toEqual([9]);
  });

  it('resolves a tie to the first cell in axis order, so the answer is stable', () => {
    const found = select({
      mode: 'argMin',
      value: numeric([d], [1, 1, 1, 1, 1]),
      along: diameters,
      nodeId: 'pick',
    });
    expect(found.at.data).toEqual([10]);
  });
});

describe('a two-axis study', () => {
  it('collapses the searched axis and keeps the other, one answer per remaining cell', () => {
    // Row-major over [d (5), T (2)]: `value` is 2d at T₀ and 4d at T₁, so a
    // bound of 100 is crossed at d = 50 in the first column and d = 25 in
    // the second — which is exactly the "a crossing size per temperature"
    // this axis bookkeeping exists for.
    const value = numeric(
      [d, t],
      [20, 40, 40, 80, 60, 120, 80, 160, 100, 200],
    );
    const found = select({
      mode: 'crossing',
      value,
      along: diameters,
      threshold: 100,
      direction: 'any',
      nodeId: 'cross',
    });
    expect(found.at.axes).toEqual([t]);
    expect(found.at.data[0]).toBeCloseTo(50, 10);
    expect(found.at.data[1]).toBeCloseTo(25, 10);
  });

  it('counts the empty cells of a partly-failing study rather than failing the whole thing', () => {
    // Crosses 150 in the second column only.
    const value = numeric(
      [d, t],
      [20, 40, 40, 80, 60, 120, 80, 160, 100, 200],
    );
    const found = select({
      mode: 'crossing',
      value,
      along: diameters,
      threshold: 150,
      direction: 'any',
      nodeId: 'cross',
    });
    expect(found.at.data[0]).toBeNaN();
    expect(found.at.data[1]).toBeCloseTo(37.5, 10);
    expect(found.warnings[0]?.message).toMatch(/at 1 of 2 points/u);
  });
});
