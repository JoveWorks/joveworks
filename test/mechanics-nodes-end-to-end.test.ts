/**
 * The mechanics node library and the kernel, end to end — the same shape as
 * `base-nodes-end-to-end.test.ts`, for `MECHANICS_CATALOGUE`'s piecewise
 * diagrams (ROADMAP item 8) rather than `BASE_CATALOGUE`'s arithmetic.
 *
 * Numbers are invented, not R&M's — `shaftTorque` is generic mechanics, but
 * this file keeps the same discipline as everything else that touches a
 * shaft, since the shaft feature as a whole will grow catalogue-backed
 * neighbours.
 */

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
import { baseCatalogueJson, arrayCatalogueJson, mechanicsCatalogueJson, mechanicsLegacyCatalogueJson } from '@joveworks/nodes';
import { evaluateDocument, valueAt, type NumericSeries } from '@joveworks/kernel';

const MECHANICS: Catalogue = loadCatalogue(mechanicsCatalogueJson());
const LEGACY: Catalogue = loadCatalogue(mechanicsLegacyCatalogueJson());
const BASE: Catalogue = loadCatalogue(baseCatalogueJson());
const ARRAY: Catalogue = loadCatalogue(arrayCatalogueJson());
// The order the app loads them in (`builtInCatalogues`): current first, the
// shipped v1 records after, so a v1 reference still resolves exactly.
const catalogues = [MECHANICS, LEGACY];
const withBaseNodes = [MECHANICS, LEGACY, BASE, ARRAY];

const NODE_IDS: Readonly<Record<string, string>> = {
  shaftTorque: 'mechanics.shaft.torque', shaftShear: 'mechanics.shaft.shear', shaftMoment: 'mechanics.shaft.moment',
  shaftDeflectionTerm: 'mechanics.shaft.deflection-term', shaftDeflection: 'mechanics.shaft.deflection',
  shaftDistributedShear: 'mechanics.shaft.distributed-shear', shaftDistributedMoment: 'mechanics.shaft.distributed-moment',
  sectionModulus: 'mechanics.shaft.section-modulus', equivalentMoment: 'mechanics.shaft.equivalent-moment',
  requiredDiameter: 'mechanics.shaft.required-diameter', equivalentStress: 'mechanics.shaft.equivalent-stress',
  // One Shaft calculation answers all four; each test reads the output it is about.
  torque: 'mechanics.shaft.calculation', shear: 'mechanics.shaft.calculation', moment: 'mechanics.shaft.calculation',
  deflection: 'mechanics.shaft.calculation', reactions: 'mechanics.shaft.reactions',
  add: 'base.math.add', subtract: 'base.math.subtract', negate: 'base.math.negate', multiply: 'base.math.multiply', divide: 'base.math.divide',
  sum: 'base.array.sum',
};

/**
 * The v1 names (`shaftTorque`, …) build the shipped records a saved NodeBook
 * holds; the bare names (`torque`, …) build their v2 successors.
 */
const V1 = new Set([
  'shaftTorque', 'shaftShear', 'shaftMoment', 'shaftDeflectionTerm', 'shaftDeflection',
  'shaftDistributedShear', 'shaftDistributedMoment',
]);

const node = (
  id: string,
  operation: string,
  from: readonly Catalogue[] = catalogues,
  extra: JsonObject = {},
): JsonObject => {
  const wanted = NODE_IDS[operation] ?? operation;
  const formula = from
    .flatMap((catalogue) => catalogue.formulas)
    .find((entry) => entry.id === wanted && (!V1.has(operation) || entry.version === 1));
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

describe('the mechanics node library through the kernel', () => {
  it("computes shaftTorque's step function at several swept positions", () => {
    // 500 N·mm applied at z = 0 mm, taken off again (-500 N·mm) at z = 100 mm.
    const document = graph(
      [
        input('position0', { kind: 'scalar', value: 0, unit: 'mm' }),
        input('position1', { kind: 'scalar', value: 100, unit: 'mm' }),
        input('torque0', { kind: 'scalar', value: 500, unit: 'Nmm' }),
        input('torque1', { kind: 'scalar', value: -500, unit: 'Nmm' }),
        input('z', { kind: 'list', values: [0, 50, 100, 150], unit: 'mm' }),
        node('T', 'shaftTorque'),
      ],
      [
        wire('position0.value', 'T.position'),
        wire('position1.value', 'T.position'),
        wire('torque0.value', 'T.torque'),
        wire('torque1.value', 'T.torque'),
        wire('z.value', 'T.z'),
      ],
    );
    expect(numeric(valueAt(evaluateDocument(document, catalogues), 'T', 'T')).data).toEqual([
      500, 500, 0, 0,
    ]);
  });

  it("solves both a 2-support beam's reactions from shaftMoment and base nodes, then folds them into physically-correct shear/moment diagrams", () => {
    // A single downward point load of 1000 N (F = −1000, this file's sign
    // convention), 80 mm from support A, on a 200 mm span (A at 0, B at 200).
    // Standard simply-supported-beam result: Ra = P·(L−x)/L = 600 N,
    // Rb = P·x/L = 400 N, both upward (positive) — worked by hand, not from
    // a book, since this is generic statics rather than R&M content.
    const nodes: JsonObject[] = [
      input('position', { kind: 'scalar', value: 80, unit: 'mm' }),
      input('force', { kind: 'scalar', value: -1000, unit: 'N' }),
      input('supportA', { kind: 'scalar', value: 0, unit: 'mm' }),
      input('supportB', { kind: 'scalar', value: 200, unit: 'mm' }),

      // The moment of the applied load alone about support B, with no
      // reactions wired in — the quantity a reaction is solved from.
      node('momentAtB', 'shaftMoment', catalogues, {
        inputValues: { z: { kind: 'scalar', value: 200, unit: 'mm' } },
      }),
      node('span', 'subtract', withBaseNodes),
      node('reactionARaw', 'divide', withBaseNodes),
      node('reactionA', 'negate', withBaseNodes),
      node('loadTotal', 'sum', withBaseNodes),
      node('negLoadTotal', 'negate', withBaseNodes),
      node('reactionB', 'subtract', withBaseNodes),

      // The real diagrams: both supports' reactions folded in alongside the
      // applied load, swept across and beyond the span.
      node('shear', 'shaftShear'),
      node('moment', 'shaftMoment'),
      input('z', { kind: 'list', values: [0, 50, 80, 150, 200, 250], unit: 'mm' }),
    ];
    const edges: JsonObject[] = [
      wire('position.value', 'momentAtB.position'),
      wire('force.value', 'momentAtB.force'),

      wire('supportB.value', 'span.a'),
      wire('supportA.value', 'span.b'),
      wire('momentAtB.M', 'reactionARaw.a'),
      wire('span.difference', 'reactionARaw.b'),
      wire('reactionARaw.quotient', 'reactionA.a'),

      wire('force.value', 'loadTotal.xs'),
      wire('loadTotal.total', 'negLoadTotal.a'),
      wire('negLoadTotal.negated', 'reactionB.a'),
      wire('reactionA.negated', 'reactionB.b'),

      wire('z.value', 'shear.z'),
      wire('position.value', 'shear.position'),
      wire('force.value', 'shear.force'),
      wire('supportA.value', 'shear.supportA'),
      wire('reactionA.negated', 'shear.reactionA'),
      wire('supportB.value', 'shear.supportB'),
      wire('reactionB.difference', 'shear.reactionB'),

      wire('z.value', 'moment.z'),
      wire('position.value', 'moment.position'),
      wire('force.value', 'moment.force'),
      wire('supportA.value', 'moment.supportA'),
      wire('reactionA.negated', 'moment.reactionA'),
      wire('supportB.value', 'moment.supportB'),
      wire('reactionB.difference', 'moment.reactionB'),
    ];
    const document = graph(nodes, edges);
    const evaluation = evaluateDocument(document, withBaseNodes);

    expect(numeric(valueAt(evaluation, 'reactionA', 'negated')).data[0]).toBeCloseTo(600);
    expect(numeric(valueAt(evaluation, 'reactionB', 'difference')).data[0]).toBeCloseTo(400);

    // z = [0, 50, 80, 150, 200, 250]. A breakpoint counts "at or before" z,
    // so the load's own −1000 N already applies at z = 80 itself: Ra alone
    // (600 N) up to but not through 80, Ra+F (−400 N) from 80 up to 200,
    // back to 0 at/after support B.
    expect(numeric(valueAt(evaluation, 'shear', 'V')).data).toEqual([600, 600, -400, -400, 0, 0]);

    // Zero at support A (z=0) and support B (z=200); 48 000 N·mm under the
    // load (Ra·80); 20 000 N·mm at z=150 (Ra·150 − 1000·70).
    expect(numeric(valueAt(evaluation, 'moment', 'M')).data).toEqual([
      0, 30000, 48000, 20000, 0, 0,
    ]);
  });

  it('combines a point load and a distributed load via an ordinary add node', () => {
    // A −1000 N point load at z = 80 mm (no supports wired — this checks
    // superposition, not a realistic supported beam), plus a −2 N/mm
    // distributed load from z = 100 to 140 mm (−80 N total).
    const nodes: JsonObject[] = [
      input('position', { kind: 'scalar', value: 80, unit: 'mm' }),
      input('force', { kind: 'scalar', value: -1000, unit: 'N' }),
      input('start', { kind: 'scalar', value: 100, unit: 'mm' }),
      input('end', { kind: 'scalar', value: 140, unit: 'mm' }),
      input('rate', { kind: 'scalar', value: -2, unit: 'N/mm' }),
      input('z', { kind: 'list', values: [50, 90, 120, 200], unit: 'mm' }),
      node('pointShear', 'shaftShear'),
      node('distShear', 'shaftDistributedShear'),
      node('shear', 'add', withBaseNodes),
      node('pointMoment', 'shaftMoment'),
      node('distMoment', 'shaftDistributedMoment'),
      node('moment', 'add', withBaseNodes),
    ];
    const edges: JsonObject[] = [
      wire('z.value', 'pointShear.z'), wire('position.value', 'pointShear.position'), wire('force.value', 'pointShear.force'),
      wire('z.value', 'distShear.z'), wire('start.value', 'distShear.start'), wire('end.value', 'distShear.end'), wire('rate.value', 'distShear.rate'),
      wire('pointShear.V', 'shear.a'), wire('distShear.V', 'shear.b'),

      wire('z.value', 'pointMoment.z'), wire('position.value', 'pointMoment.position'), wire('force.value', 'pointMoment.force'),
      wire('z.value', 'distMoment.z'), wire('start.value', 'distMoment.start'), wire('end.value', 'distMoment.end'), wire('rate.value', 'distMoment.rate'),
      wire('pointMoment.M', 'moment.a'), wire('distMoment.M', 'moment.b'),
    ];
    const evaluation = evaluateDocument(graph(nodes, edges), withBaseNodes);

    // z=50: both 0. z=90: point only, −1000. z=120: −1000 + (−2·20) = −1040.
    // z=200: −1000 + (−2·40, clamped to the span) = −1080.
    expect(numeric(valueAt(evaluation, 'shear', 'sum')).data).toEqual([0, -1000, -1040, -1080]);

    // z=200: point moment −1000·(200−80) = −120000; distributed moment
    // −2·40·(200−100−20) = −6400; combined −126400.
    expect(numeric(valueAt(evaluation, 'moment', 'sum')).data[3]).toBe(-126400);
  });

  it("solves a 2-support beam's deflection curve from shaftDeflectionTerm, the same reactions as above, and base nodes", () => {
    // Same beam as the reaction/shear/moment test: −1000 N at z = 80 mm,
    // supports at 0 and 200 mm, Ra = 600 N, Rb = 400 N.
    //
    // EI·y(z) = S(z)/6 + C1·z + C2, S(z) = shaftDeflectionTerm's raw
    // Σ force·(z − position)³ over breakpoints at or before z (reactions
    // included as breakpoints, same as the moment diagram) — shaftMoment
    // integrated twice more, so this is the same "evaluate at a support's
    // own position to get an equation, solve with base nodes" trick the
    // reactions themselves used, just with two equations (one per support,
    // both from y = 0) instead of one.
    //
    // By hand: S(0) = 0 (only supportA's own breakpoint qualifies, and its
    // own arm is zero) ⇒ C2 = 0. S(200) = 600·200³ + (−1000)·120³ =
    // 4 800 000 000 − 1 728 000 000 = 3 072 000 000 ⇒ S(200)/6 = 512 000 000
    // ⇒ C1 = −512 000 000 / 200 = −2 560 000. At z = 80: S(80) = 600·80³ =
    // 307 200 000 ⇒ S(80)/6 = 51 200 000 ⇒ EI·y(80) = 51 200 000 +
    // (−2 560 000)·80 = −153 600 000. With E = 1000 N/mm², I = 1000 mm⁴
    // (EI = 1 000 000 N·mm², invented — no cross-section formula exists
    // yet), y(80) = −153.6 mm.
    const nodes: JsonObject[] = [
      input('position', { kind: 'scalar', value: 80, unit: 'mm' }),
      input('force', { kind: 'scalar', value: -1000, unit: 'N' }),
      input('supportA', { kind: 'scalar', value: 0, unit: 'mm' }),
      input('supportB', { kind: 'scalar', value: 200, unit: 'mm' }),

      node('momentAtB', 'shaftMoment', catalogues, {
        inputValues: { z: { kind: 'scalar', value: 200, unit: 'mm' } },
      }),
      node('span', 'subtract', withBaseNodes),
      node('reactionARaw', 'divide', withBaseNodes),
      node('reactionA', 'negate', withBaseNodes),
      node('loadTotal', 'sum', withBaseNodes),
      node('negLoadTotal', 'negate', withBaseNodes),
      node('reactionB', 'subtract', withBaseNodes),

      // S(a) and S(b), the two boundary equations' left-hand terms.
      node('termAtA', 'shaftDeflectionTerm', catalogues, {
        inputValues: { z: { kind: 'scalar', value: 0, unit: 'mm' } },
      }),
      node('termAtB', 'shaftDeflectionTerm', catalogues, {
        inputValues: { z: { kind: 'scalar', value: 200, unit: 'mm' } },
      }),
      input('six', { kind: 'scalar', value: 6, unit: '' }),
      node('sA', 'divide', withBaseNodes),
      node('sB', 'divide', withBaseNodes),

      // C1 = (S(a) − S(b)) / (b − a); C2 = −(S(a) + C1·a).
      node('sDiff', 'subtract', withBaseNodes),
      node('c1', 'divide', withBaseNodes),
      node('c1A', 'multiply', withBaseNodes),
      node('c2Raw', 'add', withBaseNodes),
      node('c2', 'negate', withBaseNodes),

      // The swept curve: (S(z)/6 + C1·z + C2) / EI.
      input('z', { kind: 'list', values: [0, 80, 200], unit: 'mm' }),
      node('termSwept', 'shaftDeflectionTerm', catalogues),
      node('sSwept', 'divide', withBaseNodes),
      node('c1Z', 'multiply', withBaseNodes),
      node('withC1', 'add', withBaseNodes),
      node('eiY', 'add', withBaseNodes),
      input('E', { kind: 'scalar', value: 1000, unit: 'N/mm²' }),
      input('I', { kind: 'scalar', value: 1000, unit: 'mm⁴' }),
      node('EI', 'multiply', withBaseNodes),
      node('y', 'divide', withBaseNodes),
    ];
    const edges: JsonObject[] = [
      wire('position.value', 'momentAtB.position'),
      wire('force.value', 'momentAtB.force'),
      wire('supportB.value', 'span.a'),
      wire('supportA.value', 'span.b'),
      wire('momentAtB.M', 'reactionARaw.a'),
      wire('span.difference', 'reactionARaw.b'),
      wire('reactionARaw.quotient', 'reactionA.a'),
      wire('force.value', 'loadTotal.xs'),
      wire('loadTotal.total', 'negLoadTotal.a'),
      wire('negLoadTotal.negated', 'reactionB.a'),
      wire('reactionA.negated', 'reactionB.b'),

      wire('position.value', 'termAtA.position'), wire('force.value', 'termAtA.force'),
      wire('supportA.value', 'termAtA.supportA'), wire('reactionA.negated', 'termAtA.reactionA'),
      wire('supportB.value', 'termAtA.supportB'), wire('reactionB.difference', 'termAtA.reactionB'),

      wire('position.value', 'termAtB.position'), wire('force.value', 'termAtB.force'),
      wire('supportA.value', 'termAtB.supportA'), wire('reactionA.negated', 'termAtB.reactionA'),
      wire('supportB.value', 'termAtB.supportB'), wire('reactionB.difference', 'termAtB.reactionB'),

      wire('termAtA.S', 'sA.a'), wire('six.value', 'sA.b'),
      wire('termAtB.S', 'sB.a'), wire('six.value', 'sB.b'),

      wire('sA.quotient', 'sDiff.a'), wire('sB.quotient', 'sDiff.b'),
      wire('sDiff.difference', 'c1.a'), wire('span.difference', 'c1.b'),
      wire('c1.quotient', 'c1A.a'), wire('supportA.value', 'c1A.b'),
      wire('sA.quotient', 'c2Raw.a'), wire('c1A.product', 'c2Raw.b'),
      wire('c2Raw.sum', 'c2.a'),

      wire('z.value', 'termSwept.z'), wire('position.value', 'termSwept.position'), wire('force.value', 'termSwept.force'),
      wire('supportA.value', 'termSwept.supportA'), wire('reactionA.negated', 'termSwept.reactionA'),
      wire('supportB.value', 'termSwept.supportB'), wire('reactionB.difference', 'termSwept.reactionB'),
      wire('termSwept.S', 'sSwept.a'), wire('six.value', 'sSwept.b'),
      wire('c1.quotient', 'c1Z.a'), wire('z.value', 'c1Z.b'),
      wire('sSwept.quotient', 'withC1.a'), wire('c1Z.product', 'withC1.b'),
      wire('withC1.sum', 'eiY.a'), wire('c2.negated', 'eiY.b'),
      wire('E.value', 'EI.a'), wire('I.value', 'EI.b'),
      wire('eiY.sum', 'y.a'), wire('EI.product', 'y.b'),
    ];
    const evaluation = evaluateDocument(graph(nodes, edges), withBaseNodes);

    expect(numeric(valueAt(evaluation, 'c1', 'quotient')).data[0]).toBeCloseTo(-2_560_000);
    expect(numeric(valueAt(evaluation, 'c2', 'negated')).data[0]).toBeCloseTo(0);

    const y = numeric(valueAt(evaluation, 'y', 'quotient')).data;
    expect(y[0]).toBeCloseTo(0); // support A
    expect(y[1]).toBeCloseTo(-153.6); // under the load
    expect(y[2]).toBeCloseTo(0); // support B
  });

  it('shaftDeflection reproduces the same curve as the manual shaftDeflectionTerm composition, in one node', () => {
    // Same beam, same reactions (600 N / 400 N) — this time E and I are
    // wired straight into shaftDeflection instead of composing the
    // boundary-value solve by hand. Genuinely checks the curve is zero at
    // both supports (not just "zero because I forgot the correction"),
    // matching the −153.6 mm computed above.
    const nodes: JsonObject[] = [
      input('position', { kind: 'scalar', value: 80, unit: 'mm' }),
      input('force', { kind: 'scalar', value: -1000, unit: 'N' }),
      input('supportA', { kind: 'scalar', value: 0, unit: 'mm' }),
      input('supportB', { kind: 'scalar', value: 200, unit: 'mm' }),

      node('momentAtB', 'shaftMoment', catalogues, {
        inputValues: { z: { kind: 'scalar', value: 200, unit: 'mm' } },
      }),
      node('span', 'subtract', withBaseNodes),
      node('reactionARaw', 'divide', withBaseNodes),
      node('reactionA', 'negate', withBaseNodes),
      node('loadTotal', 'sum', withBaseNodes),
      node('negLoadTotal', 'negate', withBaseNodes),
      node('reactionB', 'subtract', withBaseNodes),

      input('z', { kind: 'list', values: [0, 80, 200], unit: 'mm' }),
      input('E', { kind: 'scalar', value: 1000, unit: 'N/mm²' }),
      input('I', { kind: 'scalar', value: 1000, unit: 'mm⁴' }),
      node('y', 'shaftDeflection'),
    ];
    const edges: JsonObject[] = [
      wire('position.value', 'momentAtB.position'),
      wire('force.value', 'momentAtB.force'),
      wire('supportB.value', 'span.a'),
      wire('supportA.value', 'span.b'),
      wire('momentAtB.M', 'reactionARaw.a'),
      wire('span.difference', 'reactionARaw.b'),
      wire('reactionARaw.quotient', 'reactionA.a'),
      wire('force.value', 'loadTotal.xs'),
      wire('loadTotal.total', 'negLoadTotal.a'),
      wire('negLoadTotal.negated', 'reactionB.a'),
      wire('reactionA.negated', 'reactionB.b'),

      wire('z.value', 'y.z'), wire('position.value', 'y.position'), wire('force.value', 'y.force'),
      wire('supportA.value', 'y.supportA'), wire('reactionA.negated', 'y.reactionA'),
      wire('supportB.value', 'y.supportB'), wire('reactionB.difference', 'y.reactionB'),
      wire('E.value', 'y.E'), wire('I.value', 'y.I'),
    ];
    const evaluation = evaluateDocument(graph(nodes, edges), withBaseNodes);

    expect(numeric(valueAt(evaluation, 'y', 'y')).data).toEqual([0, -153.6, 0]);
  });
});

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
  /** 200 mm long, EI = 1e6 N·mm² — the v1 tests' own beam. */
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

  it('keeps a NodeBook saved against the v1 records evaluating, without a formulaChanged warning', () => {
    const document = graph(
      [
        input('position', { kind: 'scalar', value: 80, unit: 'mm' }),
        input('force', { kind: 'scalar', value: -1000, unit: 'N' }),
        input('z', { kind: 'list', values: [0, 80, 200], unit: 'mm' }),
        node('V', 'shaftShear', catalogues, {
          inputValues: {
            supportA: scalar(0, 'mm'), reactionA: scalar(600, 'N'), supportB: scalar(200, 'mm'), reactionB: scalar(400, 'N'),
          },
        }),
      ],
      [wire('position.value', 'V.position'), wire('force.value', 'V.force'), wire('z.value', 'V.z')],
    );
    const evaluation = evaluateDocument(document, withBaseNodes);
    expect(evaluation.resolution.formulas.get('V')?.version).toBe(1);
    expect(evaluation.warnings.filter((warning) => warning.kind === 'formulaChanged')).toEqual([]);
    expect(data(evaluation, 'V', 'V')).toEqual([600, -400, 0]);
  });

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

  it("gives a Distributed load the same shear and moment as v1's distributed-shear/moment composition", () => {
    // −3 N/mm from 40 to 160 mm: R_A = R_B = 180 N. v1 adds the reactions by hand.
    const zs = [20, 60, 100, 150, 200];
    const document = study(
      [span('w', { from: q(40, 'mm'), to: q(160, 'mm'), qy: q(-3, 'N/mm') }), A, B],
      [diagram('V', 'shear'), diagram('M', 'moment')],
      zs,
      {
        nodes: [
          input('start', { kind: 'scalar', value: 40, unit: 'mm' }),
          input('end', { kind: 'scalar', value: 160, unit: 'mm' }),
          input('rate', { kind: 'scalar', value: -3, unit: 'N/mm' }),
          // v1 needs at least one point load wired; a zero one changes nothing.
          input('noPosition', { kind: 'scalar', value: 0, unit: 'mm' }),
          input('noForce', { kind: 'scalar', value: 0, unit: 'N' }),
          node('dV', 'shaftDistributedShear'),
          node('dM', 'shaftDistributedMoment'),
          ...['rV', 'rM'].map((id) =>
            node(id, id === 'rV' ? 'shaftShear' : 'shaftMoment', catalogues, {
              inputValues: { supportA: scalar(0, 'mm'), reactionA: scalar(180, 'N'), supportB: scalar(200, 'mm'), reactionB: scalar(180, 'N') },
            }),
          ),
          node('v1V', 'add', withBaseNodes),
          node('v1M', 'add', withBaseNodes),
        ],
        edges: [
          ...['dV', 'dM'].flatMap((id) => [wire('z.value', `${id}.z`), wire('start.value', `${id}.start`), wire('end.value', `${id}.end`), wire('rate.value', `${id}.rate`)]),
          ...['rV', 'rM'].flatMap((id) => [wire('z.value', `${id}.z`), wire('noPosition.value', `${id}.position`), wire('noForce.value', `${id}.force`)]),
          wire('rV.V', 'v1V.a'), wire('dV.V', 'v1V.b'), wire('rM.M', 'v1M.a'), wire('dM.M', 'v1M.b'),
        ],
      },
    );
    const evaluation = evaluateDocument(document, withBaseNodes);
    const v1V = data(evaluation, 'v1V', 'sum');
    const v1M = data(evaluation, 'v1M', 'sum');
    data(evaluation, 'V', 'V').forEach((value, i) => expect(value).toBeCloseTo(v1V[i] as number, 6));
    data(evaluation, 'M', 'M').forEach((value, i) => expect(value).toBeCloseTo(v1M[i] as number, 4));
  });

  it("matches v1's deflection on the 600 N / 400 N case", () => {
    const document = study(
      [load('P', { at: q(80, 'mm'), Fy: q(-1000, 'N') }), A, B],
      [diagram('y', 'deflection')],
      [0, 40, 80, 200],
      {
        nodes: [
          input('position', { kind: 'scalar', value: 80, unit: 'mm' }),
          input('force', { kind: 'scalar', value: -1000, unit: 'N' }),
          node('y1', 'shaftDeflection', catalogues, {
            inputValues: {
              supportA: scalar(0, 'mm'), reactionA: scalar(600, 'N'), supportB: scalar(200, 'mm'), reactionB: scalar(400, 'N'),
              E: scalar(1000, 'N/mm²'), I: scalar(1000, 'mm⁴'),
            },
          }),
        ],
        edges: [wire('z.value', 'y1.z'), wire('position.value', 'y1.position'), wire('force.value', 'y1.force')],
      },
    );
    const evaluation = evaluateDocument(document, catalogues);
    const v1 = data(evaluation, 'y1', 'y');
    data(evaluation, 'y', 'y').forEach((value, i) => expect(value).toBeCloseTo(v1[i] as number, 9));
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
