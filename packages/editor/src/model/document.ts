/**
 * Every edit the canvas can make, as pure functions over a `GraphDocument`.
 *
 * The editor keeps no second model of the graph: React Flow is handed a
 * projection of the document and hands back intentions, which land here. That is
 * what stops "the graph is the calculation" from quietly becoming "the graph is
 * a picture of the calculation" — there is one document, and the kernel reads
 * the same one the canvas draws.
 *
 * Nothing here decides whether an edit is *allowed*. A connection is refused by
 * `canConnect` in the kernel before it ever reaches `connect` below, and
 * that asymmetry is deliberate: the rules live in one place, and this file is
 * only how a permitted change is applied.
 */

import { closureFormula } from '@mds/kernel';
import {
  VALUE_PORT,
  type ClosureNode,
  type Edge,
  type Endpoint,
  type Frame,
  type GraphDocument,
  type GraphNode,
  type Output,
  type OutputNode,
  type Position,
} from '@mds/schema';

/** `node.port -> node.port`, which is unique because an input takes one edge. */
export function edgeId(from: Endpoint, to: Endpoint): string {
  return `${from.node}.${from.port}->${to.node}.${to.port}`;
}

/** What a node calls itself — the same text its own title field shows, not its id or port name. */
export function nodeLabel(node: GraphNode): string {
  if (node.label !== undefined) return node.label;
  return node.kind === 'formula' ? node.formula.id : node.id;
}

/** A readable id that is not taken: `input`, `input2`, `input3`… */
export function uniqueId(document: GraphDocument, prefix: string): string {
  const taken = new Set([
    ...document.nodes.map((node) => node.id),
    ...document.frames.map((frame) => frame.id),
  ]);
  if (!taken.has(prefix)) return prefix;
  for (let n = 2; ; n += 1) {
    const candidate = `${prefix}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function addNode(document: GraphDocument, node: GraphNode): GraphDocument {
  return { ...document, nodes: [...document.nodes, node] };
}

/**
 * A copy of one node, offset so it does not sit exactly on top of the
 * original, and carrying none of its wires — a duplicate is a fresh node, not
 * a fork of one that is already wired into the graph.
 */
export function duplicateNode(document: GraphDocument, id: string): GraphDocument {
  const source = document.nodes.find((node) => node.id === id);
  if (source === undefined) return document;
  const copy: GraphNode = {
    ...withoutAxisLabel(withoutFrame(source)),
    id: uniqueId(document, source.id),
    position: { x: source.position.x + 32, y: source.position.y + 32 },
  };
  return addNode(document, copy);
}

/** Replace one node, leaving everything else — and its identity — alone. */
export function updateNode<T extends GraphNode>(
  document: GraphDocument,
  id: string,
  change: (node: T) => T,
): GraphDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => (node.id === id ? change(node as T) : node)),
  };
}

export function moveNode(document: GraphDocument, id: string, position: Position): GraphDocument {
  return updateNode(document, id, (node) => ({ ...node, position }));
}

/** Remove nodes and frames, and every edge that touched one of them. */
export function removeNodes(document: GraphDocument, ids: ReadonlySet<string>): GraphDocument {
  return closeEmptyColumns({
    ...document,
    nodes: document.nodes
      .filter((node) => !ids.has(node.id))
      // A node whose frame has gone belongs to no section any more; leaving the
      // id behind would fail `parseDocument` on the next save.
      .map((node) =>
        node.frameId !== undefined && ids.has(node.frameId) ? withoutFrame(node) : node,
      ),
    edges: document.edges.filter((edge) => !ids.has(edge.from.node) && !ids.has(edge.to.node)),
    frames: document.frames.filter((frame) => !ids.has(frame.id)),
  });
}

function withoutFrame(node: GraphNode): GraphNode {
  const { frameId: _dropped, ...rest } = node;
  return rest as GraphNode;
}

/**
 * Without this, a duplicated range shows the exact same text as the
 * original in the plot's axis picker (`axisLabel ?? label ?? id`) until
 * explicitly renamed — and even then, only if the rename also clears
 * `axisLabel` (InputNodeView's title field does). Dropping it here lets the
 * copy's own label take over immediately, same as a fresh node's always
 * does.
 */
function withoutAxisLabel(node: GraphNode): GraphNode {
  if (node.kind !== 'input') return node;
  const { axisLabel: _dropped, ...rest } = node;
  return rest;
}

export function removeEdges(document: GraphDocument, ids: ReadonlySet<string>): GraphDocument {
  return closeEmptyColumns({ ...document, edges: document.edges.filter((edge) => !ids.has(edge.id)) });
}

/**
 * Attach an edge. Any edge already arriving at the target port is replaced —
 * an input takes one connection, and rewiring is the ordinary way to change
 * one's mind, not an error to report — unless `join` says the target is a
 * spectrum port, where a new wire adds to what is already there.
 */
export function connect(
  document: GraphDocument,
  from: Endpoint,
  to: Endpoint,
  join = false,
): GraphDocument {
  const edge: Edge = { id: edgeId(from, to), from, to };
  const kept = join
    ? document.edges
    : document.edges.filter((existing) => !(existing.to.node === to.node && existing.to.port === to.port));
  return { ...document, edges: [...kept, edge] };
}

// --- table columns: a table output's ports ----------------------------

/**
 * A table column exists only while something is wired to it — the same rule
 * a spectrum port's slots follow, just with a name and a position kept
 * across edits instead of an anonymous count. Called after every edit that
 * can drop an edge into a table, so a deleted wire closes its column with it
 * rather than leaving an empty one behind.
 */
function closeEmptyColumns(document: GraphDocument): GraphDocument {
  const wired = new Set(document.edges.map((edge) => `${edge.to.node}.${edge.to.port}`));
  return {
    ...document,
    nodes: document.nodes.map((node) =>
      node.kind === 'output' && node.output.kind === 'table'
        ? {
            ...node,
            output: {
              ...node.output,
              columns: node.output.columns.filter((column) => wired.has(`${node.id}.${column}`)),
            },
          }
        : node,
    ),
  };
}

/**
 * Rename a table column, carrying forward whatever is wired to it — a rename
 * is a relabel, not a rewire, the same distinction a scalar's `setUnit` makes.
 */
export function renameColumn(
  document: GraphDocument,
  nodeId: string,
  from: string,
  to: string,
): GraphDocument {
  const renamed = updateNode<OutputNode>(document, nodeId, (node) =>
    node.output.kind === 'table'
      ? {
          ...node,
          output: {
            ...node.output,
            columns: node.output.columns.map((column) => (column === from ? to : column)),
          },
        }
      : node,
  );
  return {
    ...renamed,
    edges: renamed.edges.map((edge) => {
      if (edge.to.node !== nodeId || edge.to.port !== from) return edge;
      const to_: Endpoint = { node: nodeId, port: to };
      return { id: edgeId(edge.from, to_), from: edge.from, to: to_ };
    }),
  };
}

/** Drop a table column and whatever edge fed it — the port it wired to is gone with it. */
export function removeColumn(document: GraphDocument, nodeId: string, name: string): GraphDocument {
  const dropped = updateNode<OutputNode>(document, nodeId, (node) =>
    node.output.kind === 'table'
      ? { ...node, output: { ...node.output, columns: node.output.columns.filter((column) => column !== name) } }
      : node,
  );
  return {
    ...dropped,
    edges: dropped.edges.filter((edge) => !(edge.to.node === nodeId && edge.to.port === name)),
  };
}

/** `base` if free, else `base2`, `base3`, … — a rewire never silently merges into an existing column. */
function uniqueColumnName(existing: readonly string[], base: string): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/**
 * The handle id a table's trailing ghost column renders (spectrumSlots.ts's
 * suffix convention makes this collision-proof against a real column that
 * happens to share the text — a column named `open` still slots at index 0,
 * never at `__new-column__::open`).
 */
export const NEW_COLUMN = '__new-column__';

/**
 * Wiring onto the ghost slot names the column after what was wired, the way a
 * spectrum port's ghost slot accepts a wire with no separate "add a
 * slot" step first — a table's columns are named and ordered where a
 * spectrum's are not, so this is the one piece a spectrum's ghost slot never
 * needed: the new port's name has to come from somewhere.
 */
export function addNamedColumn(
  document: GraphDocument,
  nodeId: string,
  base: string,
): { readonly document: GraphDocument; readonly column: string } {
  const node = document.nodes.find((entry) => entry.id === nodeId);
  const columns = node?.kind === 'output' && node.output.kind === 'table' ? node.output.columns : [];
  const column = uniqueColumnName(columns, base);
  return {
    document: updateNode<OutputNode>(document, nodeId, (entry) =>
      entry.output.kind === 'table'
        ? { ...entry, output: { ...entry.output, columns: [...entry.output.columns, column] } }
        : entry,
    ),
    column,
  };
}

/**
 * Rewiring an existing column relabels it too — a column's name follows
 * whatever is wired to it, the same rule its creation follows (`addNamedColumn`
 * above), not a one-time label frozen at the moment it was first connected.
 */
export function relabelColumn(
  document: GraphDocument,
  nodeId: string,
  columnName: string,
  base: string,
): { readonly document: GraphDocument; readonly column: string } {
  const node = document.nodes.find((entry) => entry.id === nodeId);
  const columns = node?.kind === 'output' && node.output.kind === 'table' ? node.output.columns : [];
  const column = uniqueColumnName(
    columns.filter((existing) => existing !== columnName),
    base,
  );
  return { document: renameColumn(document, nodeId, columnName, column), column };
}

/**
 * Propagate a node's rename to any table column that is still named after
 * its old label — a column named `width` because that source node was once
 * called `width` keeps tracking it as it is renamed, the same way the
 * column's name followed the source in the first place (`addNamedColumn`,
 * Canvas.tsx's ghost-slot wiring). A column renamed by hand no longer
 * equals `oldLabel`, so it is left alone — there is no separate flag for
 * "manually renamed"; a name that has already diverged is the flag.
 */
export function syncColumnLabels(
  document: GraphDocument,
  nodeId: string,
  oldLabel: string,
  newLabel: string,
): GraphDocument {
  if (oldLabel === newLabel) return document;
  let next = document;
  for (const node of document.nodes) {
    if (node.kind !== 'output' || node.output.kind !== 'table') continue;
    for (const column of node.output.columns) {
      if (column !== oldLabel) continue;
      const wiredFromRenamed = next.edges.some(
        (edge) => edge.to.node === node.id && edge.to.port === column && edge.from.node === nodeId,
      );
      if (wiredFromRenamed) next = relabelColumn(next, node.id, column, newLabel).document;
    }
  }
  return next;
}

/**
 * The ordinary rename: set `label`, then keep any table column that follows
 * this node's old label in sync (`syncColumnLabels`). `InputNodeView.tsx`
 * does its own variant — a rename also clears a stale `axisLabel` there —
 * and calls `syncColumnLabels` itself afterward for the same reason.
 */
export function renameNode(document: GraphDocument, nodeId: string, label: string): GraphDocument {
  const node = document.nodes.find((entry) => entry.id === nodeId);
  if (node === undefined) return document;
  const oldLabel = nodeLabel(node);
  const renamed = updateNode(document, nodeId, (entry) => ({ ...entry, label }));
  const updated = renamed.nodes.find((entry) => entry.id === nodeId) as GraphNode;
  return syncColumnLabels(renamed, nodeId, oldLabel, nodeLabel(updated));
}

/**
 * Rewrite a closure node's expression and drop every edge whose target port
 * the new expression no longer mentions — the same shape-change pruning
 * `changeOutputKind` does for a table's columns, via the same `pruneEdgesTo`.
 * An expression that fails to parse simply has no ports at all until it is
 * fixed: every existing wire is pruned, visibly, rather than kept pointing at
 * a port that may no longer mean the same thing.
 */
export function setClosureExpression(
  document: GraphDocument,
  nodeId: string,
  expression: string,
): GraphDocument {
  const withExpression = updateNode<ClosureNode>(document, nodeId, (node) => ({
    ...node,
    expression,
  }));
  let keep: ReadonlySet<string>;
  try {
    keep = new Set(closureFormula(expression).inputs.map((port) => port.name));
  } catch {
    keep = new Set();
  }
  return pruneEdgesTo(withExpression, nodeId, keep);
}

/** Reorder a table's columns — dropping `source` immediately before or after `target`. */
export function reorderColumn(
  document: GraphDocument,
  nodeId: string,
  source: string,
  target: string,
  position: 'before' | 'after',
): GraphDocument {
  if (source === target) return document;
  return updateNode<OutputNode>(document, nodeId, (node) => {
    if (node.output.kind !== 'table') return node;
    const columns = [...node.output.columns];
    const sourceIndex = columns.indexOf(source);
    if (sourceIndex === -1 || !columns.includes(target)) return node;
    columns.splice(sourceIndex, 1);
    // Re-found after the source is removed, so a source that sat earlier in
    // the list does not throw the target's index off by one (same as
    // reorderFrame).
    const targetIndex = columns.indexOf(target);
    columns.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, source);
    return { ...node, output: { ...node.output, columns } };
  });
}

/**
 * Drop every edge into `nodeId` whose target port is not in `keep` — for when
 * an output node's port set itself changes shape, such as switching away from
 * `table`'s several named columns to a single `value` port.
 */
export function pruneEdgesTo(
  document: GraphDocument,
  nodeId: string,
  keep: ReadonlySet<string>,
): GraphDocument {
  return {
    ...document,
    edges: document.edges.filter((edge) => edge.to.node !== nodeId || keep.has(edge.to.port)),
  };
}

/**
 * Switch an output node to a different kind, adapting whatever is already
 * wired rather than stranding it — an edge pointing at a port the new kind
 * does not declare is exactly the dangling-edge bug this exists to prevent.
 *
 * `table` is the one kind whose ports are not always `value`, so the
 * two directions across that boundary are asymmetric: leaving table adopts
 * its first column as `value` and drops the rest (a single-port kind has
 * nowhere else for them to go); entering table adopts whatever was on
 * `value` as a first column, named after its source the same way a fresh
 * column from the ghost slot is (Canvas.tsx). Between print,
 * check and plot — all single-`value`-port kinds — nothing needs adapting.
 */
export function changeOutputKind(document: GraphDocument, nodeId: string, next: Output): GraphDocument {
  const node = document.nodes.find((entry) => entry.id === nodeId);
  if (node?.kind !== 'output') return document;
  const current = node.output;
  if (current.kind === next.kind) return document;

  if (current.kind === 'table' && next.kind !== 'table') {
    const [firstColumn] = current.columns;
    const adopted =
      firstColumn === undefined ? document : renameColumn(document, nodeId, firstColumn, VALUE_PORT);
    const pruned = pruneEdgesTo(adopted, nodeId, new Set([VALUE_PORT]));
    return updateNode<OutputNode>(pruned, nodeId, (entry) => ({ ...entry, output: next }));
  }

  if (current.kind !== 'table' && next.kind === 'table') {
    const withKind = updateNode<OutputNode>(document, nodeId, (entry) => ({ ...entry, output: next }));
    const existing = withKind.edges.find(
      (edge) => edge.to.node === nodeId && edge.to.port === VALUE_PORT,
    );
    if (existing === undefined) return withKind;
    const source = withKind.nodes.find((entry) => entry.id === existing.from.node);
    const base = source === undefined ? existing.from.port : nodeLabel(source);
    const named = addNamedColumn(withKind, nodeId, base);
    return renameColumn(named.document, nodeId, VALUE_PORT, named.column);
  }

  return updateNode<OutputNode>(document, nodeId, (entry) => ({ ...entry, output: next }));
}

// --- frames: the notebook's sections ------------------------------

export function addFrame(document: GraphDocument, frame: Frame): GraphDocument {
  return { ...document, frames: [...document.frames, frame] };
}

export function updateFrame(
  document: GraphDocument,
  id: string,
  change: (frame: Frame) => Frame,
): GraphDocument {
  return {
    ...document,
    frames: document.frames.map((frame) => (frame.id === id ? change(frame) : frame)),
  };
}

/**
 * Move a section earlier or later in `document.frames` — the notebook's
 * section order. A precise one-step nudge, alongside the coarser drag
 * reorder (`reorderFrame`) — useful without a pointer, and when a section is
 * already exactly where dragging would land it.
 */
export function moveFrame(
  document: GraphDocument,
  id: string,
  direction: 'up' | 'down',
): GraphDocument {
  const index = document.frames.findIndex((frame) => frame.id === id);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= document.frames.length) return document;
  const frames = [...document.frames];
  [frames[index], frames[swapWith]] = [frames[swapWith] as Frame, frames[index] as Frame];
  return { ...document, frames };
}

/**
 * Move a section to just before or after another, for dragging one to a
 * specific spot in the notebook — including the very beginning (`before` the
 * first section) or the very end (`after` the last).
 */
export function reorderFrame(
  document: GraphDocument,
  sourceId: string,
  targetId: string,
  position: 'before' | 'after',
): GraphDocument {
  if (sourceId === targetId) return document;
  const frames = [...document.frames];
  const sourceIndex = frames.findIndex((frame) => frame.id === sourceId);
  if (sourceIndex === -1 || !frames.some((frame) => frame.id === targetId)) return document;
  const [moved] = frames.splice(sourceIndex, 1);
  // Re-found after the source is removed, so a source that sat earlier in the
  // list does not throw the target's index off by one.
  const targetIndex = frames.findIndex((frame) => frame.id === targetId);
  frames.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, moved as Frame);
  return { ...document, frames };
}

function inside(position: Position, frame: Frame): boolean {
  return (
    position.x >= frame.position.x &&
    position.y >= frame.position.y &&
    position.x <= frame.position.x + frame.size.width &&
    position.y <= frame.position.y + frame.size.height
  );
}

/**
 * Which section each node is in, decided by where it sits.
 *
 * Membership is *not* a thing to manage separately: the canvas layout is
 * the report outline, so dragging a node into a frame is how it joins that
 * section. The last frame wins where two overlap, which is the one drawn on top.
 */
export function reframe(document: GraphDocument): GraphDocument {
  if (document.frames.length === 0) {
    return document.nodes.some((node) => node.frameId !== undefined)
      ? { ...document, nodes: document.nodes.map(withoutFrame) }
      : document;
  }
  let changed = false;
  const nodes = document.nodes.map((node) => {
    const containing = document.frames.filter((frame) => inside(node.position, frame)).at(-1);
    if (containing?.id === node.frameId) return node;
    changed = true;
    return containing === undefined ? withoutFrame(node) : { ...node, frameId: containing.id };
  });
  return changed ? { ...document, nodes } : document;
}

/** A frame drawn around the given nodes, with room for their bodies. */
export function frameAround(
  id: string,
  title: string,
  nodes: readonly GraphNode[],
  padding = 48,
): Frame {
  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const left = Math.min(...xs) - padding;
  const top = Math.min(...ys) - padding * 1.5;
  return {
    id,
    title,
    position: { x: left, y: top },
    size: {
      // Node bodies extend right and down from their position, so the far edge
      // is the furthest node plus a node's width rather than plus the padding.
      width: Math.max(...xs) + 260 + padding - left,
      height: Math.max(...ys) + 180 + padding - top,
    },
  };
}

/**
 * "Group into new section" — around the current selection, or, with nothing
 * selected, an empty frame dropped at `at` rather than sweeping every free
 * node in the document into one. `selected` is whatever the canvas last
 * reported as selected (nodes, frames and edges alike), so it is filtered
 * against `document.nodes` here rather than trusted directly.
 */
export function groupIntoSection(
  document: GraphDocument,
  selected: ReadonlySet<string>,
  at: Position,
): GraphDocument {
  const id = uniqueId(document, 'section');
  const chosen = document.nodes.filter((node) => selected.has(node.id));
  const frame: Frame =
    chosen.length > 0
      ? frameAround(id, 'New section', chosen)
      : { id, title: 'New section', position: at, size: { width: 320, height: 220 } };
  return reframe({ ...document, frames: [...document.frames, frame] });
}
