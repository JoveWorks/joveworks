/**
 * A Shaft node: its extent along z (which sets the axis every diagram it
 * feeds is drawn along), its point count, Young's modulus, and its section —
 * one round section, one given by its I, or a table of steps. Out come the
 * shaft itself, its positions `z`, (round or stepped) its outer diameter
 * along them, `profile`, and its second moment of area along them, `I`.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { dimensionsEqual, formatPlainNumber, parseUnit } from '@joveworks/units';
import {
  SHAFT_FIELD_UNITS,
  SHAFT_PORT,
  SHAFT_PROFILE_PORT,
  SHAFT_I_PORT,
  SHAFT_Z_PORT,
  shaftFieldValue,
  type Quantity,
  type ShaftNode,
  type ShaftSection,
  type ShaftStep,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { toUnitsFormat } from '../model/numberFormat';
import { reading, summarise, axisLabel } from '../model/values';
import { parseAuthored } from '../model/quantity';
import { Symbol } from '../Symbol';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { QuantityPortRow } from './QuantityPortRow';
import { Sparkline } from './Sparkline';
import { NumberField, TextField } from './fields';
import type { CanvasFlowNode } from './node-data';
import { TitleField, TitleText } from './TitleField';

const SECTION_LABELS: Readonly<Record<ShaftSection['kind'], string>> = {
  round: 'round',
  secondMoment: 'second moment I',
  stepped: 'stepped',
};

const HINTS = {
  from: 'Where the shaft starts along z.',
  to: 'Where the shaft ends along z.',
  E: "Young's modulus of the shaft's material.",
  d: 'Outer diameter.',
  d_i: 'Bore diameter — empty for a solid shaft.',
  I: "The section's second moment of area, for a shaft that is not round.",
} as const;

/** The section a picker change leads to, keeping what carries over. */
function switchSection(node: ShaftNode, kind: ShaftSection['kind']): ShaftSection {
  const mm = parseUnit('mm');
  const current = node.section;
  if (kind === 'round') {
    return current.kind === 'stepped'
      ? { kind, d: { value: current.steps[0]?.d ?? 30, unit: current.unit } }
      : { kind, d: { value: 30, unit: mm } };
  }
  if (kind === 'secondMoment') return { kind, I: { value: 40000, unit: parseUnit('mm⁴') } };
  const d = current.kind === 'round' ? current.d : { value: 30, unit: mm };
  return { kind, unit: d.unit, steps: [{ start: node.from.value, d: d.value }] };
}

export function ShaftNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'shaft') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const problem = analysis.problems.get(id);
  const update = (change: (entry: ShaftNode) => ShaftNode): void =>
    edit((current) => updateNode<ShaftNode>(current, id, change));
  const setSection = (section: ShaftSection): void => update((entry) => ({ ...entry, section }));

  const row = (field: 'from' | 'to' | 'E' | 'd' | 'd_i' | 'I', symbol: string = field): ReactElement => (
    <QuantityPortRow
      key={field}
      nodeId={id}
      port={field}
      symbol={symbol}
      typed={shaftFieldValue(node, field)}
      reference={SHAFT_FIELD_UNITS[field]}
      hint={HINTS[field]}
      mandatory={field !== 'd_i'}
      data={data}
      onCommit={(quantity: Quantity | undefined) =>
        update((entry) => {
          if (field === 'from' || field === 'to' || field === 'E') {
            return quantity === undefined ? entry : { ...entry, [field]: quantity };
          }
          const section = entry.section as Record<string, unknown>;
          const { [field]: _old, ...rest } = section;
          return { ...entry, section: (quantity === undefined ? rest : { ...rest, [field]: quantity }) as ShaftSection };
        })
      }
    />
  );

  const section = node.section;
  const steps = section.kind === 'stepped' ? section.steps : [];
  /** A step's cell, retyped: a bare number in the profile's unit; a bad one is ignored and the cell reverts. */
  const setStep = (index: number, key: keyof ShaftStep, text: string): void => {
    if (section.kind !== 'stepped') return;
    let value: number | undefined;
    if (text.trim().length > 0) {
      try {
        value = parseAuthored(text, format).value;
      } catch {
        return;
      }
    } else if (key !== 'd_i') {
      return;
    }
    const next = section.steps.map((step, i): ShaftStep => {
      if (i !== index) return step;
      if (key === 'd_i') {
        const { d_i: _bore, ...rest } = step;
        return value === undefined ? rest : { ...rest, d_i: value };
      }
      return { ...step, [key]: value };
    });
    const valid = next.every((step, i) =>
      step.d > 0 && (step.d_i === undefined || (step.d_i >= 0 && step.d_i < step.d)) && (i === 0 || step.start > (next[i - 1] as ShaftStep).start),
    );
    if (valid) setSection({ ...section, steps: next });
  };
  const addStep = (): void => {
    if (section.kind !== 'stepped') return;
    const last = section.steps[section.steps.length - 1];
    const start = last === undefined ? node.from.value : last.start + 10;
    setSection({ ...section, steps: [...section.steps, { start, d: last?.d ?? 30 }] });
  };
  const removeStep = (index: number): void => {
    if (section.kind !== 'stepped' || section.steps.length === 1) return;
    setSection({ ...section, steps: section.steps.filter((_step, i) => i !== index) });
  };

  const outputRow = (port: string, symbol: string): ReactElement => {
    const value = reading(analysis, id, port);
    const highlighted = highlightedPorts.has(port);
    return (
      <div
        key={port}
        className="node-value"
        onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port })}
        onMouseLeave={() => data?.onPortHover?.()}
      >
        <span className={`reading${highlighted ? ' port-highlighted' : ''}`}>
          {port === SHAFT_PORT ? 'shaft' : value === undefined ? '—' : summarise(value, 4, format)}
        </span>
        {value === undefined ? null : <Sparkline reading={value} />}
        {value === undefined ? null : (
          <span className={`axis${highlighted ? ' port-highlighted' : ''}`}>
            <TitleText value={axisLabel(value) ?? ''} />
          </span>
        )}
        <span className={`port-out${highlighted ? ' port-highlighted' : ''}`}>
          {port === SHAFT_PORT ? <Symbol name={symbol} /> : <ParameterLabel name={symbol} />}
        </span>
        <Handle type="source" position={Position.Right} id={port} className={highlighted ? 'port-highlighted' : ''} />
      </div>
    );
  };

  return (
    <NodeShell
      kind="shaft"
      state={analysis.states.get(id) ?? 'ok'}
      {...(problem === undefined ? {} : { problem })}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={<TitleField value={node.label ?? id} onCommit={(label) => edit((current) => renameNode(current, id, label))} />}
      subtitle={`${SECTION_LABELS[section.kind]} shaft · ${node.count} points`}
      detail={
        <p className="load-convention">
          The shaft runs along z from its start to its end; the diagrams it feeds are drawn at the points in
          between. A step runs from its start to the next one&apos;s.
        </p>
      }
    >
      <ul className="ports">
        {row('from')}
        {row('to')}
        <li className="port shaft-setting">
          <span className="port-name">points</span>
          <NumberField
            className="quantity"
            value={node.count}
            integer
            minimum={2}
            autoSize={3}
            title="How many positions along the shaft the diagrams are drawn at."
            onCommit={(count) => update((entry) => ({ ...entry, count }))}
          />
        </li>
        {row('E')}
        <li className="port shaft-setting">
          <span className="port-name">section</span>
          <select
            className="nodrag"
            value={section.kind}
            onChange={(event) => setSection(switchSection(node, event.target.value as ShaftSection['kind']))}
          >
            {(['round', 'secondMoment', 'stepped'] as const).map((kind) => (
              <option key={kind} value={kind}>
                {SECTION_LABELS[kind]}
              </option>
            ))}
          </select>
        </li>
        {section.kind === 'stepped' ? (
          <li className="port shaft-setting">
            <span className="port-name">steps in</span>
            <TextField
              className="quantity"
              value={section.unit.symbol}
              autoSize={3}
              title="The unit every number in the step table is in."
              onCommit={(text) => {
                try {
                  const unit = parseUnit(text.trim());
                  if (dimensionsEqual(unit.dimension, SHAFT_FIELD_UNITS.d.dimension)) setSection({ ...section, unit });
                } catch {
                  // left as it was
                }
              }}
            />
          </li>
        ) : null}
        {section.kind === 'round' ? [row('d'), row('d_i')] : null}
        {section.kind === 'secondMoment' ? row('I') : null}
      </ul>

      {section.kind === 'stepped' ? (
        <>
          <div className="node-table-grid node-lut-grid nodrag">
            <table>
              <thead>
                <tr>
                  <th><span className="node-lut-heading">start</span></th>
                  <th><span className="node-lut-heading">d</span></th>
                  <th><span className="node-lut-heading">d_i</span></th>
                  <th className="node-lut-add" />
                </tr>
              </thead>
              <tbody>
                {steps.map((step, i) => (
                  <tr key={i}>
                    {(['start', 'd', 'd_i'] as const).map((key) => (
                      <td key={key}>
                        <TextField
                          className="node-lut-cell"
                          value={step[key] === undefined ? '' : formatPlainNumber(step[key] as number, format)}
                          placeholder={key === 'd_i' ? 'solid' : '—'}
                          autoSize={3}
                          selectOnFocus
                          onCommit={(text) => setStep(i, key, text)}
                        />
                      </td>
                    ))}
                    <td className="node-lut-add">
                      <button type="button" className="node-lut-remove" title="Delete this step" disabled={steps.length === 1} onClick={() => removeStep(i)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="node-table-expand nodrag" onClick={addStep}>
            add a step
          </button>
        </>
      ) : null}

      <div className="node-values">
        {outputRow(SHAFT_PORT, SHAFT_PORT)}
        {outputRow(SHAFT_Z_PORT, 'z')}
        {section.kind === 'secondMoment' ? null : outputRow(SHAFT_PROFILE_PORT, 'profile')}
        {outputRow(SHAFT_I_PORT, 'I')}
      </div>
    </NodeShell>
  );
}
