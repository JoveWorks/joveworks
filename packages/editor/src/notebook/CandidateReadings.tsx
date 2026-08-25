/**
 * A marked design's own value on one result, as a lettered line under it.
 *
 * Only where a mark pins **exactly one** cell of this result's grid. A mark
 * that names fewer axes than the result varies along identifies a whole row of
 * them, and there is no single number to print for it — saying nothing is
 * right, where averaging or picking the first would be inventing a reading.
 *
 * Shared by the editor's notebook and the published viewer rather than living
 * in the first of them, because the letters are only worth anything if the same
 * candidate reads the same way on every surface it survives to.
 */

import type { ReactElement } from 'react';

import type { MarkIndex } from './marks';

export function CandidateReadings({
  marks,
  read,
}: {
  readonly marks: MarkIndex;
  /** This result's own reading at one cell — a number, a verdict, whatever it prints. */
  readonly read: (cell: number) => ReactElement | string;
}): ReactElement | null {
  const found = marks.marks.filter((entry) => entry.cells.length === 1);
  if (found.length === 0) return null;
  return (
    <span className="candidate-readings">
      {found.map((entry) => (
        <span className="candidate-reading" key={entry.index}>
          <span className="mark-letter">{entry.letter}</span>
          {read(entry.cells[0] as number)}
        </span>
      ))}
    </span>
  );
}
