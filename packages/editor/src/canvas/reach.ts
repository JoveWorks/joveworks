/**
 * What a hovered port or wire reaches across the whole graph, not just one
 * wire away — the canvas rings these nodes more quietly than the direct
 * neighbours (ROADMAP item 17).
 *
 * The first hop is port-exact: it follows only the wires on the hovered port.
 * Every hop after that is node-level: a node reached downstream counts all of
 * its outputs as reached, since which outputs depend on which inputs is the
 * kernel's business, not something the canvas can read off a wire.
 */

import type { Edge } from '@joveworks/schema';

import type { HoveredCanvasPort } from './node-data';

export interface Reach {
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
}

export type ReachDirection = 'downstream' | 'upstream';

export const NO_REACH: Reach = { nodes: new Set(), edges: new Set() };

/** Everything the given first wires lead to, followed hop by hop. */
export function reachThrough(
  edges: readonly Edge[],
  first: readonly Edge[],
  direction: ReachDirection,
): Reach {
  const near = (edge: Edge): string => (direction === 'downstream' ? edge.from.node : edge.to.node);
  const far = (edge: Edge): string => (direction === 'downstream' ? edge.to.node : edge.from.node);
  const leaving = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = leaving.get(near(edge));
    if (list === undefined) leaving.set(near(edge), [edge]);
    else list.push(edge);
  }
  const nodes = new Set<string>();
  const reached = new Set<string>();
  const queue: string[] = [];
  const follow = (edge: Edge): void => {
    reached.add(edge.id);
    const next = far(edge);
    if (nodes.has(next)) return;
    nodes.add(next);
    queue.push(next);
  };
  for (const edge of first) follow(edge);
  // The graph is acyclic (cycles are refused at connection time), but the
  // visited set makes this terminate on any input regardless.
  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const edge of leaving.get(node) ?? []) follow(edge);
  }
  return { nodes, edges: reached };
}

function union(a: Reach, b: Reach): Reach {
  return { nodes: new Set([...a.nodes, ...b.nodes]), edges: new Set([...a.edges, ...b.edges]) };
}

/**
 * The reach of what the pointer is on. An output port reaches downstream, an
 * input port upstream (what feeds it), and a wire downstream from its target:
 * in each case, what a change there would touch or what it depends on.
 */
export function hoverReach(
  edges: readonly Edge[],
  hoveredPort: HoveredCanvasPort | undefined,
  hoveredEdgeId: string | undefined,
): Reach {
  let reach = NO_REACH;
  const hoveredEdge = hoveredEdgeId === undefined ? undefined : edges.find((edge) => edge.id === hoveredEdgeId);
  if (hoveredEdge !== undefined) reach = union(reach, reachThrough(edges, [hoveredEdge], 'downstream'));
  if (hoveredPort !== undefined) {
    const out = edges.filter((edge) => edge.from.node === hoveredPort.nodeId && edge.from.port === hoveredPort.port);
    const into = edges.filter((edge) => edge.to.node === hoveredPort.nodeId && edge.to.port === hoveredPort.port);
    if (out.length > 0) reach = union(reach, reachThrough(edges, out, 'downstream'));
    if (into.length > 0) reach = union(reach, reachThrough(edges, into, 'upstream'));
  }
  return reach;
}
