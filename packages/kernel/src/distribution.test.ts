import { describe, expect, it } from 'vitest';
import { distributionBinCount, ecdf, histogram } from './distribution.js';
import { numericExtent, percentile } from './statistics.js';

describe('distribution report data', () => {
  it('uses Freedman–Diaconis, with Sturges when IQR is zero', () => {
    expect(distributionBinCount([0, 1, 2, 3, 4, 5, 6, 7])).toBe(2);
    expect(distributionBinCount([4, 4, 4, 4, 4, 4, 4, 4])).toBe(4);
  });

  it('accounts for every sample in a histogram', () => {
    const samples = [0, 1, 2, 3, 4, 5];
    expect(histogram(samples, 3).reduce((sum, bin) => sum + bin.count, 0)).toBe(samples.length);
  });

  it('builds a monotone ECDF ending at one', () => {
    const result = ecdf([4, 1, 2, 2]);
    expect(result.map((point) => point.value)).toEqual([1, 2, 2, 4]);
    expect(result.every((point, index) => index === 0 || point.probability >= result[index - 1]!.probability)).toBe(true);
    expect(result.at(-1)?.probability).toBe(1);
  });

  it('shares the exact percentile implementation used by Statistic', () => {
    const samples = [1, 2, 4, 8];
    expect(percentile(samples, 95)).toBe(7.399999999999999);
  });
});

describe('a grid larger than the call stack', () => {
  // 160 000 cells, a 400 × 400 contour: past the point where V8 throws on
  // `Math.min(...values)`.
  const cells = Array.from({ length: 160_000 }, (_, i) => (i * 7919) % 160_000);

  it('bins every sample instead of overflowing the stack', () => {
    const bins = histogram(cells, 4);
    expect(bins.reduce((total, bin) => total + bin.count, 0)).toBe(cells.length);
  });

  it('finds the extent the way Math.min and Math.max would', () => {
    expect(numericExtent(cells)).toEqual([0, 159_999]);
    expect(numericExtent([3, Number.NaN, 1])).toEqual([Number.NaN, Number.NaN]);
    expect(numericExtent([])).toEqual([Infinity, -Infinity]);
    expect(numericExtent([2, -Infinity, 5])).toEqual([-Infinity, 5]);
  });
});
