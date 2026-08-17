import { describe, expect, it } from 'vitest';
import { formatQuantity } from '@joveworks/units';

import type { JsonObject } from '@joveworks/schema';
import {
  evaluateDocument,
  valueAt,
  type CheckResult,
  type EquationResult,
  type PlotResult,
  type TableResult,
  type PrintResult,
} from './evaluate.js';
import { KernelError } from './errors.js';
import {
  CATALOGUE,
  catalogueOf,
  closureNode,
  compareNode,
  documentOf,
  formulaNode,
  input,
  linear,
  list,
  outputNode,
  refTo,
  renard,
  scalar,
  slider,
  wire,
} from './invented.fixtures.js';
import type { CategoricalSeries, NumericSeries } from './series.js';

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

  it('evaluates a slider exactly like a scalar — its bounds are an editor concern, not the kernel’s', () => {
    const sliders = documentOf(
      [
        input('w', slider(20, 0, 100, 'mm')),
        input('h', scalar(5, 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('w.value', 'area.w'), wire('h.value', 'area.h')],
    );
    const evaluation = evaluateDocument(sliders, catalogues);
    expect(numeric(valueAt(evaluation, 'area', 'A')).data).toEqual([100]);
  });

  it('renders the output in the port’s declared unit', () => {
    const output = evaluateDocument(document, catalogues).outputs[0] as PrintResult;
    expect(output.unit.symbol).toBe('mm²');
    expect(formatQuantity(output.series.data[0] as number, output.unit)).toBe('100 mm²');
  });

  it('converts at the boundary and nowhere else', () => {
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

describe('closure nodes', () => {
  it('computes a student-typed expression, ports and all', () => {
    const document = documentOf(
      [input('F1', scalar(10, 'N')), input('F2', scalar(25, 'N')), closureNode('eq', 'a + b')],
      [wire('F1.value', 'eq.a'), wire('F2.value', 'eq.b')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    expect(numeric(valueAt(evaluation, 'eq', 'result')).data).toEqual([35]);
  });

  it('does not require its output template to be resolvable — there is none', () => {
    const document = documentOf(
      [
        input('w1', scalar(4, 'mm')),
        input('h1', scalar(3, 'mm')),
        input('w2', scalar(2, 'mm')),
        input('h2', scalar(6, 'mm')),
        closureNode('eq', 'a*b + c*d'),
      ],
      [
        wire('w1.value', 'eq.a'),
        wire('h1.value', 'eq.b'),
        wire('w2.value', 'eq.c'),
        wire('h2.value', 'eq.d'),
      ],
    );
    const evaluation = evaluateDocument(document, catalogues);
    expect(numeric(valueAt(evaluation, 'eq', 'result')).data).toEqual([24]);
  });
});

describe('sweeps', () => {
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

  it('includes both endpoints of a linear range exactly', () => {
    const document = documentOf([input('w', linear(20, 60, 21, 'mm'))], []);
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'w', 'value'));
    expect(series.data).toHaveLength(21);
    expect(series.data[0]).toBe(20);
    expect(series.data[20]).toBe(60);
  });

  it('spaces a logarithmic range geometrically', () => {
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

  it('gives two ranges an n × m grid with no grid node', () => {
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

  it('warns when the grid grows large, and still computes it', () => {
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

describe('spectra', () => {
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

describe('output nodes', () => {
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

  it('passes a check when the value clears the threshold', () => {
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

  it('converts a threshold typed in another unit', () => {
    const check = evaluateDocument(
      graph({ kind: 'check', comparison: '<=', threshold: { value: 100, unit: 'MPa' } }),
      catalogues,
    ).outputs[0] as CheckResult;
    // 100 MPa is 100 N/mm² exactly, which is the point of the canonical base.
    expect(check.threshold).toBe(100);
  });

  it('uses a wired threshold instead of the typed default, once something is wired to it', () => {
    const graphWithLimit = documentOf(
      [
        input('F', scalar(1000, 'N')),
        input('A', scalar(20, 'mm²')),
        input('limit', scalar(60, 'N/mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('out', { kind: 'check', comparison: '<=', threshold: { value: 100, unit: 'N/mm²' } }),
      ],
      [
        wire('F.value', 'p.F'),
        wire('A.value', 'p.A'),
        wire('p.p', 'out.value'),
        wire('limit.value', 'out.threshold'),
      ],
    );
    const check = evaluateDocument(graphWithLimit, catalogues).outputs[0] as CheckResult;
    expect(check.threshold).toBe(60);
    expect(check.passed).toBe(true);
  });

  it('refuses a wired threshold that is swept — a check is one bound, not one per point', () => {
    const swept = documentOf(
      [
        input('F', list([1000, 2000], 'N')),
        input('A', scalar(20, 'mm²')),
        input('limit', list([60, 70], 'N/mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('out', { kind: 'check', comparison: '<=', threshold: { value: 100, unit: 'N/mm²' } }),
      ],
      [
        wire('F.value', 'p.F'),
        wire('A.value', 'p.A'),
        wire('p.p', 'out.value'),
        wire('limit.value', 'out.threshold'),
      ],
    );
    expect(() => evaluateDocument(swept, catalogues)).toThrow(/one bound, not one per point/u);
  });

  it("reads a bare, unitless threshold default in the value port's own display unit, not canonical", () => {
    // Regression case: before the threshold port existed, a bare-unitless
    // default was read as dimensionless canonical, silently mis-scaling
    // anything not already in mm-N-s-rad-K.
    const check = evaluateDocument(
      graph({ kind: 'check', comparison: '<=', threshold: { value: 100, unit: '' } }),
      catalogues,
    ).outputs[0] as CheckResult;
    expect(check.unit.symbol).toBe('N/mm²');
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

  it('uses a wired threshold instead of the typed default, once something is wired to it', () => {
    const swept = documentOf(
      [
        input('F', list([1000, 2000, 3000], 'N'), { axisLabel: 'load' }),
        input('A', scalar(20, 'mm²')),
        input('limit', scalar(60, 'N/mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('plot', { kind: 'plot', x: 'F', threshold: { value: 100, unit: 'N/mm²' } }),
      ],
      [
        wire('F.value', 'p.F'),
        wire('A.value', 'p.A'),
        wire('p.p', 'plot.value'),
        wire('limit.value', 'plot.threshold'),
      ],
    );
    const plot = evaluateDocument(swept, catalogues).outputs[0] as PlotResult;
    expect(plot.threshold).toBe(60);
  });

  it('draws no threshold line at all when nothing is wired and nothing typed', () => {
    const swept = documentOf(
      [
        input('F', list([1000, 2000], 'N'), { axisLabel: 'load' }),
        input('A', scalar(20, 'mm²')),
        formulaNode('p', refTo('pressure')),
        outputNode('plot', { kind: 'plot', x: 'F' }),
      ],
      [wire('F.value', 'p.F'), wire('A.value', 'p.A'), wire('p.p', 'plot.value')],
    );
    const plot = evaluateDocument(swept, catalogues).outputs[0] as PlotResult;
    expect(plot.threshold).toBeUndefined();
  });

  it('refuses a wired threshold that is swept — a plot draws one reference line, not one per point', () => {
    const swept = documentOf(
      [
        input('F', list([1000, 2000], 'N'), { axisLabel: 'load' }),
        input('A', scalar(20, 'mm²')),
        input('limit', list([60, 70], 'N/mm²'), { axisLabel: 'load' }),
        formulaNode('p', refTo('pressure')),
        outputNode('plot', { kind: 'plot', x: 'F' }),
      ],
      [
        wire('F.value', 'p.F'),
        wire('A.value', 'p.A'),
        wire('p.p', 'plot.value'),
        wire('limit.value', 'plot.threshold'),
      ],
    );
    expect(() => evaluateDocument(swept, catalogues)).toThrow(/one reference line, not one per point/u);
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

  it('auto-assigns x, series and facet from the axes a value varies along, in document order', () => {
    const swept = documentOf(
      [
        input('a', list([1, 2], ''), { axisLabel: 'a' }),
        input('b', list([10, 20], ''), { axisLabel: 'b' }),
        input('c', list([100, 200], ''), { axisLabel: 'c' }),
        formulaNode('y', refTo('combine')),
        outputNode('plot', { kind: 'plot' }),
      ],
      [
        wire('a.value', 'y.a'),
        wire('b.value', 'y.b'),
        wire('c.value', 'y.c'),
        wire('y.y', 'plot.value'),
      ],
    );
    const plot = evaluateDocument(swept, catalogues).outputs[0] as PlotResult;
    expect(plot.x.axis.id).toBe('a');
    expect(plot.series2?.axis.id).toBe('b');
    expect(plot.facet?.axis.id).toBe('c');
  });

  it('leaves a pinned slot alone and fills only the empty ones', () => {
    const swept = documentOf(
      [
        input('a', list([1, 2], ''), { axisLabel: 'a' }),
        input('b', list([10, 20], ''), { axisLabel: 'b' }),
        input('c', list([100, 200], ''), { axisLabel: 'c' }),
        formulaNode('y', refTo('combine')),
        outputNode('plot', { kind: 'plot', x: 'c' }),
      ],
      [
        wire('a.value', 'y.a'),
        wire('b.value', 'y.b'),
        wire('c.value', 'y.c'),
        wire('y.y', 'plot.value'),
      ],
    );
    const plot = evaluateDocument(swept, catalogues).outputs[0] as PlotResult;
    expect(plot.x.axis.id).toBe('c');
    expect(plot.series2?.axis.id).toBe('a');
    expect(plot.facet?.axis.id).toBe('b');
  });

  it('warns and drops an axis once x, series and facet are all full', () => {
    const swept = documentOf(
      [
        input('a', list([1, 2], ''), { axisLabel: 'a' }),
        input('b', list([10, 20], ''), { axisLabel: 'b' }),
        input('c', list([100, 200], ''), { axisLabel: 'c' }),
        input('e', list([1, 2], ''), { axisLabel: 'e' }),
        formulaNode('y', refTo('combine')),
        formulaNode('sum', refTo('addTwo')),
        outputNode('plot', { kind: 'plot' }),
      ],
      [
        wire('a.value', 'y.a'),
        wire('b.value', 'y.b'),
        wire('c.value', 'y.c'),
        wire('y.y', 'sum.a'),
        wire('e.value', 'sum.b'),
        wire('sum.sum', 'plot.value'),
      ],
    );
    const evaluation = evaluateDocument(swept, catalogues);
    expect(evaluation.warnings.map((w) => w.kind)).toContain('plotAxisDropped');
    const plot = evaluation.outputs[0] as PlotResult;
    expect([plot.x.axis.id, plot.series2?.axis.id, plot.facet?.axis.id].sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('ignores a facet axis and warns when contour is on', () => {
    const swept = documentOf(
      [
        input('a', list([1, 2], ''), { axisLabel: 'a' }),
        input('b', list([10, 20], ''), { axisLabel: 'b' }),
        input('c', list([100, 200], ''), { axisLabel: 'c' }),
        formulaNode('y', refTo('combine')),
        outputNode('plot', { kind: 'plot', contour: true }),
      ],
      [
        wire('a.value', 'y.a'),
        wire('b.value', 'y.b'),
        wire('c.value', 'y.c'),
        wire('y.y', 'plot.value'),
      ],
    );
    const evaluation = evaluateDocument(swept, catalogues);
    expect(evaluation.warnings.map((w) => w.kind)).toContain('plotContourFacet');
    const plot = evaluation.outputs[0] as PlotResult;
    expect(plot.facet).toBeUndefined();
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

  it('broadcasts every table column across the union of its axes', () => {
    const swept = documentOf(
      [
        // Both inputs intentionally have four values: axis identity, rather
        // than a coincidental data length, determines how each one expands.
        input('outer', list([1, 2, 3, 4], '')),
        input('inner', list([10, 20, 30, 40], '')),
        formulaNode('product', refTo('multiplyTwo')),
        input('constant', scalar(7, '')),
        outputNode('table', { kind: 'table', columns: ['outer', 'inner', 'product', 'constant'] }),
      ],
      [
        wire('outer.value', 'product.a'),
        wire('inner.value', 'product.b'),
        wire('outer.value', 'table.outer'),
        wire('inner.value', 'table.inner'),
        wire('product.product', 'table.product'),
        wire('constant.value', 'table.constant'),
      ],
    );

    const table = evaluateDocument(swept, catalogues).outputs[0] as TableResult;
    expect(table.axes.map((axis) => axis.id)).toEqual(['outer', 'inner']);
    expect(table.columns.map((column) => column.series.axes.map((axis) => axis.id))).toEqual([
      ['outer', 'inner'],
      ['outer', 'inner'],
      ['outer', 'inner'],
      ['outer', 'inner'],
    ]);
    expect(table.columns.map((column) => column.series.data)).toEqual([
      [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4],
      [10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40],
      [10, 20, 30, 40, 20, 40, 60, 80, 30, 60, 90, 120, 40, 80, 120, 160],
      [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7],
    ]);
  });

  it('keeps a notebook section with its output', () => {
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

describe('equation outputs', () => {
  it("shows a catalogue formula's expression and citation, not its value", () => {
    const CITED: JsonObject = {
      id: 'cited',
      version: 1,
      output: { kind: 'numeric', name: 'y', unit: '' },
      inputs: [
        { kind: 'numeric', name: 'a', unit: '' },
        { kind: 'numeric', name: 'b', unit: '' },
      ],
      expression: 'a * b',
      description: 'Invented, and citation-bearing, for the equation-output test.',
      citation: 'Test 1.1',
      status: 'unverified',
    };
    const citedCatalogue = catalogueOf([CITED], 'cited-test');
    const document = documentOf(
      [
        input('a', scalar(2, '')),
        input('b', scalar(3, '')),
        formulaNode('f', refTo('cited', citedCatalogue)),
        outputNode('eq', { kind: 'equation' }),
      ],
      [wire('a.value', 'f.a'), wire('b.value', 'f.b'), wire('f.y', 'eq.value')],
    );
    const result = evaluateDocument(document, [citedCatalogue]).outputs[0] as EquationResult;
    expect(result.kind).toBe('equation');
    expect(result.expression).toBe('a * b');
    expect(result.citation).toBe('Test 1.1');
  });

  it("shows a closure node's own expression, with no citation", () => {
    const document = documentOf(
      [
        input('a', scalar(2, '')),
        input('b', scalar(3, '')),
        closureNode('eq', 'a + b'),
        outputNode('out', { kind: 'equation' }),
      ],
      [wire('a.value', 'eq.a'), wire('b.value', 'eq.b'), wire('eq.result', 'out.value')],
    );
    const result = evaluateDocument(document, catalogues).outputs[0] as EquationResult;
    expect(result.expression).toBe('a + b');
    expect(result.citation).toBeUndefined();
  });

  it('refuses an unwired equation output', () => {
    const document = documentOf([outputNode('out', { kind: 'equation' })], []);
    expect(() => evaluateDocument(document, catalogues)).toThrow(/not connected/u);
  });

  it('refuses a wire from a node that is not a formula or closure', () => {
    const document = documentOf(
      [input('a', scalar(2, 'mm')), outputNode('out', { kind: 'equation' })],
      [wire('a.value', 'out.value')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(
      /is not a formula or equation node/u,
    );
  });
});

describe('compare nodes', () => {
  const pressureGraph = (compare: JsonObject) =>
    documentOf(
      [
        input('F', list([1000, 4000], 'N')),
        input('A', scalar(20, 'mm²')),
        formulaNode('p', refTo('pressure')),
        compare,
      ],
      [wire('F.value', 'p.F'), wire('A.value', 'p.A'), wire('p.p', 'c.value')],
    );

  it('emits a pass/fail verdict per swept point, using the typed default threshold', () => {
    const document = pressureGraph(compareNode('c', '<=', { value: 100, unit: 'N/mm²' }));
    const verdict = valueAt(evaluateDocument(document, catalogues), 'c', 'verdict') as CategoricalSeries;
    expect(verdict.kind).toBe('categorical');
    // 50 N/mm² passes <= 100, 200 N/mm² does not.
    expect(verdict.data).toEqual(['pass', 'fail']);
  });

  it('reads a bare, unitless threshold default in the dimension value resolves to', () => {
    // A fresh threshold's unit is blank until the student sets one; that
    // must not force a 100 read as 100 dimensionless when p is N/mm².
    const document = pressureGraph(compareNode('c', '<=', { value: 100, unit: '' }));
    const verdict = valueAt(evaluateDocument(document, catalogues), 'c', 'verdict') as CategoricalSeries;
    expect(verdict.data).toEqual(['pass', 'fail']);
  });

  it("reads a bare threshold default in the value port's own display unit, not canonical", () => {
    // The pressure formula here displays in Pa, not N/mm² — a bare threshold
    // has to mean Pa too, or a student comparing against a Pa-displayed
    // value has no way to know 6 secretly meant 6 N/mm² canonical, a unit
    // nothing on screen ever shows.
    const PRESSURE_PA: JsonObject = {
      id: 'pressurePa',
      version: 1,
      output: { kind: 'numeric', name: 'p', unit: 'Pa' },
      inputs: [
        { kind: 'numeric', name: 'F', unit: 'N' },
        { kind: 'numeric', name: 'A', unit: 'mm²' },
      ],
      expression: 'F / A',
      description: 'Force over area, displayed in Pa. Invented for testing.',
      status: 'unverified',
    };
    const paCatalogue = catalogueOf([PRESSURE_PA], 'pa-test');
    const document = documentOf(
      [
        input('F', scalar(20, 'N')),
        input('A', scalar(1000, 'mm²')),
        formulaNode('p', refTo('pressurePa', paCatalogue)),
        compareNode('c', '>=', { value: 6, unit: '' }),
      ],
      [wire('F.value', 'p.F'), wire('A.value', 'p.A'), wire('p.p', 'c.value')],
    );
    // 20 N / 1000 mm² = 0.02 N/mm² = 20 000 Pa. A bare threshold of 6 must
    // mean 6 Pa (comparable to a Pa-displayed value, and trivially passed),
    // not 6 N/mm² canonical (which would fail: 0.02 >= 6 is false).
    const verdict = valueAt(evaluateDocument(document, [paCatalogue]), 'c', 'verdict') as CategoricalSeries;
    expect(verdict.data).toEqual(['pass']);
  });

  it('uses a wired threshold instead of the typed default, once something is wired to it', () => {
    const document = documentOf(
      [
        input('F', list([1000, 4000], 'N')),
        input('A', scalar(20, 'mm²')),
        input('limit', scalar(60, 'N/mm²')),
        formulaNode('p', refTo('pressure')),
        compareNode('c', '<=', { value: 100, unit: 'N/mm²' }),
      ],
      [
        wire('F.value', 'p.F'),
        wire('A.value', 'p.A'),
        wire('p.p', 'c.value'),
        wire('limit.value', 'c.threshold'),
      ],
    );
    const verdict = valueAt(evaluateDocument(document, catalogues), 'c', 'verdict') as CategoricalSeries;
    // Against a 60 N/mm² limit instead of the typed 100: 50 still passes, 200 now fails too.
    expect(verdict.data).toEqual(['pass', 'fail']);
  });

  it('lines a swept threshold up elementwise with the value, sharing the same axis', () => {
    const document = documentOf(
      [
        input('F', list([1000, 4000], 'N'), { axisLabel: 'load' }),
        input('A', scalar(20, 'mm²')),
        input('limit', list([60, 300], 'N/mm²'), { axisLabel: 'load' }),
        formulaNode('p', refTo('pressure')),
        compareNode('c', '<=', { value: 1, unit: 'N/mm²' }),
      ],
      [
        wire('F.value', 'p.F'),
        wire('A.value', 'p.A'),
        wire('p.p', 'c.value'),
        wire('limit.value', 'c.threshold'),
      ],
    );
    // 50 <= 60 (pass), 200 <= 300 (pass) — a per-point limit, not a grid.
    const verdict = valueAt(evaluateDocument(document, catalogues), 'c', 'verdict') as CategoricalSeries;
    expect(verdict.data).toEqual(['pass', 'pass']);
  });

  it('feeds a verdict into a table column, showing which swept points fail', () => {
    const document = documentOf(
      [
        input('F', list([1000, 4000], 'N')),
        input('A', scalar(20, 'mm²')),
        formulaNode('p', refTo('pressure')),
        compareNode('c', '<=', { value: 100, unit: 'N/mm²' }),
        outputNode('table', { kind: 'table', columns: ['pressure', 'verdict'] }),
      ],
      [
        wire('F.value', 'p.F'),
        wire('A.value', 'p.A'),
        wire('p.p', 'c.value'),
        wire('p.p', 'table.pressure'),
        wire('c.verdict', 'table.verdict'),
      ],
    );
    const table = evaluateDocument(document, catalogues).outputs[0] as TableResult;
    expect(table.columns[0]?.series.data).toEqual([50, 200]);
    expect(table.columns[1]?.series.data).toEqual(['pass', 'fail']);
  });

  it('refuses to evaluate an unwired value — there is nothing to compare', () => {
    const document = documentOf(
      [compareNode('c', '>=', { value: 1, unit: '' })],
      [],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/not connected and has no default/u);
  });

  it('refuses a swept threshold whose length does not match the value it compares against', () => {
    const document = documentOf(
      [
        input('F', list([1000, 4000], 'N')),
        input('A', scalar(20, 'mm²')),
        input('limit', list([60, 70, 80], 'N/mm²')),
        formulaNode('p', refTo('pressure')),
        compareNode('c', '<=', { value: 1, unit: 'N/mm²' }),
      ],
      [
        wire('F.value', 'p.F'),
        wire('A.value', 'p.A'),
        wire('p.p', 'c.value'),
        wire('limit.value', 'c.threshold'),
      ],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/one bound per point/u);
  });
});

describe('the gates', () => {
  it('will not evaluate a quarantined formula, however it was wired', () => {
    const document = documentOf(
      [input('a', scalar(1, 'mm')), formulaNode('broken', refTo('broken'))],
      [wire('a.value', 'broken.a')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(KernelError);
    expect(() => evaluateDocument(document, catalogues)).toThrow(/quarantined/u);
  });

  it('warns when a formula is used outside its condition, and still answers', () => {
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
