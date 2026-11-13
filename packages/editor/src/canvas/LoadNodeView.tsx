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

import { dimensionsEqual, isDimensionless } from '@joveworks/units';
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
import { useSettings } from '../settings-context';
import { reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { toUnitsFormat } from '../model/numberFormat';
import { formatAuthored, parseAuthored } from '../model/quantity';
import { reading, summarise } from '../model/values';
import { Symbol } from '../Symbol';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { slotHandleId } from './portSlots';
import { TextField } from './fields';
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
 * The shaft runs along z, drawn left to right; each transverse plane's
 * diagram is drawn with that plane's positive direction up.
 */
const FIELDS: Readonly<Record<LoadField, FieldInfo>> = {
  at: { symbol: 'at', hint: 'Position along the shaft (z).' },
  Fx: { symbol: 'F_x', arrow: '↑', hint: 'Force in the x plane. Positive points up in the x-plane diagram.' },
  Fy: { symbol: 'F_y', arrow: '↑', hint: 'Force in the y plane. Positive points up in the y-plane diagram.' },
  torque: { symbol: 'T', hint: 'Torque applied here, signed. Torques along the shaft are taken as balanced.' },
  Cx: {
    symbol: 'C_x',
    arrow: '↻',
    hint: 'Bending couple entering the x-plane moment diagram. Positive is clockwise, with z to the right: the moment steps up by it.',
  },
  Cy: {
    symbol: 'C_y',
    arrow: '↻',
    hint: 'Bending couple entering the y-plane moment diagram. Positive is clockwise, with z to the right: the moment steps up by it.',
  },
  from: { symbol: 'from', hint: 'Where the load starts along the shaft (z).' },
  to: { symbol: 'to', hint: 'Where the load ends along the shaft (z), at or after its start.' },
  qx: { symbol: 'q_x', arrow: '↑', hint: 'Force per length in the x plane. Positive points up in the x-plane diagram.' },
  qy: { symbol: 'q_y', arrow: '↑', hint: 'Force per length in the y plane. Positive points up in the y-plane diagram.' },
};

/** Fields a node cannot do without — the rest read zero when left empty. */
const MANDATORY: ReadonlySet<LoadField> = new Set(['at', 'from', 'to']);

function LoadBody({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || (node.kind !== 'load' && node.kind !== 'distributedLoad')) return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const incoming = document.edges.filter((edge) => edge.to.node === id);

  const setField = (field: LoadField, quantity: Quantity | undefined): void =>
    edit((current) =>
      updateNode<LoadNode | DistributedLoadNode>(current, id, (entry) => {
        const { [field]: _old, ...rest } = entry as unknown as Record<string, unknown>;
        return (quantity === undefined ? rest : { ...rest, [field]: quantity }) as unknown as
          | LoadNode
          | DistributedLoadNode;
      }),
    );

  /**
   * A bare number is read in the unit the field already shows; a typed unit
   * must be the field's kind of quantity. Anything else is left as it was —
   * the field reverts to the stored value.
   */
  const commit = (field: LoadField, text: string): void => {
    if (text.trim().length === 0) {
      if (!MANDATORY.has(field)) setField(field, undefined);
      return;
    }
    let parsed: Quantity;
    try {
      parsed = parseAuthored(text, format);
    } catch {
      return;
    }
    const reference = LOAD_FIELD_UNITS[field];
    const shown = loadFieldValue(node, field)?.unit ?? reference;
    if (isDimensionless(parsed.unit.dimension)) {
      setField(field, { value: parsed.value, unit: shown });
      return;
    }
    if (!dimensionsEqual(parsed.unit.dimension, reference.dimension)) return;
    setField(field, parsed);
  };

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
          The shaft runs along z, left to right. ↑ marks a positive force, up in its plane&apos;s diagram;
          ↻ a positive couple, clockwise. An empty field is zero.
        </p>
      }
    >
      <ul className="ports">
        {loadNodeFields(node).map((field) => {
          const info = FIELDS[field];
          const edge = incoming.find((candidate) => candidate.to.port === field);
          const typed = loadFieldValue(node, field);
          const supplied = edge === undefined ? undefined : reading(analysis, edge.from.node, edge.from.port);
          const unit = analysis.resolution?.targets.get(`${id}.${field}`)?.unit ?? typed?.unit ?? LOAD_FIELD_UNITS[field];
          const missing = MANDATORY.has(field) && edge === undefined && typed === undefined;
          const highlighted = highlightedPorts.has(field);
          return (
            <li
              key={field}
              className={`port${missing ? ' missing' : ''}${highlighted ? ' port-highlighted' : ''}`}
              title={info.hint}
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: field })}
              onMouseLeave={() => data?.onPortHover?.()}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={slotHandleId(field, 0)}
                className={`${missing ? 'missing' : ''}${highlighted ? ' port-highlighted' : ''}`}
              />
              <ParameterLabel name={info.symbol} unit={unit} nameClassName="port-name" unitClassName="port-unit" />
              {info.arrow === undefined ? null : (
                <span className="load-sign" aria-label={info.hint}>
                  {info.arrow}
                </span>
              )}
              <span className="quantity-split port-quantity">
                <TextField
                  className="quantity"
                  value={
                    edge !== undefined
                      ? supplied === undefined ? '' : summarise(supplied, 4, format)
                      : typed === undefined ? '' : formatAuthored(typed, format)
                  }
                  placeholder={MANDATORY.has(field) ? '' : '0'}
                  autoSize={4}
                  disabled={edge !== undefined}
                  title={
                    edge !== undefined
                      ? 'Set by the wire — unplug it to type one by hand again.'
                      : `${info.hint} Type a number, with its unit if it differs.`
                  }
                  onCommit={(text) => commit(field, text)}
                />
              </span>
            </li>
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
