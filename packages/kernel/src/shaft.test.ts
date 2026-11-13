/**
 * Shaft diagrams drawn from load values (`FormulaShaft`), through invented
 * records parsed like any catalogue. Statics worked by hand; nothing here is
 * textbook content.
 */

import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@joveworks/schema';

import { evaluateDocument, valueAt } from './evaluate.js';
import { catalogueOf, documentOf, formulaNode, input, list, refTo, scalar, wire } from './invented.fixtures.js';
import type { NumericSeries, PortValue } from './series.js';

const plane = (domain: readonly string[] = ['x', 'y', 'resultant']): JsonObject => ({
  kind: 'categorical', name: 'plane', domain: [...domain], default: 'y',
});
const z: JsonObject = { kind: 'numeric', name: 'z', unit: 'mm', default: 0 };
const loads: JsonObject = { kind: 'load', name: 'loads', variadic: true };
const supports: readonly JsonObject[] = [
  { kind: 'numeric', name: 'a', unit: 'mm' },
  { kind: 'numeric', name: 'b', unit: 'mm' },
];

const record = (id: string, output: JsonObject | JsonObject[], inputs: readonly JsonObject[], shaft: JsonObject): JsonObject => ({
  id, version: 1, output, inputs: [...inputs], shaft, description: 'Invented shaft record.', status: 'unverified',
});

const CATALOGUE = catalogueOf([
  record('torque', { kind: 'numeric', name: 'T', unit: 'Nmm' }, [z, loads], { diagram: 'torque', loads: 'loads', axis: 'z' }),
  record('shear', { kind: 'numeric', name: 'V', unit: 'N' }, [z, loads, ...supports, plane()], {
    diagram: 'shear', loads: 'loads', axis: 'z', supports: ['a', 'b'], plane: 'plane',
  }),
  record('moment', { kind: 'numeric', name: 'M', unit: 'Nmm' }, [z, loads, ...supports, plane()], {
    diagram: 'moment', loads: 'loads', axis: 'z', supports: ['a', 'b'], plane: 'plane',
  }),
  record(
    'deflection',
    { kind: 'numeric', name: 'y', unit: 'mm' },
    [z, loads, ...supports, plane(), { kind: 'numeric', name: 'E', unit: 'N/mm²' }, { kind: 'numeric', name: 'I', unit: 'mm⁴' }],
    { diagram: 'deflection', loads: 'loads', axis: 'z', supports: ['a', 'b'], plane: 'plane', modulus: 'E', secondMomentOfArea: 'I' },
  ),
  record(
    'reactions',
    [{ kind: 'numeric', name: 'R_A', unit: 'N' }, { kind: 'numeric', name: 'R_B', unit: 'N' }],
    [loads, ...supports, plane(['x', 'y'])],
    { diagram: 'reactions', loads: 'loads', supports: ['a', 'b'], plane: 'plane' },
  ),
]);

const q = (value: number, unit: string): JsonObject => ({ value, unit });
const pointLoad = (id: string, fields: JsonObject): JsonObject => ({ kind: 'load', id, position: { x: 0, y: 0 }, ...fields });
const spanLoad = (id: string, fields: JsonObject): JsonObject => ({ kind: 'distributedLoad', id, position: { x: 0, y: 0 }, ...fields });

/** A diagram node on supports at 0 and 200 mm, with typed fallbacks for everything but the loads. */
const diagram = (id: string, formula: string, extra: Record<string, JsonObject> = {}): JsonObject =>
  formulaNode(id, refTo(formula, CATALOGUE), {
    inputValues: { a: scalar(0, 'mm'), b: scalar(200, 'mm'), ...extra },
  });

function numeric(value: PortValue | undefined): NumericSeries {
  if (value?.kind !== 'numeric') throw new Error(`expected a numeric series, got ${value?.kind}`);
  return value;
}

const sweep = (values: readonly number[]): JsonObject => input('z', list(values, 'mm'));

describe('shaft diagrams from loads', () => {
  it('solve the reactions inside: 1000 N down at 80 mm on a 200 mm span gives 600 N and 400 N', () => {
    const document = documentOf(
      [
        pointLoad('P', { at: q(80, 'mm'), Fy: q(-1000, 'N') }),
        sweep([0, 50, 80, 150, 200, 250]),
        diagram('R', 'reactions'),
        diagram('V', 'shear'),
        diagram('M', 'moment'),
      ],
      [
        wire('P.load', 'R.loads'),
        wire('P.load', 'V.loads'), wire('z.value', 'V.z'),
        wire('P.load', 'M.loads'), wire('z.value', 'M.z'),
      ],
    );
    const evaluation = evaluateDocument(document, [CATALOGUE]);
    expect(numeric(valueAt(evaluation, 'R', 'R_A')).data[0]).toBeCloseTo(600, 9);
    expect(numeric(valueAt(evaluation, 'R', 'R_B')).data[0]).toBeCloseTo(400, 9);
    expect(numeric(valueAt(evaluation, 'V', 'V')).data).toEqual([600, 600, -400, -400, 0, 0]);
    numeric(valueAt(evaluation, 'M', 'M')).data.forEach((value, i) =>
      expect(value).toBeCloseTo([0, 30_000, 48_000, 20_000, 0, 0][i] as number, 6),
    );
  });

  it('take the resultant of the two planes, and leave the other plane out of a single-plane diagram', () => {
    const document = documentOf(
      [
        pointLoad('P', { at: q(80, 'mm'), Fx: q(300, 'N'), Fy: q(-400, 'N') }),
        input('z', scalar(80, 'mm')),
        diagram('Mx', 'moment', { plane: { kind: 'categorical', value: 'x' } }),
        diagram('My', 'moment', { plane: { kind: 'categorical', value: 'y' } }),
        diagram('M', 'moment', { plane: { kind: 'categorical', value: 'resultant' } }),
      ],
      ['Mx', 'My', 'M'].flatMap((id) => [wire('P.load', `${id}.loads`), wire('z.value', `${id}.z`)]),
    );
    const evaluation = evaluateDocument(document, [CATALOGUE]);
    const mx = numeric(valueAt(evaluation, 'Mx', 'M')).data[0] as number;
    const my = numeric(valueAt(evaluation, 'My', 'M')).data[0] as number;
    // An upward force between the supports hogs the shaft; a downward one sags it.
    expect(mx).toBeCloseTo(-300 * 0.6 * 80, 6);
    expect(my).toBeCloseTo(400 * 0.6 * 80, 6);
    expect(numeric(valueAt(evaluation, 'M', 'M')).data[0]).toBeCloseTo(Math.hypot(mx, my), 6);
  });

  it('step the moment by a couple at its position, and close it to zero at the far support', () => {
    // A 5000 N·mm couple alone at 50 mm: R_A = −25 N, R_B = +25 N.
    const document = documentOf(
      [
        pointLoad('C', { at: q(50, 'mm'), Cy: q(5000, 'Nmm') }),
        sweep([0, 49.999, 50, 200]),
        diagram('M', 'moment'),
      ],
      [wire('C.load', 'M.loads'), wire('z.value', 'M.z')],
    );
    const [start, before, after, end] = numeric(valueAt(evaluateDocument(document, [CATALOGUE]), 'M', 'M')).data as number[];
    expect(start).toBeCloseTo(0, 9);
    expect((after as number) - (before as number)).toBeCloseTo(5000, 1);
    expect(after).toBeCloseTo(-25 * 50 + 5000, 6);
    expect(end).toBeCloseTo(0, 6);
  });

  it('carry a distributed load: half of 2 N/mm over the whole span at each support', () => {
    const document = documentOf(
      [
        spanLoad('w', { from: q(0, 'mm'), to: q(200, 'mm'), qy: q(-2, 'N/mm') }),
        sweep([100, 200]),
        diagram('V', 'shear'),
        diagram('M', 'moment'),
      ],
      [wire('w.load', 'V.loads'), wire('z.value', 'V.z'), wire('w.load', 'M.loads'), wire('z.value', 'M.z')],
    );
    const evaluation = evaluateDocument(document, [CATALOGUE]);
    const [mid, end] = numeric(valueAt(evaluation, 'M', 'M')).data as number[];
    expect(numeric(valueAt(evaluation, 'V', 'V')).data[0]).toBeCloseTo(0, 9);
    expect(mid).toBeCloseTo((2 * 200 ** 2) / 8, 6); // q·L²/8, sagging
    expect(end).toBeCloseTo(0, 6);
  });

  it("draw the deflection zero at both supports, and refuse a distributed load's", () => {
    // EI = 1e6 N·mm²: the same −153.6 mm the v1 test worked by hand.
    const deflection = (load: JsonObject) =>
      documentOf(
        [load, sweep([0, 80, 200]), diagram('y', 'deflection', { E: scalar(1000, 'N/mm²'), I: scalar(1000, 'mm⁴') })],
        [wire(`${load['id'] as string}.load`, 'y.loads'), wire('z.value', 'y.z')],
      );
    const y = numeric(valueAt(evaluateDocument(deflection(pointLoad('P', { at: q(80, 'mm'), Fy: q(-1000, 'N') })), [CATALOGUE]), 'y', 'y')).data;
    expect(y[0]).toBeCloseTo(0, 9);
    expect(y[1]).toBeCloseTo(-153.6, 9);
    expect(y[2]).toBeCloseTo(0, 9);

    const span = spanLoad('w', { from: q(0, 'mm'), to: q(10, 'mm'), qy: q(-1, 'N/mm') });
    expect(() => evaluateDocument(deflection(span), [CATALOGUE])).toThrow(/y: a distributed load's deflection is not implemented/u);
  });

  it('sum torque at or before z, with no supports involved', () => {
    const document = documentOf(
      [
        pointLoad('in', { at: q(20, 'mm'), torque: q(40, 'Nm') }),
        pointLoad('out', { at: q(150, 'mm'), torque: q(-40, 'Nm') }),
        sweep([0, 20, 100, 150]),
        formulaNode('T', refTo('torque', CATALOGUE)),
      ],
      [wire('in.load', 'T.loads'), wire('out.load', 'T.loads'), wire('z.value', 'T.z')],
    );
    expect(numeric(valueAt(evaluateDocument(document, [CATALOGUE]), 'T', 'T')).data).toEqual([0, 40_000, 40_000, 0]);
  });

  it('broadcast a load moved along the shaft: one diagram value per position', () => {
    const document = documentOf(
      [input('p', list([50, 100, 150], 'mm')), pointLoad('P', { at: q(0, 'mm'), Fy: q(-100, 'N') }), input('z', scalar(100, 'mm')), diagram('M', 'moment')],
      [wire('p.value', 'P.at'), wire('P.load', 'M.loads'), wire('z.value', 'M.z')],
    );
    const M = numeric(valueAt(evaluateDocument(document, [CATALOGUE]), 'M', 'M'));
    expect(M.axes.map((axis) => axis.id)).toEqual(['p']);
    // 100 N down, read at mid-span: P·p·(L − z)/L before the load passes z, P·(L − p)·z/L after.
    M.data.forEach((value, i) => expect(value).toBeCloseTo([2500, 5000, 2500][i] as number, 6));
  });

  it('refuse two supports at one position, and a resultant reaction', () => {
    const P = pointLoad('P', { at: q(80, 'mm'), Fy: q(-10, 'N') });
    const same = documentOf([P, diagram('M', 'moment', { b: scalar(0, 'mm') })], [wire('P.load', 'M.loads')]);
    expect(() => evaluateDocument(same, [CATALOGUE])).toThrow(/both supports are at 0 mm/u);

    const resultant = documentOf(
      [P, diagram('R', 'reactions', { plane: { kind: 'categorical', value: 'resultant' } })],
      [wire('P.load', 'R.loads')],
    );
    expect(() => evaluateDocument(resultant, [CATALOGUE])).toThrow(/resultant/u);
  });
});
