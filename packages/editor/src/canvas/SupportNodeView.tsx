/**
 * A Support node: where the shaft is held (`at`, typed or wired) and how —
 * picked from the four support types. One `load` wire out, into a diagram's
 * `acting` port beside the loads.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { LOAD_FIELD_UNITS, SUPPORT_PORT, SUPPORT_TYPES, type SupportNode, type SupportType } from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { Symbol } from '../Symbol';
import { NodeShell } from './NodeShell';
import { QuantityPortRow } from './QuantityPortRow';
import type { CanvasFlowNode } from './node-data';
import { TitleField } from './TitleField';

export const SUPPORT_LABELS: Readonly<Record<SupportType, string>> = {
  simple: 'simple',
  fixed: 'fixed',
  locating: 'locating bearing',
  floating: 'floating bearing',
};

const SUPPORT_HINTS: Readonly<Record<SupportType, string>> = {
  simple: 'A pin or roller: takes a force, free to rotate.',
  fixed: 'Clamped: takes a force and a moment. One alone holds a cantilever.',
  locating: 'A rolling bearing that also holds the shaft axially. In bending, a simple support.',
  floating: 'A rolling bearing free to slide axially. In bending, a simple support.',
};

export function SupportNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'support') return null;

  const highlighted = (data?.highlightedPorts ?? []).includes(SUPPORT_PORT);
  const problem = analysis.problems.get(id);
  const set = (change: Partial<Pick<SupportNode, 'at' | 'support'>>): void =>
    edit((current) => updateNode<SupportNode>(current, id, (entry) => ({ ...entry, ...change })));

  return (
    <NodeShell
      kind="support"
      state={analysis.states.get(id) ?? 'ok'}
      {...(problem === undefined ? {} : { problem })}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={<TitleField value={node.label ?? id} onCommit={(label) => edit((current) => renameNode(current, id, label))} />}
      subtitle={SUPPORT_LABELS[node.support]}
      detail={<p className="load-convention">{SUPPORT_HINTS[node.support]}</p>}
    >
      <ul className="ports">
        <QuantityPortRow
          nodeId={id}
          port="at"
          symbol="at"
          typed={node.at}
          reference={LOAD_FIELD_UNITS.at}
          hint="Position along the shaft (z)."
          mandatory
          data={data}
          onCommit={(at) => {
            if (at !== undefined) set({ at });
          }}
        />
        <li className="port support-type">
          <span className="port-name">type</span>
          <select
            className="nodrag"
            value={node.support}
            title={SUPPORT_HINTS[node.support]}
            onChange={(event) => set({ support: event.target.value as SupportType })}
          >
            {SUPPORT_TYPES.map((type) => (
              <option key={type} value={type} title={SUPPORT_HINTS[type]}>
                {SUPPORT_LABELS[type]}
              </option>
            ))}
          </select>
        </li>
      </ul>

      <div
        className="node-value"
        onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: SUPPORT_PORT })}
        onMouseLeave={() => data?.onPortHover?.()}
      >
        <span className="reading">{SUPPORT_LABELS[node.support]}</span>
        <span className={`port-out${highlighted ? ' port-highlighted' : ''}`}>
          <Symbol name={SUPPORT_PORT} />
        </span>
        <Handle type="source" position={Position.Right} id={SUPPORT_PORT} className={highlighted ? 'port-highlighted' : ''} />
      </div>
    </NodeShell>
  );
}
