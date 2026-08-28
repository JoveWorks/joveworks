/**
 * An unpack: the inverse of a pack. One `bundle` input, unbound until
 * something is wired to it; `out0..outN` outputs that exist only once it
 * is, sized and dimensioned entirely by the resolved bundle
 * (`packages/kernel/src/graph.ts`'s `unpack` branch) — there is no ghost
 * slot on this side, unlike `pack`'s own input.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, renameNode } from '../model/document';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { unpackChannelLabels } from './bundleLabels';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './portSlots';
import { TitleField } from './TitleField';

export function UnpackNodeView({ id, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, hovered } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'unpack') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const bundleType = analysis.resolution?.targets.get(`${id}.bundle`);
  const count = bundleType?.channels?.length ?? 0;
  const labels = unpackChannelLabels(document, id);

  return (
    <NodeShell
      kind="unpack"
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
        <li
          className={`${count === 0 ? 'port missing' : 'port'}${highlightedPorts.has('bundle') ? ' port-highlighted' : ''}`}
          onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: 'bundle' })}
          onMouseLeave={() => data?.onPortHover?.()}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={slotHandleId('bundle', 0)}
            className={`${count === 0 ? 'missing' : ''}${highlightedPorts.has('bundle') ? ' port-highlighted' : ''}`}
          />
          <span className="port-name">bundle</span>
        </li>
      </ul>

      <ul className="ports ports-out">
        {Array.from({ length: count }, (_unused, i) => (
          <li
            key={`out${i}`}
            className={`port${highlightedPorts.has(`out${i}`) ? ' port-highlighted' : ''}`}
            onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: `out${i}` })}
            onMouseLeave={() => data?.onPortHover?.()}
          >
            <ParameterLabel
              name={labels[i] ?? `out${i}`}
              unit={analysis.resolution?.sources.get(`${id}.out${i}`)?.unit}
              nameClassName="port-name"
              unitClassName="port-unit"
            />
            <Handle
              type="source"
              position={Position.Right}
              id={`out${i}`}
              className={highlightedPorts.has(`out${i}`) ? 'port-highlighted' : ''}
            />
          </li>
        ))}
      </ul>
    </NodeShell>
  );
}
