/**
 * A closure node: a student-typed equation whose ports are whatever names the
 * expression mentions (`packages/kernel/src/closure.ts` derives them).
 *
 * The one deliberate reversal of `FormulaNodeView`'s own rule: **the
 * expression is shown, and is the primary thing edited on the node.** That
 * rule exists to keep restricted R&M content out of the app's own display —
 * this content is the student's own, and showing it is the point of the
 * node. The expression field sits where `CompareNodeView`'s threshold does:
 * always visible, editable right there, no inspector needed.
 */

import type { ReactElement } from 'react';

import { phrase } from '../i18n';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { CLOSURE_RESULT_PORT, type Port } from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { reframe, removeNodes, renameNode, setClosureExpression } from '../model/document';
import { Symbol } from '../Symbol';
import { ParameterLabel, UnitInLabel } from '../ParameterLabel';
import { axisLabel, reading, summarise } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { slotHandleId } from './spectrumSlots';
import { TextField } from './fields';
import { TitleField, TitleText } from './TitleField';

export function ClosureNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, pinned, togglePin } = useGraph();
  const { numberFormat, locale } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'closure') return null;

  // Undefined exactly when the expression does not currently parse — a
  // freshly dropped, not-yet-written node included. `analysis.tsx`'s own
  // pre-pass already recorded why in `states`/`problems`; this view's job
  // is only to keep the expression editable so a student can fix it.
  const formula = analysis.formulas.get(id);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);

  const wired = new Set(
    document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port),
  );
  const edgesAt = (portName: string): number =>
    document.edges.filter((edge) => edge.to.node === id && edge.to.port === portName).length;

  const portUnit = (port: Port) => analysis.resolution?.targets.get(`${id}.${port.name}`)?.unit;

  const value = formula === undefined ? undefined : reading(analysis, id, formula.output.name);
  const outputUnit =
    formula === undefined
      ? undefined
      : analysis.resolution?.sources.get(`${id}.${formula.output.name}`)?.unit;

  return (
    <NodeShell
      kind="closure"
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
      subtitle={
        <TextField
          className="expression"
          value={node.expression}
          placeholder="a + b"
          title={phrase(locale, 'A student-written equation — its ports are whatever names it mentions.')}
          onCommit={(expression) =>
            edit((current) => setClosureExpression(current, id, expression))
          }
        />
      }
    >
      <ul className="ports">
        {(formula?.inputs ?? []).flatMap((port) => {
          // Same shape FormulaNodeView draws a spectrum port in: one slot
          // per edge already joined, plus a trailing open one.
          if (port.kind !== 'spectrum') {
            const missing = !wired.has(port.name);
            return (
              <li key={port.name} className={missing ? 'port missing' : 'port'}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={slotHandleId(port.name, 0)}
                  className={missing ? 'missing' : ''}
                />
                <ParameterLabel
                  name={port.name}
                  unit={portUnit(port)}
                  nameClassName="port-name"
                  unitClassName="port-unit"
                />
              </li>
            );
          }

          const count = edgesAt(port.name);
          const filled = Array.from({ length: count }, (_unused, i) => (
            <li key={`${port.name}-${i}`} className="port">
              <Handle type="target" position={Position.Left} id={slotHandleId(port.name, i)} />
              {i === 0 ? (
                <>
                  <ParameterLabel
                    name={port.name}
                    unit={portUnit(port)}
                    nameClassName="port-name"
                    unitClassName="port-unit"
                  />
                </>
              ) : (
                <UnitInLabel unit={portUnit(port)} className="port-unit" />
              )}
            </li>
          ));
          return [
            ...filled,
            <li
              key={`${port.name}-open`}
              className={count === 0 ? 'port missing' : 'port port-open'}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={slotHandleId(port.name, 'open')}
                className={count === 0 ? 'missing' : ''}
              />
              {count === 0 ? (
                <span className="port-name">
                  <Symbol name={port.name} />
                </span>
              ) : null}
            </li>,
          ];
        })}
      </ul>

      <div className="node-value">
        <span className="reading">{value === undefined ? '—' : summarise(value, 4, format)}</span>
        {value === undefined ? null : <Sparkline reading={value} />}
        {value === undefined ? null : (
          <span className="axis">
            <TitleText value={axisLabel(value) ?? ''} />
          </span>
        )}
        <span className="port-out">
          <ParameterLabel name={CLOSURE_RESULT_PORT} unit={outputUnit} unitClassName="port-unit" />
        </span>
        {/* The output's name is fixed regardless of whether the expression
            currently parses, so a downstream wire never looks disconnected
            over what may be a momentary typo. */}
        <Handle type="source" position={Position.Right} id={CLOSURE_RESULT_PORT} />
      </div>
    </NodeShell>
  );
}
