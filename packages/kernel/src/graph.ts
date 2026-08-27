/**
 * What is wired to what, and whether it may be.
 *
 * This is the half of the contract `schema` deliberately left undone. A document
 * parses without a catalogue present, so it cannot know a formula's ports, let
 * alone their dimensions; and a generic port has no dimension at all until
 * something is wired to it. Both questions are answered here, in one pass over
 * the graph in topological order — which is also where a cycle shows up, since
 * a graph with one has no such order.
 *
 * **Resolution tolerates an unfinished graph and refuses an impossible one.** An
 * input that is not yet wired is normal — a student is mid-build, and the editor
 * marks it. A dimension mismatch, a cycle, a second edge into one
 * input port: those cannot be repaired by wiring more, so they are errors, and
 * `canConnect` is what lets the editor refuse the edge before it attaches rather
 * than after.
 *
 * Generic binding happens per **node instance**, not per formula: two
 * `multiply` nodes in one graph bind `$A` to whatever each of them is wired to.
 * The binding is an assignment because an input's signature is a bare variable,
 * which is the restriction `schema` enforces at parse time so that this file
 * never has to solve an equation.
 */

import {
  DIMENSIONLESS_UNIT,
  DIMENSIONLESS,
  FREQUENCY,
  bareVariable,
  dimensionsEqual,
  formatDimension,
  genericVariables,
  isDimensionless,
  isGenericDimension,
  namedUnit,
  parseUnit,
  resolveGeneric,
  unit as makeUnit,
  type Dimension,
  type GenericDimension,
  type Unit,
} from '@joveworks/units';
import {
  VALUE_PORT,
  THRESHOLD_PORT,
  VERDICT_PORT,
  ALONG_PORT,
  AT_PORT,
  BEST_PORT,
  OBJECTIVE_PORT,
  X_PORT,
  Y_PORT,
  MONTE_CARLO_SAMPLE_PORT,
  MIN_PORT,
  MAX_PORT,
  MEAN_PORT,
  STDDEV_PORT,
  MODE_PORT,
  VALUES_PORT,
  WEIGHTS_PORT,
  PERCENTILE_PORT,
  STATISTIC_RESULT_PORT,
  START_PORT,
  STOP_PORT,
  COUNT_PORT,
  plotMeasures,
  plotThresholdPort,
  axes as documentAxes,
  hasUnit,
  isRange,
  matchRef,
  axisLength,
  type AxisNode,
  type Catalogue,
  type CompareNode,
  type SelectNode,
  type StatisticNode,
  type Edge,
  type Formula,
  type FormulaRef,
  type GraphDocument,
  type GraphNode,
  type InputNode,
  type MonteCarloGeneratorNode,
  type OutputPort,
  type Port,
  type PortKind,
  type ValueSpec,
} from '@joveworks/schema';

import { packChannelIndices, waypointChannelIndices } from './bundle.js';
import { closureFormula } from './closure.js';
import { expressionDimension, type DimensionScope } from './compile.js';
import { assertConnectable, assertSameDimension, connectable } from './dimensions.js';
import { KernelError } from './errors.js';
import { parseExpression } from './parse.js';
import type { Axis } from './series.js';
import type { Warning } from './warnings.js';

/**
 * One channel of a `bundle`-kind port's per-channel type list. A pack channel
 * is whatever was wired to it — numeric with its own dimension, or
 * categorical, the same two kinds `waypoint` and `pack` pass through
 * unchanged (see their branches in `resolveGraph`).
 */
export type ChannelType = { readonly kind: 'numeric'; readonly dimension: Dimension } | { readonly kind: 'categorical' };

/** The type of one port of one node: enough to decide whether an edge may attach. */
export interface PortType {
  readonly kind: PortKind;
  /** `undefined` only while a generic port's variable is still unbound. */
  readonly dimension?: Dimension;
  /** The unit to display in, when the port declares one. */
  readonly unit?: Unit;
  /**
   * A `bundle`-kind port's per-channel types, in order — `dimension`
   * itself is meaningless for a bundle, which carries a list rather than
   * one dimension. `undefined` while unbound, same as `dimension` is for
   * every other generic port.
   */
  readonly channels?: readonly ChannelType[];
}

/** `node.port`, the key both edge ends are indexed by. */
export function endpointKey(node: string, port: string): string {
  return `${node}.${port}`;
}

/**
 * The unit a generic port displays in — a named unit when the dimension
 * has exactly one (`W` for power, not `N·mm/s`), the raw base-unit product
 * otherwise. A generic/derived frequency is the deliberate exception: it
 * prefers `Hz`, while a fixed catalogue port remains free to declare `rpm` or
 * `s-1`. `namedUnit` is the one place that decides "exactly one"; this
 * function supplies the dimensionless case, explicit generic defaults, and
 * the fallback.
 */
export function canonicalUnit(dimension: Dimension): Unit {
  if (isDimensionless(dimension)) return DIMENSIONLESS_UNIT;
  if (dimensionsEqual(dimension, FREQUENCY)) return parseUnit('Hz');
  return namedUnit(dimension) ?? makeUnit(formatDimension(dimension), dimension, 1);
}

export interface Resolution {
  readonly document: GraphDocument;
  /** Every node, in an order where a node's inputs are all already resolved. */
  readonly order: readonly GraphNode[];
  /** node id → the formula it references. */
  readonly formulas: ReadonlyMap<string, Formula>;
  /** `node.port` → the type of a port an edge may leave from. */
  readonly sources: ReadonlyMap<string, PortType>;
  /** `node.port` → the type of a port an edge may arrive at. */
  readonly targets: ReadonlyMap<string, PortType>;
  /** `node.port` → the edges arriving there — more than one only for a spectrum port. */
  readonly incoming: ReadonlyMap<string, readonly Edge[]>;
  /** node id → its generic variable bindings. */
  readonly bindings: ReadonlyMap<string, ReadonlyMap<string, Dimension>>;
  /**
   * node id → the axis it introduces, one per range/generator node. Every
   * Monte Carlo generator's `Axis.id` is the *first* generator's own id
   * (`axisOf`'s `mcTrialId`) rather than its own — so two generators
   * combined in a formula pair sample-for-sample (`series.ts`'s union rule:
   * same id, same axis) instead of forming their cross-product grid, the
   * same way two formulas both reading one ordinary range already do. A
   * lone generator is unaffected: it is its own "first", so its axis id is
   * still just its own node id.
   */
  readonly axes: ReadonlyMap<string, Axis>;
  readonly tableColumns: ReadonlyMap<string, ResolvedTableColumn>;
  readonly warnings: readonly Warning[];
}

export type ResolvedTableColumn =
  | { readonly kind: 'numeric'; readonly values: readonly number[]; readonly unit: Unit }
  | { readonly kind: 'categorical'; readonly values: readonly string[] };

// --- catalogue lookup -------------------------------------------------------

/**
 * A graph names a formula by id, version and hash and never embeds it, so
 * opening one is a lookup that can fail in two distinct ways. Missing is fatal —
 * a graph needs its catalogue. Changed is a warning: the numbers may differ from
 * the ones the student last saw, and saying so is the whole reason the hash is
 * stored.
 */
function indexFormulas(catalogues: readonly Catalogue[]): ReadonlyMap<string, readonly Formula[]> {
  const index = new Map<string, Formula[]>();
  for (const catalogue of catalogues) {
    for (const formula of catalogue.formulas) {
      const existing = index.get(formula.id);
      if (existing === undefined) index.set(formula.id, [formula]);
      else existing.push(formula);
    }
  }
  return index;
}

function lookupFormula(
  index: ReadonlyMap<string, readonly Formula[]>,
  ref: FormulaRef,
  nodeId: string,
  warnings: Warning[],
): Formula {
  const candidates = index.get(ref.id) ?? [];
  const [first] = candidates;
  if (first === undefined) {
    throw new KernelError(
      `no formula '${ref.id}' in the loaded catalogues — a graph needs its catalogue to open`,
      nodeId,
    );
  }
  const exact = candidates.find((formula) => matchRef(ref, formula) === 'match');
  if (exact !== undefined) return exact;

  warnings.push({
    kind: 'formulaChanged',
    nodeId,
    message:
      `'${ref.id}' has changed since this graph was saved (it referenced version ` +
      `${ref.version}, hash ${ref.hash}) — results may differ from the ones recorded`,
  });
  return first;
}

// --- port inventories -------------------------------------------------------

function inputValueType(node: InputNode, tableColumn?: ResolvedTableColumn): PortType {
  const spec = node.value;
  switch (spec.kind) {
    case 'categorical':
    case 'categoricalList':
      return { kind: 'categorical' };
    case 'spectrum':
      return displayOverride(node, VALUE_PORT, {
        kind: 'spectrum',
        dimension: spec.unit.dimension,
        unit: spec.unit,
      });
    case 'tableColumn':
      if (tableColumn === undefined) throw new KernelError('this table column could not be resolved', node.id);
      return tableColumn.kind === 'categorical'
        ? { kind: 'categorical' }
        : { kind: 'numeric', dimension: tableColumn.unit.dimension, unit: tableColumn.unit };
    default:
      return displayOverride(node, VALUE_PORT, {
        kind: 'numeric',
        dimension: spec.unit.dimension,
        unit: spec.unit,
      });
  }
}

/** A generator's `value` output — numeric, typed by its own declared unit, same as any numeric range's. */
function generatorValueType(node: MonteCarloGeneratorNode): PortType {
  return displayOverride(node, VALUE_PORT, {
    kind: 'numeric',
    dimension: node.unit.dimension,
    unit: node.unit,
  });
}

/** Apply a graph-local presentation choice without changing the port's type. */
function displayOverride(node: GraphNode, port: string, type: PortType): PortType {
  const unit = node.displayUnits?.[port];
  if (unit === undefined) return type;
  if (type.dimension === undefined || !dimensionsEqual(unit.dimension, type.dimension)) {
    throw new KernelError(`display unit '${unit.symbol}' is incompatible with this port`, endpointKey(node.id, port));
  }
  return { ...type, unit };
}

/**
 * The input port names an output node offers: one, or one per table column —
 * plus a `threshold` port on a plot or check, the wire that can override its
 * typed line (mirrors `CompareNode.threshold`, the first port with both a
 * typed default and an overriding wire).
 */
export function outputPortNames(node: GraphNode): readonly string[] {
  if (node.kind !== 'output') return [];
  if (node.output.kind === 'table') return node.output.columns;
  if (node.output.kind === 'plot') {
    return plotMeasures(node.output).flatMap((measure) => [measure.id, plotThresholdPort(measure.id)]);
  }
  if (node.output.kind === 'check') return [VALUE_PORT, THRESHOLD_PORT];
  // A Feasibility output references existing Check nodes by id rather than
  // taking a wire — it is the one output kind with zero ports.
  if (node.output.kind === 'feasibility' || node.output.kind === 'reliability') return [];
  // A Best Design output references its checks the same way, and takes one
  // wire for the quantity being optimised. Named `objective` rather than
  // `value` because that is what it is: the thing ranked, not the thing shown.
  if (node.output.kind === 'bestDesign') return [OBJECTIVE_PORT];
  // A Pareto output references its checks the same way again, and takes one
  // wire per objective. Named for the chart axes they become: a two-objective
  // front *is* a scatter, and wiring mass into `x` is placing it on the
  // picture about to be read.
  if (node.output.kind === 'pareto') return [X_PORT, Y_PORT];
  return [VALUE_PORT];
}

/**
 * A Select node's ports, which are deliberately **stable across modes** so
 * switching mode never strands a wire: `value` and `along` are always there,
 * `threshold` only on `crossing`, `best` only on the two extremum modes.
 */
export function selectPortNames(node: SelectNode): {
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
} {
  return {
    inputs: node.mode === 'crossing' ? [VALUE_PORT, ALONG_PORT, THRESHOLD_PORT] : [VALUE_PORT, ALONG_PORT],
    outputs: node.mode === 'argMin' || node.mode === 'argMax' ? [AT_PORT, BEST_PORT] : [AT_PORT],
  };
}

export function statisticPortNames(node: StatisticNode): {
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
} {
  return {
    inputs: node.statistic === 'percentile'
      ? [VALUE_PORT, ALONG_PORT, PERCENTILE_PORT]
      : [VALUE_PORT, ALONG_PORT],
    outputs: [STATISTIC_RESULT_PORT],
  };
}

function portType(port: Port, bindings: ReadonlyMap<string, Dimension>): PortType {
  if (port.kind === 'categorical') return { kind: 'categorical' };
  // A catalogue formula never declares one (schema/src/port.ts), so this is
  // unreachable from `formula`/`closure` resolution — kept only so `Port`'s
  // full union type-checks here.
  if (port.kind === 'bundle') return { kind: 'bundle' };
  if (!isGenericDimension(port.unit)) {
    return { kind: port.kind, dimension: port.unit.dimension, unit: port.preferredUnit ?? port.unit };
  }
  const bound = Object.fromEntries(bindings);
  for (const variable of genericVariables(port.unit)) {
    if (bound[variable] === undefined) return { kind: port.kind };
  }
  const dimension = resolveGeneric(port.unit, bound);
  return { kind: port.kind, dimension, unit: canonicalUnit(dimension) };
}

// --- topological order ------------------------------------------------------

/**
 * Kahn's algorithm over the node graph, in document order so the result is
 * stable. A graph that does not fully drain has a cycle, which is impossible
 * to reach through the editor — but a hand-edited file can carry one,
 * and it must not become an infinite loop.
 */
export function topologicalOrder(document: GraphDocument): readonly GraphNode[] {
  const nodes = new Map(document.nodes.map((node) => [node.id, node] as const));
  const remaining = new Map<string, number>(document.nodes.map((node) => [node.id, 0] as const));
  const dependents = new Map<string, string[]>();

  for (const edge of document.edges) {
    if (!nodes.has(edge.from.node) || !nodes.has(edge.to.node)) continue;
    remaining.set(edge.to.node, (remaining.get(edge.to.node) ?? 0) + 1);
    const list = dependents.get(edge.from.node);
    if (list === undefined) dependents.set(edge.from.node, [edge.to.node]);
    else list.push(edge.to.node);
  }

  const ready = document.nodes.filter((node) => remaining.get(node.id) === 0).map((node) => node.id);
  const order: GraphNode[] = [];

  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(nodes.get(id) as GraphNode);
    for (const dependent of dependents.get(id) ?? []) {
      const count = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, count);
      if (count === 0) ready.push(dependent);
    }
  }

  if (order.length !== document.nodes.length) {
    const stuck = document.nodes
      .filter((node) => !order.some((done) => done.id === node.id))
      .map((node) => node.id);
    throw new KernelError(
      `these nodes form a cycle, and the graph cannot be evaluated: ${stuck.join(', ')}`,
    );
  }
  return order;
}

/** Would this edge close a cycle? The check made at connect time. */
export function wouldCycle(document: GraphDocument, candidate: Edge): boolean {
  if (candidate.from.node === candidate.to.node) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of [...document.edges, candidate]) {
    const list = outgoing.get(edge.from.node);
    if (list === undefined) outgoing.set(edge.from.node, [edge.to.node]);
    else list.push(edge.to.node);
  }
  // Reachability from the target back to the source is what a new edge closes.
  const seen = new Set<string>([candidate.to.node]);
  const queue = [candidate.to.node];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (id === candidate.from.node) return true;
    for (const next of outgoing.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

// --- resolution -------------------------------------------------------------

/**
 * `mcTrialId` is the id every Monte Carlo generator's axis shares
 * (`Resolution.axes`'s own doc comment) — undefined only when the document
 * has no generator at all, in which case this branch never runs.
 */
function axisOf(
  node: AxisNode,
  order: number,
  tableColumn: ResolvedTableColumn | undefined,
  mcTrialId: string | undefined,
  rangeLengths: ReadonlyMap<string, number> | undefined,
): Axis {
  if (node.kind === 'monteCarloGenerator') {
    return { id: mcTrialId ?? node.id, label: node.axisLabel ?? node.label ?? node.id, length: node.count, order };
  }
  if (node.kind === 'range') {
    // `count`'s literal field is this axis's length whenever its port is
    // unwired — and also its provisional length for any caller (a
    // compatibility check while dragging a wire, say) that resolves the
    // graph without first running the `count`-resolving pass in
    // `evaluate.ts`. Only that pass's own `resolveGraph` call, with the
    // real evaluated value in `rangeLengths`, produces the axis a study
    // actually sweeps over.
    const length = rangeLengths?.get(node.id) ?? node.count;
    return { id: node.id, label: node.axisLabel ?? node.label ?? node.id, length, order };
  }
  if (node.kind === 'file') {
    // One point per file read, in the order they were picked — the axis is
    // the frames themselves, so its length is `sources`, not anything the
    // fields say.
    return { id: node.id, label: node.axisLabel ?? node.label ?? node.id, length: node.sources.length, order };
  }
  if (!isRange(node.value)) throw new KernelError('not a range node', node.id);
  const length = node.value.kind === 'tableColumn' ? tableColumn?.values.length : axisLength(node.value);
  if (length === undefined) {
    throw new KernelError(
      'this table column could not be resolved',
      node.id,
    );
  }
  return { id: node.id, label: node.axisLabel ?? node.label ?? node.id, length, order };
}

/**
 * Resolve every port of every node: kinds, dimensions, generic bindings, and the
 * edge arriving at each input. Throws on anything wiring cannot fix.
 */
export function resolveGraph(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  /**
   * A wired `RangeNode`'s resolved point count, by node id — computed by
   * the pre-resolution pass in `evaluate.ts`. Absent (the default) for any
   * caller that only needs types/dimensions, not a correct study grid — a
   * range node whose `count` is wired then falls back to its own literal
   * `count` field as a provisional length (`axisOf`'s own comment).
   */
  rangeLengths?: ReadonlyMap<string, number>,
): Resolution {
  const warnings: Warning[] = [];
  const index = indexFormulas(catalogues);
  const order = topologicalOrder(document);
  const tableColumns = new Map<string, ResolvedTableColumn>();
  for (const node of documentAxes(document)) {
    if (node.kind !== 'input' || node.value.kind !== 'tableColumn') continue;
    const spec = node.value;
    const candidates = index.get(spec.table) ?? [];
    const formula = candidates[0];
    const axis = formula?.lookup?.axes.find((candidate) => candidate.input === spec.column);
    const port = formula?.inputs.find((candidate) => candidate.name === spec.column);
    if (formula === undefined || axis === undefined || port === undefined) {
      throw new KernelError(`no lookup table '${spec.table}.${spec.column}'`, node.id);
    }
    if (axis.kind === 'categorical' && port.kind === 'categorical') {
      tableColumns.set(node.id, { kind: 'categorical', values: axis.values as readonly string[] });
    } else if (axis.kind === 'numeric' && port.kind === 'numeric' && !isGenericDimension(port.unit)) {
      tableColumns.set(node.id, { kind: 'numeric', values: axis.values as readonly number[], unit: port.unit });
    } else {
      throw new KernelError(`lookup table column '${spec.column}' has inconsistent types`, node.id);
    }
  }

  const axisNodes = documentAxes(document);
  const mcTrialId = axisNodes.find((node) => node.kind === 'monteCarloGenerator')?.id;
  const axes = new Map(
    axisNodes.map(
      (node, i) => [node.id, axisOf(node, i, tableColumns.get(node.id), mcTrialId, rangeLengths)] as const,
    ),
  );
  const formulas = new Map<string, Formula>();
  const sources = new Map<string, PortType>();
  const targets = new Map<string, PortType>();
  const incoming = new Map<string, Edge[]>();
  const bindings = new Map<string, ReadonlyMap<string, Dimension>>();

  // Collected here, not refused here: whether a second edge at one port is
  // allowed depends on that port's kind, which is not known until the
  // node's formula is looked up below.
  for (const edge of document.edges) {
    const key = endpointKey(edge.to.node, edge.to.port);
    const list = incoming.get(key);
    if (list === undefined) incoming.set(key, [edge]);
    else list.push(edge);
  }

  const oneEdge = (key: string): Edge | undefined => {
    const edges = incoming.get(key);
    if (edges === undefined || edges.length === 0) return undefined;
    if (edges.length > 1) {
      throw new KernelError(
        `two edges arrive at this input port ('${edges[0]?.id}' and '${edges[1]?.id}') — ` +
          'an input takes one connection',
        key,
      );
    }
    return edges[0];
  };

  /** `oneEdge`, as the zero-or-one-element array a spectrum port's slot takes. */
  const oneEdgeArray = (key: string): readonly Edge[] => {
    const edge = oneEdge(key);
    return edge === undefined ? [] : [edge];
  };

  const sourceType = (edge: Edge): PortType => {
    const key = endpointKey(edge.from.node, edge.from.port);
    const type = sources.get(key);
    if (type === undefined) {
      throw new KernelError(`'${key}' is not an output port of that node`, edge.id);
    }
    return type;
  };

  const checkKind = (source: PortType, target: PortType, where: string): void => {
    if (source.kind === target.kind) return;
    if (source.kind === 'numeric' && target.kind === 'spectrum') return;
    throw new KernelError(
      `cannot connect a ${source.kind} value to a ${target.kind} port`,
      where,
    );
  };

  /**
   * Bind a node's generic variables from what is wired in — or, where nothing
   * is, from what was typed on the node itself — then check every edge against
   * the port it arrives at. An input's signature is a bare variable, so this is
   * an assignment and never an equation — shared by a `formula` node (whose
   * ports may deliberately reuse one variable, as `add`'s two inputs both do
   * with `$A`) and a `closure` node (whose ports never do, each free name
   * having its own).
   *
   * An inline value binds exactly as an edge does. It has to: a generic port
   * has no dimension of its own, so `add` with `5 mm` typed into `a` would
   * otherwise leave `$A` unbound and never resolve its own output — and a
   * closure node, whose every port is generic, would not resolve at all until
   * every last name had a wire.
   */
  const bindInputs = (
    nodeId: string,
    formula: Formula,
    inputValues: Readonly<Record<string, ValueSpec>> | undefined,
  ): Map<string, Dimension> => {
    const bound = new Map<string, Dimension>();
    const bindVariable = (unit: GenericDimension, dimension: Dimension, key: string): void => {
      const variable = bareVariable(unit) as string;
      const already = bound.get(variable);
      if (already === undefined) bound.set(variable, dimension);
      else {
        assertSameDimension(
          already,
          dimension,
          `'$${variable}' is bound twice on this node and must be one dimension`,
          key,
        );
      }
    };

    for (const port of formula.inputs) {
      const key = endpointKey(nodeId, port.name);
      const generic =
        port.kind !== 'categorical' && port.kind !== 'bundle' && isGenericDimension(port.unit)
          ? port.unit
          : undefined;
      // A spectrum port takes one edge per collected value; every
      // other kind takes exactly one, which `oneEdge` throws on if not true.
      const edges = port.kind === 'spectrum' ? (incoming.get(key) ?? []) : oneEdgeArray(key);
      if (edges.length === 0) {
        // A spectrum port collects wires and takes no inline value
        // (`inputValues` is validated as scalar-or-categorical below), so
        // there is nothing here to bind from.
        const authored = inputValues?.[port.name];
        if (generic !== undefined && (authored?.kind === 'scalar' || authored?.kind === 'slider')) {
          bindVariable(generic, authored.unit.dimension, key);
        }
        continue;
      }
      const declared = portType(port, bound);

      for (const edge of edges) {
        const source = sourceType(edge);
        checkKind(source, declared, key);

        if (generic !== undefined) {
          const dimension = source.dimension;
          if (dimension === undefined) {
            throw new KernelError(
              `'${endpointKey(edge.from.node, edge.from.port)}' has no dimension yet — ` +
                'wire its own inputs first',
              key,
            );
          }
          bindVariable(generic, dimension, key);
          continue;
        }

        if (declared.dimension !== undefined && source.dimension !== undefined) {
          assertConnectable(source.dimension, declared.dimension, key);
        }
      }
    }
    return bound;
  };

  /**
   * A value typed on the node in place of a wire, checked against the port it
   * stands in for. Generic ports are exempt from the dimension check for the
   * same reason an edge into one is: the value is what *gives* the port its
   * dimension (`bindInputs`), so there is nothing yet to disagree with.
   */
  const checkInputValues = (
    nodeId: string,
    formula: Formula,
    inputValues: Readonly<Record<string, ValueSpec>> | undefined,
  ): void => {
    for (const [name, authored] of Object.entries(inputValues ?? {})) {
      const port = formula.inputs.find((candidate) => candidate.name === name);
      const key = endpointKey(nodeId, name);
      if (port === undefined) throw new KernelError(`'${name}' is not an input of '${formula.id}'`, key);
      if (port.kind === 'categorical') {
        if (authored.kind !== 'categorical') throw new KernelError(`'${name}' needs a categorical fallback`, key);
        if (!port.domain.includes(authored.value)) {
          throw new KernelError(`'${authored.value}' is not in '${name}'s declared domain`, key);
        }
        continue;
      }
      if (port.kind !== 'numeric' || (authored.kind !== 'scalar' && authored.kind !== 'slider')) {
        throw new KernelError(`'${name}' needs a scalar numeric fallback`, key);
      }
      if (!isGenericDimension(port.unit)) assertConnectable(authored.unit.dimension, port.unit.dimension, key);
    }
  };

  for (const node of order) {
    if (node.kind === 'input') {
      sources.set(endpointKey(node.id, VALUE_PORT), inputValueType(node, tableColumns.get(node.id)));
      continue;
    }

    if (node.kind === 'file') {
      // Every port this node has is declared on the node itself, by the
      // reader that filled it in — which is why the kernel needs to know
      // nothing about EXIF, or about any format a later reader understands.
      // A field with a unit is numeric in that unit; one without is
      // categorical, the same way a categorical port declares no unit.
      for (const field of node.fields) {
        sources.set(
          endpointKey(node.id, field.name),
          displayOverride(
            node,
            field.name,
            field.unit === undefined
              ? { kind: 'categorical' }
              : { kind: 'numeric', dimension: field.unit.dimension, unit: field.unit },
          ),
        );
      }
      continue;
    }

    if (node.kind === 'monteCarloGenerator') {
      sources.set(endpointKey(node.id, VALUE_PORT), generatorValueType(node));

      // Each distribution parameter is a `CompareNode.threshold`-shaped port:
      // typed on the node, wireable, dimension fixed to the generator's own
      // `unit` (unlike threshold, which infers its dimension from whatever
      // `value` is wired to — here there is no `value` input to infer from,
      // so the target type never needs to wait on anything).
      if (node.distribution === 'discrete') {
        const valuesKey = endpointKey(node.id, VALUES_PORT);
        const weightsKey = endpointKey(node.id, WEIGHTS_PORT);
        targets.set(valuesKey, { kind: 'spectrum', dimension: node.unit.dimension, unit: node.unit });
        targets.set(weightsKey, { kind: 'spectrum', dimension: DIMENSIONLESS, unit: DIMENSIONLESS_UNIT });
        for (const key of [valuesKey, weightsKey]) {
          const edge = oneEdge(key);
          if (edge !== undefined) {
            const source = sourceType(edge);
            const target = targets.get(key) as PortType;
            checkKind(source, target, key);
            if (source.dimension !== undefined && target.dimension !== undefined) {
              assertConnectable(source.dimension, target.dimension, key);
            }
          }
        }
        continue;
      }
      const paramType: PortType = { kind: 'numeric', dimension: node.unit.dimension, unit: node.unit };
      const paramPorts = node.distribution === 'uniform'
        ? [MIN_PORT, MAX_PORT]
        : node.distribution === 'triangular'
          ? [MIN_PORT, MODE_PORT, MAX_PORT]
          : [MEAN_PORT, STDDEV_PORT];
      for (const name of paramPorts) {
        const key = endpointKey(node.id, name);
        targets.set(key, paramType);
        const edge = oneEdge(key);
        if (edge === undefined) continue;
        const source = sourceType(edge);
        checkKind(source, paramType, key);
        if (source.dimension !== undefined) assertConnectable(source.dimension, node.unit.dimension, key);
      }
      continue;
    }

    if (node.kind === 'range') {
      // `start` and `stop` are generic until wiring — or the node's own
      // typed `unit` — pins them, the same "unbound until an edge or a
      // typed default supplies one" state `CompareNode.value` sits in. The
      // dimension follows whichever of the two is wired, both having to
      // agree if both are; `unit` applies only once neither is, and is
      // itself ignored while it is left at its dimensionless default — a
      // freshly dropped range is open to a wire of any dimension rather
      // than refusing every one of them for disagreeing with a unit
      // nobody chose yet.
      const startKey = endpointKey(node.id, START_PORT);
      const stopKey = endpointKey(node.id, STOP_PORT);
      const startEdge = oneEdge(startKey);
      const stopEdge = oneEdge(stopKey);
      const startSource = startEdge === undefined ? undefined : sourceType(startEdge);
      const stopSource = stopEdge === undefined ? undefined : sourceType(stopEdge);
      if (startSource !== undefined) checkKind(startSource, { kind: 'numeric' }, startKey);
      if (stopSource !== undefined) checkKind(stopSource, { kind: 'numeric' }, stopKey);
      if (startSource?.dimension !== undefined && stopSource?.dimension !== undefined) {
        assertSameDimension(
          startSource.dimension,
          stopSource.dimension,
          'a range needs the same dimension at both ends',
          stopKey,
        );
      }

      const wiredDimension = startSource?.dimension ?? stopSource?.dimension;
      const dimension = wiredDimension ?? (isDimensionless(node.unit.dimension) ? undefined : node.unit.dimension);
      const boundType: PortType =
        dimension === undefined
          ? { kind: 'numeric' }
          : {
              kind: 'numeric',
              dimension,
              // The node's own typed unit while it is what pinned the
              // dimension; the wire's own canonical unit once a wire did,
              // so the port reads in whatever the wire is naturally in
              // rather than a unit typed for a since-overridden default.
              unit: wiredDimension === undefined ? node.unit : canonicalUnit(dimension),
            };
      targets.set(startKey, boundType);
      targets.set(stopKey, boundType);
      if (dimension !== undefined) {
        if (startSource?.dimension !== undefined) assertConnectable(startSource.dimension, dimension, startKey);
        if (stopSource?.dimension !== undefined) assertConnectable(stopSource.dimension, dimension, stopKey);
      }

      sources.set(
        endpointKey(node.id, VALUE_PORT),
        dimension === undefined
          ? { kind: 'numeric' }
          : displayOverride(node, VALUE_PORT, { kind: 'numeric', dimension, unit: boundType.unit as Unit }),
      );

      // `count` is dimensionless regardless of `unit` — it is a number of
      // points, not a quantity — and unlike the other two, a wire into it
      // is not resolved here at all: it is the one port whose *value* has
      // to be known before this very pass can size the axis, which is
      // what the pre-resolution round in `evaluate.ts` is for. Typing it
      // here is still correct and harmless — it only checks that whatever
      // is wired is a dimensionless numeric, not what it evaluates to.
      const countType: PortType = { kind: 'numeric', dimension: DIMENSIONLESS, unit: DIMENSIONLESS_UNIT };
      const countKey = endpointKey(node.id, COUNT_PORT);
      targets.set(countKey, countType);
      const countEdge = oneEdge(countKey);
      if (countEdge !== undefined) {
        const source = sourceType(countEdge);
        checkKind(source, countType, countKey);
        if (source.dimension !== undefined) assertConnectable(source.dimension, DIMENSIONLESS, countKey);
      }
      continue;
    }

    if (node.kind === 'monteCarloReceiver') {
      // The one input a receiver takes: unbound until something is wired,
      // the same state `compare`'s `value` port sits in before it has a
      // source (there is nothing sensible to accumulate otherwise).
      const key = endpointKey(node.id, MONTE_CARLO_SAMPLE_PORT);
      const edge = oneEdge(key);
      targets.set(key, edge === undefined ? { kind: 'numeric' } : sourceType(edge));
      continue;
    }

    if (node.kind === 'formula') {
      const formula = lookupFormula(index, node.formula, node.id, warnings);
      formulas.set(node.id, formula);
      checkInputValues(node.id, formula, node.inputValues);
      const bound = bindInputs(node.id, formula, node.inputValues);
      bindings.set(node.id, bound);
      for (const port of formula.inputs) {
        targets.set(
          endpointKey(node.id, port.name),
          displayOverride(node, port.name, portType(port, bound)),
        );
      }
      for (const port of formula.outputs) {
        sources.set(
          endpointKey(node.id, port.name),
          displayOverride(node, port.name, portType(port, bound)),
        );
      }
      continue;
    }

    if (node.kind === 'closure') {
      // `closureFormula` and the parser it calls attribute their own errors to
      // an expression string, not a node — of no use to the editor, which can
      // only mark a *node* as failed. Re-attribute here, where the node id is
      // known, so a bad closure expression is contained to its own node
      // instead of aborting resolution for the whole document.
      let formula: Formula;
      try {
        formula = closureFormula(node.expression);
      } catch (error) {
        throw error instanceof KernelError ? new KernelError(error.message, node.id) : error;
      }
      formulas.set(node.id, formula);
      checkInputValues(node.id, formula, node.inputValues);
      const bound = bindInputs(node.id, formula, node.inputValues);
      bindings.set(node.id, bound);
      for (const port of formula.inputs) {
        targets.set(
          endpointKey(node.id, port.name),
          displayOverride(node, port.name, portType(port, bound)),
        );
      }

      // No reusable template to resolve the output against (see closure.ts):
      // once every free name the expression uses is bound, prove its
      // dimension live, the same way `formula.ts`'s own self-check does for
      // a hand-authored record — just against this one node's real wiring
      // instead of a probed basis.
      // A closure is built with exactly one output (see closure.ts).
      const closureOutput = formula.outputs[0] as OutputPort;
      const outputKey = endpointKey(node.id, closureOutput.name);
      if (formula.inputs.every((port) => bound.has(port.name))) {
        const scope: DimensionScope = {
          dimensions: Object.fromEntries(bound),
          spectra: new Set(
            formula.inputs.filter((port) => port.kind === 'spectrum').map((port) => port.name),
          ),
        };
        const dimension = expressionDimension(parseExpression(node.expression), scope, node.id);
        sources.set(
          outputKey,
          displayOverride(node, closureOutput.name, {
            kind: 'numeric',
            dimension,
            unit: canonicalUnit(dimension),
          }),
        );
      } else {
        sources.set(outputKey, { kind: 'numeric' });
      }
      continue;
    }

    if (node.kind === 'waypoint') {
      for (const n of waypointChannelIndices(document, node.id)) {
        const inKey = endpointKey(node.id, `in${n}`);
        const outKey = endpointKey(node.id, `out${n}`);
        const edge = oneEdge(inKey);
        if (edge === undefined) {
          targets.set(inKey, { kind: 'numeric' });
          sources.set(outKey, { kind: 'numeric' });
          continue;
        }
        const source = sourceType(edge);
        if (source.kind === 'categorical') {
          const type: PortType = { kind: 'categorical' };
          targets.set(inKey, type);
          sources.set(outKey, type);
          continue;
        }
        checkKind(source, { kind: 'numeric' }, inKey);
        if (source.dimension === undefined) {
          throw new KernelError(
            `'${endpointKey(edge.from.node, edge.from.port)}' has no dimension yet — wire its own inputs first`,
            inKey,
          );
        }
        const type = { kind: 'numeric' as const, dimension: source.dimension, unit: canonicalUnit(source.dimension) };
        targets.set(inKey, type);
        sources.set(outKey, type);
      }
      continue;
    }

    if (node.kind === 'pack') {
      // Channels are read straight off the edges wired to `in0..inN`, in
      // index order — there is no declared port list to consult, the same
      // way a closure node has none (bundle.ts's `packChannelIndices`).
      // Each channel is independently generic: `in2` binds its own `$C2`
      // and never shares it with `in0`, unlike `add`'s two ports sharing
      // `$A` — every channel may be a different dimension, that being the
      // whole point of bundling several wires into one.
      const indices = packChannelIndices(document, node.id);
      const channels: ChannelType[] = [];
      for (const n of indices) {
        const inKey = endpointKey(node.id, `in${n}`);
        const edge = oneEdge(inKey);
        if (edge === undefined) continue;
        const source = sourceType(edge);
        if (source.kind === 'categorical') {
          targets.set(inKey, { kind: 'categorical' });
          channels.push({ kind: 'categorical' });
          continue;
        }
        checkKind(source, { kind: 'numeric' }, inKey);
        if (source.dimension === undefined) {
          throw new KernelError(
            `'${endpointKey(edge.from.node, edge.from.port)}' has no dimension yet — wire its own inputs first`,
            inKey,
          );
        }
        targets.set(inKey, { kind: 'numeric', dimension: source.dimension, unit: canonicalUnit(source.dimension) });
        channels.push({ kind: 'numeric', dimension: source.dimension });
      }
      sources.set(endpointKey(node.id, 'bundle'), { kind: 'bundle', channels });
      continue;
    }

    if (node.kind === 'unpack') {
      // `bundle` is unbound until something is wired to it — the same state
      // `compare`'s `value` sits in before it has a source — and once it is,
      // `out0..outN` come straight from the wired bundle's own channel list,
      // not from any declaration of unpack's own.
      const inKey = endpointKey(node.id, 'bundle');
      const edge = oneEdge(inKey);
      if (edge === undefined) {
        targets.set(inKey, { kind: 'bundle' });
        continue;
      }
      const source = sourceType(edge);
      checkKind(source, { kind: 'bundle' }, inKey);
      targets.set(inKey, source);
      for (const [i, channel] of (source.channels ?? []).entries()) {
        sources.set(
          endpointKey(node.id, `out${i}`),
          channel.kind === 'categorical'
            ? { kind: 'categorical' }
            : { kind: 'numeric', dimension: channel.dimension, unit: canonicalUnit(channel.dimension) },
        );
      }
      continue;
    }

    if (node.kind === 'compare') {
      // `value` has no default — there is nothing sensible to compare
      // against when nothing is wired — so its dimension is unbound until
      // an edge supplies one, the same state a formula's own generic port
      // sits in before anything is wired to it.
      const valueKey = endpointKey(node.id, VALUE_PORT);
      const valueEdge = oneEdge(valueKey);
      const valueType: PortType = valueEdge === undefined ? { kind: 'numeric' } : sourceType(valueEdge);
      targets.set(valueKey, valueType);

      // `threshold` does have a default — a typed quantity, now a port
      // fallback rather than the only way to set the bound — so once
      // `value`'s dimension is known, `threshold`'s target follows it either
      // way — narrowing what may be wired there to match.
      const dimension = valueType.dimension;
      const thresholdKey = endpointKey(node.id, THRESHOLD_PORT);
      const thresholdEdge = oneEdge(thresholdKey);
      targets.set(
        thresholdKey,
        dimension === undefined
          ? { kind: 'numeric' }
          : { kind: 'numeric', dimension, unit: canonicalUnit(dimension) },
      );

      // An unwired threshold with no unit of its own is a bare literal, and
      // takes whatever dimension `value` resolves to — the same
      // reading `d < 50` gets in a length-typed expression. Asserting here
      // would refuse the ordinary case of a freshly dropped node, whose
      // threshold has not been given a unit yet, the moment `value` is
      // wired to anything but a dimensionless port. A wired edge is a real
      // port and still has to match exactly, and so does a threshold
      // whose unit the student *did* set, even unwired.
      const bareDefault = thresholdEdge === undefined && isDimensionless(node.threshold.unit.dimension);
      if (dimension !== undefined && !bareDefault) {
        const boundDimension =
          thresholdEdge === undefined ? node.threshold.unit.dimension : sourceType(thresholdEdge).dimension;
        if (boundDimension !== undefined) {
          assertSameDimension(
            dimension,
            boundDimension,
            'a comparison needs the value and the threshold in the same dimension',
            thresholdKey,
          );
        }
      }

      sources.set(endpointKey(node.id, VERDICT_PORT), { kind: 'categorical' });
      continue;
    }

    if (node.kind === 'select') {
      // Both inputs are unbound until an edge supplies a dimension — the
      // same state `compare`'s `value` sits in — and each propagates to a
      // different output: `along`'s to `at`, `value`'s to `best`. That is
      // the whole reason `along` is a port rather than an axis id typed into
      // a dropdown: the coordinate the answer is expressed in has to come
      // from somewhere, and a wire already carries it.
      const valueKey = endpointKey(node.id, VALUE_PORT);
      const valueEdge = oneEdge(valueKey);
      const valueType: PortType =
        valueEdge === undefined
          ? { kind: node.mode === 'firstPassing' ? 'categorical' : 'numeric' }
          : sourceType(valueEdge);
      targets.set(valueKey, valueType);

      const alongKey = endpointKey(node.id, ALONG_PORT);
      const alongEdge = oneEdge(alongKey);
      const alongType: PortType = alongEdge === undefined ? { kind: 'numeric' } : sourceType(alongEdge);
      checkKind(alongType, { kind: 'numeric' }, alongKey);
      targets.set(alongKey, alongType);

      // `at` is the headline answer, and it is a coordinate: it carries
      // `along`'s dimension, never `value`'s.
      sources.set(
        endpointKey(node.id, AT_PORT),
        alongType.dimension === undefined
          ? { kind: 'numeric' }
          : displayOverride(node, AT_PORT, {
              kind: 'numeric',
              dimension: alongType.dimension,
              unit: alongType.unit ?? canonicalUnit(alongType.dimension),
            }),
      );

      if (node.mode === 'argMin' || node.mode === 'argMax') {
        sources.set(
          endpointKey(node.id, BEST_PORT),
          valueType.dimension === undefined
            ? { kind: 'numeric' }
            : displayOverride(node, BEST_PORT, {
                kind: 'numeric',
                dimension: valueType.dimension,
                unit: valueType.unit ?? canonicalUnit(valueType.dimension),
              }),
        );
        continue;
      }

      if (node.mode !== 'crossing') continue;

      // `threshold` is `CompareNode.threshold` again, for the same reason and
      // with the same bare-unitless-default reading — reuse the reasoning
      // rather than inventing a second one.
      const dimension = valueType.dimension;
      const thresholdKey = endpointKey(node.id, THRESHOLD_PORT);
      const thresholdEdge = oneEdge(thresholdKey);
      targets.set(
        thresholdKey,
        dimension === undefined
          ? { kind: 'numeric' }
          : { kind: 'numeric', dimension, unit: canonicalUnit(dimension) },
      );
      const bareDefault = thresholdEdge === undefined && isDimensionless(node.threshold.unit.dimension);
      if (dimension !== undefined && !bareDefault) {
        const boundDimension =
          thresholdEdge === undefined ? node.threshold.unit.dimension : sourceType(thresholdEdge).dimension;
        if (boundDimension !== undefined) {
          assertSameDimension(
            dimension,
            boundDimension,
            'a crossing needs the value and the threshold in the same dimension',
            thresholdKey,
          );
        }
      }
      continue;
    }

    if (node.kind === 'statistic') {
      const valueKey = endpointKey(node.id, VALUE_PORT);
      const valueEdge = oneEdge(valueKey);
      const fallbackKind = node.statistic === 'probability' ? 'categorical' : 'numeric';
      const valueType: PortType = valueEdge === undefined ? { kind: fallbackKind } : sourceType(valueEdge);
      if (node.statistic === 'probability') checkKind(valueType, { kind: 'categorical' }, valueKey);
      else if (node.statistic !== 'count') checkKind(valueType, { kind: 'numeric' }, valueKey);
      targets.set(valueKey, valueType);

      const alongKey = endpointKey(node.id, ALONG_PORT);
      const alongEdge = oneEdge(alongKey);
      const alongType: PortType = alongEdge === undefined ? { kind: 'numeric' } : sourceType(alongEdge);
      checkKind(alongType, { kind: 'numeric' }, alongKey);
      targets.set(alongKey, alongType);

      if (node.statistic === 'percentile') {
        const percentileKey = endpointKey(node.id, PERCENTILE_PORT);
        const percentileEdge = oneEdge(percentileKey);
        const percentileType: PortType = { kind: 'numeric', dimension: DIMENSIONLESS, unit: DIMENSIONLESS_UNIT };
        targets.set(percentileKey, percentileType);
        if (percentileEdge !== undefined) {
          const source = sourceType(percentileEdge);
          checkKind(source, percentileType, percentileKey);
          if (source.dimension !== undefined) assertConnectable(source.dimension, DIMENSIONLESS, percentileKey);
        }
      }
      const resultType = node.statistic === 'probability' || node.statistic === 'count'
        ? { kind: 'numeric' as const, dimension: DIMENSIONLESS, unit: DIMENSIONLESS_UNIT }
        : { ...valueType, kind: 'numeric' as const };
      sources.set(endpointKey(node.id, STATISTIC_RESULT_PORT), resultType);
      continue;
    }

    // An output node accepts whatever is wired to it — it renders a value, it
    // does not declare one. The two things it can be wrong about are a
    // check's or a plot's threshold, both quantities a student typed with an
    // overriding wire — `CompareNode.threshold`'s pattern.
    for (const name of outputPortNames(node)) {
      const key = endpointKey(node.id, name);
      const edge = oneEdge(key);
      const type: PortType = edge === undefined ? { kind: 'numeric' } : sourceType(edge);
      targets.set(key, type);

      // A check's threshold is mandatory but still wireable — the same
      // narrowing/bare-default treatment plot's optional threshold gets
      // below, minus the "no threshold at all" case that doesn't apply here.
      // Once the checked value's own dimension is known (processed first —
      // VALUE_PORT precedes THRESHOLD_PORT in `outputPortNames`), the
      // threshold's target narrows to match it, and a bare unitless default
      // (a freshly dropped node, whose typed threshold was never given a
      // unit) is read in that dimension rather than refused.
      if (node.output.kind === 'check' && name === THRESHOLD_PORT) {
        const dimension = targets.get(endpointKey(node.id, VALUE_PORT))?.dimension;
        targets.set(
          key,
          dimension === undefined
            ? { kind: 'numeric' }
            : { kind: 'numeric', dimension, unit: canonicalUnit(dimension) },
        );
        const bareDefault = edge === undefined && isDimensionless(node.output.threshold.unit.dimension);
        if (dimension !== undefined && !bareDefault) {
          const boundDimension = edge === undefined ? node.output.threshold.unit.dimension : type.dimension;
          if (boundDimension !== undefined) {
            assertSameDimension(
              dimension,
              boundDimension,
              'a check compares a value against a threshold of the same dimension',
              key,
            );
          }
        }
      }

      // A plot's threshold is optional — `CompareNode.threshold`'s pattern,
      // minus the requirement that one exist at all. Once the plotted
      // value's own dimension is known (processed first — VALUE_PORT
      // precedes THRESHOLD_PORT in `outputPortNames`), the threshold's
      // target narrows to match it, and a bare unitless default (a freshly
      // dropped node, or one whose typed threshold was never given a unit)
      // is read in that dimension rather than refused.
      const plotMeasure = node.output.kind === 'plot'
        ? plotMeasures(node.output).find((measure) => plotThresholdPort(measure.id) === name)
        : undefined;
      if (node.output.kind === 'plot' && plotMeasure !== undefined) {
        const dimension = targets.get(endpointKey(node.id, plotMeasure.id))?.dimension;
        targets.set(
          key,
          dimension === undefined
            ? { kind: 'numeric' }
            : { kind: 'numeric', dimension, unit: canonicalUnit(dimension) },
        );
        const authoredUnit = plotMeasure.threshold?.unit;
        const bareDefault =
          edge === undefined && (authoredUnit === undefined || isDimensionless(authoredUnit.dimension));
        if (dimension !== undefined && !bareDefault) {
          const boundDimension = edge === undefined ? authoredUnit?.dimension : type.dimension;
          if (boundDimension !== undefined) {
            assertSameDimension(
              dimension,
              boundDimension,
              "a plot's threshold needs the same dimension as the plotted value",
              key,
            );
          }
        }
      }

      // An equation output shows the wired node's *expression*, not its
      // value — so, unlike every other output kind, what it accepts is
      // restricted to a node that has one: a formula or a closure, both
      // already resolved into `formulas` by the time this node is reached
      // (topological order).
      if (node.output.kind === 'equation' && edge !== undefined && !formulas.has(edge.from.node)) {
        throw new KernelError(
          `an equation output shows a formula's expression — '${edge.from.node}' is not a formula or equation node`,
          key,
        );
      }
    }
  }

  // Every edge must name ports that exist. Sources are validated as they are
  // used above; targets are checked here so a stray edge into a port a formula
  // does not have is reported rather than ignored.
  for (const edge of document.edges) {
    const key = endpointKey(edge.to.node, edge.to.port);
    if (!targets.has(key)) {
      throw new KernelError(`'${key}' is not an input port of that node`, edge.id);
    }
    sourceType(edge);
  }

  return { document, order, formulas, sources, targets, incoming, bindings, axes, tableColumns, warnings };
}

/**
 * Whether an edge's target is a spectrum port, straight from the catalogue —
 * cheaper than a full resolve, and all `canConnect` needs to decide whether a
 * candidate should join what's already there or displace it.
 * Anything it cannot place (no such node, no such formula, no such port)
 * answers `false`, which is the ordinary one-edge-per-port default.
 */
function isSpectrumTarget(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  to: Edge['to'],
): boolean {
  const node = document.nodes.find((candidate) => candidate.id === to.node);
  if (node === undefined) return false;

  if (node.kind === 'closure') {
    try {
      return closureFormula(node.expression).inputs.find((port) => port.name === to.port)?.kind === 'spectrum';
    } catch {
      return false;
    }
  }

  if (node.kind !== 'formula') return false;
  for (const catalogue of catalogues) {
    const formula = catalogue.formulas.find((entry) => matchRef(node.formula, entry) === 'match');
    const port = formula?.inputs.find((candidate) => candidate.name === to.port);
    if (port !== undefined) return port.kind === 'spectrum';
  }
  return false;
}

export type ConnectionCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * May this edge attach?
 *
 * The check is the full resolution with the candidate edge added, which is what
 * makes connect time and evaluation time agree by construction: there is one set
 * of rules, not a cheap approximation in the editor and a real one in the
 * kernel. Graphs are tens of nodes, so the cost of being exact is nothing.
 */
export function canConnect(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  candidate: Edge,
): ConnectionCheck {
  if (wouldCycle(document, candidate)) {
    return { ok: false, reason: 'this connection would close a cycle, which is not allowed' };
  }
  try {
    // A dragged wire replaces whatever already arrives at that input (an input
    // takes one connection) rather than being refused for arriving alongside
    // it — `connect` in the editor's document model already does this; the
    // check has to agree, or a re-drag onto an occupied port is rejected here
    // before it ever reaches that replace. A spectrum port is the one
    // exception: a second wire joins it, so nothing already there is
    // displaced.
    const displaced = isSpectrumTarget(document, catalogues, candidate.to)
      ? document.edges
      : document.edges.filter(
          (edge) => !(edge.to.node === candidate.to.node && edge.to.port === candidate.to.port),
        );
    resolveGraph({ ...document, edges: [...displaced, candidate] }, catalogues);
    return { ok: true };
  } catch (error) {
    if (error instanceof KernelError) return { ok: false, reason: error.message };
    throw error;
  }
}

/**
 * Whether two already-resolved port types would accept a connection.
 *
 * The editor's cheap answer — what to grey out while a wire is being dragged.
 * `canConnect` remains the authority, because only it knows about cycles and
 * about ports that are still unbound.
 */
/**
 * A freshly placed input node's unit is provisional — nothing has read it
 * yet — so wiring its output straight into a port of a different dimension
 * need not be refused the way every other mismatch is. Instead the input
 * relabels itself to the target's unit and the connection goes through.
 *
 * Deliberately narrow: the source must be an `input` node (an output's or a
 * formula's port is never adopted this way, only typed at authoring time),
 * it must not already have an outgoing edge (a second wire would silently
 * reinterpret a value something downstream already depends on), and its
 * `ValueSpec` must be one of the kinds that carries a `unit` at all —
 * `hasUnit` skips the categorical kinds, which have none to adapt.
 *
 * Only the unit is swapped; every magnitude already typed (`value`,
 * `start`/`stop`, `values`, …) survives untouched. There is no principled
 * conversion between genuinely different dimensions — this is a relabel, not
 * a unit conversion — so `canConnect` is still what decides whether the
 * result is actually connectable (a categorical or kind mismatch, or a
 * cycle, still refuses exactly as before).
 */
export function adaptInputUnit(
  document: GraphDocument,
  candidate: Edge,
  targetUnit: Unit,
): GraphDocument | undefined {
  const source = document.nodes.find((node) => node.id === candidate.from.node);
  if (source === undefined || source.kind !== 'input') return undefined;
  if (!hasUnit(source.value)) return undefined;
  const alreadyWired = document.edges.some((edge) => edge.from.node === source.id);
  if (alreadyWired) return undefined;

  return {
    ...document,
    nodes: document.nodes.map((node): GraphNode =>
      node.kind === 'input' && node.id === source.id && hasUnit(node.value)
        ? { ...node, value: { ...node.value, unit: targetUnit } }
        : node,
    ),
  };
}

export function typesConnect(source: PortType, target: PortType): boolean {
  // A spectrum target takes a matching spectrum source (one authored list, as
  // before) or a numeric one — one of what may be several discrete
  // wires collected into a series before the formula's own expression runs.
  const kindsMatch =
    source.kind === target.kind || (source.kind === 'numeric' && target.kind === 'spectrum');
  if (!kindsMatch) return false;
  if (source.dimension === undefined || target.dimension === undefined) return true;
  return connectable(source.dimension, target.dimension);
}
