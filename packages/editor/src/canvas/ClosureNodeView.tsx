/**
 * A closure node: a student-typed equation whose ports are whatever names the
 * expression mentions (`packages/kernel/src/closure.ts` derives them).
 *
 * Unlike `FormulaNodeView`, where the expression is read-only, **here it is
 * shown editable and is the primary thing edited on the node** — this
 * content is the student's own. The expression field sits where
 * `CompareNodeView`'s threshold does: always visible, editable right there,
 * no inspector needed.
 */

import type { ReactElement } from 'react';

import { phrase } from '../i18n';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { parseExpression, toLatex } from '@joveworks/kernel';
import { CLOSURE_RESULT_PORT, type Port } from '@joveworks/schema';

import type { Unit } from '@joveworks/units';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { reframe, removeNodes, renameNode, setClosureExpression, updateNode } from '../model/document';
import { Equation } from '../Equation';
import { Symbol } from '../Symbol';
import { ParameterLabel, UnitInLabel } from '../ParameterLabel';
import { axisLabel, reading, summarise } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './spectrumSlots';
import { DisplayUnitPicker } from './DisplayUnitPicker';
import { TextField } from './fields';
import { TitleField, TitleText } from './TitleField';

export function ClosureNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat, locale } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'closure') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
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
  const setOutputDisplayUnit = (unit: Unit): void =>
    edit((current) =>
      updateNode(current, id, (entry) => ({
        ...entry,
        displayUnits: { ...entry.displayUnits, [CLOSURE_RESULT_PORT]: unit },
      })),
    );

  return (
    <NodeShell
      kind="closure"
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
      detail={
        formula === undefined ? undefined : (
          <Equation latex={toLatex(parseExpression(node.expression))} displayMode={false} />
        )
      }
    >
      <ul className="ports">
        {(formula?.inputs ?? []).flatMap((port) => {
          // Same shape FormulaNodeView draws a spectrum port in: one slot
          // per edge already joined, plus a trailing open one.
          if (port.kind !== 'spectrum') {
            const missing = !wired.has(port.name);
            return (
              <li
                key={port.name}
                className={`${missing ? 'port missing' : 'port'}${highlightedPorts.has(port.name) ? ' port-highlighted' : ''}`}
                onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: port.name })}
                onMouseLeave={() => data?.onPortHover?.()}
              >
                <Handle
                  type="target"
                  position={Position.Left}
                  id={slotHandleId(port.name, 0)}
                  className={`${missing ? 'missing' : ''}${highlightedPorts.has(port.name) ? ' port-highlighted' : ''}`}
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
            <li
              key={`${port.name}-${i}`}
              className={`port${highlightedPorts.has(port.name) ? ' port-highlighted' : ''}`}
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: port.name })}
              onMouseLeave={() => data?.onPortHover?.()}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={slotHandleId(port.name, i)}
                className={highlightedPorts.has(port.name) ? 'port-highlighted' : ''}
              />
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
              className={`${count === 0 ? 'port missing' : 'port port-open'}${highlightedPorts.has(port.name) ? ' port-highlighted' : ''}`}
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: port.name })}
              onMouseLeave={() => data?.onPortHover?.()}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={slotHandleId(port.name, 'open')}
                className={`${count === 0 ? 'missing' : ''}${highlightedPorts.has(port.name) ? ' port-highlighted' : ''}`}
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

      <div
        className="node-value"
        onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: CLOSURE_RESULT_PORT })}
        onMouseLeave={() => data?.onPortHover?.()}
      >
        <span className={`reading${highlightedPorts.has(CLOSURE_RESULT_PORT) ? ' port-highlighted' : ''}`}>
          {value === undefined ? '—' : summarise(value, 4, format)}
        </span>
        {value === undefined ? null : <Sparkline reading={value} />}
        {value === undefined ? null : (
          <span className={`axis${highlightedPorts.has(CLOSURE_RESULT_PORT) ? ' port-highlighted' : ''}`}>
            <TitleText value={axisLabel(value) ?? ''} />
          </span>
        )}
        <span className={`port-out${highlightedPorts.has(CLOSURE_RESULT_PORT) ? ' port-highlighted' : ''}`}>
          <ParameterLabel name={CLOSURE_RESULT_PORT} />
          {outputUnit === undefined ? null : (
            <DisplayUnitPicker unit={outputUnit} onChange={setOutputDisplayUnit} />
          )}
        </span>
        {/* The output's name is fixed regardless of whether the expression
            currently parses, so a downstream wire never looks disconnected
            over what may be a momentary typo. */}
        <Handle
          type="source"
          position={Position.Right}
          id={CLOSURE_RESULT_PORT}
          className={highlightedPorts.has(CLOSURE_RESULT_PORT) ? 'port-highlighted' : ''}
        />
      </div>
    </NodeShell>
  );
}
