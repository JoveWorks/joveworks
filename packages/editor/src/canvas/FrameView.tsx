/**
 * A titled group frame — a notebook section, drawn on the canvas.
 *
 * It is deliberately passive: it does not carry its nodes around with it, and
 * membership is decided by where a node sits (`reframe`). Arranging the canvas
 * arranges the report, so the frame is a region of the canvas rather than a
 * container in the document.
 */

import { useState, type ReactElement } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';

import { useGraph } from '../graph-context';
import { reframe, updateFrame } from '../model/document';
import { TextField } from './fields';

export function FrameView({ id, selected }: NodeProps): ReactElement | null {
  const { document, edit } = useGraph();
  const [hovered, setHovered] = useState(false);
  const frame = document.frames.find((candidate) => candidate.id === id);
  if (frame === undefined) return null;

  return (
    <div
      className="frame"
      style={{ width: frame.size.width, height: frame.size.height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NodeResizer
        nodeId={id}
        isVisible={hovered || (selected ?? false)}
        minWidth={160}
        minHeight={100}
        // Position and size are already kept live in the document by Canvas's
        // onNodesChange (NodeResizer reports them the same way a drag reports
        // position). All that is left once the gesture ends is membership: a
        // frame's bounds decide it, same as `onNodeDragStop` does for
        // an ordinary drag.
        onResizeEnd={() => edit(reframe)}
      />
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
