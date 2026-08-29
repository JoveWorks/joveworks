import type { ReactElement } from 'react';

import type { CheckSegment } from './model/values';

/**
 * A check's reading, coloured by verdict — pass/fail/boundary segments,
 * shared by the canvas node body, the notebook, and the cloud viewer so a
 * sweep reads the same way everywhere it appears.
 */
export function CheckReading({ segments }: { readonly segments: readonly CheckSegment[] }): ReactElement {
  return (
    <>
      {segments.map((segment, index) => (
        <span key={index}>
          {index > 0 ? <span className="check-segment-separator"> … </span> : null}
          <span className={`check-segment check-segment-${segment.state}`}>{segment.text}</span>
        </span>
      ))}
    </>
  );
}
