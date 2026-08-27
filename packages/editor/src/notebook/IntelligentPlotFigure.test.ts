import { describe, expect, it } from 'vitest';

import type { Axis, PlotAxis, PlotMeasureResult } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';

import type { PlotPanel } from '../model/plot';
import { rowsForPanel } from './IntelligentPlotFigure';

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
});
