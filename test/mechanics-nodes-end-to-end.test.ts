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
});
