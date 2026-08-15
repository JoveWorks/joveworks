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
 * `canConnect` in the kernel (S64) before it ever reaches `connect` below, and
 * that asymmetry is deliberate: the rules live in one place, and this file is
 * only how a permitted change is applied.
 */

import type { Edge, Endpoint, Frame, GraphDocument, GraphNode, Position } from '@mds/schema';

/** `node.port -> node.port`, which is unique because an input takes one edge. */
export function edgeId(from: Endpoint, to: Endpoint): string {
  return `${from.node}.${from.port}->${to.node}.${to.port}`;
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
    ...withoutFrame(source),
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
  return {
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
  };
}

function withoutFrame(node: GraphNode): GraphNode {
  const { frameId: _dropped, ...rest } = node;
  return rest as GraphNode;
}

export function removeEdges(document: GraphDocument, ids: ReadonlySet<string>): GraphDocument {
  return { ...document, edges: document.edges.filter((edge) => !ids.has(edge.id)) };
}

/**
 * Attach an edge. Any edge already arriving at the target port is replaced —
 * an input takes one connection, and rewiring is the ordinary way to change
 * one's mind, not an error to report.
 */
export function connect(document: GraphDocument, from: Endpoint, to: Endpoint): GraphDocument {
  const edge: Edge = { id: edgeId(from, to), from, to };
  const kept = document.edges.filter(
    (existing) => !(existing.to.node === to.node && existing.to.port === to.port),
  );
  return { ...document, edges: [...kept, edge] };
}

// --- frames: the notebook's sections (S28/S30) ------------------------------

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
 * section order (S30). A precise one-step nudge, alongside the coarser drag
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
 * Membership is *not* a thing to manage separately: S30 makes the canvas layout
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
