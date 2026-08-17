/**
 * A waypoint: a redirect on the canvas, not an operation. One `in` port,
 * spectrum-shaped exactly like `minimum`'s own — any number of wires, all
 * one dimension — and one `out` port of that same dimension. It copies the
 * *first* wired value through unchanged; it does not reduce like
 * `minimum`/`maximum` do.
 *
 * Modeled on `FormulaNodeView`'s spectrum-port rendering, minus everything
 * that view draws from a catalogue record — there is none here, both ports
 * are derived (`packages/kernel/src/graph.ts`'s `waypoint` branch).
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { reframe, removeNodes, renameNode } from '../model/document';
import { ParameterLabel, UnitInLabel } from '../ParameterLabel';
import { axisLabel, reading, summarise } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { slotHandleId } from './spectrumSlots';
import { TitleField } from './TitleField';

export function WaypointNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, pinned, togglePin } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'waypoint') return null;

  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const count = document.edges.filter(
    (edge) => edge.to.node === id && edge.to.port === 'in',
  ).length;
  const inUnit = analysis.resolution?.targets.get(`${id}.in`)?.unit;
  const outUnit = analysis.resolution?.sources.get(`${id}.out`)?.unit;
  const value = reading(analysis, id, 'out');

  return (
    <NodeShell
      kind="waypoint"
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
        {/* Same shape FormulaNodeView draws a spectrum port in: one slot
            per edge already joined, plus a trailing open one. */}
        {Array.from({ length: count }, (_unused, i) => (
          <li key={`in-${i}`} className="port">
            <Handle type="target" position={Position.Left} id={slotHandleId('in', i)} />
            {i === 0 ? <UnitInLabel unit={inUnit} className="port-unit" /> : null}
          </li>
        ))}
        <li className={count === 0 ? 'port missing' : 'port port-open'}>
          <Handle
            type="target"
            position={Position.Left}
            id={slotHandleId('in', 'open')}
            className={count === 0 ? 'missing' : ''}
          />
          {count === 0 ? <span className="port-name">in</span> : null}
        </li>
      </ul>

      <div className="node-value">
        <span className="reading">{value === undefined ? '—' : summarise(value, 4, format)}</span>
        {value === undefined ? null : <Sparkline reading={value} />}
        {value === undefined ? null : <span className="axis">{axisLabel(value) ?? ''}</span>}
        <span className="port-out">
          <ParameterLabel name="out" unit={outUnit} unitClassName="port-unit" />
        </span>
        <Handle type="source" position={Position.Right} id="out" />
      </div>
    </NodeShell>
  );
}
