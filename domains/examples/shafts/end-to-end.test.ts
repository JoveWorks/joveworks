/**
 * The Shafts catalogue and the kernel, end to end — the same shape as
 * `test/base-nodes-end-to-end.test.ts`, for the shafts domain's diagrams and
 * sizing formulas rather than the base library's arithmetic.
 *
 * Numbers are invented, not R&M's: the diagrams are checked against
 * closed-form beam results, not against any textbook's tables.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_SCHEMA_VERSION,
  formulaRef,
  loadCatalogue,
  parseDocument,
  serializeFormulaRef,
  type Catalogue,
  type GraphDocument,
  type JsonObject,
} from '@joveworks/schema';
import { baseCatalogueJson, arrayCatalogueJson } from '@joveworks/nodes';
import { evaluateDocument, valueAt, type NumericSeries } from '@joveworks/kernel';

const SHAFTS: Catalogue = loadCatalogue(readFileSync(new URL('../catalogues/shafts.json', import.meta.url), 'utf8'));
const BASE: Catalogue = loadCatalogue(baseCatalogueJson());
const ARRAY: Catalogue = loadCatalogue(arrayCatalogueJson());
const catalogues = [SHAFTS];
const withBaseNodes = [SHAFTS, BASE, ARRAY];

const NODE_IDS: Readonly<Record<string, string>> = {
  sectionModulus: 'mechanics.shaft.section-modulus', equivalentMoment: 'mechanics.shaft.equivalent-moment',
  requiredDiameter: 'mechanics.shaft.required-diameter', equivalentStress: 'mechanics.shaft.equivalent-stress',
  // One Shaft calculation answers all four; each test reads the output it is about.
  torque: 'mechanics.shaft.calculation', shear: 'mechanics.shaft.calculation', moment: 'mechanics.shaft.calculation',
  deflection: 'mechanics.shaft.calculation', reactions: 'mechanics.shaft.reactions',
  add: 'base.math.add', subtract: 'base.math.subtract', negate: 'base.math.negate', multiply: 'base.math.multiply', divide: 'base.math.divide',
  sum: 'base.array.sum',
};

const node = (
  id: string,
  operation: string,
  from: readonly Catalogue[] = catalogues,
  extra: JsonObject = {},
): JsonObject => {
  const wanted = NODE_IDS[operation] ?? operation;
  const formula = from
    .flatMap((catalogue) => catalogue.formulas)
    .find((entry) => entry.id === wanted);
  if (formula === undefined) throw new Error(`no node '${operation}'`);
  return {
    kind: 'formula',
    id,
    position: { x: 0, y: 0 },
    formula: serializeFormulaRef(formulaRef(formula)),
    ...extra,
  };
};

const input = (id: string, value: JsonObject, extra: JsonObject = {}): JsonObject => ({
  kind: 'input',
  id,
  position: { x: 0, y: 0 },
  value,
  ...extra,
});

const wire = (from: string, to: string): JsonObject => {
  const [fromNode = '', fromPort = ''] = from.split('.');
  const [toNode = '', toPort = ''] = to.split('.');
  return {
    id: `${from}->${to}`,
    from: { node: fromNode, port: fromPort },
    to: { node: toNode, port: toPort },
  };
};

const graph = (nodes: readonly JsonObject[], edges: readonly JsonObject[]): GraphDocument =>
  parseDocument({
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: 'shaft',
    title: 'Torque diagram',
    nodes: [...nodes],
    edges: [...edges],
    frames: [],
  });

const numeric = (value: ReturnType<typeof valueAt>): NumericSeries => {
  if (value === undefined || value.kind !== 'numeric') throw new Error('not a numeric series');
  return value;
};

describe('static shaft sizing formulas', () => {
  const scalar = (value: number, unit: string): JsonObject => ({ kind: 'scalar', value, unit });
  const first = (evaluation: ReturnType<typeof evaluateDocument>, nodeId: string, port: string): number => {
    const value = numeric(valueAt(evaluation, nodeId, port)).data[0];
    if (value === undefined) throw new Error(`no value at ${nodeId}.${port}`);
    return value;
  };

  it('gives the section moduli of a solid and a hollow shaft, with W_p = 2·W_b', () => {
    const evaluation = evaluateDocument(
      graph(
        [
          node('solid', 'sectionModulus', catalogues, { inputValues: { d: scalar(40, 'mm') } }),
          node('hollow', 'sectionModulus', catalogues, { inputValues: { d: scalar(40, 'mm'), d_i: scalar(20, 'mm') } }),
        ],
        [],
      ),
      catalogues,
    );
    const solid = (Math.PI * 40 ** 4) / (32 * 40);
    const hollow = (Math.PI * (40 ** 4 - 20 ** 4)) / (32 * 40);
    expect(first(evaluation, 'solid', 'W_b')).toBeCloseTo(solid, 6);
    expect(first(evaluation, 'solid', 'W_p')).toBeCloseTo(2 * solid, 6);
    expect(first(evaluation, 'hollow', 'W_b')).toBeCloseTo(hollow, 6);
    expect(first(evaluation, 'hollow', 'W_p')).toBeCloseTo(2 * hollow, 6);
  });

  it('combines a moment with and without torque into an equivalent moment', () => {
    const evaluation = evaluateDocument(
      graph(
        [
          node('bendingOnly', 'equivalentMoment', catalogues, { inputValues: { M: scalar(3000, 'Nmm') } }),
          node('combined', 'equivalentMoment', catalogues, {
            inputValues: { M: scalar(3000, 'Nmm'), T: scalar(4000, 'Nmm') },
          }),
        ],
        [],
      ),
      catalogues,
    );
    expect(first(evaluation, 'bendingOnly', 'M_v')).toBeCloseTo(3000, 9);
    expect(first(evaluation, 'combined', 'M_v')).toBeCloseTo(Math.sqrt(3000 ** 2 + 0.75 * 4000 ** 2), 9);
  });

  it("returns the allowable stress when the required diameter's section carries the moment", () => {
    const evaluation = evaluateDocument(
      graph(
        [
          input('M_v', scalar(250_000, 'Nmm')),
          input('sigma', scalar(70, 'N/mm²')),
          node('d', 'requiredDiameter'),
          node('W', 'sectionModulus'),
          node('stress', 'divide', withBaseNodes),
        ],
        [
          wire('M_v.value', 'd.M_v'), wire('sigma.value', 'd.sigma_allow'),
          wire('d.d', 'W.d'),
          wire('M_v.value', 'stress.a'), wire('W.W_b', 'stress.b'),
        ],
      ),
      withBaseNodes,
    );
    expect(first(evaluation, 'stress', 'quotient')).toBeCloseTo(70, 9);
  });

  it('agrees with the equivalent moment over W_b when τ_t = T / W_p', () => {
    const evaluation = evaluateDocument(
      graph(
        [
          input('M', scalar(120_000, 'Nmm')),
          input('T', scalar(90_000, 'Nmm')),
          node('W', 'sectionModulus', catalogues, { inputValues: { d: scalar(25, 'mm') } }),
          node('Mv', 'equivalentMoment'),
          node('viaMoment', 'divide', withBaseNodes),
          node('sigmaB', 'divide', withBaseNodes),
          node('tauT', 'divide', withBaseNodes),
          node('sv', 'equivalentStress'),
        ],
        [
          wire('M.value', 'Mv.M'), wire('T.value', 'Mv.T'),
          wire('Mv.M_v', 'viaMoment.a'), wire('W.W_b', 'viaMoment.b'),
          wire('M.value', 'sigmaB.a'), wire('W.W_b', 'sigmaB.b'),
          wire('T.value', 'tauT.a'), wire('W.W_p', 'tauT.b'),
          wire('sigmaB.quotient', 'sv.sigma_b'), wire('tauT.quotient', 'sv.tau_t'),
        ],
      ),
      withBaseNodes,
    );
    expect(first(evaluation, 'sv', 'sigma_v')).toBeCloseTo(first(evaluation, 'viaMoment', 'quotient'), 9);
  });
});

describe('shaft diagrams on Load, Support and Shaft nodes', () => {
  const q = (value: number, unit: string): JsonObject => ({ value, unit });
  const at = { x: 0, y: 0 };
  const load = (id: string, fields: JsonObject): JsonObject => ({ kind: 'load', id, position: at, ...fields });
  const span = (id: string, fields: JsonObject): JsonObject => ({ kind: 'distributedLoad', id, position: at, ...fields });
  const support = (id: string, position: number, type = 'simple'): JsonObject => ({ kind: 'support', id, position: at, at: q(position, 'mm'), support: type });
  const scalar = (value: number, unit: string): JsonObject => ({ kind: 'scalar', value, unit });
  const plane = (value: string): JsonObject => ({ kind: 'categorical', value });
  /** 200 mm long, EI = 1e6 N·mm². */
  const shaft = (length = 200): JsonObject => ({
    kind: 'shaft', id: 'S', position: at, from: q(0, 'mm'), to: q(length, 'mm'), count: 5,
    E: q(1000, 'N/mm²'), section: { kind: 'secondMoment', I: q(1000, 'mm⁴') },
  });
  const diagram = (id: string, operation: string, values: JsonObject = {}): JsonObject =>
    node(id, operation, catalogues, Object.keys(values).length === 0 ? {} : { inputValues: values });
  /** The shaft, everything in `acting` into every diagram, and `zs` into each diagram's z. */
  const study = (
    acting: readonly JsonObject[],
    diagrams: readonly JsonObject[],
    zs?: readonly number[],
    extra: { readonly nodes?: readonly JsonObject[]; readonly edges?: readonly JsonObject[] } = {},
  ): GraphDocument => {
    const ids = diagrams.map((entry) => entry['id'] as string);
    return graph(
      [shaft(), ...acting, ...diagrams, ...(zs === undefined ? [] : [input('z', { kind: 'list', values: [...zs], unit: 'mm' })]), ...(extra.nodes ?? [])],
      [
        ...ids.flatMap((id) => [
          ...acting.map((entry) => wire(`${entry['id'] as string}.${entry['kind'] === 'support' ? 'support' : 'load'}`, `${id}.acting`)),
          wire('S.shaft', `${id}.shaft`),
          ...(zs === undefined || id.startsWith('R') ? [] : [wire('z.value', `${id}.z`)]),
        ]),
        ...(extra.edges ?? []),
      ],
    );
  };
  const data = (evaluation: ReturnType<typeof evaluateDocument>, nodeId: string, port: string): readonly number[] =>
    numeric(valueAt(evaluation, nodeId, port)).data;
  const A = support('A', 0);
  const B = support('B', 200);

  it('rebuilds the 600 N / 400 N case with one Load node and two Support nodes, nothing wired back', () => {
    const document = study(
      [load('P', { at: q(80, 'mm'), Fy: q(-1000, 'N') }), A, B],
      [diagram('RA', 'reactions'), diagram('RB', 'reactions'), diagram('V', 'shear'), diagram('M', 'moment')],
      [0, 50, 80, 150, 200, 250],
      { edges: [wire('A.support', 'RA.support'), wire('B.support', 'RB.support')] },
    );
    const evaluation = evaluateDocument(document, catalogues);
    expect(data(evaluation, 'RA', 'R')[0]).toBeCloseTo(600, 6);
    expect(data(evaluation, 'RB', 'R')[0]).toBeCloseTo(400, 6);
    data(evaluation, 'V', 'V').forEach((value, i) => expect(value).toBeCloseTo([600, 600, -400, -400, 0, 0][i] as number, 6));
    data(evaluation, 'M', 'M').forEach((value, i) => expect(value).toBeCloseTo([0, 30000, 48000, 20000, 0, 0][i] as number, 4));
  });

  it('closes the moment past an overhanging load and the far support', () => {
    const document = study(
      [load('mid', { at: q(120, 'mm'), Fy: q(-300, 'N') }), load('tip', { at: q(260, 'mm'), Fy: q(-200, 'N') }), A, B],
      [diagram('M', 'moment')],
      [200, 300],
    );
    const [overB, beyond] = data(evaluateDocument(document, catalogues), 'M', 'M') as number[];
    expect(overB).toBeCloseTo(-12_000, 4); // the overhang hogs the shaft: −200 N × 60 mm
    expect(beyond).toBeCloseTo(0, 4);
  });

  it('draws the resultant as √(M_x² + M_y²) of the two single-plane diagrams', () => {
    const document = study(
      [load('gear', { at: q(80, 'mm'), Fx: q(350, 'N'), Fy: q(-900, 'N') }), A, B],
      [diagram('Mx', 'moment', { plane: plane('x') }), diagram('My', 'moment', { plane: plane('y') }), diagram('M', 'moment', { plane: plane('resultant') })],
      [40, 80, 160],
    );
    const evaluation = evaluateDocument(document, catalogues);
    const mx = data(evaluation, 'Mx', 'M');
    const my = data(evaluation, 'My', 'M');
    data(evaluation, 'M', 'M').forEach((value, i) => expect(value).toBeCloseTo(Math.hypot(mx[i] as number, my[i] as number), 4));
  });

  it('steps the moment by a couple alone, and closes it at the far support', () => {
    const document = study([load('C', { at: q(120, 'mm'), Cx: q(3, 'Nm') }), A, B], [diagram('M', 'moment', { plane: plane('x') })], [0, 119.99, 120, 200]);
    const [start, before, after, end] = data(evaluateDocument(document, catalogues), 'M', 'M') as number[];
    expect(start).toBeCloseTo(0, 6);
    expect((after as number) - (before as number)).toBeCloseTo(3000, 0);
    expect(end).toBeCloseTo(0, 4);
  });

  it('gives a Distributed load the closed-form shear and moment of a uniformly loaded span', () => {
    // −3 N/mm from 40 to 160 mm on simple supports at 0 and 200 mm: R_A = R_B = 180 N.
    const zs = [20, 60, 100, 150];
    const document = study(
      [span('w', { from: q(40, 'mm'), to: q(160, 'mm'), qy: q(-3, 'N/mm') }), A, B],
      [diagram('V', 'shear'), diagram('M', 'moment')],
      zs,
    );
    const evaluation = evaluateDocument(document, catalogues);
    const shear = (z: number): number => 180 - 3 * Math.min(Math.max(z - 40, 0), 120);
    const moment = (z: number): number => 180 * z - 1.5 * Math.min(Math.max(z - 40, 0), 120) ** 2 - (z > 160 ? 360 * (z - 160) : 0);
    data(evaluation, 'V', 'V').forEach((value, i) => expect(value).toBeCloseTo(shear(zs[i] as number), 6));
    data(evaluation, 'M', 'M').forEach((value, i) => expect(value).toBeCloseTo(moment(zs[i] as number), 4));
  });

  it('gives the closed-form deflection of a simply supported shaft under a point load', () => {
    // P = 1000 N down at a = 80 mm, L = 200 mm, EI = 1e6 N·mm²; for z ≤ a,
    // y = −P·b·z·(L² − b² − z²) / (6·L·EI), b = L − a.
    const document = study([load('P', { at: q(80, 'mm'), Fy: q(-1000, 'N') }), A, B], [diagram('y', 'deflection')], [0, 40, 80, 200]);
    const [atA, quarter, underLoad, atB] = data(evaluateDocument(document, catalogues), 'y', 'y');
    expect(atA).toBeCloseTo(0, 9);
    expect(quarter).toBeCloseTo(-96, 9);
    expect(underLoad).toBeCloseTo(-153.6, 9);
    expect(atB).toBeCloseTo(0, 9);
  });

  it('chains the resultant moment into a required diameter along the shaft, and Select finds the governing size', () => {
    const document = study(
      [load('gear', { at: q(70, 'mm'), Fx: q(400, 'N'), Fy: q(-1100, 'N'), torque: q(45, 'Nm') }), load('coupling', { at: q(200, 'mm'), torque: q(-45, 'Nm') }), A, B],
      [diagram('M', 'moment', { plane: plane('resultant') }), diagram('T', 'torque')],
      undefined,
      {
        nodes: [
          node('Mv', 'equivalentMoment'),
          node('d', 'requiredDiameter', catalogues, { inputValues: { sigma_allow: scalar(60, 'N/mm²') } }),
          { kind: 'select', id: 'governing', position: at, mode: 'argMax' },
        ],
        edges: [wire('M.M', 'Mv.M'), wire('T.T', 'Mv.T'), wire('Mv.M_v', 'd.M_v'), wire('d.d', 'governing.value'), wire('S.z', 'governing.along')],
      },
    );
    const evaluation = evaluateDocument(document, withBaseNodes);
    const d = data(evaluation, 'd', 'd');
    const zs = data(evaluation, 'S', 'z');
    expect(d).toHaveLength(zs.length);
    expect(numeric(valueAt(evaluation, 'governing', 'at')).data[0]).toBe(zs[d.indexOf(Math.max(...d))]);
    expect(numeric(valueAt(evaluation, 'governing', 'best')).data[0]).toBeCloseTo(Math.max(...d), 9);
  });
});
