import { describe, expect, it } from 'vitest';

import { KernelError } from './errors.js';
import {
  gridSize,
  indexer,
  reader,
  scalarSeries,
  unionAxes,
  type Axis,
  type NumericSeries,
} from './series.js';

const axis = (id: string, length: number, order: number): Axis => ({
  id,
  label: id,
  length,
  order,
});

const along = (a: Axis, data: readonly number[]): NumericSeries => ({
  kind: 'numeric',
  axes: [a],
  data,
});

const d = axis('d', 3, 0);
const t = axis('T', 2, 1);

describe('axes', () => {
  it('makes a scalar the no-axis case rather than a separate kind', () => {
    const one = scalarSeries(5);
    expect(one.axes).toEqual([]);
    expect(gridSize(one.axes)).toBe(1);
  });

  it('unions in document order, whichever way round it is asked', () => {
    expect(unionAxes([d], [t])).toEqual([d, t]);
    expect(unionAxes([t], [d])).toEqual([d, t]);
    expect(unionAxes([d], [d])).toEqual([d]);
    expect(gridSize(unionAxes([d], [t]))).toBe(6);
  });

  it('refuses one axis appearing with two lengths', () => {
    expect(() => unionAxes([d], [{ ...d, length: 4 }])).toThrow(KernelError);
  });
});

describe('broadcasting', () => {
  const grid = unionAxes([d], [t]);

  it('repeats a scalar over every cell', () => {
    const read = reader(scalarSeries(7), grid);
    expect([0, 1, 2, 3, 4, 5].map(read)).toEqual([7, 7, 7, 7, 7, 7]);
  });

  it('gives two ranges an n × m grid with no grid node', () => {
    const ds = reader(along(d, [10, 20, 30]), grid);
    const ts = reader(along(t, [1, 2]), grid);
    const cells = [0, 1, 2, 3, 4, 5].map((cell) => ds(cell) * ts(cell));
    // Row-major over [d, T]: d varies slowest, T fastest.
    expect(cells).toEqual([10, 20, 20, 40, 30, 60]);
  });

  it('lines two values up elementwise when they share an axis', () => {
    const a = reader(along(d, [1, 2, 3]), [d]);
    const b = reader(along(d, [10, 20, 30]), [d]);
    expect([0, 1, 2].map((cell) => a(cell) + b(cell))).toEqual([11, 22, 33]);
  });

  it('refuses a series carrying an axis the grid does not have', () => {
    expect(() => indexer(along(t, [1, 2]), [d])).toThrow(KernelError);
  });
});
