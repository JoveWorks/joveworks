/**
 * The feasibility twin of `PlotFigure.test.ts`'s flat-curve case: a mask that
 * does not vary along the axis it is drawn against.
 *
 * Reachable as soon as a check's input can come from a value typed on the node
 * — unwire the range that fed it, type the number instead, and the range node
 * is still the only axis in the document for the figure to be drawn against
 * while no verdict depends on it any more.
 */

import { describe, expect, it } from 'vitest';

import type { Axis, FeasibilityResult } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';

import { rows } from './FeasibilityFigure';

const mm = parseUnit('mm');
const diameter: Axis = { id: 'd', label: 'diameter', length: 3, order: 0 };
const labels = { check1: 'area big enough' };

const base = { nodeId: 'feas', kind: 'feasibility' as const, checks: ['check1'] };

describe('a mask that does not vary along the axis it is drawn against', () => {
  const result: FeasibilityResult = {
    ...base,
    axes: [],
    mask: [false],
    perCheck: [[false]],
    x: { axis: diameter, coordinates: { kind: 'numeric', axes: [diameter], data: [10, 20, 30] }, unit: mm },
  };

  it('shades flat across it instead of throwing', () => {
    expect(() => rows(result, labels)).not.toThrow();
    expect(rows(result, labels).map((row) => [row.x, row.mask])).toEqual([
      [10, 'fail'],
      [20, 'fail'],
      [30, 'fail'],
    ]);
  });

  it('names the failing check in every cell of the flat strip', () => {
    expect(rows(result, labels).every((row) => row.title.includes('area big enough'))).toBe(true);
  });

  it('still reads a mask that does vary, cell for cell', () => {
    const varying: FeasibilityResult = {
      ...result,
      axes: [diameter],
      mask: [false, true, true],
      perCheck: [[false, true, true]],
    };
    expect(rows(varying, labels).map((row) => row.mask)).toEqual(['fail', 'pass', 'pass']);
  });
});
