import { describe, expect, it } from 'vitest';

import type { Axis, PlotAxis, PlotMeasureResult } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';

import type { PlotPanel, PlotValueAxis } from '../model/plot';
import {
  chartWidth,
  contourGridForPanel,
  contourLegendLevels,
  rescaleValue,
  rowsForPanel,
  sharesColorScaleKey,
  tipText,
  valueAxisPlacement,
} from './IntelligentPlotFigure';

const mm = parseUnit('mm');
const newton = parseUnit('N');
const width: Axis = { id: 'width', label: 'width', length: 2, order: 0 };
const widthReadout: PlotAxis = {
  axis: width,
  coordinates: { kind: 'numeric', axes: [width], data: [10, 20] },
  unit: mm,
};

function measure(
  id: string,
  label: string,
  data: readonly number[],
  axes: readonly Axis[],
  unit = mm,
  threshold?: number,
): PlotMeasureResult {
  return {
    id,
    label,
    series: { kind: 'numeric', axes, data },
    unit,
    axes: axes.length === 0 ? [] : [widthReadout],
    ...(threshold === undefined ? {} : { threshold }),
  };
}

function valueAxesOf(measures: readonly PlotMeasureResult[]): readonly PlotValueAxis[] {
  return [{ index: 0, measures }];
}

function panel(measures: readonly PlotMeasureResult[], axes: readonly PlotAxis[]): PlotPanel {
  return {
    id: 'panel',
    measures,
    axes,
    type: 'line',
    roles: axes.length === 0 ? {} : { x: 'width' },
    scales: {},
    valueScale: 'linear',
    valueAxes: valueAxesOf(measures),
    height: 240,
    reason: 'test',
  };
}

describe('intelligent plot rendering rows', () => {
  it('broadcasts compatible measures onto one shared axis and keeps their identity', () => {
    const plotted = panel([
      measure('value', 'diameter', [1, 2], [width]),
      measure('value2', 'clearance', [3, 4], [width]),
    ], [widthReadout]);
    expect(rowsForPanel(plotted, [mm])).toEqual([
      { cell: 0, x: 10, value: 1, reading: 1, axisIndex: 0, measure: 'diameter', key: 'diameter' },
      { cell: 1, x: 20, value: 2, reading: 2, axisIndex: 0, measure: 'diameter', key: 'diameter' },
      { cell: 0, x: 10, value: 3, reading: 3, axisIndex: 0, measure: 'clearance', key: 'clearance' },
      { cell: 1, x: 20, value: 4, reading: 4, axisIndex: 0, measure: 'clearance', key: 'clearance' },
    ]);
  });

  it('turns scalar measures into labelled dot-comparison rows', () => {
    const plotted = panel([
      measure('value', 'a', [1], []),
      measure('value2', 'b', [2], []),
    ], []);
    expect(rowsForPanel(plotted, [mm])).toEqual([
      { cell: 0, x: 'a', value: 1, reading: 1, axisIndex: 0, measure: 'a' },
      { cell: 0, x: 'b', value: 2, reading: 2, axisIndex: 0, measure: 'b' },
    ]);
  });

  it('lays a regular contour field out in the dense y-major grid Observable expects', () => {
    const height: Axis = { id: 'height', label: 'height', length: 2, order: 1 };
    const heightReadout: PlotAxis = {
      axis: height,
      coordinates: { kind: 'numeric', axes: [height], data: [1, 2] },
      unit: mm,
    };
    const plotted: PlotPanel = {
      ...panel([measure('value', 'stress', [1, 2, 3, 4], [width, height])], [widthReadout, heightReadout]),
      type: 'contour',
      roles: { x: 'width', y: 'height' },
    };
    expect(contourGridForPanel(plotted, mm)).toEqual({
      values: [1, 3, 2, 4],
      rectangle: { width: 2, height: 2, x1: 10, x2: 20, y1: 1, y2: 2 },
    });
  });

  it('keeps every in-range contour threshold on the right-side color scale', () => {
    const plotted: PlotPanel = {
      ...panel([
        measure('value', 'stress', [1, 2, 3], [width], mm, 2),
        measure('value2', 'stress limit', [4, 5, 6], [width], mm, 5),
      ], [widthReadout]),
      type: 'contour',
      roles: { x: 'width', y: 'height' },
    };
    expect(contourLegendLevels(plotted, mm)).toEqual({ minimum: 1, maximum: 6, thresholds: [2, 5] });
  });

  it('reads the same right-side color scale off a heatmap panel as off a contour', () => {
    // A heatmap's cells and a contour's bands are the same value-to-colour
    // mapping over the same two swept axes (bug: the heatmap used to get
    // Observable's own legend above the chart instead of this key) — the
    // levels behind that key must not depend on which mark draws them.
    const plotted: PlotPanel = {
      ...panel([measure('value', 'stress', [1, 2, 3], [width], mm, 2)], [widthReadout]),
      type: 'heatmap',
      roles: { x: 'width', y: 'height' },
    };
    expect(contourLegendLevels(plotted, mm)).toEqual({ minimum: 1, maximum: 3, thresholds: [2] });
  });
});

describe('the shared colour-scale key (heatmap legend placement)', () => {
  it('gives a heatmap the same right-side key as a contour, and no other panel type', () => {
    expect(sharesColorScaleKey('heatmap')).toBe(true);
    expect(sharesColorScaleKey('contour')).toBe(true);
    expect(sharesColorScaleKey('line')).toBe(false);
    expect(sharesColorScaleKey('dot')).toBe(false);
  });

  it('narrows the chart to make room for the key whenever one is actually drawn', () => {
    // Driven off "this panel got a colorbar", not off "this panel is a
    // contour" — a heatmap with a colorbar is narrowed exactly like a
    // contour with one.
    expect(chartWidth(640, true)).toBe(640 - 102);
    expect(chartWidth(640, false)).toBe(640);
  });

  it('never narrows below the 320px floor, key or no key', () => {
    expect(chartWidth(300, true)).toBe(320);
    expect(chartWidth(300, false)).toBe(320);
  });
});

describe('rescaleValue', () => {
  it('maps a value linearly from one range onto another', () => {
    expect(rescaleValue(100, [100, 300], [10, 30])).toBe(10);
    expect(rescaleValue(200, [100, 300], [10, 30])).toBe(20);
    expect(rescaleValue(300, [100, 300], [10, 30])).toBe(30);
  });

  it('lands a degenerate (zero-width) range on the target midpoint rather than dividing by zero', () => {
    expect(rescaleValue(5, [5, 5], [10, 30])).toBe(20);
  });
});

describe('a secondary value axis (a force and a length sharing one panel)', () => {
  // A force axis (index 0, N is the canonical unit, so its "display" value is
  // its canonical one) spanning [10, 30] and a length axis (index 1, mm is
  // also canonical) spanning [100, 300] — chosen so the two ranges are an
  // easy 1:10 ratio to check by hand: a length row plots at the force
  // position that is at the same fraction of its own range.
  const forceMeasure = measure('force', 'force', [10, 30], [width], newton);
  const lengthMeasure = measure('length', 'length', [100, 300], [width], mm, 250);
  const dualAxisPanel: PlotPanel = {
    ...panel([forceMeasure, lengthMeasure], [widthReadout]),
    valueAxes: [{ index: 0, measures: [forceMeasure] }, { index: 1, measures: [lengthMeasure] }],
  };

  it('reads back each axis its own true value, never the other axis\'s unit', () => {
    const placement = valueAxisPlacement(dualAxisPanel, [newton, mm]);
    expect(placement.axisIndexOf('force')).toBe(0);
    expect(placement.axisIndexOf('length')).toBe(1);
    expect(placement.toOwnValue('force', 10)).toBe(10);
    expect(placement.toOwnValue('length', 100)).toBe(100);
  });

  it('rescales a secondary-axis measure onto the primary axis’s own range', () => {
    const rows = rowsForPanel(dualAxisPanel, [newton, mm]);
    const forceRows = rows.filter((row) => row.measure === 'force');
    const lengthRows = rows.filter((row) => row.measure === 'length');
    expect(forceRows.map((row) => row.value)).toEqual([10, 30]);
    expect(forceRows.map((row) => row.reading)).toEqual([10, 30]);
    // 100 -> 10, 300 -> 30: the same fraction of its own [100, 300] range as
    // the plotted position is of the primary [10, 30] range.
    expect(lengthRows.map((row) => row.value)).toEqual([10, 30]);
    // The reading is never rescaled — a tip must still say 100 mm and 300 mm.
    expect(lengthRows.map((row) => row.reading)).toEqual([100, 300]);
    expect(lengthRows.map((row) => row.axisIndex)).toEqual([1, 1]);
  });

  it('inverts a primary-axis tick position back into the secondary axis’s real number', () => {
    const placement = valueAxisPlacement(dualAxisPanel, [newton, mm]);
    // The chart's own y scale only ever hands the right-side axis a position
    // already in the primary (force) coordinate system — 20 sits at the
    // midpoint of [10, 30], which the secondary axis must read as 200, the
    // midpoint of its own [100, 300].
    expect(placement.invertChartValue(1, 20)).toBe(200);
    expect(placement.invertChartValue(1, 10)).toBe(100);
    expect(placement.invertChartValue(1, 30)).toBe(300);
  });

  // The easiest thing to get subtly wrong: a secondary-axis measure's
  // threshold has to land on the *rescaled* coordinate its own curve does,
  // not on its raw reading plotted against the primary axis's numbers — that
  // would draw the rule at "250" on a chart whose primary axis only runs
  // 10..30, off the top of the frame instead of through the curve at 3/4 of
  // its own height.
  it('rescales a secondary-axis measure’s threshold exactly like its own readings', () => {
    const placement = valueAxisPlacement(dualAxisPanel, [newton, mm]);
    const threshold = lengthMeasure.threshold as number;
    // 250 is 3/4 of the way from 100 to 300, so it has to land 3/4 of the
    // way from 10 to 30 — 25 — not at the raw value 250.
    expect(placement.toChartValue('length', threshold)).toBe(25);
  });

  // The tip is read off `row.reading`, in that row's own axis unit — never
  // `valueUnits[0]` (the primary/force unit) and never `row.value` (the
  // rescaled plotting position). A tip that used either would tell a
  // student the length curve reads "30" in newtons instead of "300 mm".
  it('reports a secondary-axis measure in its own unit, not the primary axis’s', () => {
    const rows = rowsForPanel(dualAxisPanel, [newton, mm]);
    const forceRow = rows.find((row) => row.measure === 'force' && row.reading === 10) as typeof rows[number];
    const lengthRow = rows.find((row) => row.measure === 'length' && row.reading === 300) as typeof rows[number];
    const forceLines = tipText(dualAxisPanel, forceRow, [newton, mm]).split('\n');
    const lengthLines = tipText(dualAxisPanel, lengthRow, [newton, mm]).split('\n');
    expect(forceLines).toContain('force (N): 10');
    // 300 mm, not the rescaled "30" it plots at, and not "300 N" either.
    expect(lengthLines).toContain('length (mm): 300');
    expect(lengthLines).not.toContain('length (mm): 30');
    expect(lengthLines).not.toContain('length (N): 300');
  });
});
