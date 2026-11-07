/**
 * A zip: each wired `inN` comes back out of its own `outN`, every one of them
 * now paired by position on the zip's axis. Laid out like a waypoint — one
 * row per channel, in on the left and out on the right — because that is
 * what it is to the student: the same values, passed through. Only wired
 * channels get a row (an `out` exists once its `in` does), plus a trailing
 * open slot for the next list, as on a pack.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { nextPackChannel, packChannelIndices } from '@joveworks/kernel';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, renameNode } from '../model/document';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { packChannelLabels } from './bundleLabels';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './portSlots';
import { TitleField } from './TitleField';

export function ZipNodeView({ id, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, hovered } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'zip') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const indices = packChannelIndices(document, id);
  const labels = packChannelLabels(document, id);
  const nextChannel = nextPackChannel(indices);
  // Measured by the evaluation, not the types-only resolution: a zip's
  // length is however long the lists wired into it turned out to be.
  const length = analysis.evaluation?.resolution.axes.get(id)?.length;

  return (
    <NodeShell
      kind="zip"
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
            <span
              className={`port-out${highlightedPorts.has(`out${channel}`) ? ' port-highlighted' : ''}`}
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: `out${channel}` })}
              onMouseLeave={() => data?.onPortHover?.()}
            >
              <ParameterLabel
                name={labels[position] ?? `in${channel}`}
                unit={analysis.resolution?.sources.get(`${id}.out${channel}`)?.unit}
                nameClassName="port-name"
                unitClassName="port-unit"
              />
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
          className={`${indices.length === 0 ? 'port missing' : 'port port-open'}${highlightedPorts.has(`in${nextChannel}`) ? ' port-highlighted' : ''}`}
          onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: `in${nextChannel}` })}
          onMouseLeave={() => data?.onPortHover?.()}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={slotHandleId(`in${nextChannel}`, 0)}
            className={`${indices.length === 0 ? 'missing' : ''}${highlightedPorts.has(`in${nextChannel}`) ? ' port-highlighted' : ''}`}
          />
          {indices.length === 0 ? <span className="port-name">in0</span> : null}
        </li>
      </ul>
      {length === undefined ? null : (
        <div className="node-value">
          <span className="port-unit">{length} paired</span>
        </div>
      )}
    </NodeShell>
  );
}
