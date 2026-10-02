import { describe, expect, it } from 'vitest';

import type { Axis, PlotAxis, PlotMeasureResult, PlotResult } from '@joveworks/kernel';
import { parseUnit, type NumberFormat } from '@joveworks/units';

import { plotCsv } from './plotCsv';

const PLAIN: NumberFormat = { notation: 'auto', thousands: '', decimal: '.' };
// Dutch-style punctuation: the app's own `dot-thousands` preset.
const DUTCH: NumberFormat = { notation: 'auto', thousands: '.', decimal: ',' };

const mm = parseUnit('mm');
const newton = parseUnit('N');

const width: Axis = { id: 'width', label: 'width', length: 2, order: 0 };
const grade: Axis = { id: 'grade', label: 'grade', length: 2, order: 1 };
const widthReadout: PlotAxis = {
  axis: width,
  coordinates: { kind: 'numeric', axes: [width], data: [10, 20] },
  unit: mm,
};
const gradeReadout: PlotAxis = {
  axis: grade,
  coordinates: { kind: 'categorical', axes: [grade], data: ['S235', 'S355'] },
  unit: parseUnit(''),
};

const classic: PlotResult = {
  nodeId: 'p',
  kind: 'plot',
  label: 'load',
  unit: newton,
  contour: false,
  x: widthReadout,
  series: { kind: 'numeric', axes: [width], data: [1500, 2250.5] },
};

function measure(id: string, label: string, data: readonly number[], axes: readonly PlotAxis[], unit = mm): PlotMeasureResult {
  return { id, label, unit, axes, series: { kind: 'numeric', axes: axes.map(({ axis }) => axis), data } };
}

function lines(csv: string): readonly string[] {
  return csv.split('\r\n');
}

describe('plotCsv for a single-value plot', () => {
  it('writes one row per plotted point under the chart\'s own axis and value headings', () => {
    expect(lines(plotCsv(classic, {}, PLAIN))).toEqual(['width (mm),load (N)', '10,1500', '20,2250.5']);
  });

  it('gives a series axis its own column, one row per curve point', () => {
    const result: PlotResult = {
      ...classic,
      series2: gradeReadout,
      series: { kind: 'numeric', axes: [width, grade], data: [1, 2, 3, 4] },
    };
    expect(lines(plotCsv(result, {}, PLAIN))).toEqual([
      'width (mm),grade,load (N)',
      '10,S235,1',
      '10,S355,2',
      '20,S235,3',
      '20,S355,4',
    ]);
  });

  it('follows the decimal comma with a semicolon separator, and never groups thousands', () => {
    expect(lines(plotCsv(classic, {}, DUTCH))).toEqual(['width (mm);load (N)', '10;1500', '20;2250,5']);
  });

  it('exports the SI-prefixed unit the axis is drawn in, not the authored one', () => {
    const csv = plotCsv(classic, {}, { ...PLAIN, notation: 'si' });
    expect(lines(csv)).toEqual(['width (mm),load (kN)', '10,1.5', '20,2.2505']);
  });

  it('drops the binary noise a unit conversion leaves, and leaves a failed point empty', () => {
    const result: PlotResult = { ...classic, series: { kind: 'numeric', axes: [width], data: [0.1 + 0.2, Number.NaN] } };
    expect(lines(plotCsv(result, {}, PLAIN)).slice(1)).toEqual(['10,0.3', '20,']);
  });

  it('still names the value column when the plot has no label', () => {
    const { label: _dropped, ...unlabelled } = classic;
    expect(lines(plotCsv({ ...unlabelled, unit: parseUnit('') }, {}, PLAIN))[0]).toBe('width (mm),value');
  });
});

describe('plotCsv for an intelligent plot', () => {
  it('puts every measure of a panel in its own column, each in its own unit', () => {
    const result: PlotResult = {
      ...classic,
      measures: [
        measure('a', 'force', [100, 180], [widthReadout], newton),
        measure('b', 'deflection', [0.5, 0.25], [widthReadout]),
      ],
    };
    expect(lines(plotCsv(result, {}, PLAIN))).toEqual([
      'width (mm),force (N),deflection (mm)',
      '10,100,0.5',
      '20,180,0.25',
    ]);
  });

  it('writes one block per panel, a blank line apart, when measures vary along different axes', () => {
    const result: PlotResult = {
      ...classic,
      measures: [
        measure('a', 'force', [100, 180], [widthReadout], newton),
        measure('b', 'strength', [235, 355], [gradeReadout], newton),
      ],
    };
    expect(lines(plotCsv(result, {}, PLAIN))).toEqual([
      'width (mm),force (N)',
      '10,100',
      '20,180',
      '',
      'grade,strength (N)',
      'S235,235',
      'S355,355',
    ]);
  });

  it('leaves out a panel that refused to draw', () => {
    // A single scalar is not a plot (`inferPlotPanels` says so in its `error`).
    const result: PlotResult = { ...classic, measures: [measure('a', 'force', [100], [], newton)] };
    expect(plotCsv(result, {}, PLAIN)).toBe('');
  });
});
