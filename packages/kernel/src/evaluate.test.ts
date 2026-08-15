import { describe, expect, it } from 'vitest';
import { formatQuantity } from '@mds/units';

import { evaluateDocument, valueAt, type CheckResult, type PlotResult, type TableResult, type PrintResult } from './evaluate.js';
import { KernelError } from './errors.js';
import {
  CATALOGUE,
  documentOf,
  formulaNode,
  input,
  linear,
  list,
  outputNode,
  refTo,
  renard,
  scalar,
  wire,
} from './invented.fixtures.js';
import type { NumericSeries } from './series.js';

const catalogues = [CATALOGUE];

const numeric = (value: ReturnType<typeof valueAt>): NumericSeries => {
  if (value === undefined || value.kind !== 'numeric') throw new Error('not a numeric series');
  return value;
};

describe('a scalar graph', () => {
  const document = documentOf(
    [
      input('w', scalar(20, 'mm')),
      input('h', scalar(5, 'mm')),
      formulaNode('area', refTo('area')),
      outputNode('readout', { kind: 'print' }),
    ],
    [wire('w.value', 'area.w'), wire('h.value', 'area.h'), wire('area.A', 'readout.value')],
  );

  it('computes forwards, in canonical units', () => {
    const evaluation = evaluateDocument(document, catalogues);
    expect(numeric(valueAt(evaluation, 'area', 'A')).data).toEqual([100]);
  });

  it('renders the output in the port’s declared unit', () => {
    const output = evaluateDocument(document, catalogues).outputs[0] as PrintResult;
    expect(output.unit.symbol).toBe('mm²');
    expect(formatQuantity(output.series.data[0] as number, output.unit)).toBe('100 mm²');
  });

  it('converts at the boundary and nowhere else (S5)', () => {
    // 2 cm × 50 mm is 1000 mm², and the kernel never sees a centimetre.
    const centimetres = documentOf(
      [
        input('w', scalar(2, 'cm')),
        input('h', scalar(50, 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('w.value', 'area.w'), wire('h.value', 'area.h')],
    );
    const evaluation = evaluateDocument(centimetres, catalogues);
    expect(numeric(valueAt(evaluation, 'area', 'A')).data).toEqual([1000]);
  });

  it('falls back to a port’s default when nothing is wired', () => {
    const partial = documentOf(
      [input('w', scalar(20, 'mm')), formulaNode('area', refTo('area'))],
      [wire('w.value', 'area.w')],
    );
    // `h` defaults to 10 mm in the fixture.
    expect(numeric(valueAt(evaluateDocument(partial, catalogues), 'area', 'A')).data).toEqual([200]);
  });

  it('refuses to invent a value for an input with no default', () => {
    const partial = documentOf(
      [input('h', scalar(5, 'mm')), formulaNode('area', refTo('area'))],
      [wire('h.value', 'area.h')],
    );
    expect(() => evaluateDocument(partial, catalogues)).toThrow(/not connected and has no default/u);
  });
});

describe('sweeps (S29, S43)', () => {
  it('turns the whole downstream graph into a series with no rewiring', () => {
    const document = documentOf(
      [
        input('w', linear(10, 50, 5, 'mm'), { axisLabel: 'width' }),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('w.value', 'area.w'), wire('h.value', 'area.h')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'area', 'A'));
    expect(series.axes.map((axis) => axis.label)).toEqual(['width']);
    expect(series.data).toEqual([20, 40, 60, 80, 100]);
  });

  it('includes both endpoints of a linear range exactly (S29)', () => {
    const document = documentOf([input('w', linear(20, 60, 21, 'mm'))], []);
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'w', 'value'));
    expect(series.data).toHaveLength(21);
    expect(series.data[0]).toBe(20);
    expect(series.data[20]).toBe(60);
  });

  it('spaces a logarithmic range geometrically (S29)', () => {
    const document = documentOf(
      [input('n', { kind: 'logarithmic', start: 1, stop: 1000, points: 4, unit: '' })],
      [],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'n', 'value'));
    expect(series.data.map((value) => Math.round(value))).toEqual([1, 10, 100, 1000]);
  });

  it('sweeps the sizes you can actually buy — an explicit list', () => {
    const document = documentOf(
      [
        input('w', list([25, 30, 35, 40], 'mm')),
        input('h', scalar(1, 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('w.value', 'area.w'), wire('h.value', 'area.h')],
    );
    expect(numeric(valueAt(evaluateDocument(document, catalogues), 'area', 'A')).data).toEqual([
      25, 30, 35, 40,
    ]);
  });

  it('sweeps a Renard series (ISO 3) as an axis, expanded and converted at the boundary', () => {
    const document = documentOf([input('w', renard('R10', 10, 100, 'mm'))], []);
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'w', 'value'));
    expect(series.data).toEqual([10, 12.5, 16, 20, 25, 31.5, 40, 50, 63, 80, 100]);
  });

  it('gives two ranges an n × m grid with no grid node (S43)', () => {
    const document = documentOf(
      [
        input('w', list([1, 2, 3], 'mm')),
        input('h', list([10, 20], 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('w.value', 'area.w'), wire('h.value', 'area.h')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'area', 'A'));
    expect(series.axes.map((axis) => axis.id)).toEqual(['w', 'h']);
    expect(series.data).toEqual([10, 20, 20, 40, 30, 60]);
  });

  it('lines up two values that vary along the same axis', () => {
    // Both inputs of the sum come from one range: 3 points, not 9.
    const document = documentOf(
      [input('d', list([1, 2, 3], 'mm')), formulaNode('sum', refTo('addTwo'))],
      [wire('d.value', 'sum.a'), wire('d.value', 'sum.b')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'sum', 'sum'));
    expect(series.data).toEqual([2, 4, 6]);
  });

  it('warns when the grid grows large, and still computes it (S43)', () => {
    const document = documentOf(
      [
        input('w', linear(1, 100, 100, 'mm')),
        input('h', linear(1, 100, 100, 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('w.value', 'area.w'), wire('h.value', 'area.h')],
    );
    const evaluation = evaluateDocument(document, catalogues, { largeGrid: 5000 });
    expect(evaluation.warnings.map((warning) => warning.kind)).toContain('largeGrid');
    expect(numeric(valueAt(evaluation, 'area', 'A')).data).toHaveLength(10_000);
  });
});

describe('spectra (S36)', () => {
  it('consumes a whole series and produces one number', () => {
    const document = documentOf(
      [
        input('loads', { kind: 'spectrum', values: [100, 200, 300], unit: 'N' }),
        formulaNode('total', refTo('total')),
      ],
      [wire('loads.value', 'total.xs')],
    );
    expect(numeric(valueAt(evaluateDocument(document, catalogues), 'total', 'total')).data).toEqual([
      600,
    ]);
  });

  it('keeps a spectrum out of a numeric port — a sweep is not a spectrum', () => {
    const document = documentOf(
      [
        input('loads', { kind: 'spectrum', values: [1, 2], unit: 'N' }),
        formulaNode('sum', refTo('addTwo')),
      ],
      [wire('loads.value', 'sum.a')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(
      /spectrum value to a numeric port/u,
    );
  });
});

describe('output nodes (S33)', () => {
  const graph = (output: Parameters<typeof outputNode>[1]) =>
    documentOf(
      [
        input('F', scalar(1000, 'N')),
        input('A', scalar(20, 'mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('out', output),
      ],
      [wire('F.value', 'p.F'), wire('A.value', 'p.A'), wire('p.p', 'out.value')],
    );

  it('passes a check when the value clears the threshold (S58)', () => {
    const evaluation = evaluateDocument(
      graph({ kind: 'check', comparison: '<=', threshold: { value: 100, unit: 'N/mm²' } }),
      catalogues,
    );
    const check = evaluation.outputs[0] as CheckResult;
    expect(check.kind).toBe('check');
    expect(check.threshold).toBe(100);
    expect(check.series.data).toEqual([50]);
    expect(check.passed).toBe(true);
  });

  it('fails it when it does not, per cell of a sweep', () => {
    const swept = documentOf(
      [
        input('F', list([1000, 4000], 'N')),
        input('A', scalar(20, 'mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('out', {
          kind: 'check',
          comparison: '<=',
          threshold: { value: 100, unit: 'N/mm²' },
        }),
      ],
      [wire('F.value', 'p.F'), wire('A.value', 'p.A'), wire('p.p', 'out.value')],
    );
    const check = evaluateDocument(swept, catalogues).outputs[0] as CheckResult;
    expect(check.results).toEqual([true, false]);
    expect(check.passed).toBe(false);
  });

  it('converts a threshold typed in another unit (S5)', () => {
    const check = evaluateDocument(
      graph({ kind: 'check', comparison: '<=', threshold: { value: 100, unit: 'MPa' } }),
      catalogues,
    ).outputs[0] as CheckResult;
    // 100 MPa is 100 N/mm² exactly, which is the point of the canonical base.
    expect(check.threshold).toBe(100);
  });

  it('gives a plot its x axis and the coordinates along it', () => {
    const swept = documentOf(
      [
        input('F', list([1000, 2000, 3000], 'N'), { axisLabel: 'load' }),
        input('A', scalar(20, 'mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('plot', { kind: 'plot', x: 'F', threshold: { value: 100, unit: 'N/mm²' } }),
      ],
      [wire('F.value', 'p.F'), wire('A.value', 'p.A'), wire('p.p', 'plot.value')],
    );
    const plot = evaluateDocument(swept, catalogues).outputs[0] as PlotResult;
    expect(plot.x.axis.label).toBe('load');
    expect(plot.x.coordinates.data).toEqual([1000, 2000, 3000]);
    expect(plot.series.data).toEqual([50, 100, 150]);
    expect(plot.threshold).toBe(100);
  });

  it('warns when a plotted value does not vary along the axis it names', () => {
    const flat = documentOf(
      [
        input('d', list([1, 2, 3], 'mm')),
        input('F', scalar(1000, 'N')),
        input('A', scalar(20, 'mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('plot', { kind: 'plot', x: 'd' }),
      ],
      [wire('F.value', 'p.F'), wire('A.value', 'p.A'), wire('p.p', 'plot.value')],
    );
    expect(evaluateDocument(flat, catalogues).warnings.map((w) => w.kind)).toContain('plotAxis');
  });

  it('lays a table out as columns over a shared axis', () => {
    const swept = documentOf(
      [
        input('F', list([1000, 2000], 'N')),
        input('A', scalar(20, 'mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('table', { kind: 'table', columns: ['load', 'pressure'] }),
      ],
      [
        wire('F.value', 'p.F'),
        wire('A.value', 'p.A'),
        wire('F.value', 'table.load'),
        wire('p.p', 'table.pressure'),
      ],
    );
    const table = evaluateDocument(swept, catalogues).outputs[0] as TableResult;
    expect(table.columns.map((column) => column.name)).toEqual(['load', 'pressure']);
    expect(table.columns[0]?.unit.symbol).toBe('N');
    expect(table.columns[1]?.series.data).toEqual([50, 100]);
    expect(table.axes.map((axis) => axis.id)).toEqual(['F']);
  });

  it('keeps a notebook section with its output (S30)', () => {
    const framed = documentOf(
      [
        input('F', scalar(1000, 'N')),
        input('A', scalar(20, 'mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('out', { kind: 'print' }, { frameId: 'section', caption: 'A caption.' }),
      ],
      [wire('F.value', 'p.F'), wire('A.value', 'p.A'), wire('p.p', 'out.value')],
      [
        {
          id: 'section',
          title: 'Bearing pressure',
          note: 'Prose.',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 100 },
        },
      ],
    );
    const [output] = evaluateDocument(framed, catalogues).outputs;
    expect(output?.frameId).toBe('section');
    expect(output?.caption).toBe('A caption.');
  });
});

describe('the gates', () => {
  it('will not evaluate a quarantined formula, however it was wired (S19)', () => {
    const document = documentOf(
      [input('a', scalar(1, 'mm')), formulaNode('broken', refTo('broken'))],
      [wire('a.value', 'broken.a')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(KernelError);
    expect(() => evaluateDocument(document, catalogues)).toThrow(/quarantined/u);
  });

  it('warns when a formula is used outside its condition, and still answers (S40)', () => {
    const document = documentOf(
      [input('d', list([10, 80], 'mm')), formulaNode('c', refTo('conditional'))],
      [wire('d.value', 'c.d')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const [warning] = evaluation.warnings.filter((entry) => entry.kind === 'appliesWhen');
    expect(warning?.message).toMatch(/at 1 of 2 points/u);
    expect(numeric(valueAt(evaluation, 'c', 'y')).data).toEqual([20, 160]);
  });

  it('says nothing when the condition holds everywhere', () => {
    const document = documentOf(
      [input('d', list([10, 20], 'mm')), formulaNode('c', refTo('conditional'))],
      [wire('d.value', 'c.d')],
    );
    expect(evaluateDocument(document, catalogues).warnings).toEqual([]);
  });
});
