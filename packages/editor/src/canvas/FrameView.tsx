/**
 * A titled group frame — a notebook section, drawn on the canvas (S28/S30).
 *
 * It is deliberately passive: it does not carry its nodes around with it, and
 * membership is decided by where a node sits (`reframe`). Arranging the canvas
 * arranges the report, so the frame is a region of the canvas rather than a
 * container in the document.
 */

import type { ReactElement } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useGraph } from '../graph-context';
import { updateFrame } from '../model/document';
import { TextField } from './fields';

export function FrameView({ id }: NodeProps): ReactElement | null {
  const { document, edit } = useGraph();
  const frame = document.frames.find((candidate) => candidate.id === id);
  if (frame === undefined) return null;

  return (
    <div className="frame" style={{ width: frame.size.width, height: frame.size.height }}>
      <div className="frame-title">
        <TextField
          className="title"
          value={frame.title}
          onCommit={(title) => edit((current) => updateFrame(current, id, (entry) => ({ ...entry, title })))}
        />
      </div>
    </div>
  );
}
