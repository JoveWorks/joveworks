/**
 * A range node: an axis-introducing node like `InputNode` holding a
 * `linear`/`logarithmic` range, except `start`, `stop` and `count` are also
 * wireable — a range computed from other nodes' outputs instead of retyped
 * by hand whenever an upstream dimension changes. Each port row follows
 * `CompareNodeView.threshold`'s own shape exactly: a typed default,
 * overridden by a wire the instant one is attached, its unit taken from
 * whichever end of the range a wire has already pinned a dimension to
 * (`resolveGraph`'s `range` branch) — there is no separate "unit" field to
 * fill in ahead of time, unlike a Monte Carlo generator's own draw
 * parameters, which share one always-typed unit instead of inferring one.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { dimensionsEqual, isDimensionless } from '@joveworks/units';
import {
  COUNT_PORT,
  RANGE_SPACINGS,
  START_PORT,
  STOP_PORT,
  VALUE_PORT,
  type RangeNode,
  type RangeSpacing,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { nodeLabel, reframe, removeNodes, syncColumnLabels, updateNode } from '../model/document';
import { formatAuthored, parseAuthored } from '../model/quantity';
import { axisLabel, reading } from '../model/values';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { NumberField, TextField } from './fields';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './spectrumSlots';
import { Sparkline } from './Sparkline';
import { TitleField, TitleText } from './TitleField';

export function RangeNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'range') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const value = reading(analysis, id, VALUE_PORT);
  const wired = new Set(document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port));
  const onPortHover = (port: string) => () => data?.onPortHover?.({ nodeId: id, port });
  const onPortHoverEnd = () => data?.onPortHover?.();
  const setNode = (change: (current: RangeNode) => RangeNode): void =>
    edit((current) => updateNode<RangeNode>(current, id, change));

  const resolvedUnit = (port: string) => analysis.resolution?.targets.get(`${id}.${port}`)?.unit;

  /**
   * Typing a bound: the unit it adopts is whatever was typed, unless that
   * was bare — no unit at all — in which case it takes the port's own
   * resolved unit (the same dimension the *other* bound's wire may already
   * have pinned), the "bare default adopts the wired dimension" rule
   * `CompareNodeView`'s own threshold field follows from `value`. The other
   * bound's stored number is rescaled along with it when the dimension is
   * unchanged — retyping "20 mm" as "2 cm" should not silently move the far
   * end — and left alone when it genuinely changes, the same as
   * `ValueEditor.tsx`'s `rescaleRange` for a literal Input range.
   */
  const setBound = (bound: 'start' | 'stop', text: string): void => {
    const parsed = parseAuthored(text, format);
    const implied = resolvedUnit(bound);
    const unit = isDimensionless(parsed.unit.dimension) && implied !== undefined ? implied : parsed.unit;
    setNode((current) => {
      const other = bound === 'start' ? 'stop' : 'start';
      if (!dimensionsEqual(unit.dimension, current.unit.dimension)) {
        return { ...current, unit, [bound]: parsed.value };
      }
      const rescaled = (current[other] * current.unit.factor) / unit.factor;
      return { ...current, unit, [bound]: parsed.value, [other]: rescaled };
    });
  };

  return (
    <NodeShell
      kind="range"
      state={analysis.states.get(id) ?? 'ok'}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      dataTour={`range-${id}`}
      title={
        <TitleField
          value={node.label ?? id}
          onCommit={(label) =>
            edit((current) => {
              const oldLabel = nodeLabel(node);
              const renamed = updateNode<RangeNode>(current, id, (range) => {
                const { axisLabel: _stale, ...rest } = range;
                return { ...rest, label };
              });
              return syncColumnLabels(renamed, id, oldLabel, label);
            })
          }
        />
      }
      subtitle={`${node.spacing} range`}
      detail={
        <label>
          spacing
          <select
            className="nodrag"
            value={node.spacing}
            onChange={(event) => {
              const spacing = event.target.value as RangeSpacing;
              setNode((current) => ({ ...current, spacing }));
            }}
          >
            {RANGE_SPACINGS.map((spacing) => (
              <option key={spacing} value={spacing}>
                {spacing}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <ul className="ports">
        {([START_PORT, STOP_PORT] as const).map((port) => (
          <li
            key={port}
            className={`port${highlightedPorts.has(port) ? ' port-highlighted' : ''}`}
            onMouseEnter={onPortHover(port)}
            onMouseLeave={onPortHoverEnd}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={slotHandleId(port, 0)}
              className={highlightedPorts.has(port) ? 'port-highlighted' : ''}
            />
            <ParameterLabel name={port} unit={resolvedUnit(port)} nameClassName="port-name" unitClassName="port-unit" />
            {wired.has(port) ? null : (
              <span className="quantity-split port-quantity">
                <TextField
                  className="quantity"
                  value={formatAuthored({ value: node[port === START_PORT ? 'start' : 'stop'], unit: node.unit }, format)}
                  autoSize={4}
                  title="Overridden by the wire — this is what applies when it is removed."
                  onCommit={(text) => setBound(port === START_PORT ? 'start' : 'stop', text)}
                />
              </span>
            )}
          </li>
        ))}
        <li
          className={`port${highlightedPorts.has(COUNT_PORT) ? ' port-highlighted' : ''}`}
          onMouseEnter={onPortHover(COUNT_PORT)}
          onMouseLeave={onPortHoverEnd}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={slotHandleId(COUNT_PORT, 0)}
            className={highlightedPorts.has(COUNT_PORT) ? 'port-highlighted' : ''}
          />
          <ParameterLabel name={COUNT_PORT} nameClassName="port-name" unitClassName="port-unit" />
          {wired.has(COUNT_PORT) ? null : (
            <span className="quantity-split port-quantity">
              <NumberField
                className="quantity"
                value={node.count}
                integer
                minimum={2}
                autoSize={4}
                title="Overridden by the wire — this is what applies when it is removed."
                onCommit={(count) => setNode((current) => ({ ...current, count }))}
              />
            </span>
          )}
        </li>
      </ul>
      <div
        className="node-value"
        onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: VALUE_PORT })}
        onMouseLeave={() => data?.onPortHover?.()}
      >
        {value === undefined ? null : <Sparkline reading={value} />}
        {value === undefined ? null : (
          <span className={`axis${highlightedPorts.has(VALUE_PORT) ? ' port-highlighted' : ''}`}>
            <TitleText value={axisLabel(value) ?? ''} />
          </span>
        )}
        <Handle
          type="source"
          position={Position.Right}
          id={VALUE_PORT}
          className={highlightedPorts.has(VALUE_PORT) ? 'port-highlighted' : ''}
        />
      </div>
    </NodeShell>
  );
}
