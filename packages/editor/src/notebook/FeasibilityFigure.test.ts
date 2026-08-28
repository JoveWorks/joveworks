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

import { isFacetedChartTooWideForColumn, WIDE_FIGURE_PRINT_PX } from './PlotFigure';
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
  // Deliberately rewritten from the version added alongside c517272: that
  // version gave a single panel the same 120px floor as one facet panel,
  // which is the width regression the user reported as "cramped too thin"
  // — a single panel has no sibling panel to divide space with, so it kept
  // the old flat-360 comfort width as its own floor instead (see
  // `feasibilityPlotWidth`'s own comment). A facet panel's floor is
  // unchanged.
  it('grows the single-panel width with the tick count once ticks exceed its floor', () => {
    // ROADMAP.md #46: a flat 360px plot crowded 10+ tick labels from a
    // two-input sweep into collision with each other and the axis title.
    expect(feasibilityPlotWidth(20, undefined)).toBeGreaterThan(feasibilityPlotWidth(3, undefined));
    // Same 22px-per-tick rate a facet panel uses past its own floor, not a
    // separate formula invented for the single-panel case.
    expect(feasibilityPlotWidth(20, undefined) - feasibilityPlotWidth(19, undefined)).toBe(22);
  });

  it('keeps the pre-897e2f6 comfortable width as the single-panel floor', () => {
    expect(feasibilityPlotWidth(1, undefined)).toBe(360);
    expect(feasibilityPlotWidth(0, undefined)).toBe(360);
  });

  it('keeps a facet panel at its own tighter floor, unchanged from 897e2f6', () => {
    expect(feasibilityPlotWidth(1, 1)).toBe(120);
    expect(feasibilityPlotWidth(0, 4)).toBe(480);
  });

  it('multiplies the per-panel width by the facet count, unchanged from 897e2f6', () => {
    expect(feasibilityPlotWidth(5, 4)).toBe(feasibilityPlotWidth(5, 1) * 4);
  });

  it('reproduces the reported collision case: a many-point sweep with long decimal coordinates', () => {
    // 15 x-ticks like `66.667`, `73.333`, … no longer fit a flat 360px plot.
    expect(feasibilityPlotWidth(15, undefined)).toBeGreaterThan(360);
  });
});

// Mirrors the plotChartWidth threshold test in PlotFigure.test.ts: the print
// stylesheet spans a `figure--wide` map across both columns rather than
// crushing it, and FeasibilityFigure flags that off this same width.
describe('feasibilityPlotWidth against the print column-span threshold', () => {
  it('keeps a comfortable single-panel map, or a modest facet count, inside one column', () => {
    expect(feasibilityPlotWidth(6, undefined)).toBeLessThanOrEqual(WIDE_FIGURE_PRINT_PX);
    expect(feasibilityPlotWidth(3, 2)).toBeLessThanOrEqual(WIDE_FIGURE_PRINT_PX);
  });

  it('crosses the threshold for the many-facet map the print stylesheet names as its example', () => {
    expect(feasibilityPlotWidth(3, 6)).toBeGreaterThan(WIDE_FIGURE_PRINT_PX);
  });
});

// Thomas's explicit read after the first pass: "the feasibility cell map …
// should shrink into a column instead" — even a single-panel map whose own
// tick count alone pushes its width past the threshold (a fine, many-point
// sweep) must never span. Only a genuine small-multiples row of facets can.
describe('isFacetedChartTooWideForColumn for a Feasibility map', () => {
  it('never spans a single-panel map, however many ticks it has', () => {
    const wideSinglePanel = feasibilityPlotWidth(30, undefined);
    expect(wideSinglePanel).toBeGreaterThan(WIDE_FIGURE_PRINT_PX);
    expect(isFacetedChartTooWideForColumn(undefined, wideSinglePanel)).toBe(false);
  });

  it('spans a many-facet map once the facet row has outgrown a column', () => {
    const width = feasibilityPlotWidth(3, 6);
    expect(isFacetedChartTooWideForColumn(6, width)).toBe(true);
  });
});
