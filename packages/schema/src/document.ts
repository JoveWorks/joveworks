/**
 * The graph document: what a student saves, autosaves and hands in alongside.
 *
 * Three ideas carry more weight than they look:
 *
 * - **Formulas are referenced, never embedded**. A node holds an id, a
 *   version and a hash; the expression stays in the catalogue.
 * - **Group frames are the notebook's sections**, which makes them
 *   load-bearing schema rather than decoration. A frame's title and note are the
 *   prose of a section, and the output nodes inside it are its results — so
 *   arranging the canvas arranges the report.
 * - **A range node introduces a labelled axis**. The axis is the input
 *   node itself: everything downstream of two ranges is an `n × m` grid with no
 *   grid node and no rewiring, and a plot names an axis by naming the node.
 *
 * What is *not* here: cycle detection and topological order (kernel), the
 * expression and predicate parsers (kernel), and any check that an
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
import type { Unit } from '@joveworks/units';

/** The single port every input node produces on and every output node consumes on. */
export const VALUE_PORT = 'value';

/** A compare node's two input ports and its one output port. */
export const THRESHOLD_PORT = 'threshold';
export const VERDICT_PORT = 'verdict';

/** A closure node's one output port — its inputs are whatever its expression mentions. */
export const CLOSURE_RESULT_PORT = 'result';

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
export interface PrintOutput {
  readonly kind: 'print';
  /** The unit to display in. Absent means the port's own display unit. */
  readonly unit?: Unit;
  readonly figures?: number;
}

/**
 * The assertion that makes the notebook a dimensioning report rather than a
 * list of numbers: `S ≥ 1.5` renders as pass or fail.
 *
 * The threshold is a `Quantity` rather than a predicate string because it is a
 * number a student types with a unit — `200 N/mm²` — and unit-carrying literals
 * are exactly what an expression string cannot hold (expressions are canonical
 * and unitless by the time the kernel sees them). It is still the one
 * predicate layer: comparison against a value, the scalar counterpart of the
 * threshold line a plot draws.
 *
 * `threshold` is the `threshold` port's default when nothing is wired to it
 * — the same wireable-with-a-typed-default shape `CompareNode.threshold`
 * and `PlotOutput.threshold` use, except mandatory: a check with no bound at
 * all is meaningless, unlike a plot, which can be drawn with no reference line.
 */
export interface CheckOutput {
  readonly kind: 'check';
  readonly comparison: Comparison;
  readonly threshold: Quantity;
}

/**
 * Line or contour over swept inputs, with an optional threshold overlay.
 *
 * Up to three axes get a slot — `x`, `series` (color) and `facet` (small
 * multiples) — each naming the range input node that introduced it.
 * Any slot left unset is filled automatically at evaluate time from axes the
 * plotted value actually varies along (kernel `evaluate.ts`); a slot the
 * student *has* set is never touched. Leaving all three unset is the default
 * a new plot node starts in.
 */
export interface PlotOutput {
  readonly kind: 'plot';
  /** Axis for x — the id of the range input node that introduced it. Auto-assigned when absent. */
  readonly x?: string;
  /** A second axis, drawn as a colored series (or, with `contour`, the second grid axis). */
  readonly series?: string;
  /** A third axis, drawn as one small-multiple panel per value. */
  readonly facet?: string;
  readonly contour?: boolean;
  readonly threshold?: Quantity;
  readonly unit?: Unit;
}

/** A swept series as rows — standard sizes against results, an explicit-list range at its natural home. */
export interface TableOutput {
  readonly kind: 'table';
  /** Input port names on this node, in column order. */
  readonly columns: readonly string[];
}

/**
 * Shows the wired formula's own expression as typeset math, instead of its
 * value — the opt-in escape hatch from "expressions only behind an
 * explicitly marked toggle." Nothing to configure: everything it shows
 * (expression, citation) comes from the formula or closure node wired to
 * `value`.
 */
export interface EquationOutput {
  readonly kind: 'equation';
}

export type Output = PrintOutput | CheckOutput | PlotOutput | TableOutput | EquationOutput;

export const OUTPUT_KINDS = ['print', 'check', 'plot', 'table', 'equation'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

interface NodeBase {
  readonly id: string;
  readonly position: Position;
  /** The group frame this node sits in, and therefore its notebook section. */
  readonly frameId?: string;
  readonly label?: string;
}

/** A literal, a categorical choice, a spectrum, or a range. */
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
  /** Per-output prose — "the 1.5 threshold is crossed at 38 mm". */
  readonly caption?: string;
}

/**
 * Compares a wired value against a threshold and emits the verdict —
 * `'pass'` or `'fail'` — as a wireable value, most usefully into a table
 * column that shows which of a swept design's points fail.
 *
 * A first-class node rather than another `Output` variant: a check
 * output's badge is a rendering choice over a value that already exists and
 * goes nowhere else, but a comparison's *result* is exactly the kind of
 * thing a student wants to wire onward, which an output node cannot do.
 *
 * `threshold` is the `threshold` port's default when nothing is wired to it
 * — the same typed `Quantity` the check output kind uses, and now wireable
 * there too.
 */
export interface CompareNode extends NodeBase {
  readonly kind: 'compare';
  readonly comparison: Comparison;
  readonly threshold: Quantity;
}

/**
 * A student-authored equation: the expression is embedded directly (the
 * never-embed rule protects R&M content from leaving the repository boundary —
 * this is the student's own content, and showing it is the point), and its
 * ports are not declared here at all. They are derived from whatever names
 * the expression mentions — `packages/kernel/src/closure.ts` is what can do
 * that derivation, since it needs the parser.
 */
export interface ClosureNode extends NodeBase {
  readonly kind: 'closure';
  /** May be empty — a freshly dropped node that has not been written yet. */
  readonly expression: string;
}

/**
 * A redirect with independently typed `inN → outN` pairs. Ports are derived
 * from edges at resolve/render time; each pair preserves its own dimension
 * and value. This lets unrelated wires share one visual routing stop without
 * merging them (pack/unpack is the separate operation that really bundles).
 */
export interface WaypointNode extends NodeBase {
  readonly kind: 'waypoint';
}

/**
 * Bundles any number of independently-dimensioned wires into one wire — the
 * counterpart of `UnpackNode`. Its `in0..inN` inputs and single `bundle`
 * output are, like `WaypointNode`'s ports, not declared here: they are
 * derived from `document.edges` at resolve/render time, because a channel
 * exists exactly while something is wired to it (`packages/kernel/src/graph.ts`'s
 * `pack` branch, `packages/kernel/src/bundle.ts`'s `packChannelIndices`).
 *
 * Channel indices are never renumbered once assigned — dropping a wire from
 * `in1` while `in0` and `in2` stay wired leaves a gap rather than closing
 * it, so a rewire never silently jumps to a channel a student did not drag
 * onto.
 */
export interface PackNode extends NodeBase {
  readonly kind: 'pack';
}

/**
 * The inverse of `PackNode`: one `bundle` input, unbound until something is
 * wired to it, and `out0..outN` outputs that appear only once it is —
 * their count and dimensions come entirely from the bundle wired in, so
 * (like every port on these three node kinds) none of it is declared here.
 */
export interface UnpackNode extends NodeBase {
  readonly kind: 'unpack';
}

export type GraphNode =
  | InputNode
  | FormulaNode
  | OutputNode
  | CompareNode
  | ClosureNode
  | WaypointNode
  | PackNode
  | UnpackNode;

export interface Endpoint {
  readonly node: string;
  readonly port: string;
}

export interface Edge {
  readonly id: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
}

/** A titled group frame: a notebook section, with markdown prose. */
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

/** Every axis in the document, in node order: one per range input node. */
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
    case 'print':
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
        ...put('x', optional(object, 'x', path, readName)),
        ...put('series', optional(object, 'series', path, readName)),
        ...put('facet', optional(object, 'facet', path, readName)),
        ...put('contour', optional(object, 'contour', path, readBoolean)),
        ...put('threshold', optional(object, 'threshold', path, parseQuantity)),
        ...put('unit', optional(object, 'unit', path, parseUnitField)),
      };

    case 'table': {
      const columns = readStringArray(required(object, 'columns', path), join(path, 'columns'));
      if (columns.length === 0) fail(join(path, 'columns'), 'is empty');
      return { kind, columns };
    }

    case 'equation':
      return { kind };
  }
}

function serializeOutput(output: Output): JsonObject {
  switch (output.kind) {
    case 'print':
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
        ...put('x', output.x),
        ...put('series', output.series),
        ...put('facet', output.facet),
        ...put('contour', output.contour),
        ...put(
          'threshold',
          output.threshold === undefined ? undefined : serializeQuantity(output.threshold),
        ),
        ...put('unit', output.unit?.symbol),
      };
    case 'table':
      return { kind: output.kind, columns: [...output.columns] };
    case 'equation':
      return { kind: output.kind };
  }
}

const NODE_KINDS = [
  'input',
  'formula',
  'output',
  'compare',
  'closure',
  'waypoint',
  'pack',
  'unpack',
] as const;

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
    case 'compare':
      return {
        ...base,
        kind,
        comparison: readEnum(
          required(object, 'comparison', path),
          join(path, 'comparison'),
          COMPARISONS,
        ),
        threshold: parseQuantity(required(object, 'threshold', path), join(path, 'threshold')),
      };
    case 'closure':
      return {
        ...base,
        kind,
        expression: readString(required(object, 'expression', path), join(path, 'expression')),
      };
    case 'waypoint':
      return { ...base, kind };
    case 'pack':
      return { ...base, kind };
    case 'unpack':
      return { ...base, kind };
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
    case 'compare':
      return {
        ...base,
        comparison: node.comparison,
        threshold: serializeQuantity(node.threshold),
      };
    case 'closure':
      return { ...base, expression: node.expression };
    case 'waypoint':
    case 'pack':
    case 'unpack':
      return base;
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

  // A plot names its axes by node id, and an axis exists only where a range
  // does. Pointing at a scalar input is the mistake this catches.
  const axisIds = new Set(axes(document).map((node) => node.id));
  for (const [i, node] of document.nodes.entries()) {
    if (node.kind !== 'output' || node.output.kind !== 'plot') continue;
    const at = `${join(path, 'nodes')}[${i}].output`;
    for (const [key, axis] of [
      ['x', node.output.x],
      ['series', node.output.series],
      ['facet', node.output.facet],
    ] as const) {
      if (axis !== undefined && !axisIds.has(axis)) {
        fail(`${at}.${key}`, `'${axis}' is not a range input node, so it introduces no axis`);
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
