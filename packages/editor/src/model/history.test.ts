/** `history.ts`'s pure stack, exercised with trivial fixtures — nothing here needs a real document. */

import { describe, expect, it } from 'vitest';

import {
  commitPending,
  initHistory,
  pushEdit,
  pushLiveEdit,
  redoHistory,
  undoHistory,
  type History,
} from './history';

describe('pushEdit / undoHistory / redoHistory', () => {
  it('records one step per call and round-trips', () => {
    const h0 = initHistory(0);
    const h1 = pushEdit(h0, (n) => n + 1);
    const h2 = pushEdit(h1, (n) => n + 1);
    expect(h2.present).toBe(2);

    const undone1 = undoHistory(h2);
    expect(undone1.present).toBe(1);
    const undone0 = undoHistory(undone1);
    expect(undone0.present).toBe(0);

    const redone1 = redoHistory(undone0);
    expect(redone1.present).toBe(1);
    const redone2 = redoHistory(redone1);
    expect(redone2.present).toBe(2);
  });

  it('undo on an empty past is a no-op', () => {
    const h0 = initHistory('x');
    expect(undoHistory(h0)).toBe(h0);
  });

  it('redo on an empty future is a no-op', () => {
    const h0 = initHistory('x');
    expect(redoHistory(h0)).toBe(h0);
  });

  it('a new edit after undo discards the old future — linear, not branching', () => {
    const h0 = initHistory(0);
    const h1 = pushEdit(h0, (n) => n + 1);
    const h2 = pushEdit(h1, (n) => n + 1);
    const undone = undoHistory(h2);
    expect(undone.present).toBe(1);

    const branched = pushEdit(undone, (n) => n + 10);
    expect(branched.present).toBe(11);
    expect(branched.future).toEqual([]);
    expect(redoHistory(branched)).toBe(branched);
  });

  it('bounds past at the given limit, dropping the oldest entry', () => {
    let h: History<number> = initHistory(0);
    for (let i = 1; i <= 5; i++) h = pushEdit(h, (n) => n + 1, 3);
    expect(h.present).toBe(5);
    expect(h.past).toEqual([2, 3, 4]);
  });
});

describe('pushLiveEdit / commitPending', () => {
  it('several live edits then one commit produce exactly one past entry', () => {
    const h0 = initHistory(0);
    const dragged = [1, 2, 3].reduce((h, n) => pushLiveEdit(h, () => n), h0);
    expect(dragged.present).toBe(3);
    expect(dragged.past).toEqual([]);
    expect(dragged.pending).toBe(0);

    const committed = commitPending(dragged);
    expect(committed.past).toEqual([0]);
    expect(committed.pending).toBeUndefined();

    const undone = undoHistory(committed);
    expect(undone.present).toBe(0);
  });

  it('a no-op change (same reference) never sets pending or touches past/future', () => {
    const h0 = initHistory({ n: 0 });
    const same = pushLiveEdit(h0, (v) => v);
    expect(same).toBe(h0);
    expect(same.pending).toBeUndefined();
  });

  it('two live edits from different sources, each followed by their own commit, still coalesce into one step', () => {
    // The shape of a Backspace/Delete on a wired node: React Flow fires
    // `onEdgesChange` (removes the wire) and `onNodesChange` (removes the
    // node) as two separate calls for one keypress, each naively wanting to
    // commit its own step. Both go live instead, and whichever commit call
    // lands first does the work; the second is a no-op (already covered
    // above) — the point here is the *net result* undoes as one step.
    const h0 = initHistory({ nodes: ['a', 'b'], edges: ['a-b'] });
    const afterEdgeRemoved = pushLiveEdit(h0, (doc) => ({ ...doc, edges: [] }));
    const afterNodeRemoved = pushLiveEdit(afterEdgeRemoved, (doc) => ({
      ...doc,
      nodes: doc.nodes.filter((n) => n !== 'a'),
    }));
    const committedOnce = commitPending(afterNodeRemoved);
    const committedTwice = commitPending(committedOnce);
    expect(committedTwice.past).toEqual([{ nodes: ['a', 'b'], edges: ['a-b'] }]);

    const undone = undoHistory(committedTwice);
    expect(undone.present).toEqual({ nodes: ['a', 'b'], edges: ['a-b'] });
  });

  it('commitPending with nothing pending is a no-op', () => {
    const h0 = initHistory(0);
    expect(commitPending(h0)).toBe(h0);

    const h1 = pushEdit(h0, (n) => n + 1);
    expect(commitPending(h1)).toBe(h1);
  });

  it('a discrete pushEdit mid-gesture flushes the pending run as its own step first', () => {
    const h0 = initHistory(0);
    const live = pushLiveEdit(h0, () => 1);
    const discrete = pushEdit(live, (n) => n + 100);
    expect(discrete.present).toBe(101);
    expect(discrete.past).toEqual([0, 1]);
  });
});
