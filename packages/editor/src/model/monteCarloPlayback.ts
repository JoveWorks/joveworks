/**
 * Playback *position*, shared across every place a receiver renders
 * (`ROADMAP.md` #27) — the canvas node and the notebook entry are two views
 * of one receiver, so pressing play in either one has to advance the same
 * state, not two independent copies that drift apart the moment both are on
 * screen at once.
 *
 * The state itself stays exactly what the schema's own doc comment on
 * `MonteCarloReceiverNode` calls for — ephemeral, not part of the document,
 * reset on reload — it just now lives one level up, in `GraphContextValue`,
 * rather than in whichever component happened to mount first.
 *
 * Ticking is centralized the same way: one `setInterval` here drives every
 * currently-playing receiver together, rather than each view running its
 * own timer — two views of the same receiver both playing would otherwise
 * double its batch size per tick.
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
  readonly playback: ReadonlyMap<string, MonteCarloPlaybackState>;
  readonly togglePlayback: (id: string) => void;
  readonly stepPlayback: (id: string) => void;
  readonly resetPlayback: (id: string) => void;
}

export function useMonteCarloPlayback(document: GraphDocument): MonteCarloPlaybackControls {
  const [playback, setPlayback] = useState<ReadonlyMap<string, MonteCarloPlaybackState>>(new Map());
  // The ramp-up tick counter is write-only bookkeeping for `batchSizeAt`,
  // not something any view reads or renders — a ref, not state, so bumping
  // it never triggers a render of its own.
  const ticks = useRef(new Map<string, number>());

  const receivers = useMemo(
    () => document.nodes.filter((node): node is MonteCarloReceiverNode => node.kind === 'monteCarloReceiver'),
    [document],
  );

  // Drops state for receivers no longer in the document (deleted, or an
  // undo/redo that removed one) and clamps `revealed` down when a sample
  // limit shrinks — both keyed off the same receiver list, in one pass.
  useEffect(() => {
    const byId = new Map(receivers.map((receiver) => [receiver.id, receiver] as const));
    setPlayback((current) => {
      let changed = false;
      const next = new Map<string, MonteCarloPlaybackState>();
      for (const [id, state] of current) {
        const receiver = byId.get(id);
        if (receiver === undefined) {
          changed = true;
          continue;
        }
        if (state.revealed > receiver.sampleLimit) {
          next.set(id, { ...state, revealed: receiver.sampleLimit });
          changed = true;
        } else {
          next.set(id, state);
        }
      }
      return changed ? next : current;
    });
  }, [receivers]);

  const playingIds = receivers
    .filter((receiver) => playback.get(receiver.id)?.playing ?? false)
    .map((receiver) => receiver.id)
    .join(',');

  useEffect(() => {
    if (playingIds.length === 0) return undefined;
    const timer = window.setInterval(() => {
      setPlayback((current) => {
        const next = new Map(current);
        let changed = false;
        for (const receiver of receivers) {
          const state = current.get(receiver.id);
          if (state === undefined || !state.playing) continue;
          const limit = receiver.sampleLimit;
          if (state.revealed >= limit) continue;
          const tickIndex = ticks.current.get(receiver.id) ?? 0;
          ticks.current.set(receiver.id, tickIndex + 1);
          const revealed = Math.min(limit, state.revealed + batchSizeAt(tickIndex, receiver.rampUp));
          next.set(receiver.id, { revealed, playing: revealed < limit });
          changed = true;
        }
        return changed ? next : current;
      });
    }, MONTE_CARLO_TICK_MS);
    return () => window.clearInterval(timer);
    // `playingIds` (not `playback`) is the dependency: the interval only
    // needs restarting when *which* receivers are playing changes, not on
    // every tick's own state update, which would otherwise tear the timer
    // down and rebuild it every MONTE_CARLO_TICK_MS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingIds, receivers]);

  const update = (id: string, change: (current: MonteCarloPlaybackState) => MonteCarloPlaybackState): void =>
    setPlayback((current) => {
      const next = new Map(current);
      next.set(id, change(current.get(id) ?? INITIAL));
      return next;
    });

  return {
    playback,
    togglePlayback: (id) => update(id, (state) => ({ ...state, playing: !state.playing })),
    stepPlayback: (id) => {
      const limit = receivers.find((receiver) => receiver.id === id)?.sampleLimit;
      update(id, (state) => ({
        ...state,
        revealed: limit === undefined ? state.revealed : Math.min(limit, state.revealed + MONTE_CARLO_BATCH_SIZE),
      }));
    },
    resetPlayback: (id) => {
      ticks.current.set(id, 0);
      update(id, () => INITIAL);
    },
  };
}
