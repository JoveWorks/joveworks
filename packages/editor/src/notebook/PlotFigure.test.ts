/**
 * A known bug: "a series carries an axis the target grid does not". Root
 * cause was `rows()` treating the plotted value's own axes as the whole
 * grid, when a value that does not vary along the chosen
 * x axis — a legitimate flat curve, which evaluate.ts warns about rather
 * than refuses (`plotAxis`) — has fewer axes than the x coordinates do.
 */

import { describe, expect, it } from 'vitest';

import type { Axis, PlotAxis, PlotResult } from '@joveworks/kernel';
import { PLAIN_NUMBER_FORMAT, parseUnit, type NumberFormat } from '@joveworks/units';

import {
  axisLabel,
  chartLabelForText,
  contourGrid,
  drawsContour,
  isFacetedChartTooWideForColumn,
  markY,
  plotChartWidth,
  plotValueLabel,
  plotYLabel,
  rows,
  siAxisUnit,
  siResult,
  tipTitle,
  WIDE_FIGURE_PRINT_PX,
  type Row,
} from './PlotFigure';

const mm = parseUnit('mm');

const axisW: Axis = { id: 'w', label: 'w', length: 3, order: 0 };

const base = { nodeId: 'p', kind: 'plot' as const, unit: mm, contour: false };

describe('chart label matching', () => {
  it('keeps the authored TeX label when Observable adds layout whitespace', () => {
    expect(chartLabelForText('chip load  f_z (mm/tooth)\n', ['chip load f_z (mm/tooth)']))
      .toBe('chip load f_z (mm/tooth)');
  });

  it('recognises an axis label after Observable adds its direction and unit decoration', () => {
    expect(chartLabelForText('↑ radial engagement a_e (mm) (mm)', ['radial engagement a_e (mm)']))
      .toBe('radial engagement a_e (mm)');
  });
});

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
      { cell: 0, x: 10, y: 42 },
      { cell: 1, x: 20, y: 42 },
      { cell: 2, x: 30, y: 42 },
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
      { cell: 0, x: 10, y: 1 },
      { cell: 1, x: 20, y: 2 },
      { cell: 2, x: 30, y: 3 },
    ]);
  });
});

describe('a plot with a facet axis', () => {
  const axisG: Axis = { id: 'g', label: 'g', length: 2, order: 1 };

  it('reads out a facet field per row, broadcast the same way series does', () => {
    const result: PlotResult = {
      ...base,
      series: { kind: 'numeric', axes: [axisW, axisG], data: [1, 2, 3, 4, 5, 6] },
      x: {
        axis: axisW,
        coordinates: { kind: 'numeric', axes: [axisW], data: [10, 20, 30] },
        unit: mm,
      },
      facet: {
        axis: axisG,
        coordinates: { kind: 'categorical', axes: [axisG], data: ['low', 'high'] },
        unit: parseUnit(''),
      },
    };

    // Row-major over [axisW, axisG] with the last axis contiguous (series.ts):
    // facet (axisG, order 1) varies fastest, x (axisW, order 0) slowest.
    expect(rows(result)).toEqual([
      { cell: 0, x: 10, y: 1, facet: 'low' },
      { cell: 1, x: 10, y: 2, facet: 'high' },
      { cell: 2, x: 20, y: 3, facet: 'low' },
      { cell: 3, x: 20, y: 4, facet: 'high' },
      { cell: 4, x: 30, y: 5, facet: 'low' },
      { cell: 5, x: 30, y: 6, facet: 'high' },
    ]);
  });
});

describe('a contour plot', () => {
  const axisY: Axis = { id: 'h', label: 'h', length: 2, order: 1 };

  const result: PlotResult = {
    ...base,
    contour: true,
    label: 'stress',
    series: { kind: 'numeric', axes: [axisW, axisY], data: [1, 2, 3, 4, 5, 6] },
    x: {
      axis: axisW,
      coordinates: { kind: 'numeric', axes: [axisW], data: [10, 20, 30] },
      unit: mm,
    },
    series2: {
      axis: axisY,
      coordinates: { kind: 'numeric', axes: [axisY], data: [100, 200] },
      unit: parseUnit('N'),
    },
  };

  // The bug this guards: the y axis was titled with the color-mapped
  // value's own label (the colorbar title) instead of the axis actually
  // plotted along y, so a contour's y axis read the same as its colorbar.
  it('labels the y axis with the second swept axis, not the color-mapped value', () => {
    expect(plotYLabel(result)).toBe('h (N)');
    expect(plotValueLabel(result)).toBe('stress (mm)');
  });

  it('still labels a non-contour plot with the plotted value', () => {
    expect(plotYLabel({ ...result, contour: false })).toBe('stress (mm)');
  });

  // The same bug in position rather than in text: a mark drawn at the row's
  // value landed at the right x and an arbitrary height, because the contour's
  // y axis carries the second swept axis and not the colour-mapped value.
  it('places a mark at the second swept axis, not at the plotted value', () => {
    const y = markY(result);
    expect(rows(result).map(y)).toEqual([100, 200, 100, 200, 100, 200]);
  });

  it('places a mark at the plotted value when the same result draws as a line', () => {
    const line = { ...result, contour: false };
    expect(rows(line).map(markY(line))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // The grid the field and the threshold's isoline are both drawn from: one
  // build, so the level can never be drawn against a different field than the
  // colours are.
  it('lays the kernel grid out row-major over the second axis, spanning the axis extremes', () => {
    const { values, rectangle } = contourGrid(result, result.series2 as PlotAxis);
    expect(values).toEqual([1, 3, 5, 2, 4, 6]);
    expect(rectangle).toEqual({ width: 3, height: 2, x1: 10, x2: 30, y1: 100, y2: 200 });
  });

  it('names every coordinate of the pointed design in the tip, then its value', () => {
    const [first] = rows(result);
    expect(tipTitle(result, first as Row, axisLabel(result.x), plotValueLabel(result))).toBe(
      'w (mm): 10\nh (N): 100\nstress (mm): 1',
    );
  });
});

// The print stylesheet spans a `figure--wide` chart across both columns
// instead of letting `.figure svg { max-width: 100% }` scale it down — see
// PlotFigure.tsx's own comment on WIDE_FIGURE_PRINT_PX. Guards the two ends
// of that decision: an ordinary single-panel or lightly-faceted chart still
// fits one printed column, but enough facets outgrow it.
describe('plotChartWidth against the print column-span threshold', () => {
  it('stays under the threshold with no facet or only a couple of panels', () => {
    expect(plotChartWidth(undefined)).toBeLessThanOrEqual(WIDE_FIGURE_PRINT_PX);
    expect(plotChartWidth(2)).toBeLessThanOrEqual(WIDE_FIGURE_PRINT_PX);
  });

  it('crosses the threshold once enough facets are stacked side by side', () => {
    expect(plotChartWidth(4)).toBeGreaterThan(WIDE_FIGURE_PRINT_PX);
    // The width formula caps at 1080 (six-plus facets) rather than growing
    // unbounded — still comfortably past the threshold either way.
    expect(plotChartWidth(8)).toBeGreaterThan(WIDE_FIGURE_PRINT_PX);
  });
});

// Thomas's read on the first pass (a bare width check, no facet requirement):
// it spanned an ordinary single-panel chart just because its own tick count
// happened to push its width past the threshold, leaving a mostly-blank page
// under it. A single panel must never span, regardless of how wide it is —
// only a genuinely faceted small-multiples row can.
describe('isFacetedChartTooWideForColumn', () => {
  it('never spans a single panel, however wide it happens to be', () => {
    expect(isFacetedChartTooWideForColumn(undefined, WIDE_FIGURE_PRINT_PX + 1000)).toBe(false);
  });

  it('does not span a faceted chart that still fits a column', () => {
    expect(isFacetedChartTooWideForColumn(2, plotChartWidth(2))).toBe(false);
  });

  it('spans a faceted chart once it has outgrown a column', () => {
    expect(isFacetedChartTooWideForColumn(4, plotChartWidth(4))).toBe(true);
  });
});

describe("the 'si' number format", () => {
  const pa = parseUnit('Pa');
  const si: NumberFormat = { ...PLAIN_NUMBER_FORMAT, notation: 'si' };

  // Canonical stress is N/mm² — 1 MPa lands exactly on 1 canonical unit,
  // so a canonical value of 250 is "250 MPa", the case UX-SPEC's bug report
  // named: read as raw Pa it prints as 250 000 000, not 250.
  it('picks one shared prefix off the largest magnitude, instead of a raw base unit', () => {
    expect(siAxisUnit(pa, [100, 200, 150], si).symbol).toBe('MPa');
  });

  it('leaves the unit alone outside si notation', () => {
    expect(siAxisUnit(pa, [200], PLAIN_NUMBER_FORMAT).symbol).toBe('Pa');
  });

  it('leaves the unit alone when it has nothing to prefix (a ratio, a compound unit)', () => {
    expect(siAxisUnit(parseUnit(''), [200], si).symbol).toBe('');
    expect(siAxisUnit(parseUnit('N/mm²'), [200], si).symbol).toBe('N/mm²');
  });

  it('rescales the plotted value, x axis and threshold together, and converts the data with it', () => {
    const result: PlotResult = {
      nodeId: 'p',
      kind: 'plot',
      contour: false,
      unit: pa,
      threshold: 150,
      series: { kind: 'numeric', axes: [axisW], data: [100, 200, 300] },
      x: {
        axis: axisW,
        coordinates: { kind: 'numeric', axes: [axisW], data: [10, 20, 30] },
        unit: mm,
      },
    };
    const scaled = siResult(result, si);
    expect(scaled.unit.symbol).toBe('MPa');
    expect(rows(scaled)).toEqual([
      { cell: 0, x: 10, y: 100 },
      { cell: 1, x: 20, y: 200 },
      { cell: 2, x: 30, y: 300 },
    ]);
  });
});

describe('a plot set to contour that has lost its second axis', () => {
  const flat: PlotResult = {
    ...base,
    contour: true,
    series: { kind: 'numeric', axes: [axisW], data: [1, 2, 3] },
    x: {
      axis: axisW,
      coordinates: { kind: 'numeric', axes: [axisW], data: [10, 20, 30] },
      unit: mm,
    },
  };

  it('draws as a line, since a contour needs two swept axes', () => {
    expect(drawsContour(flat)).toBe(false);
    // The y axis is the value again, not the second axis a contour puts there.
    expect(plotYLabel(flat)).toBe(plotValueLabel(flat));
  });

  it('contours again as soon as a second axis is back — the choice was never cleared', () => {
    const axisH: Axis = { id: 'h', label: 'h', length: 2, order: 1 };
    expect(
      drawsContour({
        ...flat,
        series: { kind: 'numeric', axes: [axisW, axisH], data: [1, 2, 3, 4, 5, 6] },
        series2: {
          axis: axisH,
          coordinates: { kind: 'numeric', axes: [axisH], data: [1, 2] },
          unit: mm,
        },
      }),
    ).toBe(true);
  });
});
