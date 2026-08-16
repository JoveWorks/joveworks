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
 * input that is not yet wired is normal — a student is mid-build, and S50 has
 * the editor mark it. A dimension mismatch, a cycle, a second edge into one
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
  THRESHOLD_PORT,
  VERDICT_PORT,
  axes as documentAxes,
  isRange,
  matchRef,
  axisLength,
  type Catalogue,
  type CompareNode,
  type Edge,
  type Formula,
  type FormulaRef,
  type GraphDocument,
  type GraphNode,
  type InputNode,
  type Port,
  type PortKind,
} from '@mds/schema';

import { closureFormula } from './closure.js';
import { expressionDimension, type DimensionScope } from './compile.js';
import { assertConnectable, assertSameDimension, connectable } from './dimensions.js';
import { KernelError } from './errors.js';
import { parseExpression } from './parse.js';
import type { Axis } from './series.js';
import type { Warning } from './warnings.js';

/** The type of one port of one node: enough to decide whether an edge may attach. */
export interface PortType {
  readonly kind: PortKind;
  /** `undefined` only while a generic port's variable is still unbound. */
  readonly dimension?: Dimension;
  /** The unit to display in, when the port declares one. */
  readonly unit?: Unit;
}

/** `node.port`, the key both edge ends are indexed by. */
export function endpointKey(node: string, port: string): string {
  return `${node}.${port}`;
}

/**
 * The unit a generic port displays in — a named unit when the dimension
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
  /** `node.port` → the edges arriving there — more than one only for a spectrum port. */
  readonly incoming: ReadonlyMap<string, readonly Edge[]>;
  /** node id → its generic variable bindings. */
  readonly bindings: ReadonlyMap<string, ReadonlyMap<string, Dimension>>;
  /** One per range input node, in document order. */
  readonly axes: readonly Axis[];
  readonly warnings: readonly Warning[];
}

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
   * Bind a node's generic variables from what is wired in, then check every
   * edge against the port it arrives at. An input's signature is a bare
   * variable, so this is an assignment and never an equation — shared by a
   * `formula` node (whose ports may deliberately reuse one variable, as
   * `add`'s two inputs both do with `$A`) and a `closure` node (whose ports
   * never do, each free name having its own).
   */
  const bindInputs = (nodeId: string, formula: Formula): Map<string, Dimension> => {
    const bound = new Map<string, Dimension>();
    for (const port of formula.inputs) {
      const key = endpointKey(nodeId, port.name);
      // A spectrum port takes one edge per collected value; every
      // other kind takes exactly one, which `oneEdge` throws on if not true.
      const edges = port.kind === 'spectrum' ? (incoming.get(key) ?? []) : oneEdgeArray(key);
      if (edges.length === 0) continue;
      const declared = portType(port, bound);

      for (const edge of edges) {
        const source = sourceType(edge);
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
    }
    return bound;
  };

  for (const node of order) {
    if (node.kind === 'input') {
      sources.set(endpointKey(node.id, VALUE_PORT), inputValueType(node));
      continue;
    }

    if (node.kind === 'formula') {
      const formula = lookupFormula(index, node.formula, node.id, warnings);
      formulas.set(node.id, formula);
      const bound = bindInputs(node.id, formula);
      bindings.set(node.id, bound);
      for (const port of formula.inputs) {
        targets.set(endpointKey(node.id, port.name), portType(port, bound));
      }
      sources.set(endpointKey(node.id, formula.output.name), portType(formula.output, bound));
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
      const bound = bindInputs(node.id, formula);
      bindings.set(node.id, bound);
      for (const port of formula.inputs) {
        targets.set(endpointKey(node.id, port.name), portType(port, bound));
      }

      // No reusable template to resolve the output against (see closure.ts):
      // once every free name the expression uses is bound, prove its
      // dimension live, the same way `formula.ts`'s own self-check does for
      // a hand-authored record — just against this one node's real wiring
      // instead of a probed basis.
      const outputKey = endpointKey(node.id, formula.output.name);
      if (formula.inputs.every((port) => bound.has(port.name))) {
        const scope: DimensionScope = {
          dimensions: Object.fromEntries(bound),
          spectra: new Set(
            formula.inputs.filter((port) => port.kind === 'spectrum').map((port) => port.name),
          ),
        };
        const dimension = expressionDimension(parseExpression(node.expression), scope, node.id);
        sources.set(outputKey, { kind: 'numeric', dimension, unit: canonicalUnit(dimension) });
      } else {
        sources.set(outputKey, { kind: 'numeric' });
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

      // `threshold` does have a default (S58's typed quantity, now a port
      // fallback rather than the only way to set the bound), so once
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

    // An output node accepts whatever is wired to it — it renders a value, it
    // does not declare one. The one thing it can be wrong about is a
    // check's threshold, which is a quantity a student typed.
    for (const name of outputPortNames(node)) {
      const key = endpointKey(node.id, name);
      const edge = oneEdge(key);
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
    return { ok: false, reason: 'this connection would close a cycle, which is not allowed (S18)' };
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
