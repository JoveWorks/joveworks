import { describe, expect, it } from 'vitest';

import type { Axis, PlotAxis, PlotMeasureResult } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';

import type { PlotPanel } from '../model/plot';
import { chartWidth, contourGridForPanel, contourLegendLevels, rowsForPanel, sharesColorScaleKey } from './IntelligentPlotFigure';

const mm = parseUnit('mm');
const width: Axis = { id: 'width', label: 'width', length: 2, order: 0 };
const widthReadout: PlotAxis = {
  axis: width,
  coordinates: { kind: 'numeric', axes: [width], data: [10, 20] },
  unit: mm,
};

function measure(id: string, label: string, data: readonly number[], axes: readonly Axis[]): PlotMeasureResult {
  return { id, label, series: { kind: 'numeric', axes, data }, unit: mm, axes: axes.length === 0 ? [] : [widthReadout] };
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
    expect(rowsForPanel(plotted, mm)).toEqual([
      { cell: 0, x: 10, value: 1, measure: 'diameter', key: 'diameter' },
      { cell: 1, x: 20, value: 2, measure: 'diameter', key: 'diameter' },
      { cell: 0, x: 10, value: 3, measure: 'clearance', key: 'clearance' },
      { cell: 1, x: 20, value: 4, measure: 'clearance', key: 'clearance' },
    ]);
  });

  it('turns scalar measures into labelled dot-comparison rows', () => {
    const plotted = panel([
      measure('value', 'a', [1], []),
      measure('value2', 'b', [2], []),
    ], []);
    expect(rowsForPanel(plotted, mm)).toEqual([
      { cell: 0, x: 'a', value: 1, measure: 'a' },
      { cell: 0, x: 'b', value: 2, measure: 'b' },
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
        { ...measure('value', 'stress', [1, 2, 3], [width]), threshold: 2 },
        { ...measure('value2', 'stress limit', [4, 5, 6], [width]), threshold: 5 },
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
      ...panel([{ ...measure('value', 'stress', [1, 2, 3], [width]), threshold: 2 }], [widthReadout]),
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
