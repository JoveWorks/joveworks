/**
 * Deterministic sampling for the Monte Carlo generator range.
 *
 * A generator node behaves like any other range: it introduces an axis and
 * its length is the document's own business (`series.ts`'s "an axis is
 * introduced by a range input node" invariant covers it exactly). What is
 * different is where the *values* on that axis come from — a draw from a
 * distribution rather than a formula over `start`/`stop`/`points`.
 *
 * The playback feature built on top of this (the editor re-evaluates the
 * whole document with a larger `count` each batch, per `ROADMAP.md` #27)
 * depends on one property this file must guarantee: **sample `i` never
 * changes as `count` grows.** That falls straight out of always drawing a
 * fresh, identically-seeded stream from index 0 rather than resuming state
 * across calls — nothing here is memoised across evaluations, by design.
 *
 * The seed is derived from the document id and the generator node's own id,
 * so every generator in a document gets its own independent stream (no two
 * generators draw the same sequence), while every stream is fully determined
 * by the document alone — "a fixed seed per NodeBook", reproducible without
 * storing any randomness in the document itself.
 */

import { fnv1a64 } from '@joveworks/schema';

/**
 * Combine a document id and a node id into one 32-bit PRNG seed, reusing the
 * same FNV-1a `packages/schema/src/hash.ts` already uses for catalogue
 * change detection — a `\0` separator keeps `('ab', 'c')` and `('a', 'bc')`
 * from hashing identically.
 */
function deriveSeed(documentId: string, nodeId: string): number {
  const hash = fnv1a64(`${documentId}\u0000${nodeId}`);
  return Number(BigInt(`0x${hash}`) & 0xffffffffn);
}

/** mulberry32 — a small, fast, seedable PRNG producing values in `[0, 1)`. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface UniformDraw {
  readonly distribution: 'uniform';
  readonly min: number;
  readonly max: number;
}

export interface NormalDraw {
  readonly distribution: 'normal';
  readonly mean: number;
  readonly stddev: number;
}

export type MonteCarloDraw = UniformDraw | NormalDraw;

/**
 * `count` samples from `draw`, seeded from `documentId`/`nodeId`. Draws
 * `[0, count)` from scratch every call — see the module doc for why that is
 * what makes playback's "reveal more, never reshuffle" behaviour correct.
 */
export function monteCarloSamples(
  documentId: string,
  nodeId: string,
  draw: MonteCarloDraw,
  count: number,
): readonly number[] {
  const next = mulberry32(deriveSeed(documentId, nodeId));

  if (draw.distribution === 'uniform') {
    const { min, max } = draw;
    return Array.from({ length: count }, () => min + next() * (max - min));
  }

  // Box-Muller, drawn in pairs so that sample `i` only ever depends on the
  // pair `floor(i / 2)` — never on `count`, which is what keeps a growing
  // playback batch from reshuffling samples already revealed.
  const { mean, stddev } = draw;
  const values: number[] = [];
  const pairs = Math.ceil(count / 2);
  for (let pair = 0; pair < pairs; pair += 1) {
    const u1 = Math.max(next(), Number.EPSILON);
    const u2 = next();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    values.push(mean + stddev * radius * Math.cos(angle));
    values.push(mean + stddev * radius * Math.sin(angle));
  }
  return values.slice(0, count);
}
