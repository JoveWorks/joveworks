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
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';

import { useGraph } from '../graph-context';
import { phrase } from '../i18n';
import { reframe, updateFrame } from '../model/document';
import { TitleField } from './TitleField';
import { collapsedGroupSize, groupPortHandle, groupPorts } from '../model/collapsedGroups';
import { useSettings } from '../settings-context';

export function FrameView({ id, selected }: NodeProps): ReactElement | null {
  const { document, edit, editLive, commitEdit, collapsedGroups, toggleGroupCollapsed, hovered: hoveredIds } = useGraph();
  const { locale } = useSettings();
  const [hovered, setHovered] = useState(false);
  const frame = document.frames.find((candidate) => candidate.id === id);
  if (frame === undefined) return null;

  const highlighted = hoveredIds.has(id);
  const collapsed = frame.kind === 'group' && collapsedGroups.has(id);
  const ports = collapsed ? groupPorts(document, id) : undefined;
  const size = ports === undefined ? frame.size : collapsedGroupSize(ports);
  const collapseLabel = phrase(locale, collapsed ? 'Expand group' : 'Collapse group');

  return (
    <div
      className={`frame ${frame.kind ?? 'section'}${collapsed ? ' collapsed' : ''}${hovered ? ' hovered' : ''}${selected ? ' selected' : ''}${highlighted ? ' highlighted' : ''}`}
      style={{ width: size.width, height: size.height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!collapsed ? <NodeResizer
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
      /> : null}
      {frame.kind === 'group' ? (
        <span className="group-frame-outline" aria-hidden="true">
          <span className="corner top-left" />
          <span className="corner top-right" />
          <span className="corner bottom-left" />
          <span className="corner bottom-right" />
          <span className="midpoint top" />
          <span className="midpoint right" />
          <span className="midpoint bottom" />
          <span className="midpoint left" />
        </span>
      ) : null}
      <div className="frame-title">
        {frame.kind === 'group' ? (
          <button
            type="button"
            className="group-collapse"
            aria-label={collapseLabel}
            aria-expanded={!collapsed}
            title={collapseLabel}
            onClick={(event) => {
              event.stopPropagation();
              toggleGroupCollapsed(id);
            }}
          >
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
          </button>
        ) : null}
        <TitleField
          value={frame.title}
          onCommit={(title) => edit((current) => updateFrame(current, id, (entry) => ({ ...entry, title })))}
          multiline
        />
      </div>
      {ports === undefined ? null : (
        <div className="collapsed-group-ports">
          <div className="collapsed-group-port-list inputs">
            {ports.inputs.map((port, index) => (
              <div className="collapsed-group-port input" key={groupPortHandle('input', port)}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={groupPortHandle('input', port)}
                  isConnectable={false}
                  style={{ top: 44 + index * 24 }}
                />
                <span>{port.label}</span>
              </div>
            ))}
          </div>
          <div className="collapsed-group-port-list outputs">
            {ports.outputs.map((port, index) => (
              <div className="collapsed-group-port output" key={groupPortHandle('output', port)}>
                <span>{port.label}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={groupPortHandle('output', port)}
                  isConnectable={false}
                  style={{ top: 44 + index * 24 }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
