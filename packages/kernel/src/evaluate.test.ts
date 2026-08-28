import { describe, expect, it } from 'vitest';
import { formatQuantity } from '@joveworks/units';

import type { JsonObject } from '@joveworks/schema';
import {
  evaluateDocument,
  receiverSampleValue,
  valueAt,
  type BestDesignResult,
  type ParetoResult,
  type CheckResult,
  type EquationResult,
  type FeasibilityResult,
  type PlotResult,
  type SensitivityResult,
  type StressResult,
  type TableResult,
  type PrintResult,
  type ReliabilityResult,
} from './evaluate.js';
import { KernelError } from './errors.js';
import { resolveGraph } from './graph.js';
import { sensitivityCandidates } from './sensitivity.js';
import {
  CATALOGUE,
  catalogueOf,
  closureNode,
  compareNode,
  documentOf,
  fileNode,
  fileSource,
  formulaNode,
  input,
  linear,
  list,
  monteCarloGeneratorNode,
  monteCarloReceiverNode,
  normalDraw,
  outputNode,
  rangeNode,
  refTo,
  renard,
  scalar,
  selectNode,
  slider,
  uniformDraw,
  variadicWires,
  wire,
} from './invented.fixtures.js';
import type { CategoricalSeries, NumericSeries } from './series.js';

const catalogues = [CATALOGUE];

const numeric = (value: ReturnType<typeof valueAt>): NumericSeries => {
  if (value === undefined || value.kind !== 'numeric') throw new Error('not a numeric series');
  return value;
};

describe('intelligent multi-measure plots', () => {
  it('evaluates every named measure over its own axes and unit', () => {
    const document = documentOf(
      [
        input('w', list([10, 20, 30], 'mm'), { label: 'width' }),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area'), { label: 'area' }),
        outputNode('plot', {
          kind: 'plot',
          measures: [
            { id: 'value', label: 'width', unit: 'mm' },
            { id: 'value2', label: 'area', unit: 'mm²' },
          ],
        }),
      ],
      [
        wire('w.value', 'area.w'),
        wire('h.value', 'area.h'),
        wire('w.value', 'plot.value'),
        wire('area.A', 'plot.value2'),
      ],
    );
    const result = evaluateDocument(document, catalogues).outputs[0] as PlotResult;
    expect(result.measures?.map((measure) => [measure.id, measure.label, measure.series.data])).toEqual([
      ['value', 'width', [10, 20, 30]],
      ['value2', 'area', [20, 40, 60]],
    ]);
    expect(result.measures?.every((measure) => measure.axes[0]?.axis.id === 'w')).toBe(true);
  });

  it('resolves an independent typed or wired threshold for each measure', () => {
    const document = documentOf(
      [
        input('a', scalar(10, 'mm')),
        input('b', scalar(20, 'mm')),
        input('limit', scalar(18, 'mm')),
        outputNode('plot', {
          kind: 'plot',
          measures: [
            { id: 'value', label: 'a', threshold: { value: 12, unit: 'mm' } },
            { id: 'value2', label: 'b', threshold: { value: 15, unit: 'mm' } },
          ],
        }),
      ],
      [
        wire('a.value', 'plot.value'),
        wire('b.value', 'plot.value2'),
        wire('limit.value', 'plot.value2Threshold'),
      ],
    );
    const result = evaluateDocument(document, catalogues).outputs[0] as PlotResult;
    expect(result.measures?.map((measure) => measure.threshold)).toEqual([12, 18]);
  });

  it('keeps scalar measures axis-free for dot comparison inference', () => {
    const document = documentOf(
      [
        input('a', scalar(10, 'mm')),
        input('b', scalar(20, 'mm')),
        outputNode('plot', {
          kind: 'plot', measures: [{ id: 'value', label: 'a' }, { id: 'value2', label: 'b' }],
        }),
      ],
      [wire('a.value', 'plot.value'), wire('b.value', 'plot.value2')],
    );
    const result = evaluateDocument(document, catalogues).outputs[0] as PlotResult;
    expect(result.measures?.map((measure) => measure.axes)).toEqual([[], []]);
  });

  it('does not require the original value port after that measure is removed', () => {
    const document = documentOf(
      [
        input('b', scalar(20, 'mm')),
        outputNode('plot', { kind: 'plot', measures: [{ id: 'value2', label: 'b' }] }),
      ],
      [wire('b.value', 'plot.value2')],
    );
    const result = evaluateDocument(document, catalogues).outputs[0] as PlotResult;
    expect(result.measures?.map((measure) => measure.id)).toEqual(['value2']);
    expect(result.series.data).toEqual([20]);
  });
});

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

describe('Reliability outputs', () => {
  const study = (threshold: number) => documentOf(
    [
      monteCarloGeneratorNode('draw', uniformDraw(0, 1), 4, ''),
      outputNode('check', { kind: 'check', comparison: '>=', threshold: { value: threshold, unit: '' } }),
      outputNode('reliability', { kind: 'reliability', checks: ['check'], confidence: 0.95 }),
    ],
    [wire('draw.value', 'check.value')],
  );

  it('reports Pf, a Wilson interval, and beta over a known verdict grid', () => {
    const evaluation = evaluateDocument(study(0.5), catalogues);
    const report = evaluation.outputs.find((entry) => entry.nodeId === 'reliability') as ReliabilityResult;
    expect(report.combined).toMatchObject({ trials: 4, failures: 3, probability: 0.75, unresolved: false });
    expect(report.combined?.interval[0]).toBeCloseTo(0.3006418, 6);
    expect(report.combined?.interval[1]).toBeCloseTo(0.9544127, 6);
    expect(report.combined?.beta).toBeCloseTo(-0.67448975, 6);
  });

  it('keeps zero failures finite and reports the resolution floor', () => {
    const evaluation = evaluateDocument(study(0), catalogues);
    const report = evaluation.outputs.find((entry) => entry.nodeId === 'reliability') as ReliabilityResult;
    expect(report.combined?.failures).toBe(0);
    expect(report.combined?.interval[1]).toBeGreaterThan(0);
    expect(report.combined?.beta).toBeCloseTo(0.67448975, 6);
    expect(report.combined?.unresolved).toBe(true);
    expect(Number.isFinite(report.combined?.beta ?? Infinity)).toBe(true);
    expect(evaluation.warnings.some((warning) => warning.kind === 'reliabilityUnresolved')).toBe(true);
  });

  it('warns when referenced checks do not vary along the trial axis', () => {
    const document = documentOf(
      [
        monteCarloGeneratorNode('draw', uniformDraw(0, 1), 4, ''),
        input('fixed', scalar(1, '')),
        outputNode('check', { kind: 'check', comparison: '>=', threshold: { value: 0, unit: '' } }),
        outputNode('reliability', { kind: 'reliability', checks: ['check'] }),
      ],
      [wire('fixed.value', 'check.value')],
    );
    expect(evaluateDocument(document, catalogues).warnings.some((warning) => warning.kind === 'reliabilityNoTrials')).toBe(true);
  });

  it('allows an empty check list as an unfinished report', () => {
    const document = documentOf([outputNode('reliability', { kind: 'reliability', checks: [] })], []);
    const report = evaluateDocument(document, catalogues).outputs[0] as ReliabilityResult;
    expect(report.checks).toEqual([]);
    expect(report.combined).toBeUndefined();
  });

  it('warns and falls back to equal discrete weights when lengths differ', () => {
    const document = documentOf(
      [
        input('choice1', scalar(1, 'mm')),
        input('choice2', scalar(2, 'mm')),
        input('choice3', scalar(3, 'mm')),
        input('weight1', scalar(1, '')),
        input('weight2', scalar(2, '')),
        monteCarloGeneratorNode('draw', { distribution: 'discrete' }, 10, 'mm'),
      ],
      [
        wire('choice1.value', 'draw.values'),
        wire('choice2.value', 'draw.values'),
        wire('choice3.value', 'draw.values'),
        wire('weight1.value', 'draw.weights'),
        wire('weight2.value', 'draw.weights'),
      ],
    );
    const evaluation = evaluateDocument(document, catalogues);
    expect(numeric(valueAt(evaluation, 'draw', 'value')).data).toHaveLength(10);
    expect(evaluation.warnings.some((warning) => warning.kind === 'monteCarloDiscreteWeights')).toBe(true);
  });
});

describe('discrete Monte Carlo choices arriving as variadic wires', () => {
  // Every wiring shape below feeds the same 1/2/3 choice set to the same
  // 'draw' node in the same 'graph' document, so `monteCarloSamples`'s seed
  // (documentId + nodeId) lines up and the draws can be compared directly —
  // not just checked for shape.
  const drawsOf = (nodes: readonly JsonObject[], wires: readonly JsonObject[]): readonly number[] =>
    numeric(
      valueAt(
        evaluateDocument(
          documentOf([...nodes, monteCarloGeneratorNode('draw', { distribution: 'discrete' }, 20, 'mm')], wires),
          catalogues,
        ),
        'draw',
        'value',
      ),
    ).data;

  it('reads one wire carrying a list as the whole choice set', () => {
    const draws = drawsOf([input('choices', list([1, 2, 3], 'mm'))], [wire('choices.value', 'draw.values')]);
    expect(draws).toHaveLength(20);
    expect(draws.every((value) => [1, 2, 3].includes(value))).toBe(true);
  });

  it('reads three single-value wires as the same choice set', () => {
    const { nodes, wires } = variadicWires('choice', 'draw.values', [1, 2, 3], 'mm');
    const draws = drawsOf(nodes, wires);
    expect(draws).toHaveLength(20);
    expect(draws.every((value) => [1, 2, 3].includes(value))).toBe(true);
  });

  it('reads a mix of a multi-value wire and single-value wires as one choice set', () => {
    const draws = drawsOf(
      [input('pair', list([1, 2], 'mm')), input('third', scalar(3, 'mm'))],
      [wire('pair.value', 'draw.values'), wire('third.value', 'draw.values')],
    );
    expect(draws).toHaveLength(20);
    expect(draws.every((value) => [1, 2, 3].includes(value))).toBe(true);
  });

  it('draws identically no matter which of those shapes carried the choices', () => {
    const oneWire = drawsOf([input('choices', list([1, 2, 3], 'mm'))], [wire('choices.value', 'draw.values')]);
    const { nodes: threeNodes, wires: threeWireList } = variadicWires('choice', 'draw.values', [1, 2, 3], 'mm');
    const threeWires = drawsOf(threeNodes, threeWireList);
    const mixed = drawsOf(
      [input('pair', list([1, 2], 'mm')), input('third', scalar(3, 'mm'))],
      [wire('pair.value', 'draw.values'), wire('third.value', 'draw.values')],
    );
    expect(threeWires).toEqual(oneWire);
    expect(mixed).toEqual(oneWire);
  });

  it('reads one wire carrying a list as several weights', () => {
    const { nodes: choiceNodes, wires: choiceWires } = variadicWires('choice', 'draw.values', [1, 2, 3], 'mm');
    const draws = drawsOf(
      [...choiceNodes, input('weights', list([1, 2, 3], ''))],
      [...choiceWires, wire('weights.value', 'draw.weights')],
    );
    expect(draws).toHaveLength(20);
  });
});

describe('table-backed formulas', () => {
  const lookupCatalogue = catalogueOf([
    {
      id: 'lookup', version: 1,
      output: { kind: 'numeric', name: 'result', unit: 'mm' },
      inputs: [
        { kind: 'numeric', name: 'size', unit: 'mm', default: 1 },
        { kind: 'categorical', name: 'class', domain: ['A', 'B'], default: 'A' },
      ],
      expression: '0 * size',
      lookup: {
        axes: [
          { input: 'size', kind: 'numeric', values: [10, 20] },
          { input: 'class', kind: 'categorical', values: ['A', 'B'] },
        ],
        values: [1, 2, 3, null],
      },
      description: 'Invented lookup table.', status: 'unverified',
    },
  ]);
  const lookupRef = refTo('lookup', lookupCatalogue);

  it('uses catalogue defaults and node-local unwired overrides', () => {
    const defaults = documentOf([formulaNode('table', lookupRef)], []);
    expect(numeric(valueAt(evaluateDocument(defaults, [lookupCatalogue]), 'table', 'result')).data).toEqual([1]);

    const overridden = documentOf([
      formulaNode('table', lookupRef, {
        inputValues: {
          size: { kind: 'scalar', value: 15, unit: 'mm' },
          class: { kind: 'categorical', value: 'A' },
        },
      }),
    ], []);
    expect(numeric(valueAt(evaluateDocument(overridden, [lookupCatalogue]), 'table', 'result')).data).toEqual([3]);
  });

  it('reports an explicitly undefined table cell', () => {
    const document = documentOf([
      formulaNode('table', lookupRef, {
        inputValues: {
          size: { kind: 'scalar', value: 15, unit: 'mm' },
          class: { kind: 'categorical', value: 'B' },
        },
      }),
    ], []);
    expect(() => evaluateDocument(document, [lookupCatalogue])).toThrow(/not defined/u);
  });

  /**
   * The shape a camera library takes: one dropdown, and every property of the
   * thing picked answered at once, each in its own unit.
   */
  describe('answering with several properties at once', () => {
    const propertiesCatalogue = catalogueOf([
      {
        id: 'properties', version: 1,
        output: [
          { kind: 'numeric', name: 'w', unit: 'mm' },
          { kind: 'numeric', name: 'p', unit: 'µm' },
          { kind: 'numeric', name: 'n', unit: '' },
        ],
        inputs: [{ kind: 'categorical', name: 'pick', domain: ['first', 'second'], default: 'first' }],
        lookup: {
          axes: [{ input: 'pick', kind: 'categorical', values: ['first', 'second'] }],
          values: { w: [36, 23.5], p: [5.9, 3.9], n: [24, 40] },
        },
        description: 'Invented property table.', status: 'unverified',
      },
    ]);
    const propertiesRef = refTo('properties', propertiesCatalogue);

    it('reads every output off the row its dropdown picks, each in its own unit', () => {
      const document = documentOf([formulaNode('spec', propertiesRef)], []);
      const evaluation = evaluateDocument(document, [propertiesCatalogue]);
      // Canonical length is mm, so µm arrives scaled and the dimensionless
      // count arrives untouched.
      expect(numeric(valueAt(evaluation, 'spec', 'w')).data).toEqual([36]);
      expect(numeric(valueAt(evaluation, 'spec', 'p')).data[0]).toBeCloseTo(0.0059, 9);
      expect(numeric(valueAt(evaluation, 'spec', 'n')).data).toEqual([24]);
    });

    it('moves every output together when the pick changes', () => {
      const document = documentOf([
        formulaNode('spec', propertiesRef, {
          inputValues: { pick: { kind: 'categorical', value: 'second' } },
        }),
      ], []);
      const evaluation = evaluateDocument(document, [propertiesCatalogue]);
      expect(numeric(valueAt(evaluation, 'spec', 'w')).data).toEqual([23.5]);
      expect(numeric(valueAt(evaluation, 'spec', 'n')).data).toEqual([40]);
    });
  });

  /**
   * The point of the alias table: a thing names itself one way and the
   * domain names it another, and a wire between them still lands.
   */
  describe('an entry called by another name', () => {
    const aliasedCatalogue = catalogueOf([
      {
        id: 'aliased', version: 1,
        output: { kind: 'numeric', name: 'w', unit: 'mm' },
        inputs: [
          {
            kind: 'categorical',
            name: 'pick',
            domain: ['First Thing Mark II', 'Second Thing'],
            aliases: { 'FirstThingM2': 'First Thing Mark II', 'first-thing-2': 'First Thing Mark II' },
            default: 'Second Thing',
          },
        ],
        lookup: {
          axes: [{ input: 'pick', kind: 'categorical', values: ['First Thing Mark II', 'Second Thing'] }],
          values: [36, 23.5],
        },
        description: 'Invented aliased table.', status: 'unverified',
      },
    ]);
    const aliasedRef = refTo('aliased', aliasedCatalogue);

    it('resolves a wired-in spelling that is not itself a domain entry', () => {
      const document = documentOf(
        [
          input('name', { kind: 'categorical', value: 'FirstThingM2' }),
          formulaNode('spec', aliasedRef),
        ],
        [wire('name.value', 'spec.pick')],
      );
      expect(numeric(valueAt(evaluateDocument(document, [aliasedCatalogue]), 'spec', 'w')).data).toEqual([36]);
    });

    it('names the spelling that missed, rather than only the port', () => {
      const document = documentOf(
        [
          input('name', { kind: 'categorical', value: 'Third Thing' }),
          formulaNode('spec', aliasedRef),
        ],
        [wire('name.value', 'spec.pick')],
      );
      expect(() => evaluateDocument(document, [aliasedCatalogue])).toThrow(
        /nothing here is called 'Third Thing'/u,
      );
    });
  });

  it('uses lookup axes as numeric or categorical table-column sweeps', () => {
    const document = documentOf([
      input('sizes', { kind: 'tableColumn', table: 'lookup', column: 'size' }),
      input('classes', { kind: 'tableColumn', table: 'lookup', column: 'class' }),
    ], []);
    const evaluation = evaluateDocument(document, [lookupCatalogue]);
    expect(numeric(valueAt(evaluation, 'sizes', 'value')).data).toEqual([10, 20]);
    const classes = valueAt(evaluation, 'classes', 'value');
    expect(classes?.kind).toBe('categorical');
    if (classes?.kind === 'categorical') expect(classes.data).toEqual(['A', 'B']);
  });
});

describe('a formula that answers with several expressions', () => {
  const limitsCatalogue = catalogueOf([
    {
      id: 'limits', version: 1,
      output: [
        { kind: 'numeric', name: 'near', unit: 'mm' },
        { kind: 'numeric', name: 'far', unit: 'mm' },
        { kind: 'numeric', name: 'span', unit: 'mm' },
      ],
      inputs: [
        { kind: 'numeric', name: 'a', unit: 'mm', default: 10 },
        { kind: 'numeric', name: 'b', unit: 'mm', default: 2 },
      ],
      expression: { near: 'a - b', far: 'a + b', span: 'far - near' },
      description: 'Invented multi-expression record.', status: 'unverified',
    },
  ]);
  const limitsRef = refTo('limits', limitsCatalogue);

  it('answers on every output, each from its own expression', () => {
    const evaluation = evaluateDocument(documentOf([formulaNode('l', limitsRef)], []), [limitsCatalogue]);
    expect(numeric(valueAt(evaluation, 'l', 'near')).data).toEqual([8]);
    expect(numeric(valueAt(evaluation, 'l', 'far')).data).toEqual([12]);
    // `span` names the two outputs declared before it rather than restating
    // their algebra — the whole point of the ordering rule.
    expect(numeric(valueAt(evaluation, 'l', 'span')).data).toEqual([4]);
  });

  it('carries the ordering rule through a sweep, cell by cell', () => {
    const document = documentOf(
      [input('b', linear(1, 3, 3, 'mm')), formulaNode('l', limitsRef)],
      [wire('b.value', 'l.b')],
    );
    const evaluation = evaluateDocument(document, [limitsCatalogue]);
    expect(numeric(valueAt(evaluation, 'l', 'span')).data).toEqual([2, 4, 6]);
  });

  it('refuses a record whose later expression names an output declared after it', () => {
    const backwards = catalogueOf([
      {
        id: 'backwards', version: 1,
        output: [
          { kind: 'numeric', name: 'first', unit: 'mm' },
          { kind: 'numeric', name: 'second', unit: 'mm' },
        ],
        inputs: [{ kind: 'numeric', name: 'a', unit: 'mm', default: 1 }],
        expression: { first: 'second + a', second: 'a * 2' },
        description: 'Invented backwards record.', status: 'unverified',
      },
    ]);
    const document = documentOf([formulaNode('b', refTo('backwards', backwards))], []);
    expect(() => evaluateDocument(document, [backwards])).toThrow(/second/u);
  });

  it('checks each output’s dimension against its own expression', () => {
    const catalogue = catalogueOf([
      {
        id: 'mismatched', version: 1,
        output: [
          { kind: 'numeric', name: 'length', unit: 'mm' },
          // Declared a length, but computed as one squared — the check has to
          // read `length` out of the scope the earlier output put it in.
          { kind: 'numeric', name: 'area', unit: 'mm' },
        ],
        inputs: [{ kind: 'numeric', name: 'a', unit: 'mm', default: 1 }],
        expression: { length: 'a', area: 'length * a' },
        description: 'Invented mismatched record.', status: 'unverified',
      },
    ]);
    const document = documentOf([formulaNode('m', refTo('mismatched', catalogue))], []);
    expect(() => evaluateDocument(document, [catalogue])).toThrow(/declares 'area' as/u);
  });

  it('warns only about the output whose own condition does not hold', () => {
    const guarded = catalogueOf([
      {
        id: 'guarded', version: 1,
        output: [
          { kind: 'numeric', name: 'always', unit: 'mm' },
          { kind: 'numeric', name: 'sometimes', unit: 'mm' },
        ],
        inputs: [{ kind: 'numeric', name: 'a', unit: 'mm', default: 100 }],
        expression: { always: 'a', sometimes: 'a * 2' },
        appliesWhen: { sometimes: 'a < 50' },
        description: 'Invented guarded record.', status: 'unverified',
      },
    ]);
    const document = documentOf([formulaNode('g', refTo('guarded', guarded))], []);
    const evaluation = evaluateDocument(document, [guarded]);
    // Both still compute — a condition warns, it does not block.
    expect(numeric(valueAt(evaluation, 'g', 'always')).data).toEqual([100]);
    expect(numeric(valueAt(evaluation, 'g', 'sometimes')).data).toEqual([200]);
    const applies = evaluation.warnings.filter((warning) => warning.kind === 'appliesWhen');
    expect(applies).toHaveLength(1);
    expect(applies[0]?.message).toMatch(/computes 'sometimes' only when a < 50/u);
  });
});

describe('piecewise-backed formulas', () => {
  const stepCatalogue = catalogueOf([
    {
      id: 'runningTotal', version: 1,
      output: { kind: 'numeric', name: 'y', unit: 'N' },
      inputs: [
        { kind: 'numeric', name: 'z', unit: 'mm', default: 0 },
        { kind: 'numeric', name: 'position', unit: 'mm', variadic: true },
        { kind: 'numeric', name: 'value', unit: 'N', variadic: true },
        { kind: 'numeric', name: 'extraPosition', unit: 'mm', default: 1_000_000 },
        { kind: 'numeric', name: 'extraValue', unit: 'N', default: 0 },
      ],
      expression: 'sum(value)',
      piecewise: {
        kind: 'cumulativeStep', axis: 'z',
        breakpoints: ['position', 'extraPosition'], values: ['value', 'extraValue'],
      },
      description: 'Invented running-total-vs-position formula.', status: 'unverified',
    },
  ]);
  const stepRef = refTo('runningTotal', stepCatalogue);

  it('totals only the breakpoints at or before z', () => {
    const position = variadicWires('position', 'step.position', [10, 30, 50], 'mm');
    const value = variadicWires('value', 'step.value', [100, 200, 300], 'N');
    const document = documentOf(
      [
        ...position.nodes,
        ...value.nodes,
        formulaNode('step', stepRef, { inputValues: { z: { kind: 'scalar', value: 40, unit: 'mm' } } }),
      ],
      [...position.wires, ...value.wires],
    );
    // 10 mm and 30 mm are at or before z = 40 mm; 50 mm is not.
    expect(numeric(valueAt(evaluateDocument(document, [stepCatalogue]), 'step', 'y')).data).toEqual([300]);
  });

  it('is closed-form at every sampled z, not a cumulative sum over the sweep', () => {
    const position = variadicWires('position', 'step.position', [10, 30, 50], 'mm');
    const value = variadicWires('value', 'step.value', [100, 200, 300], 'N');
    const document = documentOf(
      [
        ...position.nodes,
        ...value.nodes,
        input('z', linear(0, 60, 4, 'mm')), // 0, 20, 40, 60 mm
        formulaNode('step', stepRef),
      ],
      [...position.wires, ...value.wires, wire('z.value', 'step.z')],
    );
    expect(numeric(valueAt(evaluateDocument(document, [stepCatalogue]), 'step', 'y')).data).toEqual([
      0, 100, 300, 600,
    ]);
  });

  it('reports mismatched breakpoint/value counts rather than silently truncating', () => {
    const position = variadicWires('position', 'step.position', [10, 30], 'mm');
    const value = variadicWires('value', 'step.value', [100, 200, 300], 'N');
    const document = documentOf(
      [...position.nodes, ...value.nodes, formulaNode('step', stepRef)],
      [...position.wires, ...value.wires],
    );
    // Plus the fixture's own extraPosition/extraValue: 2+1 = 3 breakpoints, 3+1 = 4 values.
    expect(() => evaluateDocument(document, [stepCatalogue])).toThrow(/has 3 values but 'value\+extraValue' has 4/u);
  });

  it('joins a plain numeric port to a variadic one in the same list, by declared order rather than wire order', () => {
    const position = variadicWires('position', 'step.position', [10, 30], 'mm');
    const value = variadicWires('value', 'step.value', [100, 200], 'N');
    const document = documentOf(
      [
        ...position.nodes,
        ...value.nodes,
        formulaNode('step', stepRef, {
          inputValues: {
            z: { kind: 'scalar', value: 50, unit: 'mm' },
            extraPosition: { kind: 'scalar', value: 20, unit: 'mm' },
            extraValue: { kind: 'scalar', value: 1000, unit: 'N' },
          },
        }),
      ],
      [...position.wires, ...value.wires],
    );
    // 10, 30 and 20 mm are all at or before z = 50 mm: 100 + 200 + 1000.
    expect(numeric(valueAt(evaluateDocument(document, [stepCatalogue]), 'step', 'y')).data).toEqual([1300]);
  });

  const momentCatalogue = catalogueOf([
    {
      id: 'runningMoment', version: 1,
      output: { kind: 'numeric', name: 'y', unit: 'Nmm' },
      inputs: [
        { kind: 'numeric', name: 'z', unit: 'mm', default: 0 },
        { kind: 'numeric', name: 'position', unit: 'mm', variadic: true },
        { kind: 'numeric', name: 'value', unit: 'N', variadic: true },
      ],
      expression: 'sum(value) * z',
      piecewise: { kind: 'cumulativeMoment', axis: 'z', breakpoints: ['position'], values: ['value'] },
      description: 'Invented running-moment-vs-position formula.', status: 'unverified',
    },
  ]);
  const momentRef = refTo('runningMoment', momentCatalogue);

  it('weighs each breakpoint at or before z by its distance from z', () => {
    const position = variadicWires('position', 'moment.position', [10, 30, 50], 'mm');
    const value = variadicWires('value', 'moment.value', [100, 200, 300], 'N');
    const document = documentOf(
      [
        ...position.nodes,
        ...value.nodes,
        input('z', { kind: 'list', values: [0, 40, 60], unit: 'mm' }),
        formulaNode('moment', momentRef),
      ],
      [...position.wires, ...value.wires, wire('z.value', 'moment.z')],
    );
    // z = 0: no breakpoint at or before 0 → 0.
    // z = 40: 100·(40−10) + 200·(40−30) = 3000 + 2000 = 5000.
    // z = 60: 100·50 + 200·30 + 300·10 = 5000 + 6000 + 3000 = 14000.
    expect(numeric(valueAt(evaluateDocument(document, [momentCatalogue]), 'moment', 'y')).data).toEqual([
      0, 5000, 14000,
    ]);
  });

  const cubicCatalogue = catalogueOf([
    {
      id: 'runningCubic', version: 1,
      output: { kind: 'numeric', name: 'y', unit: 'N*mm3' },
      inputs: [
        { kind: 'numeric', name: 'z', unit: 'mm', default: 0 },
        { kind: 'numeric', name: 'position', unit: 'mm', variadic: true },
        { kind: 'numeric', name: 'value', unit: 'N', variadic: true },
      ],
      expression: 'sum(value) * z * z * z',
      piecewise: { kind: 'cumulativeCubic', axis: 'z', breakpoints: ['position'], values: ['value'] },
      description: 'Invented running-cubic-vs-position formula.', status: 'unverified',
    },
  ]);
  const cubicRef = refTo('runningCubic', cubicCatalogue);

  it('weighs each breakpoint at or before z by the cube of its distance from z', () => {
    const position = variadicWires('position', 'cubic.position', [0, 10], 'mm');
    const value = variadicWires('value', 'cubic.value', [1, 2], 'N');
    const document = documentOf(
      [
        ...position.nodes,
        ...value.nodes,
        input('z', { kind: 'list', values: [5, 15], unit: 'mm' }),
        formulaNode('cubic', cubicRef),
      ],
      [...position.wires, ...value.wires, wire('z.value', 'cubic.z')],
    );
    // z=5: only the z=0 breakpoint qualifies: 1·5³ = 125.
    // z=15: both qualify: 1·15³ + 2·5³ = 3375 + 250 = 3625.
    expect(numeric(valueAt(evaluateDocument(document, [cubicCatalogue]), 'cubic', 'y')).data).toEqual([
      125, 3625,
    ]);
  });

  describe('distributed loads', () => {
    const distributedInputs = [
      { kind: 'numeric', name: 'z', unit: 'mm', default: 0 },
      { kind: 'numeric', name: 'start', unit: 'mm', variadic: true },
      { kind: 'numeric', name: 'end', unit: 'mm', variadic: true },
      { kind: 'numeric', name: 'rate', unit: 'N/mm', variadic: true },
    ];
    const distributedStepCatalogue = catalogueOf([
      {
        id: 'distributedStep', version: 1,
        output: { kind: 'numeric', name: 'y', unit: 'N' },
        inputs: distributedInputs,
        expression: 'sum(rate) * z',
        piecewise: {
          kind: 'cumulativeStep', axis: 'z',
          distributedStart: ['start'], distributedEnd: ['end'], distributedRate: ['rate'],
        },
        description: 'Invented distributed-load shear formula.', status: 'unverified',
      },
    ]);
    const distributedStepRef = refTo('distributedStep', distributedStepCatalogue);

    const distributedMomentCatalogue = catalogueOf([
      {
        id: 'distributedMoment', version: 1,
        output: { kind: 'numeric', name: 'y', unit: 'Nmm' },
        inputs: distributedInputs,
        expression: 'sum(rate) * z * z',
        piecewise: {
          kind: 'cumulativeMoment', axis: 'z',
          distributedStart: ['start'], distributedEnd: ['end'], distributedRate: ['rate'],
        },
        description: 'Invented distributed-load moment formula.', status: 'unverified',
      },
    ]);
    const distributedMomentRef = refTo('distributedMoment', distributedMomentCatalogue);

    // A single uniform load, 10 N/mm from z = 20 to z = 60 (400 N total,
    // centroid at z = 40).
    const loadStart = variadicWires('start', 'v.start', [20], 'mm');
    const loadEnd = variadicWires('end', 'v.end', [60], 'mm');
    const loadRate = variadicWires('rate', 'v.rate', [10], 'N/mm');
    const loadInputs = [
      ...loadStart.nodes,
      ...loadEnd.nodes,
      ...loadRate.nodes,
      input('z', { kind: 'list', values: [0, 10, 20, 30, 60, 100], unit: 'mm' }),
    ];
    const loadWires = [...loadStart.wires, ...loadEnd.wires, ...loadRate.wires, wire('z.value', 'v.z')];

    it('integrates a rectangular load into a shear-shaped ramp — flat, then linear, then flat again', () => {
      const document = documentOf(
        [...loadInputs, formulaNode('v', distributedStepRef)],
        loadWires,
      );
      // Before the span: 0. Inside: rate·(z − start). Past it: the full 400 N.
      expect(numeric(valueAt(evaluateDocument(document, [distributedStepCatalogue]), 'v', 'y')).data).toEqual([
        0, 0, 0, 100, 400, 400,
      ]);
    });

    it("integrates the same load twice for the moment — quadratic inside the span, linear from the load's centroid past it", () => {
      const document = documentOf([...loadInputs, formulaNode('v', distributedMomentRef)], loadWires);
      // z=30: 10·10·(30−20−5) = 500. z=60: 10·40·(60−20−20) = 8000.
      // z=100: 400·(100 − 40) = 24000 — total force times distance to the centroid.
      expect(numeric(valueAt(evaluateDocument(document, [distributedMomentCatalogue]), 'v', 'y')).data).toEqual([
        0, 0, 0, 500, 8000, 24000,
      ]);
    });

    it('adds a distributed load on top of point breakpoints in the same formula', () => {
      const combinedCatalogue = catalogueOf([
        {
          id: 'combined', version: 1,
          output: { kind: 'numeric', name: 'y', unit: 'N' },
          inputs: [
            { kind: 'numeric', name: 'z', unit: 'mm', default: 0 },
            { kind: 'numeric', name: 'position', unit: 'mm', variadic: true },
            { kind: 'numeric', name: 'value', unit: 'N', variadic: true },
            { kind: 'numeric', name: 'start', unit: 'mm', variadic: true },
            { kind: 'numeric', name: 'end', unit: 'mm', variadic: true },
            { kind: 'numeric', name: 'rate', unit: 'N/mm', variadic: true },
          ],
          expression: 'sum(value) + sum(rate) * z',
          piecewise: {
            kind: 'cumulativeStep', axis: 'z',
            breakpoints: ['position'], values: ['value'],
            distributedStart: ['start'], distributedEnd: ['end'], distributedRate: ['rate'],
          },
          description: 'Invented point-plus-distributed shear formula.', status: 'unverified',
        },
      ]);
      const position = variadicWires('position', 'v.position', [50], 'mm');
      const value = variadicWires('value', 'v.value', [1000], 'N');
      const document = documentOf(
        [
          ...position.nodes,
          ...value.nodes,
          ...loadInputs.filter((n) => n['id'] !== 'z'),
          input('z', { kind: 'list', values: [10, 55], unit: 'mm' }),
          formulaNode('v', refTo('combined', combinedCatalogue)),
        ],
        [
          ...position.wires, ...value.wires,
          ...loadStart.wires, ...loadEnd.wires, ...loadRate.wires,
          wire('z.value', 'v.z'),
        ],
      );
      // z=10: only the distributed load's ramp has started? No — z=10 is
      // before the 20–60 span too, so both contribute 0.
      // z=55: distributed 10·(55−20) = 350, plus the 1000 N point load at 50.
      expect(numeric(valueAt(evaluateDocument(document, [combinedCatalogue]), 'v', 'y')).data).toEqual([
        0, 1350,
      ]);
    });

    it("rejects a distributed load whose end is before its start", () => {
      const start = variadicWires('start', 'v.start', [60], 'mm');
      const end = variadicWires('end', 'v.end', [20], 'mm');
      const rate = variadicWires('rate', 'v.rate', [10], 'N/mm');
      const document = documentOf(
        [...start.nodes, ...end.nodes, ...rate.nodes, formulaNode('v', distributedStepRef)],
        [...start.wires, ...end.wires, ...rate.wires],
      );
      expect(() => evaluateDocument(document, [distributedStepCatalogue])).toThrow(/end .* is before its start/u);
    });
  });
});

describe('deflection-backed formulas', () => {
  const deflectionCatalogue = catalogueOf([
    {
      id: 'beamDeflection', version: 1,
      output: { kind: 'numeric', name: 'y', unit: 'mm' },
      inputs: [
        { kind: 'numeric', name: 'z', unit: 'mm', default: 0 },
        { kind: 'numeric', name: 'position', unit: 'mm', variadic: true },
        { kind: 'numeric', name: 'value', unit: 'N', variadic: true },
        { kind: 'numeric', name: 'supportA', unit: 'mm' },
        { kind: 'numeric', name: 'supportB', unit: 'mm' },
        { kind: 'numeric', name: 'modulus', unit: 'N/mm²' },
        { kind: 'numeric', name: 'inertia', unit: 'mm⁴' },
      ],
      expression: 'z',
      deflection: {
        axis: 'z', breakpoints: ['position'], values: ['value'],
        zeroAt: ['supportA', 'supportB'], modulus: 'modulus', secondMomentOfArea: 'inertia',
      },
      description: 'Invented beam-deflection formula.', status: 'unverified',
    },
  ]);
  const deflectionRef = refTo('beamDeflection', deflectionCatalogue);

  it('is zero at both zeroAt positions by construction, and closed-form in between', () => {
    const position = variadicWires('position', 'y.position', [0], 'mm');
    const value = variadicWires('value', 'y.value', [6], 'N');
    const document = documentOf(
      [
        ...position.nodes,
        ...value.nodes,
        input('supportA', scalar(0, 'mm')),
        input('supportB', scalar(10, 'mm')),
        input('modulus', scalar(1, 'N/mm²')),
        input('inertia', scalar(1, 'mm⁴')),
        input('z', { kind: 'list', values: [0, 5, 10], unit: 'mm' }),
        formulaNode('y', deflectionRef),
      ],
      [
        ...position.wires, ...value.wires,
        wire('supportA.value', 'y.supportA'), wire('supportB.value', 'y.supportB'),
        wire('modulus.value', 'y.modulus'), wire('inertia.value', 'y.inertia'),
        wire('z.value', 'y.z'),
      ],
    );
    // By hand, EI = 1: S(w) = 6·w³ for w ≥ 0. Sa = S(0)/6 = 0, Sb = S(10)/6
    // = 1000 ⇒ C1 = (0−1000)/10 = −100, C2 = 0. y(z) = S(z)/6 − 100·z.
    // z=0: 0. z=5: S(5)/6=125, y=125−500=−375. z=10: 1000−1000=0.
    expect(numeric(valueAt(evaluateDocument(document, [deflectionCatalogue]), 'y', 'y')).data).toEqual([
      0, -375, 0,
    ]);
  });

  it('rejects zeroAt positions that coincide', () => {
    const position = variadicWires('position', 'y.position', [0], 'mm');
    const value = variadicWires('value', 'y.value', [6], 'N');
    const document = documentOf(
      [
        ...position.nodes,
        ...value.nodes,
        input('supportA', scalar(5, 'mm')),
        input('supportB', scalar(5, 'mm')),
        input('modulus', scalar(1, 'N/mm²')),
        input('inertia', scalar(1, 'mm⁴')),
        formulaNode('y', deflectionRef),
      ],
      [
        ...position.wires, ...value.wires,
        wire('supportA.value', 'y.supportA'), wire('supportB.value', 'y.supportB'),
        wire('modulus.value', 'y.modulus'), wire('inertia.value', 'y.inertia'),
      ],
    );
    expect(() => evaluateDocument(document, [deflectionCatalogue])).toThrow(/two different support positions are needed/u);
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

describe('file nodes', () => {
  const field = (name: string, unit: string | undefined, values: readonly (number | string | null)[]) =>
    ({ name, ...(unit === undefined ? {} : { unit }), values }) as JsonObject;

  it('answers with each field, in canonical units, from one file', () => {
    const document = documentOf(
      [
        fileNode('photo', [fileSource('one.cr3')], [
          field('f', 'mm', [50]),
          field('N', '', [2.8]),
          field('t', 's', [0.004]),
          field('camera', undefined, ['Canon EOS R6m3']),
        ]),
      ],
      [],
    );
    const evaluation = evaluateDocument(document, catalogues);
    expect(numeric(valueAt(evaluation, 'photo', 'f')).data).toEqual([50]);
    expect(numeric(valueAt(evaluation, 'photo', 'N')).data).toEqual([2.8]);
    expect(numeric(valueAt(evaluation, 'photo', 't')).data).toEqual([0.004]);
    const camera = valueAt(evaluation, 'photo', 'camera');
    expect(camera?.kind).toBe('categorical');
    if (camera?.kind === 'categorical') expect(camera.data).toEqual(['Canon EOS R6m3']);
  });

  it('converts a field out of the unit the reader recorded it in', () => {
    const document = documentOf(
      [fileNode('photo', [fileSource('one.cr3')], [field('s', 'm', [2.5])])],
      [],
    );
    // Canonical length is mm, so metres arrive scaled.
    expect(numeric(valueAt(evaluateDocument(document, catalogues), 'photo', 's')).data).toEqual([2500]);
  });

  it('leaves a field the file did not record with no value at all', () => {
    const document = documentOf(
      [fileNode('photo', [fileSource('one.cr3')], [field('f', 'mm', [50]), field('s', 'm', [null])])],
      [],
    );
    const evaluation = evaluateDocument(document, catalogues);
    expect(valueAt(evaluation, 'photo', 'f')).toBeDefined();
    expect(valueAt(evaluation, 'photo', 's')).toBeUndefined();
  });

  it('reports the node that wanted a field its file never recorded', () => {
    const document = documentOf(
      [
        fileNode('photo', [fileSource('one.cr3')], [field('w', 'mm', [null]), field('h', 'mm', [10])]),
        formulaNode('area', refTo('area')),
      ],
      [wire('photo.w', 'area.w'), wire('photo.h', 'area.h')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/nothing was computed for 'photo\.w'/u);
  });

  it('sweeps over several files, one point per file', () => {
    const document = documentOf(
      [
        fileNode(
          'photos',
          [fileSource('one.cr3'), fileSource('two.cr3'), fileSource('three.cr3')],
          [field('w', 'mm', [10, 20, 30]), field('h', 'mm', [2, 2, 2])],
          { label: 'the bracket' },
        ),
        formulaNode('area', refTo('area')),
      ],
      [wire('photos.w', 'area.w'), wire('photos.h', 'area.h')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const area = numeric(valueAt(evaluation, 'area', 'A'));
    expect(area.data).toEqual([20, 40, 60]);
    expect(area.axes.map((axis) => axis.label)).toEqual(['the bracket']);
  });

  it('introduces no axis while it holds a single file', () => {
    const document = documentOf(
      [fileNode('photo', [fileSource('one.cr3')], [field('f', 'mm', [50])])],
      [],
    );
    expect(numeric(valueAt(evaluateDocument(document, catalogues), 'photo', 'f')).axes).toEqual([]);
  });

  it('wires a photograph’s own camera name into the library that lists it', () => {
    const libraryCatalogue = catalogueOf([
      {
        id: 'bodies', version: 1,
        output: { kind: 'numeric', name: 'w', unit: 'mm' },
        inputs: [
          {
            kind: 'categorical',
            name: 'camera',
            domain: ['First Body Mark III'],
            aliases: { 'FirstBodym3': 'First Body Mark III' },
            default: 'First Body Mark III',
          },
        ],
        lookup: {
          axes: [{ input: 'camera', kind: 'categorical', values: ['First Body Mark III'] }],
          values: [35.9],
        },
        description: 'Invented body table.', status: 'unverified',
      },
    ]);
    const document = documentOf(
      [
        fileNode('photo', [fileSource('one.cr3')], [field('camera', undefined, ['FirstBodym3'])]),
        formulaNode('spec', refTo('bodies', libraryCatalogue)),
      ],
      [wire('photo.camera', 'spec.camera')],
    );
    expect(numeric(valueAt(evaluateDocument(document, [libraryCatalogue]), 'spec', 'w')).data).toEqual([35.9]);
  });
});

describe('skipping already-known nodes (options.skip/seed)', () => {
  const document = documentOf(
    [input('w', scalar(20, 'mm')), input('h', scalar(5, 'mm')), formulaNode('area', refTo('area'))],
    [wire('w.value', 'area.w'), wire('h.value', 'area.h')],
  );

  it('changes nothing for a caller that passes neither option', () => {
    const evaluation = evaluateDocument(document, catalogues);
    expect(numeric(valueAt(evaluation, 'area', 'A')).data).toEqual([100]);
  });

  it('reads a skipped node’s value from seed instead of recomputing it', () => {
    // A `w` far off from what the real node says — proof this came from
    // `seed`, not from re-evaluating the actual input.
    const seed = new Map(evaluateDocument(document, catalogues).values);
    seed.set('w.value', { kind: 'numeric', axes: [], data: [1000] });
    const evaluation = evaluateDocument(document, catalogues, { skip: new Set(['w']), seed });
    expect(numeric(valueAt(evaluation, 'area', 'A')).data).toEqual([5000]);
  });

  it('fails the same way an unwired required input would when a skipped node has no seed', () => {
    expect(() => evaluateDocument(document, catalogues, { skip: new Set(['w']) })).toThrow(
      /nothing was computed for 'w\.value'/u,
    );
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

describe('range nodes — bounds and count from wired ports', () => {
  it('behaves exactly like a literal linear range when nothing is wired', () => {
    const document = documentOf([rangeNode('r', 'linear', 20, 60, 21, 'mm')], []);
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'r', 'value'));
    expect(series.data).toHaveLength(21);
    expect(series.data[0]).toBe(20);
    expect(series.data[20]).toBe(60);
  });

  it('adopts a wired dimension for a freshly dropped range left at its dimensionless default', () => {
    // A fresh range's `unit` defaults to dimensionless — it should not
    // refuse an mm wire for disagreeing with a unit nobody chose.
    const document = documentOf(
      [input('lo', scalar(20, 'mm')), rangeNode('r', 'linear', 0, 1, 5, '')],
      [wire('lo.value', 'r.start')],
    );
    const resolution = resolveGraph(document, catalogues);
    expect(resolution.targets.get('r.start')?.unit?.symbol).toBe('mm');
  });

  it('reads an unwired bound in the dimension the other, wired bound established', () => {
    const document = documentOf(
      [input('lo', scalar(20, 'mm')), rangeNode('r', 'linear', 0, 60, 3, '')],
      [wire('lo.value', 'r.start')],
    );
    // `stop` is left at its literal `60`, unwired and read in mm — the
    // dimension `start`'s wire established, not the node's own
    // dimensionless default.
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'r', 'value'));
    expect(series.data).toEqual([20, 40, 60]);
  });

  it('refuses start and stop wired to two different dimensions', () => {
    const document = documentOf(
      [input('lo', scalar(20, 'mm')), input('hi', scalar(60, 'N')), rangeNode('r', 'linear', 0, 1, 5, '')],
      [wire('lo.value', 'r.start'), wire('hi.value', 'r.stop')],
    );
    expect(() => resolveGraph(document, catalogues)).toThrow(/same dimension at both ends/);
  });

  it('reads start and stop off wired ports, unlike an input range', () => {
    const document = documentOf(
      [
        input('lo', scalar(20, 'mm')),
        input('hi', scalar(60, 'mm')),
        rangeNode('r', 'linear', 0, 1, 5, 'mm'),
      ],
      [wire('lo.value', 'r.start'), wire('hi.value', 'r.stop')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'r', 'value'));
    expect(series.data).toEqual([20, 30, 40, 50, 60]);
  });

  it('spaces logarithmically the same way a literal logarithmic range does', () => {
    const document = documentOf(
      [input('lo', scalar(1, '')), input('hi', scalar(1000, '')), rangeNode('r', 'logarithmic', 1, 1, 4, '')],
      [wire('lo.value', 'r.start'), wire('hi.value', 'r.stop')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'r', 'value'));
    expect(series.data.map((value) => Math.round(value))).toEqual([1, 10, 100, 1000]);
  });

  it('sizes the axis from a wired count, and drives a downstream formula across it with no rewiring', () => {
    const document = documentOf(
      [
        input('n', scalar(5, '')),
        rangeNode('w', 'linear', 10, 50, 2, 'mm'),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('n.value', 'w.count'), wire('w.value', 'area.w'), wire('h.value', 'area.h')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'area', 'A'));
    expect(series.data).toEqual([20, 40, 60, 80, 100]);
  });

  it('refuses a count wired from something that itself varies across a sweep', () => {
    const document = documentOf(
      [input('n', linear(2, 6, 3, '')), rangeNode('r', 'linear', 0, 1, 5, '')],
      [wire('n.value', 'r.count')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/cannot depend on something that itself varies/);
  });

  it('refuses a wired count that is not a whole number of at least 2', () => {
    const document = documentOf(
      [input('n', scalar(1.5, '')), rangeNode('r', 'linear', 0, 1, 5, '')],
      [wire('n.value', 'r.count')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/at least 2 points/);
  });

  it('does not disturb an ordinary sweep elsewhere in the same document', () => {
    // The pre-resolution pass this adds only ever runs for the nodes
    // upstream of a wired `count` — an unrelated range in the same graph
    // should sweep exactly as it would with no range node present at all.
    const document = documentOf(
      [
        input('n', scalar(3, '')),
        rangeNode('r', 'linear', 0, 1, 5, ''),
        input('w', linear(10, 30, 3, 'mm')),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('n.value', 'r.count'), wire('w.value', 'area.w'), wire('h.value', 'area.h')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'area', 'A'));
    expect(series.data).toEqual([20, 40, 60]);
  });
});

describe('the Monte Carlo generator and receiver (roadmap #27)', () => {
  it('behaves like any other range: an axis, one value per draw, a formula wired downstream', () => {
    const document = documentOf(
      [
        monteCarloGeneratorNode('draw', uniformDraw(10, 20), 25, 'mm'),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
      ],
      [wire('draw.value', 'area.w'), wire('h.value', 'area.h')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'area', 'A'));
    expect(series.axes.map((axis) => axis.id)).toEqual(['draw']);
    expect(series.data).toHaveLength(25);
    expect(series.data.every((value) => value >= 20 && value <= 40)).toBe(true);
  });

  it('converts a normal generator’s parameters into canonical units at the boundary', () => {
    const document = documentOf([monteCarloGeneratorNode('draw', normalDraw(1, 0.1), 500, 'cm')], []);
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'draw', 'value'));
    // 1 cm mean, 0.1 cm stddev — comfortably inside ±5 canonical-mm sigma.
    expect(series.data.every((value) => value > -40 && value < 60)).toBe(true);
  });

  it('names its axis from `axisLabel`, like an input range does', () => {
    const document = documentOf(
      [monteCarloGeneratorNode('draw', uniformDraw(0, 1), 10, '', { axisLabel: 'trial' })],
      [],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'draw', 'value'));
    expect(series.axes[0]?.label).toBe('trial');
  });

  it('reproduces the same prefix as `count` grows — the property playback depends on', () => {
    const documentAt = (count: number) => documentOf([monteCarloGeneratorNode('draw', uniformDraw(0, 1), count, '')], []);
    const short = numeric(valueAt(evaluateDocument(documentAt(10), catalogues), 'draw', 'value'));
    const long = numeric(valueAt(evaluateDocument(documentAt(25), catalogues), 'draw', 'value'));
    expect(long.data.slice(0, 10)).toEqual(short.data);
  });

  it('gives two generators in the same document independent draws', () => {
    const document = documentOf(
      [
        monteCarloGeneratorNode('a', uniformDraw(0, 1), 25, ''),
        monteCarloGeneratorNode('b', uniformDraw(0, 1), 25, ''),
      ],
      [],
    );
    const evaluation = evaluateDocument(document, catalogues);
    expect(numeric(valueAt(evaluation, 'a', 'value')).data).not.toEqual(
      numeric(valueAt(evaluation, 'b', 'value')).data,
    );
  });

  it('combines two generators sample-for-sample, not into their cross-product grid (ROADMAP.md #31)', () => {
    const document = documentOf(
      [
        monteCarloGeneratorNode('a', uniformDraw(0, 1), 25, ''),
        monteCarloGeneratorNode('b', uniformDraw(0, 1), 25, ''),
        formulaNode('sum', refTo('addTwo')),
      ],
      [wire('a.value', 'sum.a'), wire('b.value', 'sum.b')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const a = numeric(valueAt(evaluation, 'a', 'value'));
    const b = numeric(valueAt(evaluation, 'b', 'value'));
    const sum = numeric(valueAt(evaluation, 'sum', 'sum'));
    // 625 cells would mean it gridded instead of pairing.
    expect(sum.data).toHaveLength(25);
    expect(sum.data).toEqual(a.data.map((value, i) => value + (b.data[i] as number)));
  });

  it('refuses to combine two generators whose sample counts disagree', () => {
    const document = documentOf(
      [
        monteCarloGeneratorNode('a', uniformDraw(0, 1), 25, ''),
        monteCarloGeneratorNode('b', uniformDraw(0, 1), 30, ''),
        formulaNode('sum', refTo('addTwo')),
      ],
      [wire('a.value', 'sum.a'), wire('b.value', 'sum.b')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/appears with lengths 25 and 30/u);
  });

  it('takes a wired mean over its own typed default, the same `CompareNode.threshold` shape', () => {
    const document = documentOf(
      [
        input('center', scalar(100, 'mm')),
        monteCarloGeneratorNode('draw', normalDraw(1, 0.1), 500, 'mm'),
      ],
      [wire('center.value', 'draw.mean')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'draw', 'value'));
    // Wired mean of 100 mm, stddev still the node's own typed 0.1 mm default.
    expect(series.data.every((value) => value > 99.5 && value < 100.5)).toBe(true);
  });

  it('takes wired min/max for a uniform generator the same way', () => {
    const document = documentOf(
      [
        input('lo', scalar(5, 'mm')),
        input('hi', scalar(6, 'mm')),
        monteCarloGeneratorNode('draw', uniformDraw(0, 1), 500, 'mm'),
      ],
      [wire('lo.value', 'draw.min'), wire('hi.value', 'draw.max')],
    );
    const series = numeric(valueAt(evaluateDocument(document, catalogues), 'draw', 'value'));
    expect(series.data.every((value) => value >= 5 && value <= 6)).toBe(true);
  });

  it('refuses a wired mean that is not a single value', () => {
    const document = documentOf(
      [
        input('sweep', linear(0, 10, 5, 'mm')),
        monteCarloGeneratorNode('draw', normalDraw(1, 0.1), 25, 'mm'),
      ],
      [wire('sweep.value', 'draw.mean')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/single value/u);
  });

  it('lets a receiver read through to whatever is wired to its sample port', () => {
    const document = documentOf(
      [monteCarloGeneratorNode('draw', uniformDraw(0, 1), 25, ''), monteCarloReceiverNode('watch', 10_000)],
      [wire('draw.value', 'watch.sample')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const receiver = document.nodes.find(
      (node): node is Extract<typeof node, { kind: 'monteCarloReceiver' }> => node.id === 'watch',
    );
    if (receiver === undefined) throw new Error('fixture missing its receiver node');
    const sample = numeric(receiverSampleValue(receiver, evaluation.resolution, evaluation.values));
    expect(sample.data).toEqual(numeric(valueAt(evaluation, 'draw', 'value')).data);
  });

  it('gives an unwired receiver’s sample port no value at all', () => {
    const document = documentOf([monteCarloReceiverNode('watch', 10_000)], []);
    const evaluation = evaluateDocument(document, catalogues);
    const receiver = document.nodes.find(
      (node): node is Extract<typeof node, { kind: 'monteCarloReceiver' }> => node.id === 'watch',
    );
    if (receiver === undefined) throw new Error('fixture missing its receiver node');
    expect(receiverSampleValue(receiver, evaluation.resolution, evaluation.values)).toBeUndefined();
  });
});

describe('variadic ports', () => {
  it('totals every wire, not just the first — the ghost-slot n-wire mechanism end to end', () => {
    const document = documentOf(
      [
        input('load1', scalar(100, 'N')),
        input('load2', scalar(200, 'N')),
        input('load3', scalar(300, 'N')),
        formulaNode('total', refTo('total')),
      ],
      [
        wire('load1.value', 'total.xs'),
        wire('load2.value', 'total.xs'),
        wire('load3.value', 'total.xs'),
      ],
    );
    expect(numeric(valueAt(evaluateDocument(document, catalogues), 'total', 'total')).data).toEqual([
      600,
    ]);
  });

  it('refuses a second wire into an ordinary, non-variadic numeric port', () => {
    const document = documentOf(
      [
        input('a1', scalar(1, 'N')),
        input('a2', scalar(2, 'N')),
        formulaNode('sum', refTo('addTwo')),
      ],
      [wire('a1.value', 'sum.a'), wire('a2.value', 'sum.a')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/two edges arrive/u);
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

  it('keeps the contour choice but says it has no second axis to contour over', () => {
    // What is left when the range that fed `b` is unwired and a value typed
    // on the port instead: one swept axis, and a plot still set to contour.
    const swept = documentOf(
      [
        input('a', list([1, 2], ''), { axisLabel: 'a' }),
        formulaNode('y', refTo('addTwo'), {
          inputValues: { b: { kind: 'scalar', value: 3, unit: '' } },
        }),
        outputNode('plot', { kind: 'plot', contour: true }),
      ],
      [wire('a.value', 'y.a'), wire('y.sum', 'plot.value')],
    );
    const evaluation = evaluateDocument(swept, catalogues);
    expect(evaluation.warnings.map((w) => w.kind)).toContain('plotContourFlat');
    const plot = evaluation.outputs[0] as PlotResult;
    // The choice survives — restoring the range restores the contour — while
    // `series2` says there is nothing to draw one over yet.
    expect(plot.contour).toBe(true);
    expect(plot.series2).toBeUndefined();
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

describe('feasibility outputs', () => {
  /** `A = d * h` swept along `d` — five points, so each check's mask is easy to read by eye. */
  const sweptArea = (feasibilityFirst: boolean) =>
    documentOf(
      [
        ...(feasibilityFirst
          ? [outputNode('feas', { kind: 'feasibility', checks: ['check1', 'check2'] })]
          : []),
        input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'diameter' }),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
        outputNode('check1', { kind: 'check', comparison: '>=', threshold: { value: 30, unit: 'mm²' } }),
        outputNode('check2', { kind: 'check', comparison: '<=', threshold: { value: 80, unit: 'mm²' } }),
        ...(feasibilityFirst
          ? []
          : [outputNode('feas', { kind: 'feasibility', checks: ['check1', 'check2'] })]),
      ],
      [
        wire('d.value', 'area.w'),
        wire('h.value', 'area.h'),
        wire('area.A', 'check1.value'),
        wire('area.A', 'check2.value'),
      ],
    );

  it('ANDs two checks sharing one axis, cell for cell', () => {
    const evaluation = evaluateDocument(sweptArea(false), catalogues);
    const feas = evaluation.outputs.find((entry) => entry.nodeId === 'feas') as FeasibilityResult;
    expect(feas.kind).toBe('feasibility');
    // A = 20, 40, 60, 80, 100 mm²: check1 (>= 30) is [F,T,T,T,T], check2 (<= 80) is [T,T,T,T,F].
    expect(feas.mask).toEqual([false, true, true, true, false]);
    // `perCheck` keeps each input mask `mask` was AND'd from, same order as `checks`.
    expect(feas.perCheck).toEqual([
      [false, true, true, true, true],
      [true, true, true, true, false],
    ]);
  });

  it('evaluates correctly however the checks are ordered relative to it — the ordering regression this closes', () => {
    // The Feasibility node's array position precedes the Check nodes it
    // references. It has no incoming edges of its own (it references
    // checks by id, not by wire), so it is trivially ready in the first
    // pass of a naive single-pass evaluation — this is the exact scenario
    // that would read an uncomputed Check without the two-pass fix.
    const evaluation = evaluateDocument(sweptArea(true), catalogues);
    const feas = evaluation.outputs.find((entry) => entry.nodeId === 'feas') as FeasibilityResult;
    expect(feas.mask).toEqual([false, true, true, true, false]);
  });

  it('ANDs across the union of two different axes, broadcasting each check onto the shared grid', () => {
    const document = documentOf(
      [
        input('d1', linear(0, 10, 3, 'mm'), { axisLabel: 'd1' }),
        input('d2', linear(0, 20, 2, 'mm'), { axisLabel: 'd2' }),
        input('unit1', scalar(1, 'mm')),
        input('unit2', scalar(1, 'mm')),
        formulaNode('f1', refTo('area')),
        formulaNode('f2', refTo('area')),
        outputNode('check1', { kind: 'check', comparison: '>=', threshold: { value: 5, unit: 'mm²' } }),
        outputNode('check2', { kind: 'check', comparison: '<=', threshold: { value: 10, unit: 'mm²' } }),
        outputNode('feas', { kind: 'feasibility', checks: ['check1', 'check2'] }),
      ],
      [
        wire('d1.value', 'f1.w'),
        wire('unit1.value', 'f1.h'),
        wire('d2.value', 'f2.w'),
        wire('unit2.value', 'f2.h'),
        wire('f1.A', 'check1.value'),
        wire('f2.A', 'check2.value'),
      ],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const feas = evaluation.outputs.find((entry) => entry.nodeId === 'feas') as FeasibilityResult;
    // d1 → A1 = [0, 5, 10] (check1 >= 5: [F, T, T]); d2 → A2 = [0, 20] (check2 <= 10: [T, F]).
    // Row-major over [d1 (3), d2 (2)]: AND is [F,F, T,F, T,F].
    expect(feas.axes.map((axis) => axis.label)).toEqual(['d1', 'd2']);
    expect(feas.mask).toEqual([false, false, true, false, true, false]);
  });

  it('counts one verdict, not one per point, when no check varies along the axis it is drawn against', () => {
    // The range node is still in the document — and still the only axis in
    // it, so it is what the figure is drawn against — but nothing feeding the
    // check varies along it any more: `w` takes a value typed on the node
    // instead. The mask is then a single cell, and says so.
    const document = documentOf(
      [
        input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'diameter' }),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area'), {
          inputValues: { w: { kind: 'scalar', value: 20, unit: 'mm' } },
        }),
        outputNode('check1', { kind: 'check', comparison: '>=', threshold: { value: 30, unit: 'mm²' } }),
        outputNode('feas', { kind: 'feasibility', checks: ['check1'] }),
      ],
      [wire('h.value', 'area.h'), wire('area.A', 'check1.value')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const feas = evaluation.outputs.find((entry) => entry.nodeId === 'feas') as FeasibilityResult;
    // A = 40 mm², once: one verdict over no axes at all. The figure still
    // draws it against `diameter`, flat — that widening is `FeasibilityFigure`'s
    // to do, and doing it here would report five points that do not exist.
    expect(feas.axes).toEqual([]);
    expect(feas.mask).toEqual([true]);
    expect(feas.x.axis.label).toBe('diameter');
    expect(evaluation.warnings.some((entry) => /will be flat/u.test(entry.message))).toBe(true);
  });

  it('throws a clear error when a referenced id is not a Check node', () => {
    const document = documentOf(
      [
        input('d', scalar(20, 'mm')),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
        outputNode('readout', { kind: 'print' }),
        outputNode('feas', { kind: 'feasibility', checks: ['readout'] }),
      ],
      [wire('d.value', 'area.w'), wire('h.value', 'area.h'), wire('area.A', 'readout.value')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/can only reference checks/u);
  });

  it('throws a clear error when a referenced id does not exist', () => {
    const document = documentOf(
      [input('d', scalar(20, 'mm')), outputNode('feas', { kind: 'feasibility', checks: ['nope'] })],
      [],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/not a Check node, or has not been computed/u);
  });
});

describe('sensitivity outputs', () => {
  it('finds a candidate from a range input, bracketed by its own start/stop', () => {
    const document = documentOf(
      [
        input('d', linear(10, 50, 3, 'mm'), { axisLabel: 'diameter' }),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
        outputNode('sens', { kind: 'sensitivity' }),
      ],
      [wire('d.value', 'area.w'), wire('h.value', 'area.h'), wire('area.A', 'sens.value')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const sens = evaluation.outputs.find((entry) => entry.nodeId === 'sens') as SensitivityResult;
    expect(sens.kind).toBe('sensitivity');
    const ranking = sens.rankings.find((entry) => entry.nodeId === 'd');
    expect(ranking?.low).toBe(10);
    expect(ranking?.high).toBe(50);
    // A = d * 2mm, so at d=10 → 20mm², at d=50 → 100mm².
    expect(ranking?.lowValue).toBeCloseTo(20);
    expect(ranking?.highValue).toBeCloseTo(100);
    expect(ranking?.swing).toBeCloseTo(80);
  });

  it('collapses an unrelated range node to its midpoint while ranking a different candidate', () => {
    // `collapseAxis` (sensitivity.ts) has to handle every `AxisNode` kind it
    // is asked to hold fixed, `RangeNode` included, or a document with one
    // anywhere in it would fail every sensitivity ranking, not just one
    // that happens to involve it.
    const document = documentOf(
      [
        input('d', linear(10, 50, 3, 'mm'), { axisLabel: 'diameter' }),
        rangeNode('h', 'linear', 2, 4, 3, 'mm'),
        formulaNode('area', refTo('area')),
        outputNode('sens', { kind: 'sensitivity' }),
      ],
      [wire('d.value', 'area.w'), wire('h.value', 'area.h'), wire('area.A', 'sens.value')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const sens = evaluation.outputs.find((entry) => entry.nodeId === 'sens') as SensitivityResult;
    const ranking = sens.rankings.find((entry) => entry.nodeId === 'd');
    // h collapses to its midpoint, (2 + 4) / 2 = 3mm.
    expect(ranking?.lowValue).toBeCloseTo(30);
    expect(ranking?.highValue).toBeCloseTo(150);
  });

  it('finds a candidate from a scalar input whose wired port declares a validRange — the first real consumer of it', () => {
    const bounded = catalogueOf([
      {
        id: 'bounded', version: 1,
        output: { kind: 'numeric', name: 'y', unit: 'mm' },
        inputs: [{ kind: 'numeric', name: 'x', unit: 'mm', validRange: { min: 5, max: 15 } }],
        expression: 'x * 2',
        description: 'Invented for a validRange sensitivity test.',
        status: 'unverified',
      },
    ]);
    const document = documentOf(
      [input('x', scalar(8, 'mm')), formulaNode('f', refTo('bounded', bounded)), outputNode('sens', { kind: 'sensitivity' })],
      [wire('x.value', 'f.x'), wire('f.y', 'sens.value')],
    );
    const evaluation = evaluateDocument(document, [bounded]);
    const sens = evaluation.outputs.find((entry) => entry.nodeId === 'sens') as SensitivityResult;
    const ranking = sens.rankings.find((entry) => entry.nodeId === 'x');
    expect(ranking?.low).toBe(5);
    expect(ranking?.high).toBe(15);
    expect(ranking?.lowValue).toBeCloseTo(10);
    expect(ranking?.highValue).toBeCloseTo(30);
  });

  it('excludes a categorical sweep — a numeric swing has no meaning on an unordered axis', () => {
    const document = documentOf(
      [
        input('cls', { kind: 'categoricalList', values: ['A', 'B'] }, { axisLabel: 'cls' }),
        input('x', linear(0, 10, 2, 'mm'), { axisLabel: 'x' }),
      ],
      [],
    );
    const resolution = resolveGraph(document, catalogues);
    const candidates = sensitivityCandidates(document, resolution);
    expect(candidates.some((entry) => entry.nodeId === 'cls')).toBe(false);
    expect(candidates.some((entry) => entry.nodeId === 'x')).toBe(true);
  });

  it('ranks candidates by swing, descending', () => {
    const document = documentOf(
      [
        input('a', linear(0, 100, 2, 'mm'), { axisLabel: 'a' }),
        input('b', linear(0, 1, 2, 'mm'), { axisLabel: 'b' }),
        formulaNode('sum', refTo('addTwo')),
        outputNode('sens', { kind: 'sensitivity' }),
      ],
      [wire('a.value', 'sum.a'), wire('b.value', 'sum.b'), wire('sum.sum', 'sens.value')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const sens = evaluation.outputs.find((entry) => entry.nodeId === 'sens') as SensitivityResult;
    expect(sens.rankings.map((entry) => entry.nodeId)).toEqual(['a', 'b']);
    expect(sens.rankings[0]?.swing ?? 0).toBeGreaterThan(sens.rankings[1]?.swing ?? 0);
  });

  it('skips a candidate that throws at evaluation time, with a warning, rather than aborting the whole result', () => {
    // A lookup cell that is explicitly undefined for one bound of the
    // candidate's bracket but not the other — the candidate's own low/high
    // splice is what triggers it, not the document's authored value (5,
    // 'B'), which lands on a defined cell and lets the top-level evaluation
    // succeed.
    const lookupCatalogue = catalogueOf([
      {
        id: 'lookup', version: 1,
        output: { kind: 'numeric', name: 'result', unit: 'mm' },
        inputs: [
          { kind: 'numeric', name: 'size', unit: 'mm', validRange: { min: 10, max: 20 } },
          { kind: 'categorical', name: 'class', domain: ['A', 'B'] },
        ],
        expression: '0 * size',
        lookup: {
          axes: [
            { input: 'size', kind: 'numeric', values: [10, 20] },
            { input: 'class', kind: 'categorical', values: ['A', 'B'] },
          ],
          // (size ≤ 10, A) → 1; (size ≤ 10, B) → 2; (size ≤ 20, A) → 3; (size ≤ 20, B) → undefined.
          values: [1, 2, 3, null],
        },
        description: 'Invented lookup table, for a sensitivity skip test.', status: 'unverified',
      },
    ]);
    const document = documentOf(
      [
        input('size', scalar(5, 'mm')),
        input('class', { kind: 'categorical', value: 'B' }),
        formulaNode('lookup', refTo('lookup', lookupCatalogue)),
        outputNode('sens', { kind: 'sensitivity' }),
      ],
      [
        wire('size.value', 'lookup.size'),
        wire('class.value', 'lookup.class'),
        wire('lookup.result', 'sens.value'),
      ],
    );
    const evaluation = evaluateDocument(document, [lookupCatalogue]);
    const sens = evaluation.outputs.find((entry) => entry.nodeId === 'sens') as SensitivityResult;
    expect(sens.rankings).toEqual([]);
    expect(evaluation.warnings.some((warning) => warning.kind === 'sensitivityCandidateSkipped')).toBe(true);
  });

  it('does not blow up when the document carries a second analysis output — every sub-evaluation strips output nodes first', () => {
    const document = documentOf(
      [
        input('a', linear(0, 10, 2, 'mm'), { axisLabel: 'a' }),
        input('b', linear(0, 1, 2, 'mm'), { axisLabel: 'b' }),
        formulaNode('sum', refTo('addTwo')),
        outputNode('sens1', { kind: 'sensitivity' }),
        outputNode('sens2', { kind: 'sensitivity' }),
      ],
      [wire('a.value', 'sum.a'), wire('b.value', 'sum.b'), wire('sum.sum', 'sens1.value'), wire('sum.sum', 'sens2.value')],
    );
    const start = Date.now();
    const evaluation = evaluateDocument(document, catalogues);
    expect(Date.now() - start).toBeLessThan(3000);
    const sens1 = evaluation.outputs.find((entry) => entry.nodeId === 'sens1') as SensitivityResult;
    const sens2 = evaluation.outputs.find((entry) => entry.nodeId === 'sens2') as SensitivityResult;
    expect(sens1.rankings).toHaveLength(2);
    expect(sens2.rankings).toHaveLength(2);
  });
});

describe('select nodes', () => {
  /** `A = w * h` swept along `w`, with `h` fixed at 2 mm: A = 2w, five points. */
  const sweptArea = (selectJson: JsonObject, wires: readonly JsonObject[]) =>
    documentOf(
      [
        input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'diameter' }),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
        selectJson,
      ],
      [wire('d.value', 'area.w'), wire('h.value', 'area.h'), ...wires],
    );

  it('answers on `at` in the dimension of whatever is wired into `along`, not the value', () => {
    const document = sweptArea(
      selectNode('cross', 'crossing', { threshold: { value: 50, unit: 'mm²' }, direction: 'any' }),
      [wire('area.A', 'cross.value'), wire('d.value', 'cross.along')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    // A = 20…100 mm² over d = 10…50 mm, so A = 50 mm² at d = 25 mm.
    expect(numeric(valueAt(evaluation, 'cross', 'at')).data[0]).toBeCloseTo(25, 10);
    // `at` is a length because `along` is, even though the searched value is an area.
    const type = resolveGraph(document, catalogues).sources.get('cross.at');
    expect(type?.unit?.symbol).toBe('mm');
  });

  it('reads a bare unitless threshold in the searched value’s own unit, exactly as compare does', () => {
    const document = sweptArea(
      selectNode('cross', 'crossing', { threshold: { value: 50, unit: '' }, direction: 'any' }),
      [wire('area.A', 'cross.value'), wire('d.value', 'cross.along')],
    );
    const evaluation = evaluateDocument(document, catalogues);
    expect(numeric(valueAt(evaluation, 'cross', 'at')).data[0]).toBeCloseTo(25, 10);
  });

  it('emits `best` alongside `at` for an extremum, and nothing for the other modes', () => {
    const document = sweptArea(selectNode('least', 'argMin'), [
      wire('area.A', 'least.value'),
      wire('d.value', 'least.along'),
    ]);
    const evaluation = evaluateDocument(document, catalogues);
    expect(numeric(valueAt(evaluation, 'least', 'at')).data).toEqual([10]);
    expect(numeric(valueAt(evaluation, 'least', 'best')).data).toEqual([20]);

    const crossing = sweptArea(
      selectNode('cross', 'crossing', { threshold: { value: 50, unit: 'mm²' }, direction: 'any' }),
      [wire('area.A', 'cross.value'), wire('d.value', 'cross.along')],
    );
    expect(valueAt(evaluateDocument(crossing, catalogues), 'cross', 'best')).toBeUndefined();
  });

  it('takes a Compare verdict for `firstPassing`, landing on a size the range actually holds', () => {
    const document = documentOf(
      [
        input('d', renard('R10', 10, 25, 'mm'), { axisLabel: 'size' }),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
        compareNode('ok', '>=', { value: 30, unit: 'mm²' }),
        selectNode('first', 'firstPassing'),
      ],
      [
        wire('d.value', 'area.w'),
        wire('h.value', 'area.h'),
        wire('area.A', 'ok.value'),
        wire('ok.verdict', 'first.value'),
        wire('d.value', 'first.along'),
      ],
    );
    const evaluation = evaluateDocument(document, catalogues);
    // R10 from 10 to 25 is 10, 12.5, 16, 20, 25; A = 2d, so A ≥ 30 mm² first
    // holds at 16 mm — a size on the list, never one between two of them.
    expect(numeric(valueAt(evaluation, 'first', 'at')).data).toEqual([16]);
  });

  it("keeps the second axis of a 2-D study, one crossing size per its coordinate", () => {
    const document = documentOf(
      [
        input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'diameter' }),
        input('h', list([2, 4], 'mm'), { axisLabel: 'height' }),
        formulaNode('area', refTo('area')),
        selectNode('cross', 'crossing', { threshold: { value: 100, unit: 'mm²' }, direction: 'any' }),
      ],
      [
        wire('d.value', 'area.w'),
        wire('h.value', 'area.h'),
        wire('area.A', 'cross.value'),
        wire('d.value', 'cross.along'),
      ],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const at = numeric(valueAt(evaluation, 'cross', 'at'));
    expect(at.axes.map((entry) => entry.label)).toEqual(['height']);
    // A = d·h reaches 100 mm² at d = 50 for h = 2, and at d = 25 for h = 4.
    expect(at.data[0]).toBeCloseTo(50, 10);
    expect(at.data[1]).toBeCloseTo(25, 10);
  });

  it("refuses a scalar in `along` with the message that says what to wire", () => {
    const document = sweptArea(
      selectNode('cross', 'crossing', { threshold: { value: 50, unit: 'mm²' }, direction: 'any' }),
      [wire('area.A', 'cross.value'), wire('h.value', 'cross.along')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/wire the swept range into 'along'/u);
  });

  it('refuses a threshold in the wrong dimension at resolve time, before anything is evaluated', () => {
    const document = sweptArea(
      selectNode('cross', 'crossing', { threshold: { value: 50, unit: 'mm' }, direction: 'any' }),
      [wire('area.A', 'cross.value'), wire('d.value', 'cross.along')],
    );
    expect(() => resolveGraph(document, catalogues)).toThrow(/same dimension/u);
  });
});

describe('Assumption Stress outputs', () => {
  const study = () => documentOf(
    [
      input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'load factor' }),
      input('h', scalar(2, 'mm')),
      formulaNode('area', refTo('area')),
      outputNode('limit', { kind: 'check', comparison: '<=', threshold: { value: 70, unit: 'mm²' } }),
      outputNode('stress', { kind: 'stress', checks: ['limit'] }),
    ],
    [
      wire('d.value', 'area.w'),
      wire('h.value', 'area.h'),
      wire('area.A', 'limit.value'),
      wire('d.value', 'stress.along'),
    ],
  );

  it('keeps raw readings but reports their shared margin and interpolated first failure', () => {
    const evaluation = evaluateDocument(study(), catalogues);
    const result = evaluation.outputs.find((entry) => entry.nodeId === 'stress') as StressResult;
    expect(result.along.axis.label).toBe('load factor');
    expect(result.designAxes).toEqual([]);
    const [trace] = result.traces;
    expect(trace?.margins.data[0]).toBeCloseTo(50 / 70, 10);
    expect(trace?.margins.data.at(-1)).toBeCloseTo(-30 / 70, 10);
    expect(trace?.firstFailure.data).toEqual([35]);
  });

  it('rejects a challenge that is not a deterministic range', () => {
    const document = study();
    const scalarAlong = {
      ...document,
      edges: document.edges.map((edge) => edge.to.node === 'stress'
        ? { ...edge, from: { node: 'h', port: 'value' } }
        : edge),
    };
    expect(() => evaluateDocument(scalarAlong, catalogues)).toThrow(/numeric range/u);
  });
});

describe('Best Design outputs', () => {
  /**
   * `A = d · h` swept along `d`, with two checks bounding it from both
   * sides and `A` itself as the objective — small enough to read by eye.
   */
  const study = (output: JsonObject, extraNodes: readonly JsonObject[] = []) =>
    documentOf(
      [
        input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'diameter' }),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
        outputNode('floor', { kind: 'check', comparison: '>=', threshold: { value: 50, unit: 'mm²' } }),
        outputNode('ceiling', { kind: 'check', comparison: '<=', threshold: { value: 90, unit: 'mm²' } }),
        ...extraNodes,
        outputNode('best', output),
      ],
      [
        wire('d.value', 'area.w'),
        wire('h.value', 'area.h'),
        wire('area.A', 'floor.value'),
        wire('area.A', 'ceiling.value'),
        wire('area.A', 'best.objective'),
      ],
    );

  const cardOf = (document: ReturnType<typeof documentOf>): BestDesignResult => {
    const evaluation = evaluateDocument(document, catalogues);
    return evaluation.outputs.find((entry) => entry.nodeId === 'best') as BestDesignResult;
  };

  it('picks the smallest objective among the cells every check passes at', () => {
    const card = cardOf(study({ kind: 'bestDesign', checks: ['floor', 'ceiling'], direction: 'minimize' }));
    // A = 20, 40, 60, 80, 100 mm². Feasible (≥50 and ≤90) is [F,F,T,T,F].
    expect(card.feasible).toEqual([false, false, true, true, false]);
    expect(card.feasibleCount).toBe(2);
    expect(card.winner?.cell).toBe(2);
    expect(card.winner?.objective).toBe(60);
    expect(card.winner?.at.map((entry) => [entry.axis.label, entry.value])).toEqual([['diameter', 30]]);
  });

  it('maximises when told to, over the same feasible set', () => {
    const card = cardOf(study({ kind: 'bestDesign', checks: ['floor', 'ceiling'], direction: 'maximize' }));
    expect(card.winner?.objective).toBe(80);
    expect(card.winner?.at[0]?.value).toBe(40);
  });

  it('names the least-margin check as governing when two are close', () => {
    // At A = 60 mm²: the floor (≥50) has (60−50)/50 = 20 % of room, the
    // ceiling (≤90) has −(60−90)/90 = 33 %. The floor governs.
    const card = cardOf(study({ kind: 'bestDesign', checks: ['floor', 'ceiling'], direction: 'minimize' }));
    expect(card.winner?.governing?.checkId).toBe('floor');
    expect(card.winner?.governing?.margin).toBeCloseTo(0.2, 10);
    expect(card.winner?.margins.map((entry) => entry.checkId)).toEqual(['floor', 'ceiling']);
  });

  it('leaves an equality check and a zero-threshold check out of the ranking, and says so', () => {
    const document = study(
      { kind: 'bestDesign', checks: ['floor', 'exact', 'zero'], direction: 'minimize' },
      [
        outputNode('exact', { kind: 'check', comparison: '==', threshold: { value: 60, unit: 'mm²' } }),
        outputNode('zero', { kind: 'check', comparison: '>=', threshold: { value: 0, unit: 'mm²' } }),
      ],
    );
    const wired = {
      ...document,
      edges: [
        ...document.edges,
        { id: 'area.A->exact.value', from: { node: 'area', port: 'A' }, to: { node: 'exact', port: 'value' } },
        { id: 'area.A->zero.value', from: { node: 'area', port: 'A' }, to: { node: 'zero', port: 'value' } },
      ],
    };
    const evaluation = evaluateDocument(wired, catalogues);
    const card = evaluation.outputs.find((entry) => entry.nodeId === 'best') as BestDesignResult;
    // `==` asserts equality rather than a bound, and a zero threshold has no
    // scale to measure a ratio against — neither can be ranked, so only the
    // floor is left to govern.
    expect(card.winner?.margins.map((entry) => entry.checkId)).toEqual(['floor']);
    expect(evaluation.warnings.some((entry) => entry.kind === 'bestDesignUnrankable')).toBe(true);
  });

  it('reports no feasible candidate as an answer, naming the check that fails most', () => {
    const document = study({ kind: 'bestDesign', checks: ['floor', 'impossible'], direction: 'minimize' }, [
      outputNode('impossible', { kind: 'check', comparison: '>=', threshold: { value: 500, unit: 'mm²' } }),
    ]);
    const wired = {
      ...document,
      edges: [
        ...document.edges,
        {
          id: 'area.A->impossible.value',
          from: { node: 'area', port: 'A' },
          to: { node: 'impossible', port: 'value' },
        },
      ],
    };
    const evaluation = evaluateDocument(wired, catalogues);
    const card = evaluation.outputs.find((entry) => entry.nodeId === 'best') as BestDesignResult;
    expect(card.winner).toBeUndefined();
    expect(card.feasibleCount).toBe(0);
    // `impossible` fails at all five points, `floor` at two.
    expect(card.blocking).toEqual({ checkId: 'impossible', failures: 5 });
    expect(evaluation.warnings.some((entry) => entry.kind === 'bestDesignInfeasible')).toBe(true);
  });

  it('treats an empty `checks` list as an unconstrained minimum, not an error', () => {
    const card = cardOf(study({ kind: 'bestDesign', checks: [], direction: 'minimize' }));
    expect(card.feasible).toEqual([true, true, true, true, true]);
    expect(card.winner?.objective).toBe(20);
    expect(card.winner?.governing).toBeUndefined();
  });

  it('evaluates correctly however the Best Design node is ordered relative to its checks', () => {
    const document = documentOf(
      [
        outputNode('best', { kind: 'bestDesign', checks: ['floor'], direction: 'minimize' }),
        input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'diameter' }),
        input('h', scalar(2, 'mm')),
        formulaNode('area', refTo('area')),
        outputNode('floor', { kind: 'check', comparison: '>=', threshold: { value: 50, unit: 'mm²' } }),
      ],
      [
        wire('d.value', 'area.w'),
        wire('h.value', 'area.h'),
        wire('area.A', 'floor.value'),
        wire('area.A', 'best.objective'),
      ],
    );
    const card = cardOf(document);
    expect(card.winner?.objective).toBe(60);
  });

  it('warns that a flat objective makes the choice arbitrary', () => {
    const document = documentOf(
      [
        input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'diameter' }),
        input('h', scalar(2, 'mm')),
        input('c', scalar(7, '')),
        formulaNode('area', refTo('area')),
        outputNode('floor', { kind: 'check', comparison: '>=', threshold: { value: 50, unit: 'mm²' } }),
        outputNode('best', { kind: 'bestDesign', checks: ['floor'], direction: 'minimize' }),
      ],
      [
        wire('d.value', 'area.w'),
        wire('h.value', 'area.h'),
        wire('area.A', 'floor.value'),
        wire('c.value', 'best.objective'),
      ],
    );
    // The check varies along `diameter`, so the study has three feasible
    // candidates — and the objective is the same constant at every one of
    // them. Nothing here makes one better than another, and the card says so
    // rather than presenting the first as a decision.
    const evaluation = evaluateDocument(document, catalogues);
    const card = evaluation.outputs.find((entry) => entry.nodeId === 'best') as BestDesignResult;
    expect(card.feasibleCount).toBe(3);
    expect(card.winner?.objective).toBe(7);
    expect(evaluation.warnings.some((entry) => entry.kind === 'bestDesignFlat')).toBe(true);
  });

  it('refuses a referenced id that is not a Check node', () => {
    const document = study({ kind: 'bestDesign', checks: ['readout'], direction: 'minimize' }, [
      outputNode('readout', { kind: 'print' }),
    ]);
    const wired = {
      ...document,
      edges: [
        ...document.edges,
        { id: 'area.A->readout.value', from: { node: 'area', port: 'A' }, to: { node: 'readout', port: 'value' } },
      ],
    };
    expect(() => evaluateDocument(wired, catalogues)).toThrow(
      /a Best Design node can only reference checks/u,
    );
  });
});

describe('Pareto outputs', () => {
  /**
   * Two objectives over one sweep, invented throughout: `A = d·h` and
   * `p = F/A`, both to be minimised. Since `p` falls as `A` rises they pull
   * against each other by construction — wanting a small area and a small
   * pressure at once is exactly the shape a Pareto question has, and no single
   * `d` gives both.
   */
  const study = (output: JsonObject, extraNodes: readonly JsonObject[] = []) =>
    documentOf(
      [
        input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'diameter' }),
        input('h', scalar(2, 'mm')),
        input('F', scalar(1000, 'N')),
        formulaNode('area', refTo('area')),
        formulaNode('press', refTo('pressure')),
        outputNode('floor', { kind: 'check', comparison: '>=', threshold: { value: 50, unit: 'mm²' } }),
        ...extraNodes,
        outputNode('front', output),
      ],
      [
        wire('d.value', 'area.w'),
        wire('h.value', 'area.h'),
        wire('F.value', 'press.F'),
        wire('area.A', 'press.A'),
        wire('area.A', 'floor.value'),
        wire('area.A', 'front.x'),
        wire('press.p', 'front.y'),
      ],
    );

  const frontOf = (document: ReturnType<typeof documentOf>): ParetoResult => {
    const evaluation = evaluateDocument(document, catalogues);
    return evaluation.outputs.find((entry) => entry.nodeId === 'front') as ParetoResult;
  };

  const unconstrained: JsonObject = {
    kind: 'pareto',
    checks: [],
    xDirection: 'minimize',
    yDirection: 'minimize',
  };

  it('puts every candidate on the front when the two objectives are strictly opposed', () => {
    // A = 20, 40, 60, 80, 100 mm²; p = 50, 25, 16.7, 12.5, 10 N/mm². Every step
    // that improves p costs A, so nothing dominates anything.
    const front = frontOf(study(unconstrained));
    expect(front.points).toHaveLength(5);
    expect(front.points.map((point) => point.onFront)).toEqual([true, true, true, true, true]);
    expect(front.frontCount).toBe(5);
  });

  it('carries each point’s coordinates and its candidate, ready to mark', () => {
    const front = frontOf(study(unconstrained));
    expect(front.points[2]?.at.map((entry) => [entry.axis.label, entry.value])).toEqual([['diameter', 30]]);
    expect(front.points[2]?.candidate).toEqual({ at: { d: 30 } });
  });

  it('keeps a failing candidate on the chart but out of the competition', () => {
    // The floor (A ≥ 50 mm²) fails at d = 10 and 20 — the two cheapest points on
    // pressure, and the reason the front starts where it does.
    const front = frontOf(study({ ...unconstrained, checks: ['floor'] }));
    expect(front.points.map((point) => point.feasible)).toEqual([false, false, true, true, true]);
    expect(front.points.map((point) => point.onFront)).toEqual([false, false, true, true, true]);
    expect(front.feasibleCount).toBe(3);
    // Still five points: seeing why the front stops is most of the value.
    expect(front.points).toHaveLength(5);
  });

  it('labels the axes from the wired nodes, and records both directions', () => {
    const front = frontOf(study(unconstrained));
    expect(front.xDirection).toBe('minimize');
    expect(front.yDirection).toBe('minimize');
    expect(front.xUnit.symbol).toBe('mm²');
    expect(front.yUnit.symbol).toBe('N/mm²');
  });

  it('says so when no candidate passes, instead of drawing an empty chart silently', () => {
    const document = study({ ...unconstrained, checks: ['impossible'] }, [
      outputNode('impossible', { kind: 'check', comparison: '>=', threshold: { value: 1e6, unit: 'mm²' } }),
    ]);
    const wired = {
      ...document,
      edges: [
        ...document.edges,
        { id: 'area.A->impossible.value', from: { node: 'area', port: 'A' }, to: { node: 'impossible', port: 'value' } },
      ],
    };
    const evaluation = evaluateDocument(wired, catalogues);
    const front = evaluation.outputs.find((entry) => entry.nodeId === 'front') as ParetoResult;
    expect(front.feasibleCount).toBe(0);
    expect(front.frontCount).toBe(0);
    expect(evaluation.warnings.some((entry) => entry.kind === 'paretoInfeasible')).toBe(true);
  });

  it('refuses a referenced id that is not a Check node', () => {
    const document = study({ ...unconstrained, checks: ['readout'] }, [
      outputNode('readout', { kind: 'print' }),
    ]);
    const wired = {
      ...document,
      edges: [
        ...document.edges,
        { id: 'area.A->readout.value', from: { node: 'area', port: 'A' }, to: { node: 'readout', port: 'value' } },
      ],
    };
    expect(() => evaluateDocument(wired, catalogues)).toThrow(/a Pareto node can only reference checks/u);
  });
});

describe('marks against the axes they were set on', () => {
  const study = (marks: JsonObject[] | undefined) => {
    const base = documentOf(
      [input('d', linear(10, 50, 5, 'mm'), { axisLabel: 'diameter' }), outputNode('show', { kind: 'print' })],
      [wire('d.value', 'show.value')],
    );
    return marks === undefined ? base : { ...base, marks };
  };

  it('exposes every axis’s coordinates, so any figure can resolve a mark', () => {
    const evaluation = evaluateDocument(study(undefined), catalogues);
    const readout = evaluation.axisReadouts.get('d');
    expect(readout?.axis.label).toBe('diameter');
    expect(readout?.coordinates.data).toEqual([10, 20, 30, 40, 50]);
  });

  it('says nothing about a mark that still lands on a sample', () => {
    const evaluation = evaluateDocument(study([{ at: { d: 30 } }]), catalogues);
    expect(evaluation.warnings.some((entry) => entry.kind === 'candidateStale')).toBe(false);
  });

  it('names the mark it had to snap, rather than moving it quietly', () => {
    const evaluation = evaluateDocument(study([{ at: { d: 33 } }]), catalogues);
    const stale = evaluation.warnings.filter((entry) => entry.kind === 'candidateStale');
    expect(stale).toHaveLength(1);
    expect(stale[0]?.message).toMatch(/candidate A was snapped/u);
    expect(stale[0]?.message).toMatch(/diameter/u);
  });

  it('reports a mark the range no longer reaches, and letters marks in order', () => {
    const evaluation = evaluateDocument(study([{ at: { d: 30 } }, { at: { d: 500 } }]), catalogues);
    const stale = evaluation.warnings.filter((entry) => entry.kind === 'candidateStale');
    expect(stale).toHaveLength(1);
    expect(stale[0]?.message).toMatch(/candidate B no longer sits on any sampled point/u);
  });
});
