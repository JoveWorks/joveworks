/**
 * Running the kernel over a graph that is still being built.
 *
 * `evaluateDocument` answers about a *finished* graph: an unconnected input or a
 * quarantined formula is a refusal, which is right for a test and wrong for a
 * canvas — a student mid-build would watch every number vanish because the node
 * they have not wired yet is not wired yet.
 *
 * So the editor evaluates the part of the graph that can be evaluated, and marks
 * the rest. **It does not implement a second, laxer kernel to do it**: the
 * subgraph handed to `evaluateDocument` is a real document, evaluated by the real
 * kernel under the real rules. What this file decides is only *which nodes are
 * ready*, and that decision is made from the same facts the kernel would use —
 * an incoming edge, a declared default, a `quarantined` status.
 *
 * The states it produces are what colour is spent on elsewhere — colour
 * means state and nothing else:
 *
 * - `incomplete` — a required input is not wired, marked even when the node is compact
 * - `quarantined` — the formula cannot be evaluated by anyone, ever
 * - `blocked` — nothing wrong here; something upstream is
 * - `error` — the kernel refused this node, with its message kept
 */

import type { ReactNode } from 'react';

import {
  KernelError,
  closureFormula,
  evaluateDocument,
  packChannelIndices,
  resolveGraph,
  ROUTING_KINDS,
  ROUTING_QUARANTINE_REASON,
  type Evaluation,
  type Resolution,
  type Warning,
} from '@mds/kernel';
import {
  findFormula,
  isEvaluable,
  isGenericPort,
  THRESHOLD_PORT,
  VALUE_PORT,
  type Catalogue,
  type Formula,
  type GraphDocument,
  type GraphNode,
  type Port,
} from '@mds/schema';

import { Symbol } from '../Symbol';

/**
 * The `not connected: ...` reason, with each name rendered the same way its
 * port label is — a plain string here would fall back to
 * the raw, trailing-underscore form the rest of the app deliberately never
 * shows (mu instead of μ, F_N instead of F with a true subscript).
 */
function notConnected(names: readonly string[]): ReactNode {
  return (
    <>
      not connected:{' '}
      {names.map((name, index) => (
        <span key={name}>
          {index > 0 ? ', ' : ''}
          <Symbol name={name} />
        </span>
      ))}
    </>
  );
}

export type NodeState = 'ok' | 'incomplete' | 'quarantined' | 'blocked' | 'error';

export interface Analysis {
  /** Port types and generic bindings, when the graph resolves at all. */
  readonly resolution?: Resolution;
  /** The numbers, over the ready part of the graph. */
  readonly evaluation?: Evaluation;
  /** node id → the formula it references, for drawing ports and citations. */
  readonly formulas: ReadonlyMap<string, Formula>;
  /**
   * node id → the catalogue that formula came from, for showing provenance on
   * the node. Only formula nodes have one — a closure's formula is synthesised
   * from its expression, not drawn from any catalogue.
   */
  readonly sources: ReadonlyMap<string, Catalogue>;
  readonly states: ReadonlyMap<string, NodeState>;
  /** node id → why it is not `ok`, in the kernel's own words. */
  readonly problems: ReadonlyMap<string, ReactNode>;
  readonly warnings: readonly Warning[];
  /** A failure the whole graph carries — a cycle, a bad file, no catalogue. */
  readonly message?: string;
}

/** The formula a node names, in whichever catalogue carries it — formula ids are global. */
export function lookup(catalogues: readonly Catalogue[], id: string): Formula | undefined {
  for (const catalogue of catalogues) {
    const found = findFormula(catalogue, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The catalogue that carries a formula id — the same search as `lookup`, but
 * returning the owning catalogue rather than the formula. A canvas node needs
 * this to show where it came from; the palette gets it for free by pairing
 * `{ formula, catalogue }` directly off catalogue data (`PaletteEntry`), but a
 * node only has the flat `analysis.formulas` map, which carries no back-reference.
 */
export function lookupCatalogue(catalogues: readonly Catalogue[], id: string): Catalogue | undefined {
  return catalogues.find((catalogue) => findFormula(catalogue, id) !== undefined);
}

/** Whether an unwired input port can stand in for itself (the kernel's rule). */
function hasDefault(port: Port): boolean {
  if (port.kind === 'categorical') return port.default !== undefined;
  if (port.kind === 'spectrum' || port.kind === 'bundle') return false;
  return port.default !== undefined && !isGenericPort(port);
}

/** The node a `KernelError` points at: `where` is a node id or `node.port`. */
function nodeOf(document: GraphDocument, where: string | undefined): string | undefined {
  if (where === undefined) return undefined;
  const ids = new Set(document.nodes.map((node) => node.id));
  if (ids.has(where)) return where;
  const cut = where.lastIndexOf('.');
  const prefix = cut === -1 ? undefined : where.slice(0, cut);
  return prefix !== undefined && ids.has(prefix) ? prefix : undefined;
}

/** Everything downstream of a node, itself included. */
function descendants(document: GraphDocument, from: string): ReadonlySet<string> {
  const found = new Set([from]);
  let growing = true;
  while (growing) {
    growing = false;
    for (const edge of document.edges) {
      if (found.has(edge.from.node) && !found.has(edge.to.node)) {
        found.add(edge.to.node);
        growing = true;
      }
    }
  }
  return found;
}

function subgraph(document: GraphDocument, keep: ReadonlySet<string>): GraphDocument {
  return {
    ...document,
    nodes: document.nodes.filter((node) => keep.has(node.id)),
    edges: document.edges.filter((edge) => keep.has(edge.from.node) && keep.has(edge.to.node)),
  };
}

/**
 * Which nodes are ready to evaluate, and why the others are not.
 *
 * One pass in topological order, so a node is decided after everything feeding
 * it: readiness is inherited, and that is what makes `blocked` distinct from
 * `incomplete` — the difference between "you have not finished here" and "you
 * have not finished over there".
 */
function readiness(
  document: GraphDocument,
  order: readonly GraphNode[],
  formulas: ReadonlyMap<string, Formula>,
  states: Map<string, NodeState>,
  problems: Map<string, ReactNode>,
): ReadonlySet<string> {
  const ready = new Set<string>();
  // More than one source only for a spectrum port — a plain `Map` here
  // would let a second edge silently overwrite the first, and readiness would
  // only ever check whichever source happened to be recorded last.
  const wired = new Map<string, Array<{ readonly node: string; readonly port: string }>>();
  for (const edge of document.edges) {
    const key = `${edge.to.node}.${edge.to.port}`;
    const sources = wired.get(key);
    if (sources === undefined) wired.set(key, [edge.from]);
    else sources.push(edge.from);
  }
  const isWired = (nodeId: string, portName: string): boolean =>
    (wired.get(`${nodeId}.${portName}`)?.length ?? 0) > 0;

  const upstreamReady = (nodeId: string, portName: string): boolean => {
    const sources = wired.get(`${nodeId}.${portName}`) ?? [];
    return sources.length > 0 && sources.every((source) => ready.has(source.node));
  };

  for (const node of order) {
    if (node.kind === 'input') {
      ready.add(node.id);
      continue;
    }

    if (node.kind === 'formula' || node.kind === 'closure') {
      const formula = formulas.get(node.id);
      if (formula === undefined) continue; // already recorded as an error
      if (!isEvaluable(formula)) {
        states.set(node.id, 'quarantined');
        problems.set(
          node.id,
          formula.quarantineReason ??
            'this formula is quarantined and cannot be evaluated',
        );
        continue;
      }
      const missing = formula.inputs.filter(
        (port) => !hasDefault(port) && !isWired(node.id, port.name),
      );
      if (missing.length > 0) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, notConnected(missing.map((port) => port.name)));
        continue;
      }
      const blocked = formula.inputs.some(
        (port) => isWired(node.id, port.name) && !upstreamReady(node.id, port.name),
      );
      if (blocked) {
        states.set(node.id, 'blocked');
        continue;
      }
      ready.add(node.id);
      continue;
    }

    if (node.kind === 'compare') {
      // `value` has no default (nothing sensible to compare against when
      // unwired); `threshold` does, the node's own typed quantity.
      if (!isWired(node.id, VALUE_PORT)) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, notConnected([VALUE_PORT]));
        continue;
      }
      if (!upstreamReady(node.id, VALUE_PORT)) {
        states.set(node.id, 'blocked');
        continue;
      }
      if (isWired(node.id, THRESHOLD_PORT) && !upstreamReady(node.id, THRESHOLD_PORT)) {
        states.set(node.id, 'blocked');
        continue;
      }
      ready.add(node.id);
      continue;
    }

    if (node.kind === 'waypoint') {
      if (!isWired(node.id, 'in')) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, notConnected(['in']));
        continue;
      }
      if (!upstreamReady(node.id, 'in')) {
        states.set(node.id, 'blocked');
        continue;
      }
      ready.add(node.id);
      continue;
    }

    if (node.kind === 'pack') {
      // Any number of channels, including none — an empty bundle is a
      // legitimate value, not an incomplete node, the same way a
      // freshly-dropped node with zero wires anywhere is not "wrong" by
      // itself.
      const indices = packChannelIndices(document, node.id);
      const blocked = indices.some((n) => !upstreamReady(node.id, `in${n}`));
      if (blocked) {
        states.set(node.id, 'blocked');
        continue;
      }
      ready.add(node.id);
      continue;
    }

    if (node.kind === 'unpack') {
      if (!isWired(node.id, 'bundle')) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, notConnected(['bundle']));
        continue;
      }
      if (!upstreamReady(node.id, 'bundle')) {
        states.set(node.id, 'blocked');
        continue;
      }
      ready.add(node.id);
      continue;
    }

    // A table's columns exist only while wired (model/document.ts's
    // `closeEmptyColumns`), so zero columns is not "nothing to check" the way
    // it would be for a fixed port list — it is the same "not connected" a
    // fresh, unwired node is in.
    if (node.output.kind === 'table' && node.output.columns.length === 0) {
      states.set(node.id, 'incomplete');
      problems.set(node.id, 'wire something to it to add a column');
      continue;
    }

    const names = node.output.kind === 'table' ? node.output.columns : ['value'];
    const unwired = names.filter((name) => !isWired(node.id, name));
    if (unwired.length > 0) {
      states.set(node.id, 'incomplete');
      problems.set(node.id, notConnected(unwired));
      continue;
    }
    if (!names.every((name) => upstreamReady(node.id, name))) {
      states.set(node.id, 'blocked');
      continue;
    }
    // A plot's threshold is optional, and a check's is mandatory but always
    // has a typed default — either way it is never "not connected" like
    // `names` above, but a wire that is itself unready still blocks the node
    // the same way an unready `value` would.
    if (
      (node.output.kind === 'plot' || node.output.kind === 'check') &&
      isWired(node.id, THRESHOLD_PORT) &&
      !upstreamReady(node.id, THRESHOLD_PORT)
    ) {
      states.set(node.id, 'blocked');
      continue;
    }
    ready.add(node.id);
  }

  return ready;
}

/** How many times a node may be dropped and the rest re-evaluated. */
const RETRIES = 8;

export function analyse(document: GraphDocument, catalogues: readonly Catalogue[]): Analysis {
  const states = new Map<string, NodeState>();
  const problems = new Map<string, ReactNode>();
  const formulas = new Map<string, Formula>();
  const sources = new Map<string, Catalogue>();

  for (const node of document.nodes) {
    if (node.kind === 'formula') {
      const formula = lookup(catalogues, node.formula.id);
      if (formula === undefined) {
        states.set(node.id, 'error');
        problems.set(
          node.id,
          `no formula '${node.formula.id}' in the loaded catalogues — a graph needs its ` +
            'catalogue to open',
        );
        continue;
      }
      formulas.set(node.id, formula);
      const catalogue = lookupCatalogue(catalogues, node.formula.id);
      if (catalogue !== undefined) sources.set(node.id, catalogue);
      continue;
    }
    if (node.kind === 'closure') {
      try {
        formulas.set(node.id, closureFormula(node.expression));
      } catch (error) {
        states.set(node.id, 'error');
        problems.set(node.id, error instanceof Error ? error.message : String(error));
      }
    }
  }

  let resolution: Resolution | undefined;
  let candidate = document;
  let message: string | undefined;

  // A resolution failure is contained the same way an evaluation failure is
  // below: drop the offending node and its descendants, then resolve what's
  // left. One bad node's wiring or expression must not blank the whole
  // canvas — the rest of the graph may still be resolvable and evaluable.
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      resolution = resolveGraph(candidate, catalogues);
      break;
    } catch (error) {
      if (!(error instanceof KernelError)) throw error;
      const nodeId = nodeOf(document, error.where);
      if (nodeId === undefined) {
        message = error.message;
        break;
      }
      // A routing node's resolution failure is always the quarantine gate
      // (`graph.ts`) — nothing else can throw from those three kinds right
      // now — so it reads as `quarantined`, not a generic refusal.
      const routingKind = document.nodes.find((node) => node.id === nodeId)?.kind;
      if (routingKind !== undefined && ROUTING_KINDS.has(routingKind)) {
        states.set(nodeId, 'quarantined');
        problems.set(nodeId, ROUTING_QUARANTINE_REASON[routingKind as 'waypoint' | 'pack' | 'unpack']);
      } else {
        states.set(nodeId, 'error');
        problems.set(nodeId, error.message);
      }
      const dropped = descendants(document, nodeId);
      for (const id of dropped) {
        if (id !== nodeId) states.set(id, 'blocked');
      }
      candidate = subgraph(candidate, new Set(candidate.nodes.map((n) => n.id).filter((id) => !dropped.has(id))));
    }
  }

  if (resolution === undefined) {
    // Without a resolution there are no port types and no order, so nothing can
    // be evaluated — but the canvas still draws, which is the point.
    return {
      formulas,
      sources,
      states,
      problems,
      warnings: [],
      ...(message === undefined ? {} : { message }),
    };
  }

  let ready = readiness(document, resolution.order, formulas, states, problems);
  let evaluation: Evaluation | undefined;

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      evaluation = evaluateDocument(subgraph(document, ready), catalogues);
      break;
    } catch (error) {
      if (!(error instanceof KernelError)) throw error;
      const nodeId = nodeOf(document, error.where);
      if (nodeId === undefined || !ready.has(nodeId)) {
        message = error.message;
        break;
      }
      states.set(nodeId, 'error');
      problems.set(nodeId, error.message);
      const dropped = descendants(document, nodeId);
      const kept = new Set([...ready].filter((id) => !dropped.has(id)));
      for (const id of dropped) {
        if (id !== nodeId && ready.has(id)) states.set(id, 'blocked');
      }
      ready = kept;
    }
  }

  for (const node of document.nodes) {
    if (ready.has(node.id) && !states.has(node.id)) states.set(node.id, 'ok');
    if (!states.has(node.id)) states.set(node.id, 'blocked');
  }

  return {
    resolution,
    ...(evaluation === undefined ? {} : { evaluation }),
    formulas,
    sources,
    states,
    problems,
    warnings: evaluation?.warnings ?? [],
    ...(message === undefined ? {} : { message }),
  };
}
