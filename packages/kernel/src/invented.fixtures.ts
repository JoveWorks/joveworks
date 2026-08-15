/**
 * Builders for the kernel's tests.
 *
 * They go through `parseCatalogue` and `parseDocument` rather than constructing
 * records directly, so a test exercises the same path a loaded file does — a
 * fixture that only the TypeScript literal could express would prove nothing
 * about a graph a student opens.
 *
 * **Every formula here is invented.** `y = a*b + c` sorts a graph topologically
 * exactly as well as a textbook equation does, and it carries no citation for
 * anyone to copy — which is the rule CLAUDE.md states and the reason this file
 * has no R&M content in it.
 */

import {
  SCHEMA_VERSION,
  formulaRef,
  parseCatalogue,
  parseDocument,
  serializeFormulaRef,
  type Catalogue,
  type FormulaRef,
  type GraphDocument,
  type JsonObject,
} from '@mds/schema';

export function catalogueOf(formulas: readonly JsonObject[], id = 'test'): Catalogue {
  return parseCatalogue({
    schemaVersion: SCHEMA_VERSION,
    id,
    name: 'Invented formulas',
    restricted: false,
    formulas: [...formulas],
  });
}

export function documentOf(
  nodes: readonly JsonObject[],
  edges: readonly JsonObject[],
  frames: readonly JsonObject[] = [],
): GraphDocument {
  return parseDocument({
    schemaVersion: SCHEMA_VERSION,
    id: 'graph',
    title: 'Test graph',
    nodes: [...nodes],
    edges: [...edges],
    frames: [...frames],
  });
}

export function input(id: string, value: JsonObject, extra: JsonObject = {}): JsonObject {
  return { kind: 'input', id, position: { x: 0, y: 0 }, value, ...extra };
}

export function formulaNode(id: string, ref: FormulaRef, extra: JsonObject = {}): JsonObject {
  return {
    kind: 'formula',
    id,
    position: { x: 0, y: 0 },
    formula: serializeFormulaRef(ref),
    ...extra,
  };
}

export function outputNode(id: string, output: JsonObject, extra: JsonObject = {}): JsonObject {
  return { kind: 'output', id, position: { x: 0, y: 0 }, output, ...extra };
}

/** `wire('w.value', 'area.w')` — endpoints written the way errors report them. */
export function wire(from: string, to: string): JsonObject {
  const [fromNode = '', fromPort = ''] = from.split('.');
  const [toNode = '', toPort = ''] = to.split('.');
  return {
    id: `${from}->${to}`,
    from: { node: fromNode, port: fromPort },
    to: { node: toNode, port: toPort },
  };
}

export const scalar = (value: number, unit: string): JsonObject => ({ kind: 'scalar', value, unit });

export const linear = (start: number, stop: number, points: number, unit: string): JsonObject => ({
  kind: 'linear',
  start,
  stop,
  points,
  unit,
});

export const list = (values: readonly number[], unit: string): JsonObject => ({
  kind: 'list',
  values: [...values],
  unit,
});

// --- invented formulas ------------------------------------------------------

/** `A = w * h` — two lengths in, an area out. */
export const AREA: JsonObject = {
  id: 'area',
  version: 1,
  output: { kind: 'numeric', name: 'A', unit: 'mm²' },
  inputs: [
    { kind: 'numeric', name: 'w', unit: 'mm' },
    { kind: 'numeric', name: 'h', unit: 'mm', default: 10 },
  ],
  expression: 'w * h',
  description: 'Area of a rectangle. Invented for testing.',
  status: 'unverified',
};

/** `p = F / A` — the shape of a stress, with none of the content. */
export const PRESSURE: JsonObject = {
  id: 'pressure',
  version: 1,
  output: { kind: 'numeric', name: 'p', unit: 'N/mm²' },
  inputs: [
    { kind: 'numeric', name: 'F', unit: 'N' },
    { kind: 'numeric', name: 'A', unit: 'mm²' },
  ],
  expression: 'F / A',
  description: 'Force over area. Invented for testing.',
  status: 'unverified',
};

/** `y = a*b + c`, the example CLAUDE.md names: enough to sort, nothing to cite. */
export const COMBINE: JsonObject = {
  id: 'combine',
  version: 1,
  output: { kind: 'numeric', name: 'y', unit: '' },
  inputs: [
    { kind: 'numeric', name: 'a', unit: '' },
    { kind: 'numeric', name: 'b', unit: '' },
    { kind: 'numeric', name: 'c', unit: '' },
  ],
  expression: 'a*b + c',
  description: 'An invented arithmetic combination.',
  status: 'unverified',
};

/** Quarantined, so that S19's gate has something to refuse. */
export const BROKEN: JsonObject = {
  id: 'broken',
  version: 1,
  output: { kind: 'numeric', name: 'x', unit: 'mm' },
  inputs: [{ kind: 'numeric', name: 'a', unit: 'mm' }],
  expression: 'a * 2',
  description: 'Invented, and deliberately not signed off.',
  status: 'quarantined',
  quarantineReason: 'invented for a test of the quarantine gate',
};

/** Generic in the way the base library is: `(A, A) → A`. */
export const ADD: JsonObject = {
  id: 'addTwo',
  version: 1,
  output: { kind: 'numeric', name: 'sum', unit: '$A' },
  inputs: [
    { kind: 'numeric', name: 'a', unit: '$A' },
    { kind: 'numeric', name: 'b', unit: '$A' },
  ],
  expression: 'a + b',
  description: 'Sum of two values of one dimension.',
  status: 'unverified',
};

/** Generic in the other way: `(A, B) → A·B`. */
export const MULTIPLY: JsonObject = {
  id: 'multiplyTwo',
  version: 1,
  output: { kind: 'numeric', name: 'product', unit: '$A*$B' },
  inputs: [
    { kind: 'numeric', name: 'a', unit: '$A' },
    { kind: 'numeric', name: 'b', unit: '$B' },
  ],
  expression: 'a * b',
  description: 'Product of two values.',
  status: 'unverified',
};

/** Takes an angle, so the S54 connection rule has a port to arrive at. */
export const SINE: JsonObject = {
  id: 'sineOf',
  version: 1,
  output: { kind: 'numeric', name: 'result', unit: '' },
  inputs: [{ kind: 'numeric', name: 'theta', unit: 'rad' }],
  expression: 'sin(theta)',
  description: 'Sine of an angle.',
  status: 'unverified',
};

/** A reduction over a load spectrum (S36), with an invented weighting. */
export const TOTAL: JsonObject = {
  id: 'total',
  version: 1,
  output: { kind: 'numeric', name: 'total', unit: 'N' },
  inputs: [{ kind: 'spectrum', name: 'xs', unit: 'N' }],
  expression: 'sum(xs)',
  description: 'Total of a series of forces.',
  status: 'unverified',
};

/** Carries a condition, so S40's warning has something to fire on. */
export const CONDITIONAL: JsonObject = {
  id: 'conditional',
  version: 1,
  output: { kind: 'numeric', name: 'y', unit: 'mm' },
  inputs: [{ kind: 'numeric', name: 'd', unit: 'mm' }],
  expression: 'd * 2',
  description: 'Invented, and only meant for small diameters.',
  appliesWhen: 'd < 50',
  status: 'unverified',
};

export const FORMULAS: readonly JsonObject[] = [
  AREA,
  PRESSURE,
  COMBINE,
  BROKEN,
  ADD,
  MULTIPLY,
  SINE,
  TOTAL,
  CONDITIONAL,
];

export const CATALOGUE: Catalogue = catalogueOf(FORMULAS);

/** The reference a graph node holds: id, version and hash, never the record (S23). */
export function refTo(id: string, catalogue: Catalogue = CATALOGUE): FormulaRef {
  const formula = catalogue.formulas.find((entry) => entry.id === id);
  if (formula === undefined) throw new Error(`no fixture formula '${id}'`);
  return formulaRef(formula);
}
