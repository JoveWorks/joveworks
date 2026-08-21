/**
 * Playback support for the Monte Carlo receiver (`ROADMAP.md` #27), and the
 * linked sample count every generator shares (`ROADMAP.md` #31).
 *
 * The kernel never learns playback exists (`packages/kernel/src/random.ts`):
 * a batch is just re-evaluating the whole document with an upstream
 * generator's `count` bumped up. What lives here is the editor-only part of
 * that trick — finding which generator node(s) actually feed a receiver
 * (through any number of ordinary formula/waypoint/pack/unpack nodes in
 * between, which must keep working unmodified) and building the scratch
 * document a playback tick evaluates, without ever touching the real one or
 * its undo history.
 */

import {
  MONTE_CARLO_SAMPLE_PORT,
  type GraphDocument,
  type MonteCarloGeneratorNode,
  type MonteCarloReceiverNode,
} from '@joveworks/schema';

/**
 * Every Monte Carlo generator upstream of a receiver's `sample` port,
 * reached by walking edges backward through however many ordinary nodes sit
 * in between. Two or more generators combined this way pair sample-for-
 * sample rather than gridding (`packages/kernel/src/series.ts`'s union rule,
 * given every generator's axis id — `graph.ts`'s `Resolution.axes`), which is
 * exactly what advancing every one together as a single "revealed count"
 * assumes.
 */
export function upstreamGenerators(
  document: GraphDocument,
  receiverId: string,
): readonly string[] {
  const visited = new Set<string>();
  const found = new Set<string>();
  const queue: string[] = [receiverId];

  while (queue.length > 0) {
    const nodeId = queue.shift() as string;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    for (const edge of document.edges) {
      if (edge.to.node !== nodeId) continue;
      const upstream = document.nodes.find((node) => node.id === edge.from.node);
      if (upstream === undefined) continue;
      if (upstream.kind === 'monteCarloGenerator') found.add(upstream.id);
      queue.push(upstream.id);
    }
  }

  return [...found];
}

/**
 * A scratch copy of `document` with the given generators' `count` set to
 * `count` (never below 1 — a generator with no samples has no axis at all).
 * The document's own `id` is untouched, which is what keeps the seeded
 * stream (`random.ts`) identical to the real document's: sample `i` never
 * changes as playback reveals more of them, it only ever appends.
 */
export function withGeneratorCounts(
  document: GraphDocument,
  generatorIds: readonly string[],
  count: number,
): GraphDocument {
  const revealed = Math.max(1, Math.round(count));
  const ids = new Set(generatorIds);
  if (ids.size === 0) return document;
  return {
    ...document,
    nodes: document.nodes.map((node) =>
      ids.has(node.id) && node.kind === 'monteCarloGenerator'
        ? ({ ...node, count: revealed } satisfies MonteCarloGeneratorNode)
        : node,
    ),
  };
}

/** The fixed batch size and tick cadence settled for v1 (`ROADMAP.md` #27). */
export const MONTE_CARLO_BATCH_SIZE = 25;
export const MONTE_CARLO_TICK_MS = 100;

/**
 * How far a ramped-up playback should have advanced by tick `tickIndex`
 * (0-based) — a gentle slow start when `rampUp` is on, otherwise the full
 * batch every tick. Ramps over the first eight ticks, then settles at the
 * full batch size; chosen so a receiver's first second or so of playback
 * visibly eases in rather than jumping straight to +25/tick.
 */
export function batchSizeAt(tickIndex: number, rampUp: boolean | undefined): number {
  if (!(rampUp ?? false)) return MONTE_CARLO_BATCH_SIZE;
  const ramped = Math.round((MONTE_CARLO_BATCH_SIZE * (tickIndex + 1)) / 8);
  return Math.max(1, Math.min(MONTE_CARLO_BATCH_SIZE, ramped));
}

/** Whether a receiver has anything wired to accumulate at all. */
export function isReceiverWired(document: GraphDocument, receiver: MonteCarloReceiverNode): boolean {
  return document.edges.some(
    (edge) => edge.to.node === receiver.id && edge.to.port === MONTE_CARLO_SAMPLE_PORT,
  );
}

/** What a document's first Monte Carlo generator starts with, absent any generator yet. */
export const DEFAULT_MONTE_CARLO_COUNT = 25;

/**
 * The sample count a new generator should be dropped with (`ROADMAP.md`
 * #31): whatever count is already in use, so a document never opens with two
 * generators disagreeing before a student has touched either one. Reads the
 * first generator in document order — with every generator kept in lockstep
 * by `setMonteCarloSampleCount`, any one of them already carries the answer.
 */
export function monteCarloSampleCount(document: GraphDocument): number {
  const generator = document.nodes.find(
    (node): node is MonteCarloGeneratorNode => node.kind === 'monteCarloGenerator',
  );
  return generator?.count ?? DEFAULT_MONTE_CARLO_COUNT;
}

/**
 * Sets `count` on every Monte Carlo generator in the document at once — the
 * one field a student edits from any generator's inspector, kept identical
 * everywhere rather than offered per-node. Two generators are only ever
 * combined meaningfully when they share one trial (`ROADMAP.md` #31), so
 * there is no legitimate case for them to disagree.
 */
export function setMonteCarloSampleCount(document: GraphDocument, count: number): GraphDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) =>
      node.kind === 'monteCarloGenerator' ? ({ ...node, count } satisfies MonteCarloGeneratorNode) : node,
    ),
  };
}
