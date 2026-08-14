/**
 * The graph document: what a student saves, autosaves and hands in alongside.
 *
 * Three ideas carry more weight than they look:
 *
 * - **Formulas are referenced, never embedded** (S23). A node holds an id, a
 *   version and a hash; the expression stays in the catalogue.
 * - **Group frames are the notebook's sections** (S28/S30), which makes them
 *   load-bearing schema rather than decoration. A frame's title and note are the
 *   prose of a section, and the output nodes inside it are its results — so
 *   arranging the canvas arranges the report.
 * - **A range node introduces a labelled axis** (S43). The axis is the input
 *   node itself: everything downstream of two ranges is an `n × m` grid with no
 *   grid node and no rewiring, and a plot names an axis by naming the node.
 *
 * What is *not* here: cycle detection and topological order (S18, kernel), the
 * expression and predicate parsers (S34/S39, kernel), and any check that an
 * edge's ports exist — port names belong to the catalogue, and a document is
 * routinely parsed before one is loaded.
 */

import {
  fail,
  join,
  optional,
  put,
  readArray,
  readBoolean,
  readEnum,
  readInteger,
  readName,
  readNumber,
  readObject,
  readString,
  readStringArray,
  required,
  type JsonObject,
  type JsonValue,
} from './json.js';
import { parseFormulaRef, serializeFormulaRef, type FormulaRef } from './formula.js';
import {
  parseQuantity,
  parseUnitField,
  serializeQuantity,
  type Quantity,
} from './quantity.js';
import { isRange, parseValueSpec, serializeValueSpec, type ValueSpec } from './value.js';
import { SCHEMA_VERSION, readSchemaVersion } from './version.js';
import type { Unit } from '@mds/units';

/** The single port every input node produces on and every output node consumes on. */
export const VALUE_PORT = 'value';

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const COMPARISONS = ['<', '<=', '>', '>=', '==', '!='] as const;
export type Comparison = (typeof COMPARISONS)[number];

/** A scalar with a unit and a significant-figure count. */
export interface ValueOutput {
  readonly kind: 'value';
  /** The unit to display in. Absent means the port's own display unit. */
  readonly unit?: Unit;
  readonly figures?: number;
}

/**
 * The assertion that makes the notebook a dimensioning report rather than a
 * list of numbers (S33): `S ≥ 1.5` renders as pass or fail.
 *
 * The threshold is a `Quantity` rather than a predicate string because it is a
 * number a student types with a unit — `200 N/mm²` — and unit-carrying literals
 * are exactly what an expression string cannot hold (expressions are canonical
 * and unitless by the time the kernel sees them). It is still S39's one
 * predicate layer: comparison against a value, the scalar counterpart of the
 * threshold line a plot draws.
 */
export interface CheckOutput {
  readonly kind: 'check';
  readonly comparison: Comparison;
  readonly threshold: Quantity;
}

/** Line or contour over swept inputs, with an optional threshold overlay. */
export interface PlotOutput {
  readonly kind: 'plot';
  /** Axis for x — the id of the range input node that introduced it (S43). */
  readonly x: string;
  /** A second axis, drawn as separate series or as the second contour axis. */
  readonly series?: string;
  readonly contour?: boolean;
  readonly threshold?: Quantity;
  readonly unit?: Unit;
}

/** A swept series as rows — standard sizes against results (S29's explicit list). */
export interface TableOutput {
  readonly kind: 'table';
  /** Input port names on this node, in column order. */
  readonly columns: readonly string[];
}

export type Output = ValueOutput | CheckOutput | PlotOutput | TableOutput;

export const OUTPUT_KINDS = ['value', 'check', 'plot', 'table'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

interface NodeBase {
  readonly id: string;
  readonly position: Position;
  /** The group frame this node sits in, and therefore its notebook section. */
  readonly frameId?: string;
  readonly label?: string;
}

/** A literal, a categorical choice, a spectrum, or a range (S29). */
export interface InputNode extends NodeBase {
  readonly kind: 'input';
  readonly value: ValueSpec;
  /** What the axis is called when this node holds a range. Defaults to `label`. */
  readonly axisLabel?: string;
}

export interface FormulaNode extends NodeBase {
  readonly kind: 'formula';
  readonly formula: FormulaRef;
}

export interface OutputNode extends NodeBase {
  readonly kind: 'output';
  readonly output: Output;
  /** Per-output prose (S48) — "the 1.5 threshold is crossed at 38 mm". */
  readonly caption?: string;
}

export type GraphNode = InputNode | FormulaNode | OutputNode;

export interface Endpoint {
  readonly node: string;
  readonly port: string;
}

export interface Edge {
  readonly id: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
}

/** A titled group frame: a notebook section (S28/S30), with markdown prose. */
export interface Frame {
  readonly id: string;
  readonly title: string;
  readonly note?: string;
  readonly position: Position;
  readonly size: Size;
}

export interface GraphDocument {
  readonly schemaVersion: number;
  readonly id: string;
  readonly title: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
  readonly frames: readonly Frame[];
}

/** Every axis in the document, in node order: one per range input node (S43). */
export function axes(document: GraphDocument): readonly InputNode[] {
  return document.nodes.filter(
    (node): node is InputNode => node.kind === 'input' && isRange(node.value),
  );
}

/** The nodes of one notebook section, in document order. */
export function nodesInFrame(document: GraphDocument, frameId: string): readonly GraphNode[] {
  return document.nodes.filter((node) => node.frameId === frameId);
}

// --- parsing ---------------------------------------------------------------

function parsePosition(value: JsonValue, path: string): Position {
  const object = readObject(value, path);
  return {
    x: readNumber(required(object, 'x', path), join(path, 'x')),
    y: readNumber(required(object, 'y', path), join(path, 'y')),
  };
}

function parseSize(value: JsonValue, path: string): Size {
  const object = readObject(value, path);
  return {
    width: readNumber(required(object, 'width', path), join(path, 'width')),
    height: readNumber(required(object, 'height', path), join(path, 'height')),
  };
}

function parseOutput(value: JsonValue, path: string): Output {
  const object = readObject(value, path);
  const kind = readEnum(required(object, 'kind', path), join(path, 'kind'), OUTPUT_KINDS);

  switch (kind) {
    case 'value':
      return {
        kind,
        ...put('unit', optional(object, 'unit', path, parseUnitField)),
        ...put(
          'figures',
          optional(object, 'figures', path, (v, p) => readInteger(v, p, 1)),
        ),
      };

    case 'check':
      return {
        kind,
        comparison: readEnum(
          required(object, 'comparison', path),
          join(path, 'comparison'),
          COMPARISONS,
        ),
        threshold: parseQuantity(required(object, 'threshold', path), join(path, 'threshold')),
      };

    case 'plot':
      return {
        kind,
        x: readName(required(object, 'x', path), join(path, 'x')),
        ...put('series', optional(object, 'series', path, readName)),
        ...put('contour', optional(object, 'contour', path, readBoolean)),
        ...put('threshold', optional(object, 'threshold', path, parseQuantity)),
        ...put('unit', optional(object, 'unit', path, parseUnitField)),
      };

    case 'table': {
      const columns = readStringArray(required(object, 'columns', path), join(path, 'columns'));
      if (columns.length === 0) fail(join(path, 'columns'), 'is empty');
      return { kind, columns };
    }
  }
}

function serializeOutput(output: Output): JsonObject {
  switch (output.kind) {
    case 'value':
      return {
        kind: output.kind,
        ...put('unit', output.unit?.symbol),
        ...put('figures', output.figures),
      };
    case 'check':
      return {
        kind: output.kind,
        comparison: output.comparison,
        threshold: serializeQuantity(output.threshold),
      };
    case 'plot':
      return {
        kind: output.kind,
        x: output.x,
        ...put('series', output.series),
        ...put('contour', output.contour),
        ...put(
          'threshold',
          output.threshold === undefined ? undefined : serializeQuantity(output.threshold),
        ),
        ...put('unit', output.unit?.symbol),
      };
    case 'table':
      return { kind: output.kind, columns: [...output.columns] };
  }
}

const NODE_KINDS = ['input', 'formula', 'output'] as const;

function parseNode(value: JsonValue, path: string): GraphNode {
  const object = readObject(value, path);
  const base = {
    id: readName(required(object, 'id', path), join(path, 'id')),
    position: parsePosition(required(object, 'position', path), join(path, 'position')),
    ...put('frameId', optional(object, 'frameId', path, readName)),
    ...put('label', optional(object, 'label', path, readString)),
  };
  const kind = readEnum(required(object, 'kind', path), join(path, 'kind'), NODE_KINDS);

  switch (kind) {
    case 'input':
      return {
        ...base,
        kind,
        value: parseValueSpec(required(object, 'value', path), join(path, 'value')),
        ...put('axisLabel', optional(object, 'axisLabel', path, readString)),
      };
    case 'formula':
      return {
        ...base,
        kind,
        formula: parseFormulaRef(required(object, 'formula', path), join(path, 'formula')),
      };
    case 'output':
      return {
        ...base,
        kind,
        output: parseOutput(required(object, 'output', path), join(path, 'output')),
        ...put('caption', optional(object, 'caption', path, readString)),
      };
  }
}

function serializeNode(node: GraphNode): JsonObject {
  const base = {
    kind: node.kind,
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    ...put('frameId', node.frameId),
    ...put('label', node.label),
  };
  switch (node.kind) {
    case 'input':
      return {
        ...base,
        value: serializeValueSpec(node.value),
        ...put('axisLabel', node.axisLabel),
      };
    case 'formula':
      return { ...base, formula: serializeFormulaRef(node.formula) };
    case 'output':
      return { ...base, output: serializeOutput(node.output), ...put('caption', node.caption) };
  }
}

function parseEndpoint(value: JsonValue, path: string): Endpoint {
  const object = readObject(value, path);
  return {
    node: readName(required(object, 'node', path), join(path, 'node')),
    port: readName(required(object, 'port', path), join(path, 'port')),
  };
}

function parseEdge(value: JsonValue, path: string): Edge {
  const object = readObject(value, path);
  return {
    id: readName(required(object, 'id', path), join(path, 'id')),
    from: parseEndpoint(required(object, 'from', path), join(path, 'from')),
    to: parseEndpoint(required(object, 'to', path), join(path, 'to')),
  };
}

function serializeEdge(edge: Edge): JsonObject {
  return {
    id: edge.id,
    from: { node: edge.from.node, port: edge.from.port },
    to: { node: edge.to.node, port: edge.to.port },
  };
}

function parseFrame(value: JsonValue, path: string): Frame {
  const object = readObject(value, path);
  return {
    id: readName(required(object, 'id', path), join(path, 'id')),
    title: readString(required(object, 'title', path), join(path, 'title')),
    ...put('note', optional(object, 'note', path, readString)),
    position: parsePosition(required(object, 'position', path), join(path, 'position')),
    size: parseSize(required(object, 'size', path), join(path, 'size')),
  };
}

function serializeFrame(frame: Frame): JsonObject {
  return {
    id: frame.id,
    title: frame.title,
    ...put('note', frame.note),
    position: { x: frame.position.x, y: frame.position.y },
    size: { width: frame.size.width, height: frame.size.height },
  };
}

/**
 * Structural checks only, but the ones a graph cannot be repaired from: a
 * dangling edge or a node in a frame that no longer exists would surface later
 * as an unexplained missing wire or an orphaned notebook section.
 */
function checkReferences(document: GraphDocument, path: string): void {
  const nodeIds = new Set<string>();
  for (const [i, node] of document.nodes.entries()) {
    if (nodeIds.has(node.id)) fail(`${join(path, 'nodes')}[${i}].id`, `'${node.id}' appears twice`);
    nodeIds.add(node.id);
  }

  const frameIds = new Set<string>();
  for (const [i, frame] of document.frames.entries()) {
    if (frameIds.has(frame.id)) {
      fail(`${join(path, 'frames')}[${i}].id`, `'${frame.id}' appears twice`);
    }
    frameIds.add(frame.id);
  }

  for (const [i, node] of document.nodes.entries()) {
    if (node.frameId !== undefined && !frameIds.has(node.frameId)) {
      fail(`${join(path, 'nodes')}[${i}].frameId`, `no frame '${node.frameId}' exists`);
    }
  }

  const edgeIds = new Set<string>();
  for (const [i, edge] of document.edges.entries()) {
    const at = `${join(path, 'edges')}[${i}]`;
    if (edgeIds.has(edge.id)) fail(`${at}.id`, `'${edge.id}' appears twice`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from.node)) fail(`${at}.from.node`, `no node '${edge.from.node}' exists`);
    if (!nodeIds.has(edge.to.node)) fail(`${at}.to.node`, `no node '${edge.to.node}' exists`);
  }

  // A plot names its axes by node id, and an axis exists only where a range does
  // (S43). Pointing at a scalar input is the mistake this catches.
  const axisIds = new Set(axes(document).map((node) => node.id));
  for (const [i, node] of document.nodes.entries()) {
    if (node.kind !== 'output' || node.output.kind !== 'plot') continue;
    const at = `${join(path, 'nodes')}[${i}].output`;
    for (const [key, axis] of [
      ['x', node.output.x],
      ['series', node.output.series],
    ] as const) {
      if (axis !== undefined && !axisIds.has(axis)) {
        fail(`${at}.${key}`, `'${axis}' is not a range input node, so it introduces no axis (S43)`);
      }
    }
  }
}

export function parseDocument(value: JsonValue, path = ''): GraphDocument {
  const object = readObject(value, path);
  const document: GraphDocument = {
    schemaVersion: readSchemaVersion(object, path),
    id: readName(required(object, 'id', path), join(path, 'id')),
    title: readString(required(object, 'title', path), join(path, 'title')),
    nodes: readArray(required(object, 'nodes', path), join(path, 'nodes')).map((entry, i) =>
      parseNode(entry, `${join(path, 'nodes')}[${i}]`),
    ),
    edges: readArray(required(object, 'edges', path), join(path, 'edges')).map((entry, i) =>
      parseEdge(entry, `${join(path, 'edges')}[${i}]`),
    ),
    frames: readArray(required(object, 'frames', path), join(path, 'frames')).map((entry, i) =>
      parseFrame(entry, `${join(path, 'frames')}[${i}]`),
    ),
  };
  checkReferences(document, path);
  return document;
}

export function serializeDocument(document: GraphDocument): JsonObject {
  return {
    schemaVersion: document.schemaVersion,
    id: document.id,
    title: document.title,
    nodes: document.nodes.map(serializeNode),
    edges: document.edges.map(serializeEdge),
    frames: document.frames.map(serializeFrame),
  };
}

/** An empty document, stamped with the version this build writes. */
export function emptyDocument(id: string, title: string): GraphDocument {
  return { schemaVersion: SCHEMA_VERSION, id, title, nodes: [], edges: [], frames: [] };
}
