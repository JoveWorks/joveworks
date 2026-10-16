/**
 * An interpolator: read a table's value column at a point.
 *
 * Three wires and a choice. `xs` and `ys` are two columns of one table —
 * a lookup table node's, a catalogue table's, anything that varies along one
 * shared row axis — and `x` is the point to look up. The row axis is learned
 * from the `xs` wire, as a Select node learns its axis from `along`, so
 * there is nothing to pick.
 *
 * `mode` is `SelectNodeView`'s threshold idiom: a dropdown right on the port
 * row is the typed default, and a categorical wire into the same port
 * overrides it — sweep a list of modes into it and "linear against next up"
 * is one comparison on one graph.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { interpolatePortNames, type PortType } from '@joveworks/kernel';
import {
  INTERPOLATION_MODES,
  MODE_PORT,
  OUT_OF_RANGE_RULES,
  Y_PORT,
  type InterpolateNode,
  type InterpolationMode,
  type OutOfRangeRule,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { toUnitsFormat } from '../model/numberFormat';
import { reading, summarise } from '../model/values';
import { ParameterLabel } from '../ParameterLabel';
import { Symbol } from '../Symbol';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { slotHandleId } from './portSlots';
import type { CanvasFlowNode } from './node-data';
import { TitleField } from './TitleField';

/** What each mode is called where a student reads it. */
export const INTERPOLATION_LABELS: Readonly<Record<InterpolationMode, string>> = {
  linear: 'linear',
  nextUp: 'next row up',
  nextDown: 'next row down',
  exact: 'exact match',
};

const INTERPOLATION_HINTS: Readonly<Record<InterpolationMode, string>> = {
  linear: 'A straight line between the two rows either side of x.',
  nextUp: 'The first row whose key is at or above x — how a standard writes “over 10 up to 12”.',
  nextDown: 'The last row whose key is at or below x — “from 10”.',
  exact: 'Only a row whose key is exactly x. A key column of names only matches this way.',
};

const OUT_OF_RANGE_LABELS: Readonly<Record<OutOfRangeRule, string>> = {
  error: 'refuse',
  clamp: 'hold the end row',
  extrapolate: 'extrapolate (linear only)',
};

/** What each port is for, on hover. */
const PORT_HINTS: Readonly<Record<string, string>> = {
  xs: 'The table’s key column — what x is looked up in.',
  ys: 'The column to read the answer from, from the same table.',
  x: 'The point to look up. Sweep it and the answer is swept too.',
  mode: 'How x is turned into a row. A wire overrides the choice here.',
};

export function InterpolateNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'interpolate') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const { inputs } = interpolatePortNames(node);
  const wired = new Set(document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port));
  const targetType = (port: string): PortType | undefined => analysis.resolution?.targets.get(`${id}.${port}`);
  const y = reading(analysis, id, Y_PORT);
  const setNode = (change: Partial<Pick<InterpolateNode, 'mode' | 'outOfRange'>>): void =>
    edit((current) => updateNode<InterpolateNode>(current, id, (entry) => ({ ...entry, ...change })));

  const portRow = (port: string): ReactElement => {
    const required = port !== MODE_PORT;
    const present = wired.has(port) || !required;
    return (
      <li
        key={port}
        className={`${present ? 'port' : 'port missing'}${highlightedPorts.has(port) ? ' port-highlighted' : ''}`}
        title={PORT_HINTS[port]}
        onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port })}
        onMouseLeave={() => data?.onPortHover?.()}
      >
        <Handle
          type="target"
          position={Position.Left}
          id={slotHandleId(port, 0)}
          className={`${present ? '' : 'missing'}${highlightedPorts.has(port) ? ' port-highlighted' : ''}`}
        />
        <ParameterLabel name={port} unit={targetType(port)?.unit} nameClassName="port-name" unitClassName="port-unit" />
        {port !== MODE_PORT ? null : wired.has(MODE_PORT) ? (
          <span className="port-unit">set by the wire</span>
        ) : (
          <select
            className="nodrag"
            value={node.mode}
            title={INTERPOLATION_HINTS[node.mode]}
            onChange={(event) => setNode({ mode: event.target.value as InterpolationMode })}
          >
            {INTERPOLATION_MODES.map((mode) => (
              <option key={mode} value={mode} title={INTERPOLATION_HINTS[mode]}>
                {INTERPOLATION_LABELS[mode]}
              </option>
            ))}
          </select>
        )}
      </li>
    );
  };

  return (
    <NodeShell
      kind="interpolate"
      state={analysis.states.get(id) ?? 'ok'}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={<TitleField value={node.label ?? id} onCommit={(label) => edit((current) => renameNode(current, id, label))} />}
      subtitle={wired.has(MODE_PORT) ? 'interpolate' : `interpolate · ${INTERPOLATION_LABELS[node.mode]}`}
      detail={
        <div className="output-editor">
          <label>
            outside the table
            <select
              className="nodrag"
              value={node.outOfRange ?? 'error'}
              title="What a point beyond the first or last key gets. Refusing is the default: a key width read off the end of its table is not a key width."
              onChange={(event) => setNode({ outOfRange: event.target.value as OutOfRangeRule })}
            >
              {OUT_OF_RANGE_RULES.map((rule) => (
                <option key={rule} value={rule}>
                  {OUT_OF_RANGE_LABELS[rule]}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
    >
      <ul className="ports">{inputs.map(portRow)}</ul>
      <div
        className="node-value"
        onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: Y_PORT })}
        onMouseLeave={() => data?.onPortHover?.()}
      >
        <span className={`reading${highlightedPorts.has(Y_PORT) ? ' port-highlighted' : ''}`}>
          {y === undefined ? '—' : summarise(y, 4, format)}
        </span>
        {y === undefined ? null : <Sparkline reading={y} />}
        <span className={`port-out${highlightedPorts.has(Y_PORT) ? ' port-highlighted' : ''}`}>
          <Symbol name={Y_PORT} />
        </span>
        <Handle
          type="source"
          position={Position.Right}
          id={Y_PORT}
          className={highlightedPorts.has(Y_PORT) ? 'port-highlighted' : ''}
        />
      </div>
    </NodeShell>
  );
}
