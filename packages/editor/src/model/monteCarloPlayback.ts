/**
 * Playback *position* — one shared position for the whole document
 * (`ROADMAP.md` #27, #31), not one per receiver. Every Monte Carlo generator
 * shares one trial axis (`model/monteCarlo.ts`'s `allGeneratorIds` doc
 * comment), so "how far into the run we are" is one document-wide fact:
 * pressing play on any receiver's transport advances every receiver
 * together, the same way `setMonteCarloSampleCount` already keeps every
 * generator's authored count in lockstep rather than offering it per-node.
 *
 * The state itself stays exactly what the schema's own doc comment on
 * `MonteCarloReceiverNode` calls for — ephemeral, not part of the document,
 * reset on reload — it just lives one level up, in `GraphContextValue`,
 * rather than in whichever component happened to mount first.
 *
 * Ticking is centralized the same way: one `setInterval` here drives
 * playback, rather than each view running its own timer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { GraphDocument, MonteCarloReceiverNode } from '@joveworks/schema';

import { MONTE_CARLO_BATCH_SIZE, MONTE_CARLO_TICK_MS, batchSizeAt } from './monteCarlo';

export interface MonteCarloPlaybackState {
  readonly revealed: number;
  readonly playing: boolean;
}

const INITIAL: MonteCarloPlaybackState = { revealed: MONTE_CARLO_BATCH_SIZE, playing: false };

export interface MonteCarloPlaybackControls {
  readonly playback: MonteCarloPlaybackState;
  readonly togglePlayback: () => void;
  readonly stepPlayback: () => void;
  readonly resetPlayback: () => void;
}

export function useMonteCarloPlayback(document: GraphDocument): MonteCarloPlaybackControls {
  const [playback, setPlayback] = useState<MonteCarloPlaybackState>(INITIAL);
  // The ramp-up tick counter is write-only bookkeeping for `batchSizeAt`,
  // not something any view reads or renders — a ref, not state, so bumping
  // it never triggers a render of its own.
  const tick = useRef(0);

  const receivers = useMemo(
    () => document.nodes.filter((node): node is MonteCarloReceiverNode => node.kind === 'monteCarloReceiver'),
    [document],
  );

  // The ceiling playback plays toward: whichever receiver asks to see the
  // most samples, since a shared position has to satisfy all of them at
  // once. Zero with no receiver at all — nothing to play against.
  const limit = receivers.reduce((max, receiver) => Math.max(max, receiver.sampleLimit), 0);
  // Eases in if *any* receiver asked for a gentle start — one shared timer
  // can only ramp one way, so a receiver wanting the slow start gets it for
  // everyone rather than being overridden by a sibling that did not ask.
  const rampUp = receivers.some((receiver) => receiver.rampUp ?? false);

  // Clamps `revealed` down when the ceiling shrinks — a receiver was
  // deleted, or its own `sampleLimit` was lowered.
  useEffect(() => {
    setPlayback((current) =>
      current.revealed > limit ? { revealed: limit, playing: current.playing && limit > 0 } : current,
    );
  }, [limit]);

  useEffect(() => {
    if (!playback.playing) return undefined;
    const timer = window.setInterval(() => {
      setPlayback((current) => {
        if (!current.playing || current.revealed >= limit) return current;
        const tickIndex = tick.current;
        tick.current += 1;
        const revealed = Math.min(limit, current.revealed + batchSizeAt(tickIndex, rampUp));
        return { revealed, playing: revealed < limit };
      });
    }, MONTE_CARLO_TICK_MS);
    return () => window.clearInterval(timer);
    // `playback.playing` (not the whole `playback` object) is the
    // dependency: the interval only needs restarting when play/pause
    // toggles, not on every tick's own state update, which would otherwise
    // tear the timer down and rebuild it every `MONTE_CARLO_TICK_MS`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.playing, limit, rampUp]);

  return {
    playback,
    togglePlayback: () => setPlayback((current) => ({ ...current, playing: !current.playing })),
    stepPlayback: () =>
      setPlayback((current) => ({ ...current, revealed: Math.min(limit, current.revealed + MONTE_CARLO_BATCH_SIZE) })),
    resetPlayback: () => {
      tick.current = 0;
      setPlayback(INITIAL);
    },
  };
}
