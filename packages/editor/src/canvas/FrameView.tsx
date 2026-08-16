/**
 * A titled group frame — a notebook section, drawn on the canvas.
 *
 * Membership is decided by where a node sits (`reframe`), not by any
 * parent/child link in the document — arranging the canvas arranges the
 * report, so the frame is a region rather than a container. Dragging a frame
 * (`Canvas.tsx`'s `onNodesChange`) still moves every member's position along
 * with it, but that's a courtesy carried out in position deltas, not a
 * change to what decides membership: drop the frame somewhere its members no
 * longer fit and `reframe` reassigns them at drag-stop like it always did.
 */

import { useState, type ReactElement } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';

import { useGraph } from '../graph-context';
import { reframe, updateFrame } from '../model/document';
import { TextField } from './fields';

export function FrameView({ id, selected }: NodeProps): ReactElement | null {
  const { document, edit, editLive, commitEdit } = useGraph();
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
        onResizeEnd={() => {
          editLive(reframe);
          commitEdit();
        }}
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
