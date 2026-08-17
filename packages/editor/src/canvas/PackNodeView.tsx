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

import { nextPackChannel, packChannelIndices } from '@mds/kernel';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, renameNode } from '../model/document';
import { unitLabel } from '../model/quantity';
import { NodeShell } from './NodeShell';
import { slotHandleId } from './spectrumSlots';
import { TitleField } from './TitleField';

export function PackNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, pinned, togglePin } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'pack') return null;

  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const indices = packChannelIndices(document, id);
  const nextChannel = nextPackChannel(indices);

  return (
    <NodeShell
      kind="pack"
      state={state}
      {...(problem === undefined ? {} : { problem })}
      selected={selected ?? false}
      pinned={pinned.has(id)}
      onTogglePin={() => togglePin(id)}
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
          <li key={`in${channel}`} className="port">
            <Handle type="target" position={Position.Left} id={slotHandleId(`in${channel}`, 0)} />
            <span className="port-name">in{position}</span>
            <span className="port-unit">
              {unitLabel(analysis.resolution?.targets.get(`${id}.in${channel}`)?.unit)}
            </span>
          </li>
        ))}
        <li className={indices.length === 0 ? 'port missing' : 'port port-open'}>
          <Handle
            type="target"
            position={Position.Left}
            id={slotHandleId(`in${nextChannel}`, 0)}
            className={indices.length === 0 ? 'missing' : ''}
          />
          {indices.length === 0 ? <span className="port-name">in0</span> : null}
        </li>
      </ul>

      <div className="node-value">
        <span className="port-out">
          bundle <span className="port-unit">({indices.length})</span>
        </span>
        <Handle type="source" position={Position.Right} id="bundle" />
      </div>
    </NodeShell>
  );
}
