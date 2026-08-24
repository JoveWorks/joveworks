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

/**
 * A Monte Carlo generator's distribution parameters — each a `CompareNode.threshold`-
 * shaped port: the node's own typed field is what applies unwired, and an edge
 * into the matching port overrides it. `min`/`max` apply to a `uniform`
 * generator, `mean`/`stddev` to a `normal` one — only the pair matching the
 * node's current `distribution` is a live target port.
 */
export const MIN_PORT = 'min';
export const MAX_PORT = 'max';
export const MEAN_PORT = 'mean';
export const STDDEV_PORT = 'stddev';

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

/**
 * A swept series as rows — standard sizes against results, an explicit-list
 * range at its natural home.
 *
 * `figures` and `marks` are edited in the notebook, where the rendered table
 * is, rather than in this node's own panel — the same "complex settings live
 * where they're read" rule the notebook's captions and section notes already
 * follow. They still live on this node because the table's rendering is a
 * property of the output, not of the notebook view showing it.
 */
export interface TableOutput {
  readonly kind: 'table';
  /** Input port names on this node, in column order. */
  readonly columns: readonly string[];
  /** Decimal-figure count per column, keyed by column name. Missing means the default (4). */
  readonly figures?: Readonly<Record<string, number>>;
  /**
   * Row indices a student has marked to call a value out. Indices, not axis
   * values, so a sweep that changes shape (a different sample count, a
   * reordered range) can leave a mark pointing at a different row than the
   * one it was set on — an accepted gap until this is unified with the
   * plot's own "mark a point on the curve" affordance.
   */
  readonly marks?: readonly number[];
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

/**
 * Shades where every referenced Check node's verdict passes at once — the
 * multi-constraint counterpart of a single scalar check, and the reason it
 * references existing Check nodes by id rather than re-entering their
 * comparisons/thresholds: a student who already built "safety factor ≥ 1.5"
 * and "pressure ≤ 200 N/mm²" as separate checks wants to see where *both*
 * hold, not retype either bound a second time.
 *
 * No `contour` field, unlike `PlotOutput`: a boolean mask has no
 * line/contour ambiguity a numeric plot has — `series` present means a 2-D
 * shaded region, absent means a 1-D band along `x`.
 */
export interface FeasibilityOutput {
  readonly kind: 'feasibility';
  /** The ids of the Check output nodes whose verdicts are ANDed together. */
  readonly checks: readonly string[];
  readonly x?: string;
  readonly series?: string;
  readonly facet?: string;
}

/**
 * "Which input actually matters?" — a tornado: each sweepable input swept
 * alone across its own bounds, the rest held fixed, ranked by how much a
 * wired target output moves. No fields of its own — everything it needs
 * (the target, and every candidate input) comes from the document itself,
 * the same minimal footprint `EquationOutput` has, wired via the one
 * `VALUE_PORT` like `check`/`print`.
 */
export interface SensitivityOutput {
  readonly kind: 'sensitivity';
}

export type Output =
  | PrintOutput
  | CheckOutput
  | PlotOutput
  | TableOutput
  | EquationOutput
  | FeasibilityOutput
  | SensitivityOutput;

export const OUTPUT_KINDS = ['print', 'check', 'plot', 'table', 'equation', 'feasibility', 'sensitivity'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

interface NodeBase {
  readonly id: string;
  readonly position: Position;
  /** The group frame this node sits in, and therefore its notebook section. */
  readonly frameId?: string;
  readonly label?: string;
  /** Per-port display choices made in this graph, keyed by port name. */
  readonly displayUnits?: Readonly<Record<string, Unit>>;
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
  /** Per-port fallbacks used only while that input is unwired. */
  readonly inputValues?: Readonly<Record<string, ValueSpec>>;
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

/** The value port every generator produces and every receiver consumes from — reuses `VALUE_PORT`. */
export const MONTE_CARLO_DISTRIBUTIONS = ['uniform', 'normal'] as const;
export type MonteCarloDistribution = (typeof MONTE_CARLO_DISTRIBUTIONS)[number];

interface MonteCarloGeneratorBase extends NodeBase {
  readonly kind: 'monteCarloGenerator';
  /** The current sample count — this *is* the axis length, exactly the way a
   *  `linear`/`logarithmic` range's `points` is. Playback (an editor concern,
   *  see `ROADMAP.md` #27) advances a study by bumping this and
   *  re-evaluating, not by anything the kernel needs to know is happening. */
  readonly count: number;
  readonly unit: Unit;
  /** What the axis is called. Defaults to `label`, like `InputNode`'s. */
  readonly axisLabel?: string;
}

/**
 * Draws uniformly over `[min, max]`, in `unit`. Each bound is also that
 * bound's port default (`MIN_PORT`/`MAX_PORT`) — wired, the edge overrides it,
 * the same `CompareNode.threshold` shape.
 */
export interface UniformMonteCarloGeneratorNode extends MonteCarloGeneratorBase {
  readonly distribution: 'uniform';
  readonly min: number;
  readonly max: number;
}

/**
 * Draws from a normal distribution with the given mean and standard
 * deviation, in `unit`. Each is also that parameter's port default
 * (`MEAN_PORT`/`STDDEV_PORT`) — wired, the edge overrides it, the same
 * `CompareNode.threshold` shape.
 */
export interface NormalMonteCarloGeneratorNode extends MonteCarloGeneratorBase {
  readonly distribution: 'normal';
  readonly mean: number;
  readonly stddev: number;
}

/**
 * A Monte Carlo generator: an axis-introducing node like `InputNode` holding
 * a range, except its values are drawn from a distribution instead of
 * computed from `start`/`stop`/`points` — and it is deliberately its own
 * node kind rather than another `RangeSpec` on `InputNode`, so the input
 * node's value-kind switch does not have to grow distribution parameters
 * alongside every other range shape.
 *
 * Sampling is deterministic given the document
 * (`packages/kernel/src/random.ts`): a fixed seed per NodeBook, so
 * re-evaluating with a larger `count` only ever appends samples, never
 * reshuffles ones already drawn — the property the receiver's playback
 * depends on.
 */
export type MonteCarloGeneratorNode = UniformMonteCarloGeneratorNode | NormalMonteCarloGeneratorNode;

/** The one input port a Monte Carlo receiver consumes — a wired series to accumulate. */
export const MONTE_CARLO_SAMPLE_PORT = 'sample';

/** The sample limit a freshly dropped receiver starts with (settled in `ROADMAP.md` #27). */
export const DEFAULT_MONTE_CARLO_SAMPLE_LIMIT = 10_000;

/**
 * A Monte Carlo receiver: consumes a wired numeric series (typically a
 * generator's output, or anything downstream of one) and holds its own
 * playback transport and inline aggregate visual — the didactic half of
 * #27, watching values populate and an aggregate converge rather than only
 * seeing a final number.
 *
 * It is not a range and introduces no axis; it is a sink, the same shape as
 * an output node's single `value` port, just under its own port name so a
 * receiver is never mistaken for an ordinary output in the notebook.
 *
 * Playback position (how many samples are currently revealed) is
 * deliberately **not** a field here — it is ephemeral editor/session state,
 * not part of the saved document, so reopening a NodeBook always resets
 * playback to the start. `sampleLimit` and the visual toggles are the only
 * receiver state that is authored and saved; the notebook export always
 * renders the aggregate at `sampleLimit`, independent of any in-progress
 * playback on the canvas.
 */
export interface MonteCarloReceiverNode extends NodeBase {
  readonly kind: 'monteCarloReceiver';
  readonly sampleLimit: number;
  /** A gentle slow start before playback reaches full speed — off by default. */
  readonly rampUp?: boolean;
  /** Both default to shown; a student may hide either from the settings icon. */
  readonly showMeanBand?: boolean;
  readonly showHistogram?: boolean;
}

/** Where a file node's values came from. Provenance, never a way back to the file. */
export interface FileSource {
  readonly name: string;
  readonly size: number;
  /** The file's own last-modified stamp, in epoch milliseconds. */
  readonly modified?: number;
}

/**
 * One quantity read out of a file: a port, and its value once per source.
 *
 * `unit` absent means a categorical field — a camera model, a lens name —
 * the same "no unit to have" a categorical port and `CategoricalValue`
 * already state by omission. `null` is the honest answer for a file that
 * simply did not carry the field, and it stays a resolvable port so the rest
 * of the node keeps working; asking for it is what fails.
 */
export interface FileField {
  readonly name: string;
  readonly unit?: Unit;
  /** One entry per `FileNode.sources`, in that order. */
  readonly values: readonly (number | string | null)[];
}

/**
 * Values read out of a file the student picked: EXIF from a photograph today,
 * whatever a later reader understands after that.
 *
 * **The file is not in the document and never will be.** A raw frame is tens
 * of megabytes against an autosave slot measured in single-digit ones, a file
 * handle does not survive being mailed to a classmate, and evaluation has to
 * be reproducible from the document alone. So the node stores what was read
 * — `fields` — plus enough provenance to say where it came from. Hand the
 * NodeBook to someone else and every number still evaluates; the file is
 * gone, and the node says so rather than pretending otherwise.
 *
 * `reader` names the editor-side reader that produced the fields. The kernel
 * never consults it and knows nothing about EXIF or any other format: it sees
 * declared, typed, constant outputs, the way `closure` hands it ports derived
 * from an expression it did not write either.
 *
 * `sources` is a list at one entry rather than a single source because
 * several files read the same way are a sweep — ten frames giving an axis of
 * focal lengths — and that axis is a `FileNode` with a longer `sources` and
 * correspondingly longer `FileField.values`, not a different node.
 *
 * Both lists may be empty: that is a node dropped from the palette with no
 * file picked yet, the same unfinished-but-valid state a `ClosureNode` with
 * an empty expression sits in.
 */
export interface FileNode extends NodeBase {
  readonly kind: 'file';
  readonly reader: string;
  readonly sources: readonly FileSource[];
  readonly fields: readonly FileField[];
  /** What the axis is called while several files are loaded. Defaults to `label`. */
  readonly axisLabel?: string;
}

export type GraphNode =
  | InputNode
  | FileNode
  | FormulaNode
  | OutputNode
  | CompareNode
  | ClosureNode
  | WaypointNode
  | PackNode
  | UnpackNode
  | MonteCarloGeneratorNode
  | MonteCarloReceiverNode;


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
  /** Absent means render the NodeBook in the reader's app language. */
  readonly notebookLocale?: 'en' | 'nl';
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly Edge[];
  readonly frames: readonly Frame[];
}

/**
 * Every axis in the document, in node order: a range input node, a Monte
 * Carlo generator, or a file node reading more than one file — several
 * frames are a sweep over the frames, the same way a list of sizes is.
 */
export type AxisNode = InputNode | FileNode | MonteCarloGeneratorNode;

export function axes(document: GraphDocument): readonly AxisNode[] {
  return document.nodes.filter(
    (node): node is AxisNode =>
      (node.kind === 'input' && isRange(node.value)) ||
      (node.kind === 'file' && node.sources.length > 1) ||
      node.kind === 'monteCarloGenerator',
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
      return {
        kind,
        columns,
        ...put('figures', optional(object, 'figures', path, parseTableFigures)),
        ...put('marks', optional(object, 'marks', path, parseTableMarks)),
      };
    }

    case 'equation':
      return { kind };

    case 'feasibility':
      // An empty array is a freshly-dropped node that has not been given
      // any checks yet — allowed, unlike `table`'s `columns`, which rejects
      // an empty list (a separate pre-existing inconsistency, not one to
      // copy here).
      return {
        kind,
        checks: readStringArray(required(object, 'checks', path), join(path, 'checks')),
        ...put('x', optional(object, 'x', path, readName)),
        ...put('series', optional(object, 'series', path, readName)),
        ...put('facet', optional(object, 'facet', path, readName)),
      };

    case 'sensitivity':
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
      return {
        kind: output.kind,
        columns: [...output.columns],
        ...put('figures', serializeTableFigures(output.figures)),
        ...put('marks', output.marks === undefined || output.marks.length === 0 ? undefined : [...output.marks]),
      };
    case 'equation':
      return { kind: output.kind };
    case 'feasibility':
      return {
        kind: output.kind,
        checks: [...output.checks],
        ...put('x', output.x),
        ...put('series', output.series),
        ...put('facet', output.facet),
      };
    case 'sensitivity':
      return { kind: output.kind };
  }
}

function parseFileSource(value: JsonValue, path: string): FileSource {
  const object = readObject(value, path);
  return {
    name: readString(required(object, 'name', path), join(path, 'name')),
    size: readInteger(required(object, 'size', path), join(path, 'size'), 0),
    ...put('modified', optional(object, 'modified', path, readNumber)),
  };
}

function parseFileField(value: JsonValue, path: string, sources: number): FileField {
  const object = readObject(value, path);
  const unit = optional(object, 'unit', path, parseUnitField);
  const values = readArray(required(object, 'values', path), join(path, 'values')).map(
    (cell, i) => {
      const cellPath = `${join(path, 'values')}[${i}]`;
      if (cell === null) return null;
      // A field is numeric or categorical exactly as its unit says; a cell
      // that disagrees is a reader that lost track of its own field, not a
      // value to coerce.
      return unit === undefined ? readString(cell, cellPath) : readNumber(cell, cellPath);
    },
  );
  if (values.length !== sources) {
    fail(join(path, 'values'), `has ${values.length} entries; ${sources} file(s) require ${sources}`);
  }
  return {
    name: readName(required(object, 'name', path), join(path, 'name')),
    ...put('unit', unit),
    values,
  };
}

const NODE_KINDS = [
  'input',
  'file',
  'formula',
  'output',
  'compare',
  'closure',
  'waypoint',
  'pack',
  'unpack',
  'monteCarloGenerator',
  'monteCarloReceiver',
] as const;

function parseNode(value: JsonValue, path: string): GraphNode {
  const object = readObject(value, path);
  const base = {
    id: readName(required(object, 'id', path), join(path, 'id')),
    position: parsePosition(required(object, 'position', path), join(path, 'position')),
    ...put('frameId', optional(object, 'frameId', path, readName)),
    ...put('label', optional(object, 'label', path, readString)),
    ...put('displayUnits', optional(object, 'displayUnits', path, parseDisplayUnits)),
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
    case 'file': {
      const sources = readArray(required(object, 'sources', path), join(path, 'sources')).map(
        (entry, i) => parseFileSource(entry, `${join(path, 'sources')}[${i}]`),
      );
      const fields = readArray(required(object, 'fields', path), join(path, 'fields')).map(
        (entry, i) => parseFileField(entry, `${join(path, 'fields')}[${i}]`, sources.length),
      );
      if (sources.length === 0 && fields.length > 0) {
        fail(join(path, 'fields'), 'has fields but no file to have read them from');
      }
      const duplicate = fields.find((field, i) => fields.findIndex((other) => other.name === field.name) !== i);
      if (duplicate !== undefined) fail(join(path, 'fields'), `names '${duplicate.name}' twice`);
      return {
        ...base,
        kind,
        reader: readName(required(object, 'reader', path), join(path, 'reader')),
        sources,
        fields,
        ...put('axisLabel', optional(object, 'axisLabel', path, readString)),
      };
    }
    case 'formula':
      return {
        ...base,
        kind,
        formula: parseFormulaRef(required(object, 'formula', path), join(path, 'formula')),
        ...put(
          'inputValues',
          optional(object, 'inputValues', path, (entry, entryPath) => {
            const values = readObject(entry, entryPath);
            return Object.fromEntries(
              Object.entries(values).map(([name, spec]) => [
                readName(name, entryPath),
                parseValueSpec(spec, join(entryPath, name)),
              ]),
            );
          }),
        ),
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
    case 'monteCarloGenerator': {
      const distribution = readEnum(
        required(object, 'distribution', path),
        join(path, 'distribution'),
        MONTE_CARLO_DISTRIBUTIONS,
      );
      const count = readInteger(required(object, 'count', path), join(path, 'count'), 1);
      const unit = parseUnitField(required(object, 'unit', path), join(path, 'unit'));
      const axisLabel = put('axisLabel', optional(object, 'axisLabel', path, readString));
      if (distribution === 'uniform') {
        const min = readNumber(required(object, 'min', path), join(path, 'min'));
        const max = readNumber(required(object, 'max', path), join(path, 'max'));
        if (min >= max) fail(path, 'a uniform generator needs its low end below its high end');
        return { ...base, kind, distribution, min, max, count, unit, ...axisLabel };
      }
      const mean = readNumber(required(object, 'mean', path), join(path, 'mean'));
      const stddev = readNumber(required(object, 'stddev', path), join(path, 'stddev'));
      if (stddev <= 0) fail(join(path, 'stddev'), 'must be above zero');
      return { ...base, kind, distribution, mean, stddev, count, unit, ...axisLabel };
    }
    case 'monteCarloReceiver': {
      const sampleLimit = readInteger(
        required(object, 'sampleLimit', path),
        join(path, 'sampleLimit'),
        1,
      );
      return {
        ...base,
        kind,
        sampleLimit,
        ...put('rampUp', optional(object, 'rampUp', path, readBoolean)),
        ...put('showMeanBand', optional(object, 'showMeanBand', path, readBoolean)),
        ...put('showHistogram', optional(object, 'showHistogram', path, readBoolean)),
      };
    }
  }
}

function serializeNode(node: GraphNode): JsonObject {
  const base = {
    kind: node.kind,
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    ...put('frameId', node.frameId),
    ...put('label', node.label),
    ...put('displayUnits', serializeDisplayUnits(node.displayUnits)),
  };
  switch (node.kind) {
    case 'input':
      return {
        ...base,
        value: serializeValueSpec(node.value),
        ...put('axisLabel', node.axisLabel),
      };
    case 'file':
      return {
        ...base,
        reader: node.reader,
        sources: node.sources.map((source) => ({
          name: source.name,
          size: source.size,
          ...put('modified', source.modified),
        })),
        fields: node.fields.map((field) => ({
          name: field.name,
          ...put('unit', field.unit?.symbol),
          values: [...field.values],
        })),
        ...put('axisLabel', node.axisLabel),
      };
    case 'formula':
      return {
        ...base,
        formula: serializeFormulaRef(node.formula),
        ...put(
          'inputValues',
          node.inputValues === undefined
            ? undefined
            : Object.fromEntries(
                Object.entries(node.inputValues).map(([name, spec]) => [name, serializeValueSpec(spec)]),
              ),
        ),
      };
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
    case 'monteCarloGenerator':
      return node.distribution === 'uniform'
        ? {
            ...base,
            distribution: node.distribution,
            min: node.min,
            max: node.max,
            count: node.count,
            unit: node.unit.symbol,
            ...put('axisLabel', node.axisLabel),
          }
        : {
            ...base,
            distribution: node.distribution,
            mean: node.mean,
            stddev: node.stddev,
            count: node.count,
            unit: node.unit.symbol,
            ...put('axisLabel', node.axisLabel),
          };
    case 'monteCarloReceiver':
      return {
        ...base,
        sampleLimit: node.sampleLimit,
        ...put('rampUp', node.rampUp),
        ...put('showMeanBand', node.showMeanBand),
        ...put('showHistogram', node.showHistogram),
      };
  }
}

function parseDisplayUnits(value: JsonValue, path: string): Readonly<Record<string, Unit>> {
  const object = readObject(value, path);
  return Object.fromEntries(
    Object.entries(object).map(([port, symbol]) => [readName(port, path), parseUnitField(symbol, join(path, port))]),
  );
}

function serializeDisplayUnits(units: Readonly<Record<string, Unit>> | undefined): JsonObject | undefined {
  if (units === undefined || Object.keys(units).length === 0) return undefined;
  return Object.fromEntries(Object.entries(units).map(([port, unit]) => [port, unit.symbol]));
}

function parseTableFigures(value: JsonValue, path: string): Readonly<Record<string, number>> {
  const object = readObject(value, path);
  return Object.fromEntries(
    Object.entries(object).map(([column, figures]) => [
      readName(column, path),
      readInteger(figures, join(path, column), 1),
    ]),
  );
}

function serializeTableFigures(figures: Readonly<Record<string, number>> | undefined): JsonObject | undefined {
  if (figures === undefined || Object.keys(figures).length === 0) return undefined;
  return { ...figures };
}

function parseTableMarks(value: JsonValue, path: string): readonly number[] {
  return readArray(value, path).map((entry, i) => readInteger(entry, `${path}[${i}]`, 0));
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
    ...put('notebookLocale', optional(object, 'notebookLocale', path, (v, p) => readEnum(v, p, ['en', 'nl'] as const))),
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
    if (node.kind !== 'output' || (node.output.kind !== 'plot' && node.output.kind !== 'feasibility')) continue;
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
    ...put('notebookLocale', document.notebookLocale),
    nodes: document.nodes.map(serializeNode),
    edges: document.edges.map(serializeEdge),
    frames: document.frames.map(serializeFrame),
  };
}

/** An empty document, stamped with the version this build writes. */
export function emptyDocument(id: string, title: string): GraphDocument {
  return { schemaVersion: SCHEMA_VERSION, id, title, nodes: [], edges: [], frames: [] };
}
