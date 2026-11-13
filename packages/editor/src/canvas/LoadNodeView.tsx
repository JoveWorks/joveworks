/**
 * Load and Distributed load nodes: one physical load on a shaft, every
 * field typed on its port row or wired in, and one `load` wire out.
 *
 * Each row is `CompareNode.threshold`'s idiom — a port with a typed value
 * beside it, the wire winning outright once one arrives. An optional field
 * left empty reads zero (the kernel's `evaluateLoad` is the authority). A
 * small arrow beside each force and couple states its sign convention, since
 * the sign is the one thing about a load a student most easily gets wrong.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import {
  LOAD_FIELD_UNITS,
  LOAD_PORT,
  loadFieldValue,
  loadNodeFields,
  type DistributedLoadNode,
  type LoadField,
  type LoadNode,
  type Quantity,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { Symbol } from '../Symbol';
import { NodeShell } from './NodeShell';
import { QuantityPortRow } from './QuantityPortRow';
import type { CanvasFlowNode } from './node-data';
import { TitleField } from './TitleField';

interface FieldInfo {
  /** How the field is written on the node: `F_x` typesets as F with a subscript x. */
  readonly symbol: string;
  /** The sign convention, drawn beside the field. */
  readonly arrow?: string;
  readonly hint: string;
}

/**
 * The shaft runs along z, drawn left to right; y points up (vertical) and x
 * across (horizontal). Each direction's diagram is drawn with it positive up.
 */
export const FIELDS: Readonly<Record<LoadField, FieldInfo>> = {
  at: { symbol: 'at', hint: 'Position along the shaft (z).' },
  Fx: { symbol: 'F_x', arrow: '↑', hint: 'Horizontal force, along x. Positive along +x: up in the horizontal view, seen from above.' },
  Fy: { symbol: 'F_y', arrow: '↑', hint: 'Vertical force, along y. Positive points up.' },
  torque: { symbol: 'T', hint: 'Torque applied here, signed. Torques along the shaft are taken as balanced.' },
  Cx: {
    symbol: 'C_x',
    arrow: '↻',
    hint: 'Bending couple in the horizontal (x–z) plane. Positive is clockwise in the view from above, with z to the right: the moment steps up by it.',
  },
  Cy: {
    symbol: 'C_y',
    arrow: '↻',
    hint: 'Bending couple in the vertical (y–z) plane. Positive is clockwise, with z to the right: the moment steps up by it.',
  },
  from: { symbol: 'from', hint: 'Where the load starts along the shaft (z).' },
  to: { symbol: 'to', hint: 'Where the load ends along the shaft (z), at or after its start.' },
  qx: { symbol: 'q_x', arrow: '↑', hint: 'Horizontal force per length, along x. Positive along +x.' },
  qy: { symbol: 'q_y', arrow: '↑', hint: 'Vertical force per length, along y. Positive points up.' },
};

/** Fields a node cannot do without — the rest read zero when left empty. */
const MANDATORY: ReadonlySet<LoadField> = new Set(['at', 'from', 'to']);

function LoadBody({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || (node.kind !== 'load' && node.kind !== 'distributedLoad')) return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);

  const setField = (field: LoadField, quantity: Quantity | undefined): void =>
    edit((current) =>
      updateNode<LoadNode | DistributedLoadNode>(current, id, (entry) => {
        const { [field]: _old, ...rest } = entry as unknown as Record<string, unknown>;
        return (quantity === undefined ? rest : { ...rest, [field]: quantity }) as unknown as
          | LoadNode
          | DistributedLoadNode;
      }),
    );

  const shape = node.kind === 'load' ? 'point load' : 'distributed load';

  return (
    <NodeShell
      kind={node.kind}
      state={state}
      {...(problem === undefined ? {} : { problem })}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={
        <TitleField
          value={node.label ?? id}
          onCommit={(label) => edit((current) => renameNode(current, id, label))}
        />
      }
      subtitle={shape}
      detail={
        <p className="load-convention">
          The shaft runs along z, left to right; y is vertical, x horizontal. ↑ marks a positive force;
          ↻ a positive couple, clockwise. An empty field is zero.
        </p>
      }
    >
      <ul className="ports">
        {loadNodeFields(node).map((field) => {
          const info = FIELDS[field];
          return (
            <QuantityPortRow
              key={field}
              nodeId={id}
              port={field}
              symbol={info.symbol}
              typed={loadFieldValue(node, field)}
              reference={LOAD_FIELD_UNITS[field]}
              hint={info.hint}
              {...(info.arrow === undefined ? {} : { arrow: info.arrow })}
              mandatory={MANDATORY.has(field)}
              data={data}
              onCommit={(quantity) => setField(field, quantity)}
            />
          );
        })}
      </ul>

      <div
        className="node-value"
        onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: LOAD_PORT })}
        onMouseLeave={() => data?.onPortHover?.()}
      >
        <span className="reading">{shape}</span>
        <span className={`port-out${highlightedPorts.has(LOAD_PORT) ? ' port-highlighted' : ''}`}>
          <Symbol name={LOAD_PORT} />
        </span>
        <Handle
          type="source"
          position={Position.Right}
          id={LOAD_PORT}
          className={highlightedPorts.has(LOAD_PORT) ? 'port-highlighted' : ''}
        />
      </div>
    </NodeShell>
  );
}

export function LoadNodeView(props: NodeProps<CanvasFlowNode>): ReactElement | null {
  return <LoadBody {...props} />;
}

export function DistributedLoadNodeView(props: NodeProps<CanvasFlowNode>): ReactElement | null {
  return <LoadBody {...props} />;
}
