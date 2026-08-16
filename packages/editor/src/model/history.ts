/**
 * A linear undo/redo stack over snapshots of `T`, generic rather than tied
 * to `GraphDocument` — it's a self-contained utility with one real consumer
 * (`App.tsx`), but the generic type costs nothing and lets tests use trivial
 * fixtures.
 *
 * Two edit paths, because most of the editor commits one step per user
 * gesture (a menu action, a field committed on blur) but a few interactions
 * — node/frame drag, free-typed captions — call an edit function on every
 * pointer-move tick or keystroke. `pushEdit` is the former: record
 * immediately. `pushLiveEdit` is the latter: apply without recording, and
 * `commitPending` folds everything since the last commit into exactly one
 * step. Everywhere that already commits once per gesture keeps using
 * `pushEdit` unchanged.
 */

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** The pre-gesture snapshot, while a live edit run is in progress. */
  readonly pending: T | undefined;
}

const DEFAULT_LIMIT = 100;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], pending: undefined };
}

function bounded<T>(past: readonly T[], limit: number): readonly T[] {
  return past.length <= limit ? past : past.slice(past.length - limit);
}

/**
 * Flushes a pending live run into its own step, then records `change` as a
 * second, separate step — the ordinary case, one call one step, but also
 * correct if a discrete edit interrupts a live run (e.g. a menu action mid-drag).
 */
export function pushEdit<T>(
  history: History<T>,
  change: (value: T) => T,
  limit = DEFAULT_LIMIT,
): History<T> {
  const flushed = commitPending(history, limit);
  return {
    past: bounded([...flushed.past, flushed.present], limit),
    present: change(flushed.present),
    future: [],
    pending: undefined,
  };
}

/**
 * Applies `change` immediately, without recording a step — a no-op (no
 * `pending` set, nothing else touched) if `change` returns the same
 * reference, which covers gestures that end up changing nothing (a click
 * that never moved a node, a `reframe` with nothing to reassign) without any
 * caller having to check for that itself.
 */
export function pushLiveEdit<T>(history: History<T>, change: (value: T) => T): History<T> {
  const next = change(history.present);
  if (next === history.present) return history;
  return {
    ...history,
    present: next,
    future: [],
    pending: history.pending ?? history.present,
  };
}

/** Finalizes whatever `pushLiveEdit` accumulated into one step. No-op if nothing is pending. */
export function commitPending<T>(history: History<T>, limit = DEFAULT_LIMIT): History<T> {
  if (history.pending === undefined) return history;
  return {
    past: bounded([...history.past, history.pending], limit),
    present: history.present,
    future: history.future,
    pending: undefined,
  };
}

export function undoHistory<T>(history: History<T>): History<T> {
  const last = history.past.at(-1);
  if (last === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: last,
    future: [history.present, ...history.future],
    pending: undefined,
  };
}

export function redoHistory<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
    pending: undefined,
  };
}
