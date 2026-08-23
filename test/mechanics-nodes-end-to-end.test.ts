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
  SCHEMA_VERSION,
  formulaRef,
  loadCatalogue,
  parseDocument,
  serializeFormulaRef,
  type Catalogue,
  type GraphDocument,
  type JsonObject,
} from '@joveworks/schema';
import { baseCatalogueJson, arrayCatalogueJson, MECHANICS_CATALOGUE, mechanicsCatalogueJson } from '@joveworks/nodes';
import { evaluateDocument, valueAt, type NumericSeries } from '@joveworks/kernel';

const MECHANICS: Catalogue = loadCatalogue(mechanicsCatalogueJson());
const BASE: Catalogue = loadCatalogue(baseCatalogueJson());
const ARRAY: Catalogue = loadCatalogue(arrayCatalogueJson());
const catalogues = [MECHANICS];
const withBaseNodes = [MECHANICS, BASE, ARRAY];

const node = (
  id: string,
  operation: string,
  from: readonly Catalogue[] = [MECHANICS],
  extra: JsonObject = {},
): JsonObject => {
  const formula = from.flatMap((catalogue) => catalogue.formulas).find((entry) => entry.id === operation);
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
    schemaVersion: SCHEMA_VERSION,
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
        input('position', { kind: 'spectrum', values: [0, 100], unit: 'mm' }),
        input('torque', { kind: 'spectrum', values: [500, -500], unit: 'Nmm' }),
        input('z', { kind: 'list', values: [0, 50, 100, 150], unit: 'mm' }),
        node('T', 'shaftTorque'),
      ],
      [
        wire('position.value', 'T.position'),
        wire('torque.value', 'T.torque'),
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
      input('position', { kind: 'spectrum', values: [80], unit: 'mm' }),
      input('force', { kind: 'spectrum', values: [-1000], unit: 'N' }),
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
      input('position', { kind: 'spectrum', values: [80], unit: 'mm' }),
      input('force', { kind: 'spectrum', values: [-1000], unit: 'N' }),
      input('start', { kind: 'spectrum', values: [100], unit: 'mm' }),
      input('end', { kind: 'spectrum', values: [140], unit: 'mm' }),
      input('rate', { kind: 'spectrum', values: [-2], unit: 'N/mm' }),
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
      input('position', { kind: 'spectrum', values: [80], unit: 'mm' }),
      input('force', { kind: 'spectrum', values: [-1000], unit: 'N' }),
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
});
