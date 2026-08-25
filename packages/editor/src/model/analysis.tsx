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
  outputPortNames,
  packChannelIndices,
  resolveGraph,
  selectPortNames,
  waypointChannelIndices,
  type Evaluation,
  type Resolution,
  type Warning,
} from '@joveworks/kernel';
import {
  findFormula,
  isEvaluable,
  isGenericPort,
  localize,
  ALONG_PORT,
  MONTE_CARLO_SAMPLE_PORT,
  OBJECTIVE_PORT,
  X_PORT,
  Y_PORT,
  THRESHOLD_PORT,
  VALUE_PORT,
  type Catalogue,
  type Formula,
  type GraphDocument,
  type GraphNode,
  type OutputNode,
  type Port,
} from '@joveworks/schema';

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

/**
 * Whether an unwired input port already has a value to stand in with — the
 * kernel's own order (`inputPortValue`): a value typed on the node first, the
 * catalogue's declared default second. Typed beats declared, and a generic
 * port's declared default is unusable (there is no unit to read it in), which
 * is exactly why it takes a typed one.
 */
function hasValue(node: GraphNode, port: Port): boolean {
  const authored = 'inputValues' in node ? node.inputValues?.[port.name] : undefined;
  if (port.kind === 'spectrum' || port.kind === 'bundle') return false;
  if (port.kind === 'categorical') return authored !== undefined || port.default !== undefined;
  if (authored !== undefined) return true;
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

  // A Feasibility or Best Design node references Check nodes by id rather
  // than by wire, so it carries no dependency edge and its position in
  // `order` is incidental — the same reason `evaluateDocument`
  // (kernel/evaluate.ts) defers both to a second pass after every other
  // output has been decided, and this walks the identical topological order
  // to decide per-node state, so it needs the identical split.
  const deferredOutputs: OutputNode[] = [];

  for (const node of order) {
    if (node.kind === 'file') {
      // Nothing upstream to wait on — but a node with no file picked yet has
      // nothing to answer with either, which is the same "not finished"
      // an unwired input port is in.
      if (node.sources.length === 0) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, 'pick a file to read');
        continue;
      }
      ready.add(node.id);
      continue;
    }

    if (node.kind === 'input' || node.kind === 'monteCarloGenerator') {
      ready.add(node.id);
      continue;
    }

    if (node.kind === 'monteCarloReceiver') {
      if (!isWired(node.id, MONTE_CARLO_SAMPLE_PORT)) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, notConnected([MONTE_CARLO_SAMPLE_PORT]));
        continue;
      }
      if (!upstreamReady(node.id, MONTE_CARLO_SAMPLE_PORT)) {
        states.set(node.id, 'blocked');
        continue;
      }
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
          (formula.quarantineReason === undefined ? undefined : localize(formula.quarantineReason, 'en')) ??
            'this formula is quarantined and cannot be evaluated',
        );
        continue;
      }
      const missing = formula.inputs.filter(
        (port) => !hasValue(node, port) && !isWired(node.id, port.name),
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

    if (node.kind === 'select') {
      // Two required wires, not one: `value` says what to search, and
      // `along` says which axis to search it over — a selection with no
      // `along` has no coordinate to answer in and is not a selection yet.
      // `threshold` is `compare`'s again: typed default, overriding wire.
      const missing = [VALUE_PORT, ALONG_PORT].filter((port) => !isWired(node.id, port));
      if (missing.length > 0) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, notConnected(missing));
        continue;
      }
      const inputs = selectPortNames(node).inputs;
      if (inputs.some((port) => isWired(node.id, port) && !upstreamReady(node.id, port))) {
        states.set(node.id, 'blocked');
        continue;
      }
      ready.add(node.id);
      continue;
    }

    if (node.kind === 'waypoint') {
      const channels = waypointChannelIndices(document, node.id);
      const inputs = channels.map((channel) => `in${channel}`);
      if (inputs.length === 0 || inputs.some((port) => !isWired(node.id, port))) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, notConnected(inputs.length === 0 ? ['in0'] : inputs.filter((port) => !isWired(node.id, port))));
        continue;
      }
      if (inputs.some((port) => !upstreamReady(node.id, port))) {
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

    // A Feasibility node has no wired ports of its own (`outputPortNames`
    // returns none for it) and a Best Design node has one — but both
    // reference existing Check nodes by id, so part of their readiness is
    // inherited from theirs directly rather than from any wire. Deferred to
    // the second pass below, after every other node (including every Check)
    // has been decided.
    if (
      node.output.kind === 'feasibility' ||
      node.output.kind === 'bestDesign' ||
      node.output.kind === 'pareto'
    ) {
      deferredOutputs.push(node);
      continue;
    }

    // `THRESHOLD_PORT` is excluded: unlike `VALUE_PORT` (or a table's named
    // columns), it is never mandatory — a plot's is optional and a check's
    // always has a typed default — so its own readiness is handled by the
    // "wired but not ready" check below instead of the "unwired" one here.
    const names = outputPortNames(node).filter((name) => name !== THRESHOLD_PORT);
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

  for (const node of deferredOutputs) {
    const output = node.output;
    if (output.kind === 'bestDesign') {
      // `checks: []` is legal here, unlike on a Feasibility node: it is an
      // unconstrained min or max, which is a real thing to ask for. What
      // this node cannot do without is the objective — there is nothing to
      // rank the candidates by.
      if (!isWired(node.id, OBJECTIVE_PORT)) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, notConnected([OBJECTIVE_PORT]));
        continue;
      }
      if (!upstreamReady(node.id, OBJECTIVE_PORT) || !output.checks.every((id) => ready.has(id))) {
        states.set(node.id, 'blocked');
        continue;
      }
      ready.add(node.id);
      continue;
    }
    if (output.kind === 'pareto') {
      // Two objectives, both mandatory — a front needs something to trade
      // against something. `checks: []` is legal for the same reason it is on
      // Best Design: with nothing referenced, every candidate competes.
      const unwired = [X_PORT, Y_PORT].filter((port) => !isWired(node.id, port));
      if (unwired.length > 0) {
        states.set(node.id, 'incomplete');
        problems.set(node.id, notConnected(unwired));
        continue;
      }
      if (
        ![X_PORT, Y_PORT].every((port) => upstreamReady(node.id, port)) ||
        !output.checks.every((id) => ready.has(id))
      ) {
        states.set(node.id, 'blocked');
        continue;
      }
      ready.add(node.id);
      continue;
    }
    if (output.kind !== 'feasibility') continue; // narrows for TS; always true here
    if (output.checks.length === 0) {
      states.set(node.id, 'incomplete');
      problems.set(node.id, 'choose at least one check');
      continue;
    }
    if (!output.checks.every((id) => ready.has(id))) {
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
      states.set(nodeId, 'error');
      problems.set(nodeId, error.message);
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
