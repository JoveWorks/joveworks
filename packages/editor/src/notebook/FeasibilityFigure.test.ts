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

import { feasibilityPlotWidth, rows } from './FeasibilityFigure';

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

describe('feasibilityPlotWidth', () => {
  it('grows the single-panel width with the tick count, same as a facet panel does (897e2f6)', () => {
    // ROADMAP.md #46: a flat 360px plot crowded 10+ tick labels from a
    // two-input sweep into collision with each other and the axis title.
    expect(feasibilityPlotWidth(3, undefined)).toBe(feasibilityPlotWidth(3, 1));
    expect(feasibilityPlotWidth(12, undefined)).toBeGreaterThan(feasibilityPlotWidth(3, undefined));
  });

  it('never shrinks a panel below the floor a couple of ticks still need', () => {
    expect(feasibilityPlotWidth(1, undefined)).toBe(120);
    expect(feasibilityPlotWidth(0, undefined)).toBe(120);
  });

  it('multiplies the per-panel width by the facet count, unchanged from 897e2f6', () => {
    expect(feasibilityPlotWidth(5, 4)).toBe(feasibilityPlotWidth(5, undefined) * 4);
  });

  it('reproduces the reported collision case: a many-point sweep with long decimal coordinates', () => {
    // 15 x-ticks like `66.667`, `73.333`, … no longer fit a flat 360px plot.
    expect(feasibilityPlotWidth(15, undefined)).toBeGreaterThan(360);
  });
});
