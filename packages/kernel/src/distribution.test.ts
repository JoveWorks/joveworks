import { describe, expect, it } from 'vitest';
import { distributionBinCount, ecdf, histogram } from './distribution.js';
import { percentile } from './statistics.js';

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
