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
import { updateFrame } from '../model/document';
import type { CanvasFlowNode } from './node-data';
import { TitleField } from './TitleField';
import { collapsedGroupSize, groupPortHandle, groupPorts } from '../model/collapsedGroups';
import { useSettings } from '../settings-context';

export function FrameView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, edit, collapsedGroups, toggleGroupCollapsed, hovered: hoveredIds } = useGraph();
  const { locale } = useSettings();
  const [hovered, setHovered] = useState(false);
  const frame = document.frames.find((candidate) => candidate.id === id);
  if (frame === undefined) return null;

  const highlighted = hoveredIds.has(id);
  const collapsed = frame.kind === 'group' && collapsedGroups.has(id);
  const ports = collapsed ? groupPorts(document, id) : undefined;
  const size = ports === undefined ? (data?.layoutSize ?? frame.size) : collapsedGroupSize(ports);
  const collapseLabel = phrase(locale, collapsed ? 'Expand group' : 'Collapse group');
  const highlightedGroupPorts = new Set(data?.highlightedGroupPorts ?? []);
  const interfaceHighlighted = (data?.highlighted ?? false) || highlightedGroupPorts.size > 0;

  return (
    <div
      className={`frame ${frame.kind ?? 'section'}${collapsed ? ' collapsed' : ''}${hovered ? ' hovered' : ''}${selected ? ' selected' : ''}${highlighted || interfaceHighlighted ? ' highlighted' : ''}`}
      style={{ width: size.width, height: size.height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!collapsed ? <NodeResizer
        nodeId={id}
        isVisible={hovered || (selected ?? false)}
        minWidth={160}
        minHeight={100}
        // Canvas keeps geometry in an ephemeral preview while the handle is
        // moving, then commits it and assigns membership exactly once here.
        onResizeEnd={() => data?.onLayoutGestureEnd?.()}
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
      <div
        className="frame-title"
        // A frame label is an editor control, not a small patch of draggable
        // canvas.  In particular, it must win over a wire crossing the title.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
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
              <div
                className={`collapsed-group-port input${highlightedGroupPorts.has(groupPortHandle('input', port)) ? ' port-highlighted' : ''}`}
                key={groupPortHandle('input', port)}
                onMouseEnter={() => data?.onPortHover?.({ nodeId: port.nodeId, port: port.port })}
                onMouseLeave={() => data?.onPortHover?.()}
              >
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
              <div
                className={`collapsed-group-port output${highlightedGroupPorts.has(groupPortHandle('output', port)) ? ' port-highlighted' : ''}`}
                key={groupPortHandle('output', port)}
                onMouseEnter={() => data?.onPortHover?.({ nodeId: port.nodeId, port: port.port })}
                onMouseLeave={() => data?.onPortHover?.()}
              >
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
