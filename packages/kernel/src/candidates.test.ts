/**
 * Marks resolved against grids built by hand.
 *
 * The whole feature rests on one rule — *a figure matches a candidate on the
 * axes they share* — so most of what is checked here is the asymmetry that rule
 * produces: naming more axes narrows, naming fewer widens, and naming an axis
 * this grid does not have changes nothing.
 *
 * Invented coordinates throughout: diameters and temperatures with no formula
 * behind them.
 */

import { describe, expect, it } from 'vitest';

import { candidateAt, candidateMask, coordinatesAt, sameCandidate, type AxisReadout } from './candidates.js';
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

const UNIT = { symbol: '', dimension: {}, scale: 1, offset: 0 } as unknown as AxisReadout['unit'];

const d = axis('d', 3, 0);
const T = axis('T', 2, 1);
const m = axis('m', 2, 2);

const readouts = new Map<string, AxisReadout>([
  ['d', { axis: d, coordinates: numeric([d], [10, 20, 30]), unit: UNIT }],
  ['T', { axis: T, coordinates: numeric([T], [20, 80]), unit: UNIT }],
  ['m', { axis: m, coordinates: categorical([m], ['steel', 'alu']), unit: UNIT }],
]);

describe('a cell, said in coordinates', () => {
  it('reads every axis of the grid at one cell', () => {
    // Row-major over [d, T]: cell 3 is d index 1, T index 1.
    expect(candidateAt([d, T], 3, readouts)).toEqual({ at: { d: 20, T: 80 } });
  });

  it('round-trips: the candidate at a cell identifies that cell and no other', () => {
    for (let cell = 0; cell < 6; cell += 1) {
      const { mask } = candidateMask([d, T], candidateAt([d, T], cell, readouts), readouts);
      expect(mask.flatMap((hit, index) => (hit ? [index] : []))).toEqual([cell]);
    }
  });

  it('carries the axis and unit through, for printing', () => {
    expect(coordinatesAt([d], 2, readouts)).toEqual([{ axis: d, value: 30, unit: UNIT }]);
  });

  it('skips an axis whose coordinates never resolved, rather than inventing one', () => {
    expect(candidateAt([d, T], 0, new Map([['d', readouts.get('d') as AxisReadout]]))).toEqual({
      at: { d: 10 },
    });
  });
});

describe('the shared-axes rule', () => {
  it('pins one cell when the candidate names every axis the figure has', () => {
    const { mask } = candidateMask([d, T], { at: { d: 30, T: 20 } }, readouts);
    expect(mask).toEqual([false, false, false, false, true, false]);
  });

  it('lights a whole row when the candidate names fewer axes than the figure has', () => {
    // "everything at d = 20" — the honest reading of a mark made on a 1-D plot
    // that never knew about T.
    const { mask } = candidateMask([d, T], { at: { d: 20 } }, readouts);
    expect(mask).toEqual([false, false, true, true, false, false]);
  });

  it('ignores axes the candidate names that this figure does not have', () => {
    // A fully determined mark, resolved against a plot that only varies along d.
    const { mask } = candidateMask([d], { at: { d: 20, T: 80 } }, readouts);
    expect(mask).toEqual([false, true, false]);
  });

  it('matches a categorical coordinate exactly', () => {
    const { mask, missing } = candidateMask([m], { at: { m: 'alu' } }, readouts);
    expect(mask).toEqual([false, true]);
    expect(missing).toEqual([]);
  });
});

describe('when the range moves under a mark', () => {
  it('snaps to the nearest sample within one gap, and says it did', () => {
    const moved = new Map<string, AxisReadout>([
      ['d', { axis: axis('d', 3, 0), coordinates: numeric([d], [12, 22, 32]), unit: UNIT }],
    ]);
    const { mask, approximate, missing } = candidateMask([d], { at: { d: 20 } }, moved);
    expect(mask).toEqual([false, true, false]);
    expect(approximate).toEqual(['d']);
    expect(missing).toEqual([]);
  });

  it('reports a coordinate outside the grid as missing rather than snapping to an end', () => {
    // 40 mm against a range that now runs 100–300: the nearest sample is not
    // "nearly right", it is a different design.
    const elsewhere = new Map<string, AxisReadout>([
      ['d', { axis: axis('d', 3, 0), coordinates: numeric([d], [100, 200, 300]), unit: UNIT }],
    ]);
    const { mask, missing } = candidateMask([d], { at: { d: 40 } }, elsewhere);
    expect(missing).toEqual(['d']);
    expect(mask).toEqual([false, false, false]);
  });

  it('will not snap on a single-sample axis, which has no neighbourhood', () => {
    const one = axis('d', 1, 0);
    const single = new Map<string, AxisReadout>([
      ['d', { axis: one, coordinates: numeric([one], [50]), unit: UNIT }],
    ]);
    expect(candidateMask([one], { at: { d: 40 } }, single).missing).toEqual(['d']);
    expect(candidateMask([one], { at: { d: 50 } }, single).mask).toEqual([true]);
  });

  it('reports a categorical value that no longer exists, never a nearest one', () => {
    const { mask, missing } = candidateMask([m], { at: { m: 'bronze' } }, readouts);
    expect(missing).toEqual(['m']);
    expect(mask).toEqual([false, false]);
  });

  it('drops the whole mark when any one of its axes is missing', () => {
    // An unsatisfiable constraint is not a weaker constraint: with d gone,
    // drawing the mark at "some T" would be inventing a design.
    const partial = new Map<string, AxisReadout>([
      ['d', { axis: d, coordinates: numeric([d], [100, 200, 300]), unit: UNIT }],
      ['T', readouts.get('T') as AxisReadout],
    ]);
    expect(candidateMask([d, T], { at: { d: 40, T: 80 } }, partial).mask).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('candidate equality', () => {
  it('ignores key order', () => {
    expect(sameCandidate({ at: { d: 40, T: 80 } }, { at: { T: 80, d: 40 } })).toBe(true);
  });

  it('separates a design from one that names an extra axis', () => {
    expect(sameCandidate({ at: { d: 40 } }, { at: { d: 40, T: 80 } })).toBe(false);
  });

  it('tolerates a unit round-trip, but not a different sample', () => {
    expect(sameCandidate({ at: { d: 40 } }, { at: { d: 40 + 1e-12 } })).toBe(true);
    expect(sameCandidate({ at: { d: 40 } }, { at: { d: 40.001 } })).toBe(false);
  });

  it('does not equate a number with the string that prints it', () => {
    expect(sameCandidate({ at: { m: 40 } }, { at: { m: '40' } })).toBe(false);
  });
});
