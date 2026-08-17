/**
 * The Sugiyama-style layered layout `layout.ts` builds on: rank blocks left
 * to right by longest path from a source, pin inputs to the leftmost rank
 * and outputs to the rightmost, then order each rank vertically by
 * iterated barycenter to cut down edge crossings. Works over an abstract
 * `LayoutBlock`/`LayoutEdge` graph rather than `GraphDocument` directly, so
 * it can be tested without document fixtures — `layout.ts` is what maps a
 * frame (with its members folded in as one compound node) and a loose node
 * onto a block.
 */

import type { Position } from '@joveworks/schema';

import { BOTTOM_ROW_GAP_Y, GAP, LAYER_GAP_X, ROW_GAP_Y } from './layout-constants';

export interface LayoutBlock {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  /** Current position — only used to seed the initial within-rank order. */
  readonly origin: Position;
  /** True if this block contains (or is) an `'input'`-kind node — clamps its rank to 0. */
  readonly hasInput: boolean;
  /** True if this block contains (or is) an `'output'`-kind node — pins its rank to the last column. */
  readonly hasOutput: boolean;
  /**
   * A loose output node: excluded from ranking and vertical ordering
   * entirely, placed in a row under the main layout afterward instead.
   */
  readonly bottomRow: boolean;
}

export interface LayoutEdge {
  readonly from: string;
  readonly to: string;
}

export type LayeredLayoutResult =
  | { readonly cyclic: false; readonly positions: ReadonlyMap<string, Position> }
  | { readonly cyclic: true; readonly positions: undefined };

const MAX_ORDERING_PASSES = 8;

/** Longest-path-from-sources rank via Kahn's algorithm. `undefined` on a cycle. */
function assignRanks(
  blocks: readonly LayoutBlock[],
  edges: readonly LayoutEdge[],
): Map<string, number> | undefined {
  const indegree = new Map<string, number>(blocks.map((block) => [block.key, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    const list = outgoing.get(edge.from);
    if (list === undefined) outgoing.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }

  const rank = new Map<string, number>();
  const remaining = new Map(indegree);
  const queue = blocks.filter((block) => (indegree.get(block.key) ?? 0) === 0).map((block) => block.key);
  for (const key of queue) rank.set(key, 0);

  let processed = 0;
  while (queue.length > 0) {
    const key = queue.shift() as string;
    processed += 1;
    const r = rank.get(key) ?? 0;
    for (const next of outgoing.get(key) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, r + 1));
      const left = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  return processed === blocks.length ? rank : undefined;
}

function snapshotOrder(order: ReadonlyMap<number, readonly string[]>): string {
  return [...order.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, keys]) => keys.join(','))
    .join('|');
}

/**
 * One barycenter pass: reorders every rank by the mean index its neighbours
 * (in the adjacent reference rank) currently hold, keeping a block that has
 * none of those neighbours near its own previous position rather than
 * shuffling it to an edge.
 */
function barycenterPass(
  order: Map<number, string[]>,
  ranks: readonly number[],
  direction: 'forward' | 'backward',
  predecessors: ReadonlyMap<string, readonly string[]>,
  successors: ReadonlyMap<string, readonly string[]>,
): void {
  const sequence = direction === 'forward' ? ranks.slice(1) : ranks.slice(0, -1).reverse();
  const step = direction === 'forward' ? -1 : 1;

  for (const r of sequence) {
    const refRank = r + step;
    const refIndex = new Map((order.get(refRank) ?? []).map((key, i) => [key, i] as const));
    const neighborsOf = direction === 'forward' ? predecessors : successors;

    const withBarycenter = (order.get(r) ?? []).map((key, i) => {
      const relevant = (neighborsOf.get(key) ?? []).filter((n) => refIndex.has(n)).map((n) => refIndex.get(n)!);
      const barycenter = relevant.length > 0 ? relevant.reduce((a, b) => a + b, 0) / relevant.length : i;
      return { key, barycenter };
    });
    withBarycenter.sort((a, b) => a.barycenter - b.barycenter || a.key.localeCompare(b.key));
    order.set(r, withBarycenter.map((entry) => entry.key));
  }
}

export function computeLayeredPositions(
  blocks: readonly LayoutBlock[],
  edges: readonly LayoutEdge[],
): LayeredLayoutResult {
  const blockByKey = new Map(blocks.map((block) => [block.key, block] as const));
  const mainBlocks = blocks.filter((block) => !block.bottomRow);
  const bottomBlocks = blocks.filter((block) => block.bottomRow);
  const mainKeys = new Set(mainBlocks.map((block) => block.key));

  const mainEdges = edges.filter(
    (edge) => edge.from !== edge.to && mainKeys.has(edge.from) && mainKeys.has(edge.to),
  );

  const rank = assignRanks(mainBlocks, mainEdges);
  if (rank === undefined) return { cyclic: true, positions: undefined };

  // Inputs lead, outputs trail — a hard rule, not left to emerge from
  // longest-path alone. Input clamps first since it should already hold by
  // construction (a source has rank 0); output pins after, on the rank
  // that clamp may have lowered, and wins if a block is (rarely) both.
  for (const block of mainBlocks) {
    if (block.hasInput) rank.set(block.key, 0);
  }
  const maxRank = Math.max(0, ...mainBlocks.map((block) => rank.get(block.key) ?? 0));
  for (const block of mainBlocks) {
    if (block.hasOutput) rank.set(block.key, maxRank);
  }

  const order = new Map<number, string[]>();
  for (const block of mainBlocks) {
    const r = rank.get(block.key) ?? 0;
    const list = order.get(r);
    if (list === undefined) order.set(r, [block.key]);
    else list.push(block.key);
  }
  for (const [r, keys] of order) {
    keys.sort((a, b) => {
      const blockA = blockByKey.get(a)!;
      const blockB = blockByKey.get(b)!;
      return blockA.origin.y - blockB.origin.y || blockA.origin.x - blockB.origin.x || a.localeCompare(b);
    });
    order.set(r, keys);
  }

  const ranks = [...order.keys()].sort((a, b) => a - b);

  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const edge of mainEdges) {
    const succ = successors.get(edge.from);
    if (succ === undefined) successors.set(edge.from, [edge.to]);
    else succ.push(edge.to);
    const pred = predecessors.get(edge.to);
    if (pred === undefined) predecessors.set(edge.to, [edge.from]);
    else pred.push(edge.from);
  }

  let previous = snapshotOrder(order);
  for (let pass = 0; pass < MAX_ORDERING_PASSES; pass += 1) {
    barycenterPass(order, ranks, pass % 2 === 0 ? 'forward' : 'backward', predecessors, successors);
    const next = snapshotOrder(order);
    if (next === previous) break;
    previous = next;
  }

  // x per rank: cumulative widest block of every prior rank, plus a gap.
  const rankX = new Map<number, number>();
  let cursorX = 0;
  for (const r of ranks) {
    rankX.set(r, cursorX);
    const widest = Math.max(...(order.get(r) ?? []).map((key) => blockByKey.get(key)!.width));
    cursorX += widest + LAYER_GAP_X;
  }

  const positions = new Map<string, Position>();
  for (const r of ranks) {
    let cursorY = 0;
    for (const key of order.get(r) ?? []) {
      const block = blockByKey.get(key)!;
      positions.set(key, { x: rankX.get(r) ?? 0, y: cursorY });
      cursorY += block.height + ROW_GAP_Y;
    }
  }

  let mainBottom = 0;
  for (const [key, position] of positions) {
    mainBottom = Math.max(mainBottom, position.y + blockByKey.get(key)!.height);
  }

  // Left-to-right by the rank of the strongest upstream connection, so a
  // loose output roughly sits under the column its data came from.
  const sourceRankOf = (key: string): number => {
    const inbound = edges.filter((edge) => edge.to === key && mainKeys.has(edge.from));
    return inbound.length > 0 ? Math.max(...inbound.map((edge) => rank.get(edge.from) ?? 0)) : 0;
  };
  const orderedBottom = [...bottomBlocks].sort((a, b) => {
    const ra = sourceRankOf(a.key);
    const rb = sourceRankOf(b.key);
    return ra - rb || a.key.localeCompare(b.key);
  });

  let bottomCursorX = 0;
  const bottomY = mainBottom + BOTTOM_ROW_GAP_Y;
  for (const block of orderedBottom) {
    positions.set(block.key, { x: bottomCursorX, y: bottomY });
    bottomCursorX += block.width + GAP;
  }

  return { cyclic: false, positions };
}
