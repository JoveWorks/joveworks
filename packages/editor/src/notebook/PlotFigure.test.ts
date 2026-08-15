/**
 * The known bug from UX-SPEC.md: "a series carries an axis the target
 * grid does not". Root cause was `rows()` treating the plotted value's own
 * axes as the whole grid, when a value that does not vary along the chosen
 * x axis — a legitimate flat curve, which evaluate.ts warns about rather
 * than refuses (`plotAxis`) — has fewer axes than the x coordinates do.
 */

import { describe, expect, it } from 'vitest';

import type { Axis, PlotResult } from '@mds/kernel';
import { parseUnit } from '@mds/units';

import { rows } from './PlotFigure';

const mm = parseUnit('mm');

const axisW: Axis = { id: 'w', label: 'w', length: 3, order: 0 };

const base = { nodeId: 'p', kind: 'plot' as const, unit: mm, contour: false };

describe('a plotted value that does not vary along the x axis', () => {
  it('renders a flat line instead of throwing', () => {
    const result: PlotResult = {
      ...base,
      series: { kind: 'numeric', axes: [], data: [42] },
      x: {
        axis: axisW,
        coordinates: { kind: 'numeric', axes: [axisW], data: [10, 20, 30] },
        unit: mm,
      },
    };

    expect(() => rows(result)).not.toThrow();
    const data = rows(result);
    expect(data).toEqual([
      { x: 10, y: 42 },
      { x: 20, y: 42 },
      { x: 30, y: 42 },
    ]);
  });

  it('still works when the value does vary along the axis, unaffected', () => {
    const result: PlotResult = {
      ...base,
      series: { kind: 'numeric', axes: [axisW], data: [1, 2, 3] },
      x: {
        axis: axisW,
        coordinates: { kind: 'numeric', axes: [axisW], data: [10, 20, 30] },
        unit: mm,
      },
    };

    expect(rows(result)).toEqual([
      { x: 10, y: 1 },
      { x: 20, y: 2 },
      { x: 30, y: 3 },
    ]);
  });
});
