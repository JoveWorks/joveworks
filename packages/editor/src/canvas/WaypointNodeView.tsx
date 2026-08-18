/** A multi-channel wire redirect. Each inN passes unchanged to its own outN. */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { nextPackChannel, waypointChannelIndices } from '@joveworks/kernel';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, renameNode } from '../model/document';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './spectrumSlots';
import { TitleField } from './TitleField';

export function WaypointNodeView({ id, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, hovered } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'waypoint') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const indices = waypointChannelIndices(document, id);
  const nextChannel = nextPackChannel(indices);

  return (
    <NodeShell
      kind="waypoint"
      state={state}
      {...(problem === undefined ? {} : { problem })}
      highlighted={data?.highlighted === true || hovered.has(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={<TitleField value={node.label ?? id} onCommit={(label) => edit((current) => renameNode(current, id, label))} />}
    >
      <ul className="ports">
        {indices.map((channel, position) => (
          <li
            key={channel}
            className={`port${highlightedPorts.has(`in${channel}`) || highlightedPorts.has(`out${channel}`) ? ' port-highlighted' : ''}`}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={slotHandleId(`in${channel}`, 0)}
              className={highlightedPorts.has(`in${channel}`) ? 'port-highlighted' : ''}
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: `in${channel}` })}
              onMouseLeave={() => data?.onPortHover?.()}
            />
            <ParameterLabel name={`in${position}`} unit={analysis.resolution?.targets.get(`${id}.in${channel}`)?.unit} nameClassName="port-name" unitClassName="port-unit" />
            <span
              className={`port-out${highlightedPorts.has(`out${channel}`) ? ' port-highlighted' : ''}`}
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: `out${channel}` })}
              onMouseLeave={() => data?.onPortHover?.()}
            >
              <ParameterLabel name={`out${position}`} unit={analysis.resolution?.sources.get(`${id}.out${channel}`)?.unit} nameClassName="port-name" unitClassName="port-unit" />
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={`out${channel}`}
              className={highlightedPorts.has(`out${channel}`) ? 'port-highlighted' : ''}
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: `out${channel}` })}
              onMouseLeave={() => data?.onPortHover?.()}
            />
          </li>
        ))}
        <li
          className={`${indices.length === 0 ? 'port missing' : 'port port-open'}${
            highlightedPorts.has(`in${nextChannel}`) || highlightedPorts.has(`out${nextChannel}`) ? ' port-highlighted' : ''
          }`}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={slotHandleId(`in${nextChannel}`, 0)}
            className={`${indices.length === 0 ? 'missing' : ''}${highlightedPorts.has(`in${nextChannel}`) ? ' port-highlighted' : ''}`}
            onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: `in${nextChannel}` })}
            onMouseLeave={() => data?.onPortHover?.()}
          />
          {indices.length === 0 ? <span className="port-name">in0</span> : null}
          <Handle
            type="source"
            position={Position.Right}
            id={`out${nextChannel}`}
            className={highlightedPorts.has(`out${nextChannel}`) ? 'port-highlighted' : ''}
            onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: `out${nextChannel}` })}
            onMouseLeave={() => data?.onPortHover?.()}
          />
        </li>
      </ul>
    </NodeShell>
  );
}
