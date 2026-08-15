/**
 * What is wired to what, and whether it may be (S6, S18, S59).
 *
 * This is the half of the contract `schema` deliberately left undone. A document
 * parses without a catalogue present, so it cannot know a formula's ports, let
 * alone their dimensions; and a generic port has no dimension at all until
 * something is wired to it. Both questions are answered here, in one pass over
 * the graph in topological order — which is also where a cycle shows up, since
 * a graph with one has no such order.
 *
 * **Resolution tolerates an unfinished graph and refuses an impossible one.** An
 * input that is not yet wired is normal — a student is mid-build, and S50 has
 * the editor mark it. A dimension mismatch, a cycle, a second edge into one
 * input port: those cannot be repaired by wiring more, so they are errors, and
 * `canConnect` is what lets the editor refuse the edge before it attaches rather
 * than after.
 *
 * Generic binding (S59) happens per **node instance**, not per formula: two
 * `multiply` nodes in one graph bind `$A` to whatever each of them is wired to.
 * The binding is an assignment because an input's signature is a bare variable,
 * which is the restriction `schema` enforces at parse time so that this file
 * never has to solve an equation.
 */

import {
  DIMENSIONLESS_UNIT,
  bareVariable,
  formatDimension,
  genericVariables,
  isDimensionless,
  isGenericDimension,
  namedUnit,
  resolveGeneric,
  unit as makeUnit,
  type Dimension,
  type Unit,
} from '@mds/units';
import {
  VALUE_PORT,
  axes as documentAxes,
  isRange,
  matchRef,
  axisLength,
  type Catalogue,
  type Edge,
  type Formula,
  type FormulaRef,
  type GraphDocument,
  type GraphNode,
  type InputNode,
  type Port,
  type PortKind,
} from '@mds/schema';

import { assertConnectable, assertSameDimension, connectable } from './dimensions.js';
import { KernelError } from './errors.js';
import type { Axis } from './series.js';
import type { Warning } from './warnings.js';

/** The type of one port of one node: enough to decide whether an edge may attach. */
export interface PortType {
  readonly kind: PortKind;
  /** `undefined` only while a generic port's variable is still unbound (S59). */
  readonly dimension?: Dimension;
  /** The unit to display in, when the port declares one. */
  readonly unit?: Unit;
}

/** `node.port`, the key both edge ends are indexed by. */
export function endpointKey(node: string, port: string): string {
  return `${node}.${port}`;
}

/**
 * The unit a generic port displays in (S5) — a named unit when the dimension
 * has exactly one (`W` for power, not `N·mm/s`), the raw base-unit product
 * otherwise. `namedUnit` is the one place that decides "exactly one"; this
 * function only supplies the dimensionless case and the fallback.
 */
export function canonicalUnit(dimension: Dimension): Unit {
  if (isDimensionless(dimension)) return DIMENSIONLESS_UNIT;
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
  /** `node.port` → the edge arriving there. */
  readonly incoming: ReadonlyMap<string, Edge>;
  /** node id → its generic variable bindings (S59). */
  readonly bindings: ReadonlyMap<string, ReadonlyMap<string, Dimension>>;
  /** One per range input node, in document order (S43). */
  readonly axes: readonly Axis[];
  readonly warnings: readonly Warning[];
}

// --- catalogue lookup -------------------------------------------------------

/**
 * A graph names a formula by id, version and hash and never embeds it (S23), so
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
      `no formula '${ref.id}' in the loaded catalogues — a graph needs its catalogue to open (S23)`,
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

function inputValueType(node: InputNode): PortType {
  const spec = node.value;
  switch (spec.kind) {
    case 'categorical':
    case 'categoricalList':
      return { kind: 'categorical' };
    case 'spectrum':
      return { kind: 'spectrum', dimension: spec.unit.dimension, unit: spec.unit };
    case 'tableColumn':
      throw new KernelError(
        'a table column needs a table, and tables arrive with the second slice (S37)',
        node.id,
      );
    default:
      return { kind: 'numeric', dimension: spec.unit.dimension, unit: spec.unit };
  }
}

/** The input port names an output node offers: one, or one per table column. */
function outputPortNames(node: GraphNode): readonly string[] {
  if (node.kind !== 'output') return [];
  return node.output.kind === 'table' ? node.output.columns : [VALUE_PORT];
}

function portType(port: Port, bindings: ReadonlyMap<string, Dimension>): PortType {
  if (port.kind === 'categorical') return { kind: 'categorical' };
  if (!isGenericDimension(port.unit)) {
    return { kind: port.kind, dimension: port.unit.dimension, unit: port.unit };
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
 * stable. A graph that does not fully drain has a cycle, and S18 makes that
 * impossible to reach through the editor — but a hand-edited file can carry one,
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
      `these nodes form a cycle, and the graph cannot be evaluated (S18): ${stuck.join(', ')}`,
    );
  }
  return order;
}

/** Would this edge close a cycle? The check S18 makes at connect time. */
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

function axisOf(node: InputNode, order: number): Axis {
  if (!isRange(node.value)) throw new KernelError('not a range node', node.id);
  const length = axisLength(node.value);
  if (length === undefined) {
    throw new KernelError(
      'a table column needs a table, and tables arrive with the second slice (S37)',
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
): Resolution {
  const warnings: Warning[] = [];
  const index = indexFormulas(catalogues);
  const order = topologicalOrder(document);

  const axes = documentAxes(document).map((node, i) => axisOf(node, i));
  const formulas = new Map<string, Formula>();
  const sources = new Map<string, PortType>();
  const targets = new Map<string, PortType>();
  const incoming = new Map<string, Edge>();
  const bindings = new Map<string, ReadonlyMap<string, Dimension>>();

  for (const edge of document.edges) {
    const key = endpointKey(edge.to.node, edge.to.port);
    const existing = incoming.get(key);
    if (existing !== undefined) {
      throw new KernelError(
        `two edges arrive at this input port ('${existing.id}' and '${edge.id}') — ` +
          'an input takes one connection',
        key,
      );
    }
    incoming.set(key, edge);
  }

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
    throw new KernelError(
      `cannot connect a ${source.kind} value to a ${target.kind} port`,
      where,
    );
  };

  for (const node of order) {
    if (node.kind === 'input') {
      sources.set(endpointKey(node.id, VALUE_PORT), inputValueType(node));
      continue;
    }

    if (node.kind === 'formula') {
      const formula = lookupFormula(index, node.formula, node.id, warnings);
      formulas.set(node.id, formula);

      // Bind the generic variables from what is wired in, then read every port
      // through those bindings. An input's signature is a bare variable (S59),
      // so this is an assignment and never an equation.
      const bound = new Map<string, Dimension>();
      for (const port of formula.inputs) {
        const key = endpointKey(node.id, port.name);
        const edge = incoming.get(key);
        if (edge === undefined) continue;
        const source = sourceType(edge);
        const declared = portType(port, bound);
        checkKind(source, declared, key);

        if (port.kind !== 'categorical' && isGenericDimension(port.unit)) {
          const variable = bareVariable(port.unit) as string;
          const dimension = source.dimension;
          if (dimension === undefined) {
            throw new KernelError(
              `'${endpointKey(edge.from.node, edge.from.port)}' has no dimension yet — ` +
                'wire its own inputs first',
              key,
            );
          }
          const already = bound.get(variable);
          if (already === undefined) bound.set(variable, dimension);
          else {
            assertSameDimension(
              already,
              dimension,
              `'$${variable}' is bound twice on this node and must be one dimension (S59)`,
              key,
            );
          }
          continue;
        }

        if (declared.dimension !== undefined && source.dimension !== undefined) {
          assertConnectable(source.dimension, declared.dimension, key);
        }
      }

      bindings.set(node.id, bound);
      for (const port of formula.inputs) {
        targets.set(endpointKey(node.id, port.name), portType(port, bound));
      }
      sources.set(endpointKey(node.id, formula.output.name), portType(formula.output, bound));
      continue;
    }

    // An output node accepts whatever is wired to it — it renders a value, it
    // does not declare one (S60). The one thing it can be wrong about is a
    // check's threshold, which is a quantity a student typed (S58).
    for (const name of outputPortNames(node)) {
      const key = endpointKey(node.id, name);
      const edge = incoming.get(key);
      const type: PortType = edge === undefined ? { kind: 'numeric' } : sourceType(edge);
      targets.set(key, type);

      if (node.output.kind === 'check' && edge !== undefined && type.dimension !== undefined) {
        assertSameDimension(
          type.dimension,
          node.output.threshold.unit.dimension,
          'a check compares a value against a threshold of the same dimension (S58)',
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

  return { document, order, formulas, sources, targets, incoming, bindings, axes, warnings };
}

export type ConnectionCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * May this edge attach (S6, S18)?
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
    return { ok: false, reason: 'this connection would close a cycle, which is not allowed (S18)' };
  }
  try {
    // A dragged wire replaces whatever already arrives at that input (an input
    // takes one connection) rather than being refused for arriving alongside
    // it — `connect` in the editor's document model already does this; the
    // check has to agree, or a re-drag onto an occupied port is rejected here
    // before it ever reaches that replace.
    const displaced = document.edges.filter(
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
export function typesConnect(source: PortType, target: PortType): boolean {
  if (source.kind !== target.kind) return false;
  if (source.dimension === undefined || target.dimension === undefined) return true;
  return connectable(source.dimension, target.dimension);
}
