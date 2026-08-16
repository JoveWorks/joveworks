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

import type { GraphDocument } from '@mds/schema';

const CHANNEL_PATTERN = /^in(\d+)$/u;

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

/**
 * `waypoint`/`pack`/`unpack` are quarantined pending a redesign — see
 * ROADMAP.md's "Waypoint/pack/unpack" entry. Kept here, next to their other
 * shared bookkeeping, as the one place both the resolution gate
 * (`graph.ts`) and the editor (palette entries, node state) read the same
 * reason from — the same "gate stated once" reasoning `formula.ts`'s own
 * quarantine gate follows.
 */
export const ROUTING_QUARANTINE_REASON: Readonly<Record<'waypoint' | 'pack' | 'unpack', string>> = {
  waypoint:
    'only accepts wires that already share one dimension, merged into a single output — the ' +
    'actual want is several independent in→out pairs on one node, not one shared channel',
  pack: "resolution can throw a dimension error misattributed to 'waypoint' — root cause not yet found",
  unpack: 'quarantined alongside pack, the node every unpack depends on',
};

export const ROUTING_KINDS = new Set(['waypoint', 'pack', 'unpack']);
