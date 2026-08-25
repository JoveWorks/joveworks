/**
 * Resolving the document's marks against one figure's grid.
 *
 * Every notebook surface asks the same question — *which of my cells are
 * marked, and what letter does each carry* — so it is answered once, here,
 * rather than five times in five figures that would drift. The kernel owns the
 * matching itself (`candidateMask`); this is the editor-side shape around it:
 * the letters, the ordering, and the per-cell lookup a renderer wants.
 *
 * The letters are the feature. A mark drawn as a highlight says "this one"; a
 * mark drawn as **A** says "this one, and it is the same one you are looking at
 * on the other four figures". That is the whole of "coordinated" — without the
 * letter, a reader with two marks and three figures has to re-derive which is
 * which every time they look up.
 */

import { candidateMask, markLetter, type Axis, type AxisReadout } from '@joveworks/kernel';
import type { Candidate, GraphDocument } from '@joveworks/schema';

export interface ResolvedMark {
  /** Position in `document.marks` — the identity, and the index the toggle uses. */
  readonly index: number;
  /** A, B, C … as drawn. */
  readonly letter: string;
  readonly candidate: Candidate;
  /** Cells of the grid this mark identifies. Empty when it identifies none. */
  readonly cells: readonly number[];
  /** A coordinate had to be snapped to a neighbouring sample to land at all. */
  readonly approximate: boolean;
}

export interface MarkIndex {
  readonly marks: readonly ResolvedMark[];
  /** The marks on one cell, in document order. Empty for an unmarked cell. */
  readonly at: (cell: number) => readonly ResolvedMark[];
  /** Whether anything is marked on this grid at all — cheap enough to guard a render on. */
  readonly any: boolean;
}

/**
 * Everything a figure needs to take part in marking, in one prop.
 *
 * Optional at every call site on purpose: the read-only course viewer renders
 * the same figures with no way to change the document, and passing it nothing
 * is how a figure becomes non-interactive — rather than each figure growing its
 * own `readOnly` flag to remember to honour.
 */
export interface FigureMarking {
  readonly marks: MarkIndex;
  /** Axis id → coordinates, for turning a clicked cell back into a candidate. */
  readonly readouts: ReadonlyMap<string, AxisReadout>;
  readonly toggle: (candidate: Candidate) => void;
  readonly hover: (candidate: Candidate | undefined) => void;
}

const NONE: readonly ResolvedMark[] = [];

/** Nothing marked, nothing to look up — for a figure rendered before evaluation lands. */
export const NO_MARKS: MarkIndex = { marks: [], at: () => NONE, any: false };

/**
 * Resolve every mark against `axes`.
 *
 * A mark that names none of these axes is unconstrained here and matches every
 * cell — which is correct and rarely what a figure wants to *draw*, so it is
 * left to the caller: a table highlights every such row, while a scatter would
 * rather show nothing than light up entirely. `candidateMask`'s own rule (a
 * figure matches on the axes it shares) is what produces that, and it is not
 * special-cased here.
 */
export function resolveMarks(
  document: GraphDocument,
  axes: readonly Axis[],
  readouts: ReadonlyMap<string, AxisReadout>,
): MarkIndex {
  const marks = (document.marks ?? []).map((candidate, index): ResolvedMark => {
    const { mask, approximate } = candidateMask(axes, candidate, readouts);
    return {
      index,
      letter: markLetter(index),
      candidate,
      cells: mask.flatMap((hit, cell) => (hit ? [cell] : [])),
      approximate: approximate.length > 0,
    };
  });

  // One pass to build the reverse lookup: a figure asks per cell while it
  // draws, and a mask scan per cell would be quadratic in the grid.
  const byCell = new Map<number, ResolvedMark[]>();
  for (const mark of marks) {
    for (const cell of mark.cells) {
      const list = byCell.get(cell);
      if (list === undefined) byCell.set(cell, [mark]);
      else list.push(mark);
    }
  }

  return {
    marks,
    at: (cell) => byCell.get(cell) ?? NONE,
    any: byCell.size > 0,
  };
}
