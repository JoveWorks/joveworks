/**
 * Shaft diagrams drawn from everything acting on a shaft (`FormulaShaft`),
 * through invented records parsed like any catalogue. The answers are
 * standard statics worked by hand; nothing here is textbook content.
 */

import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@joveworks/schema';

import { evaluateDocument, valueAt } from './evaluate.js';
import { isVariadicTarget } from './graph.js';
import { catalogueOf, documentOf, formulaNode, input, list, refTo, wire } from './invented.fixtures.js';
import type { NumericSeries, PortValue } from './series.js';

const z: JsonObject = { kind: 'numeric', name: 'z', unit: 'mm' };
const acting: JsonObject = { kind: 'load', name: 'acting', variadic: true };
const shaftPort: JsonObject = { kind: 'shaft', name: 'shaft' };
const plane: JsonObject = { kind: 'categorical', name: 'plane', domain: ['x', 'y', 'resultant'], default: 'y' };

const record = (id: string, output: JsonObject | JsonObject[], inputs: readonly JsonObject[], shaft: JsonObject): JsonObject => ({
  id, version: 1, output, inputs: [...inputs], shaft, description: 'Invented shaft record.', status: 'unverified',
});
const diagramRecord = (diagram: string, output: JsonObject): JsonObject =>
  record(diagram, output, [z, acting, shaftPort, plane], { diagram, acting: 'acting', shaft: 'shaft', axis: 'z', plane: 'plane' });

const CATALOGUE = catalogueOf([
  record('torque', { kind: 'numeric', name: 'T', unit: 'Nmm' }, [z, acting, shaftPort], { diagram: 'torque', acting: 'acting', shaft: 'shaft', axis: 'z' }),
  diagramRecord('shear', { kind: 'numeric', name: 'V', unit: 'N' }),
  diagramRecord('moment', { kind: 'numeric', name: 'M', unit: 'Nmm' }),
  diagramRecord('deflection', { kind: 'numeric', name: 'y', unit: 'mm' }),
  record(
    'reactions',
    [{ kind: 'numeric', name: 'R', unit: 'N' }, { kind: 'numeric', name: 'M_R', unit: 'Nmm' }],
    [acting, shaftPort, { kind: 'load', name: 'support' }, plane],
    { diagram: 'reactions', acting: 'acting', shaft: 'shaft', support: 'support', plane: 'plane' },
  ),
]);

const q = (value: number, unit: string): JsonObject => ({ value, unit });
const at = { x: 0, y: 0 };
const pointLoad = (id: string, fields: JsonObject): JsonObject => ({ kind: 'load', id, position: at, ...fields });
const spanLoad = (id: string, fields: JsonObject): JsonObject => ({ kind: 'distributedLoad', id, position: at, ...fields });
const support = (id: string, position: number, type = 'simple'): JsonObject => ({
  kind: 'support', id, position: at, at: q(position, 'mm'), support: type,
});
/** EI = 1e6 N·mm² unless a section says otherwise. */
const shaftNode = (length = 200, section: JsonObject = { kind: 'secondMoment', I: q(1000, 'mm⁴') }, count = 5): JsonObject => ({
  kind: 'shaft', id: 'S', position: at, from: q(0, 'mm'), to: q(length, 'mm'), count, E: q(1000, 'N/mm²'), section,
});

const diagram = (id: string, formula: string, extra: Record<string, JsonObject> = {}): JsonObject =>
  formulaNode(id, refTo(formula, CATALOGUE), Object.keys(extra).length === 0 ? {} : { inputValues: extra });

function numeric(value: PortValue | undefined): NumericSeries {
  if (value?.kind !== 'numeric') throw new Error(`expected a numeric series, got ${value?.kind}`);
  return value;
}

/** Everything in `acting` wired into each diagram, the shaft into each, and `zs` (when given) into each `z`. */
function study(
  actingIds: readonly string[],
  diagrams: readonly JsonObject[],
  options: { readonly zs?: readonly number[]; readonly shaft?: JsonObject; readonly extra?: readonly JsonObject[]; readonly wires?: readonly JsonObject[] } = {},
) {
  const ids = diagrams.map((node) => node['id'] as string);
  return documentOf(
    [options.shaft ?? shaftNode(), ...(options.zs === undefined ? [] : [input('zs', list(options.zs, 'mm'))]), ...diagrams, ...(options.extra ?? [])],
    [
      ...ids.flatMap((id) => [
        ...actingIds.map((from) => wire(`${from}.load`, `${id}.acting`)),
        wire('S.shaft', `${id}.shaft`),
        ...(options.zs === undefined || id.startsWith('R') ? [] : [wire('zs.value', `${id}.z`)]),
      ]),
      ...(options.wires ?? []),
    ],
  );
}

const data = (evaluation: ReturnType<typeof evaluateDocument>, nodeId: string, port: string): readonly number[] =>
  numeric(valueAt(evaluation, nodeId, port)).data;

describe('shaft diagrams on supports', () => {
  it('solve two simple supports: 1000 N down at 80 mm on a 200 mm span gives 600 N and 400 N', () => {
    const document = study(['P', 'A', 'B'], [diagram('V', 'shear'), diagram('M', 'moment'), diagram('RA', 'reactions'), diagram('RB', 'reactions')], {
      zs: [0, 50, 80, 150, 200, 250],
      extra: [pointLoad('P', { at: q(80, 'mm'), Fy: q(-1000, 'N') }), support('A', 0), support('B', 200)],
      wires: [wire('A.load', 'RA.support'), wire('B.load', 'RB.support')],
    });
    const evaluation = evaluateDocument(document, [CATALOGUE]);
    expect(data(evaluation, 'RA', 'R')[0]).toBeCloseTo(600, 6);
    expect(data(evaluation, 'RB', 'R')[0]).toBeCloseTo(400, 6);
    expect(data(evaluation, 'RA', 'M_R')[0]).toBe(0);
    data(evaluation, 'V', 'V').forEach((value, i) => expect(value).toBeCloseTo([600, 600, -400, -400, 0, 0][i] as number, 6));
    data(evaluation, 'M', 'M').forEach((value, i) => expect(value).toBeCloseTo([0, 30000, 48000, 20000, 0, 0][i] as number, 4));
  });

  it("draw along the shaft's own z when nothing is wired into z", () => {
    const document = study(['P', 'A', 'B'], [diagram('M', 'moment')], {
      extra: [pointLoad('P', { at: q(100, 'mm'), Fy: q(-400, 'N') }), support('A', 0), support('B', 200)],
    });
    const M = numeric(valueAt(evaluateDocument(document, [CATALOGUE]), 'M', 'M'));
    expect(M.axes.map((axis) => axis.id)).toEqual(['S']);
    M.data.forEach((value, i) => expect(value).toBeCloseTo([0, 10000, 20000, 10000, 0][i] as number, 4));
  });

  it('hold a cantilever on one fixed support: P·L at the wall, −P·L³/(3EI) at the tip', () => {
    const document = study(['P', 'W'], [diagram('M', 'moment'), diagram('y', 'deflection'), diagram('R', 'reactions')], {
      zs: [0, 200],
      extra: [pointLoad('P', { at: q(200, 'mm'), Fy: q(-10, 'N') }), support('W', 0, 'fixed')],
      wires: [wire('W.load', 'R.support')],
    });
    const evaluation = evaluateDocument(document, [CATALOGUE]);
    expect(data(evaluation, 'R', 'R')[0]).toBeCloseTo(10, 6);
    expect(data(evaluation, 'R', 'M_R')[0]).toBeCloseTo(-2000, 4);
    expect(data(evaluation, 'M', 'M')[0]).toBeCloseTo(-2000, 4);
    expect(data(evaluation, 'y', 'y')[0]).toBeCloseTo(0, 9);
    expect(data(evaluation, 'y', 'y')[1]).toBeCloseTo((-10 * 200 ** 3) / (3 * 1e6), 6);
  });

  it('solve a statically indeterminate shaft: a uniform load over two equal spans puts 5qL/4 on the middle support', () => {
    const document = study(['w', 'A', 'B', 'C'], [diagram('RA', 'reactions'), diagram('RB', 'reactions'), diagram('M', 'moment')], {
      zs: [100],
      extra: [spanLoad('w', { from: q(0, 'mm'), to: q(200, 'mm'), qy: q(-2, 'N/mm') }), support('A', 0), support('B', 100), support('C', 200)],
      wires: [wire('A.load', 'RA.support'), wire('B.load', 'RB.support')],
    });
    const evaluation = evaluateDocument(document, [CATALOGUE]);
    expect(data(evaluation, 'RA', 'R')[0]).toBeCloseTo((3 * 2 * 100) / 8, 6);
    expect(data(evaluation, 'RB', 'R')[0]).toBeCloseTo((5 * 2 * 100) / 4, 6);
    // Over the middle support the shaft hogs: −qL²/8.
    expect(data(evaluation, 'M', 'M')[0]).toBeCloseTo((-2 * 100 ** 2) / 8, 4);
  });

  it("use a stepped shaft's real stiffness: a two-section cantilever's tip deflection by the unit-load method", () => {
    // Fixed at 0; 40 mm diameter to 120 mm, 20 mm after; 100 N down at 200 mm, E = 1000 N/mm².
    const I = (d: number): number => (Math.PI * d ** 4) / 64;
    const stepped = { kind: 'stepped', unit: 'mm', steps: [{ start: 0, d: 40 }, { start: 120, d: 20 }] };
    const document = study(['P', 'W'], [diagram('y', 'deflection')], {
      zs: [200],
      shaft: shaftNode(200, stepped),
      extra: [pointLoad('P', { at: q(200, 'mm'), Fy: q(-100, 'N') }), support('W', 0, 'fixed')],
    });
    const expected = (-100 / (3 * 1000)) * ((200 ** 3 - 80 ** 3) / I(40) + 80 ** 3 / I(20));
    expect(data(evaluateDocument(document, [CATALOGUE]), 'y', 'y')[0]).toBeCloseTo(expected, 6);
  });

  it('draw a distributed load\'s deflection: 5qL⁴/(384EI) at mid-span', () => {
    const document = study(['w', 'A', 'B'], [diagram('y', 'deflection')], {
      zs: [100],
      extra: [spanLoad('w', { from: q(0, 'mm'), to: q(200, 'mm'), qy: q(-1, 'N/mm') }), support('A', 0), support('B', 200)],
    });
    expect(data(evaluateDocument(document, [CATALOGUE]), 'y', 'y')[0]).toBeCloseTo((-5 * 1 * 200 ** 4) / (384 * 1e6), 6);
  });

  it('read a hollow round section as π(d⁴ − d_i⁴)/64', () => {
    const section = { kind: 'round', d: q(30, 'mm'), d_i: q(20, 'mm') };
    const document = study(['P', 'W'], [diagram('y', 'deflection')], {
      zs: [200],
      shaft: shaftNode(200, section),
      extra: [pointLoad('P', { at: q(200, 'mm'), Fy: q(-1, 'N') }), support('W', 0, 'fixed')],
    });
    const I = (Math.PI * (30 ** 4 - 20 ** 4)) / 64;
    expect(data(evaluateDocument(document, [CATALOGUE]), 'y', 'y')[0]).toBeCloseTo((-1 * 200 ** 3) / (3 * 1000 * I), 9);
  });

  it('take the resultant of the two planes', () => {
    const document = study(['P', 'A', 'B'], [
      diagram('Mx', 'moment', { plane: { kind: 'categorical', value: 'x' } }),
      diagram('My', 'moment', { plane: { kind: 'categorical', value: 'y' } }),
      diagram('M', 'moment', { plane: { kind: 'categorical', value: 'resultant' } }),
    ], {
      zs: [80],
      extra: [pointLoad('P', { at: q(80, 'mm'), Fx: q(300, 'N'), Fy: q(-400, 'N') }), support('A', 0), support('B', 200)],
    });
    const evaluation = evaluateDocument(document, [CATALOGUE]);
    const mx = data(evaluation, 'Mx', 'M')[0] as number;
    const my = data(evaluation, 'My', 'M')[0] as number;
    expect(mx).toBeCloseTo(-300 * 0.6 * 80, 4);
    expect(my).toBeCloseTo(400 * 0.6 * 80, 4);
    expect(data(evaluation, 'M', 'M')[0]).toBeCloseTo(Math.hypot(mx, my), 4);
  });

  it('step the moment by a couple, and close it at the far support', () => {
    const document = study(['C', 'A', 'B'], [diagram('M', 'moment')], {
      zs: [49.999, 50, 200],
      extra: [pointLoad('C', { at: q(50, 'mm'), Cy: q(5000, 'Nmm') }), support('A', 0), support('B', 200)],
    });
    const [before, after, end] = data(evaluateDocument(document, [CATALOGUE]), 'M', 'M') as number[];
    expect((after as number) - (before as number)).toBeCloseTo(5000, 1);
    expect(end).toBeCloseTo(0, 6);
  });

  it('sum torque at or before z', () => {
    const document = study(['in', 'out'], [diagram('T', 'torque')], {
      zs: [0, 20, 100, 150],
      extra: [pointLoad('in', { at: q(20, 'mm'), torque: q(40, 'Nm') }), pointLoad('out', { at: q(150, 'mm'), torque: q(-40, 'Nm') })],
    });
    expect(data(evaluateDocument(document, [CATALOGUE]), 'T', 'T')).toEqual([0, 40_000, 40_000, 0]);
  });

  it('broadcast a support moved along the shaft', () => {
    const document = study(['P', 'A', 'B'], [diagram('R', 'reactions')], {
      extra: [input('span', list([100, 200], 'mm')), pointLoad('P', { at: q(50, 'mm'), Fy: q(-100, 'N') }), support('A', 0), support('B', 0)],
      wires: [wire('span.value', 'B.at'), wire('A.load', 'R.support')],
    });
    data(evaluateDocument(document, [CATALOGUE]), 'R', 'R').forEach((value, i) => expect(value).toBeCloseTo([50, 75][i] as number, 6));
  });

  it('refuse a shaft nothing holds, or only one simple support', () => {
    const P = pointLoad('P', { at: q(50, 'mm'), Fy: q(-1, 'N') });
    const loose = study(['P'], [diagram('M', 'moment')], { extra: [P] });
    expect(() => evaluateDocument(loose, [CATALOGUE])).toThrow(/M: nothing holds this shaft/u);
    const pivot = study(['P', 'A'], [diagram('M', 'moment')], { extra: [P, support('A', 0)] });
    expect(() => evaluateDocument(pivot, [CATALOGUE])).toThrow(/M: these supports cannot hold the shaft/u);
  });

  it('warn when more than one bearing locates the shaft', () => {
    const document = study(['P', 'A', 'B'], [diagram('M', 'moment')], {
      extra: [pointLoad('P', { at: q(50, 'mm'), Fy: q(-1, 'N') }), support('A', 0, 'locating'), support('B', 200, 'locating')],
    });
    expect(evaluateDocument(document, [CATALOGUE]).warnings.map((warning) => warning.kind)).toContain('shaftSupports');
  });

  it('refuse a shaft wired anywhere but a shaft port', () => {
    const document = documentOf([shaftNode(), { kind: 'output', id: 'show', position: at, output: { kind: 'print' } }], [wire('S.shaft', 'show.value')]);
    expect(() => evaluateDocument(document, [])).toThrow(/show\.value: this wire carries a shaft/u);
  });
});

it('a Shaft node introduces its own z axis', () => {
  const document = documentOf([shaftNode(200, { kind: 'round', d: q(30, 'mm') }, 5)], []);
  const zs = numeric(valueAt(evaluateDocument(document, []), 'S', 'z'));
  expect(zs.data).toEqual([0, 50, 100, 150, 200]);
  expect(zs.axes.map((axis) => axis.label)).toEqual(['z']);
});

it('reports only a support that acts on the shaft', () => {
  const document = study(['P', 'A', 'B'], [diagram('R', 'reactions')], {
    extra: [pointLoad('P', { at: q(50, 'mm'), Fy: q(-1, 'N') }), support('A', 0), support('B', 200), support('C', 100)],
    wires: [wire('C.load', 'R.support')],
  });
  expect(() => evaluateDocument(document, [CATALOGUE])).toThrow(/must be one of the supports wired into 'acting'/u);
});

it("a stepped Shaft node outputs its outer diameter along its own z", () => {
  const stepped = { kind: 'stepped', unit: 'mm', steps: [{ start: 0, d: 20 }, { start: 60, d: 30, d_i: 10 }, { start: 150, d: 25 }] };
  const document = documentOf([shaftNode(200, stepped, 5)], []);
  expect(numeric(valueAt(evaluateDocument(document, []), 'S', 'profile')).data).toEqual([20, 20, 30, 25, 25]);
});

it("joins every wire into a diagram's acting port, where its shaft port takes one", () => {
  const document = documentOf([shaftNode(), diagram('M', 'moment')], []);
  expect(isVariadicTarget(document, [CATALOGUE], { node: 'M', port: 'acting' })).toBe(true);
  expect(isVariadicTarget(document, [CATALOGUE], { node: 'M', port: 'shaft' })).toBe(false);
});
