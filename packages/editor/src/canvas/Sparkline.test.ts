import { describe, expect, it } from 'vitest';

import { sparkRows } from './Sparkline';

describe('splitting a swept value into sparkline rows', () => {
  it('is one row for a single-axis sweep', () => {
    expect(sparkRows([1, 2, 3, 4], 4)).toEqual([[1, 2, 3, 4]]);
  });

  it('splits at the last (contiguous) axis for a two-axis grid', () => {
    // Row-major, last axis contiguous (series.ts): 2 outer values x 3 inner.
    expect(sparkRows([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('is one row for a scalar reading too', () => {
    expect(sparkRows([1, 1], 2)).toEqual([[1, 1]]);
  });
});
