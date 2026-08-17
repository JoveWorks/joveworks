/**
 * `pack`'s channel bookkeeping — shared between resolution (`graph.ts`),
 * evaluation (`evaluate.ts`) and the editor, which all need the same answer
 * to "which channels are currently wired, and what comes next".
 *
 * `pack` stores no ports of its own (`document.ts`'s `PackNode`, same idea
 * as a closure node's ports): a channel exists exactly while an edge targets
 * `in{n}`, so the channel list is read straight off `document.edges` rather
 * than kept anywhere else.
 */

import type { GraphDocument } from '@joveworks/schema';

const CHANNEL_PATTERN = /^in(\d+)$/u;
const OUT_CHANNEL_PATTERN = /^out(\d+)$/u;

/** The pack channel indices actually wired on this node, ascending. Gaps are normal. */
export function packChannelIndices(document: GraphDocument, nodeId: string): readonly number[] {
  const indices = new Set<number>();
  for (const edge of document.edges) {
    if (edge.to.node !== nodeId) continue;
    const match = CHANNEL_PATTERN.exec(edge.to.port);
    if (match === null) continue;
    indices.add(Number(match[1]));
  }
  return [...indices].sort((a, b) => a - b);
}

/**
 * The channel index a freshly wired ghost slot gets: one past the highest
 * currently wired index, never a gap left by an unwired one. Channel
 * indices are never renumbered or reused within one editing session — a
 * rewire never silently lands on a channel a student did not drag onto —
 * which this one-line rule is all that is needed to guarantee, since there
 * is no persisted channel list to get out of step with.
 */
export function nextPackChannel(wired: readonly number[]): number {
  return wired.length === 0 ? 0 : Math.max(...wired) + 1;
}

/** Every independent inN/outN pair currently used by a waypoint. */
export function waypointChannelIndices(document: GraphDocument, nodeId: string): readonly number[] {
  const indices = new Set<number>();
  for (const edge of document.edges) {
    const match = edge.to.node === nodeId
      ? CHANNEL_PATTERN.exec(edge.to.port)
      : edge.from.node === nodeId
        ? OUT_CHANNEL_PATTERN.exec(edge.from.port)
        : null;
    if (match !== null) indices.add(Number(match[1]));
  }
  return [...indices].sort((a, b) => a - b);
}
