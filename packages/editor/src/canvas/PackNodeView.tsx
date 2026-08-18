/**
 * A pack: bundles any number of independently-dimensioned wires into one
 * `bundle` output. Each currently-wired channel (`in0`, `in2`, …, whatever
 * is actually wired — see `bundle.ts`'s `packChannelIndices`, gaps and all)
 * draws its own handle; a trailing ghost slot, like a spectrum port's own,
 * accepts the next wire — except here the ghost's *port name* is decided at
 * render time (`nextPackChannel`), because unlike a spectrum port's several
 * same-named slots, every pack channel is its own distinctly-named port.
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
import { slotHandleId } from './spectrumSlots';
import { TitleField } from './TitleField';

export function PackNodeView({ id, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, hovered } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'pack') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const indices = packChannelIndices(document, id);
  const labels = packChannelLabels(document, id);
  const nextChannel = nextPackChannel(indices);

  return (
    <NodeShell
      kind="pack"
      state={state}
      {...(problem === undefined ? {} : { problem })}
      highlighted={data?.highlighted === true || hovered.has(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={
        <TitleField
          value={node.label ?? id}
          onCommit={(label) => edit((current) => renameNode(current, id, label))}
        />
      }
    >
      <ul className="ports">
        {indices.map((channel, position) => (
          <li
            key={`in${channel}`}
            className={`port${highlightedPorts.has(`in${channel}`) ? ' port-highlighted' : ''}`}
            onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: `in${channel}` })}
            onMouseLeave={() => data?.onPortHover?.()}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={slotHandleId(`in${channel}`, 0)}
              className={highlightedPorts.has(`in${channel}`) ? 'port-highlighted' : ''}
            />
            <ParameterLabel
              name={labels[position] ?? `in${channel}`}
              unit={analysis.resolution?.targets.get(`${id}.in${channel}`)?.unit}
              nameClassName="port-name"
              unitClassName="port-unit"
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

      <div className="node-value">
        <span
          className={`port-out${highlightedPorts.has('bundle') ? ' port-highlighted' : ''}`}
          onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: 'bundle' })}
          onMouseLeave={() => data?.onPortHover?.()}
        >
          bundle <span className="port-unit">({indices.length})</span>
        </span>
        <Handle
          type="source"
          position={Position.Right}
          id="bundle"
          className={highlightedPorts.has('bundle') ? 'port-highlighted' : ''}
          onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: 'bundle' })}
          onMouseLeave={() => data?.onPortHover?.()}
        />
      </div>
    </NodeShell>
  );
}
