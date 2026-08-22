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
import { MECHANICS_CATALOGUE, mechanicsCatalogueJson } from '@joveworks/nodes';
import { evaluateDocument, valueAt, type NumericSeries } from '@joveworks/kernel';

const MECHANICS: Catalogue = loadCatalogue(mechanicsCatalogueJson());
const catalogues = [MECHANICS];

const node = (id: string, operation: string): JsonObject => {
  const formula = MECHANICS.formulas.find((entry) => entry.id === operation);
  if (formula === undefined) throw new Error(`no mechanics node '${operation}'`);
  return {
    kind: 'formula',
    id,
    position: { x: 0, y: 0 },
    formula: serializeFormulaRef(formulaRef(formula)),
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
});
