import { describe, expect, it } from 'vitest';
import { REDUCTIONS } from './functions.js';
import { percentile, reduceAlong } from './statistics.js';
import type { Axis, CategoricalSeries, NumericSeries } from './series.js';

const trial: Axis = { id: 'trial', label: 'trial', length: 4, order: 1 };
const design: Axis = { id: 'd', label: 'diameter', length: 2, order: 0 };
const numeric = (data: readonly number[], axes: readonly Axis[] = [trial]): NumericSeries => ({ kind: 'numeric', axes, data });

describe('statistics over axes', () => {
  it('uses type-7 interpolation at exact and fractional order positions', () => {
    expect(percentile([1, 2, 4, 8, 16], 50)).toBe(4);
    expect(percentile([1, 2, 4, 8], 25)).toBe(1.75);
  });

  it('matches the existing spectrum sdev denominator', () => {
    const values = [1, 2, 4, 8];
    const expected = REDUCTIONS.get('sdev')?.apply(values, []);
    expect(reduceAlong({ statistic: 'stddev', value: numeric(values), nodeId: 's' }).result.data[0]).toBe(expected);
  });

  it('makes every running mean and standard deviation agree with its batch prefix', () => {
    const values = [1, 2, 4, 8];
    for (const statistic of ['mean', 'stddev'] as const) {
      const running = reduceAlong({ statistic, value: numeric(values), running: true, nodeId: 's' }).result.data;
      for (let length = 1; length <= values.length; length += 1) {
        const batch = reduceAlong({ statistic, value: numeric(values.slice(0, length), [{ ...trial, length }]), nodeId: 'b' }).result.data[0];
        expect(running[length - 1]).toEqual(batch);
      }
    }
  });

  it('counts pass and fail independently', () => {
    const value: CategoricalSeries = { kind: 'categorical', axes: [trial], data: ['pass', 'fail', 'pass', 'fail'] };
    expect(reduceAlong({ statistic: 'probability', value, match: 'pass', nodeId: 'p' }).result.data).toEqual([0.5]);
    expect(reduceAlong({ statistic: 'probability', value, match: 'fail', nodeId: 'p' }).result.data).toEqual([0.5]);
  });

  it('warns when unwired pooling collapses design and trial axes, while along keeps design', () => {
    const value = numeric([1, 2, 3, 4, 10, 20, 30, 40], [design, trial]);
    const pooled = reduceAlong({ statistic: 'mean', value, nodeId: 'p' });
    expect(pooled.warnings.map((warning) => warning.kind)).toContain('statisticPooledAxes');
    const kept = reduceAlong({ statistic: 'mean', value, along: numeric([0, 1, 2, 3]), nodeId: 'k' });
    expect(kept.result.axes).toEqual([design]);
    expect(kept.result.data).toEqual([2.5, 25]);
  });

  it('warns and returns NaN for a one-cell sample deviation', () => {
    const result = reduceAlong({ statistic: 'stddev', value: numeric([1], [{ ...trial, length: 1 }]), nodeId: 's' });
    expect(result.result.data[0]).toBeNaN();
    expect(result.warnings.map((warning) => warning.kind)).toContain('statisticTooFewSamples');
  });

  it('refuses a running statistic over two axes', () => {
    expect(() => reduceAlong({ statistic: 'mean', value: numeric([1, 2, 3, 4, 5, 6, 7, 8], [design, trial]), running: true, nodeId: 's' })).toThrow(/exactly one/u);
  });
});
