/**
 * A formula node: the catalogue record, its ports, and what it produced.
 *
 * Three things this node must get right, and they are all restrictions rather
 * than features:
 *
 * - **The expression is not shown.** The node carries a citation, a description
 *   and numbers, which is what an export defaults to and what a graph file
 *   carries. Milestone 1 has no need to display R&M expressions in the app,
 *   so it does not.
 * - **Units are text on the port**. Colour is spent on state.
 * - **A missing required input is visible while compact**, because an
 *   incomplete graph should be obvious before it is evaluated.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { isGenericPort, type Port } from '@joveworks/schema';
import type { Unit } from '@joveworks/units';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { reframe, removeNodes, renameNode } from '../model/document';
import { Symbol } from '../Symbol';
import { ParameterLabel, UnitInLabel } from '../ParameterLabel';
import { axisLabel, reading, summarise } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { slotHandleId } from './spectrumSlots';
import { TitleField, TitleText } from './TitleField';

export function FormulaNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, pinned, togglePin } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'formula') return null;

  const formula = analysis.formulas.get(id);
  const source = analysis.sources.get(id);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const warning = analysis.warnings
    .filter((entry) => entry.nodeId === id)
    .map((entry) => entry.message)
    .join(' ');

  // Without the catalogue there is no port list to draw — which is exactly what
  // a graph opened without its catalogue looks like, and saying so is better
  // than drawing an empty box.
  if (formula === undefined) {
    return (
      <NodeShell
        kind="formula"
        state="error"
        {...(problem === undefined ? {} : { problem })}
        selected={selected ?? false}
        pinned={pinned.has(id)}
        onTogglePin={() => togglePin(id)}
        onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
        title={node.label ?? node.formula.id}
        subtitle="formula not loaded"
      >
        <div className="node-value">
          <span className="reading">—</span>
        </div>
      </NodeShell>
    );
  }

  const value = reading(analysis, id, formula.output.name);
  const wired = new Set(
    document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port),
  );
  /** Every edge already arriving at one port — more than one only for a spectrum port. */
  const edgesAt = (portName: string): number =>
    document.edges.filter((edge) => edge.to.node === id && edge.to.port === portName).length;

  const portUnit = (port: Port): Unit | undefined => {
    if (port.kind === 'categorical' || port.kind === 'bundle') return undefined;
    // A catalogue formula never declares a bundle port (schema/src/port.ts) —
    // kept only so `Port`'s full union type-checks here.
    // A generic port has no unit of its own until something is wired to it
    //, so what it shows is the unit the binding gave it.
    const resolved = analysis.resolution?.targets.get(`${id}.${port.name}`)?.unit;
    return resolved ?? (isGenericPort(port) ? undefined : (port.preferredUnit ?? port.unit) as Unit);
  };

  const missing = (port: Port): boolean =>
    !wired.has(port.name) &&
    !(port.kind === 'numeric' && port.default !== undefined && !isGenericPort(port)) &&
    !(port.kind === 'categorical' && port.default !== undefined);

  const outputUnit = analysis.resolution?.sources.get(`${id}.${formula.output.name}`)?.unit;

  // The title is the friendly name: a student's own label, else the catalogue's
  // citation, else the bare id. The subtitle is the provenance line underneath
  // it — always citation-or-id — shown only when it says something the title
  // doesn't already: a renamed R&M node still needs "R&M 16.19A" visible, but
  // an unrenamed one showing "R&M 16.19A" twice would not.
  const title = node.label ?? formula.citation ?? formula.id;
  const provenance = formula.citation ?? formula.id;

  return (
    <NodeShell
      kind="formula"
      state={state}
      {...(problem === undefined ? {} : { problem })}
      {...(warning.length === 0 ? {} : { warning })}
      selected={selected ?? false}
      pinned={pinned.has(id)}
      onTogglePin={() => togglePin(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={
        <TitleField
          value={title}
          onCommit={(label) => edit((current) => renameNode(current, id, label))}
        />
      }
      subtitle={
        <>{provenance === title ? null : <span className="citation">{provenance}</span>}</>
      }
      detail={
        <>
          <p className="description">{formula.description}</p>
          {formula.appliesWhen === undefined ? null : (
            <p className="applies">applies when {formula.appliesWhen}</p>
          )}
          {formula.variantOf === undefined ? null : (
            <p className="applies">same relation as {formula.variantOf}</p>
          )}
          <p className="provenance">
            {/* Which catalogue this formula came from — the same name the palette
                groups it under — so a restricted R&M node reads as restricted on
                the canvas too, not only in the dropdown it was dragged from. */}
            {source === undefined ? null : (
              <span
                className={source.restricted ? 'source restricted' : 'source'}
                title={source.restricted ? 'Restricted content — never exported.' : undefined}
              >
                From catalogue: {source.name}
              </span>
            )}
            {/* Signs off content against R&M formula by formula — see
                ROADMAP.md. Drop this once the whole catalogue is verified. */}
            {formula.status === 'verified' ? <span className="status verified">verified</span> : null}
            {formula.status === 'unverified' ? (
              <span className="status unverified" title="No golden value exercises this yet.">
                unverified
              </span>
            ) : null}
          </p>
        </>
      }
    >
      <ul className="ports">
        {formula.inputs.flatMap((port) => {
          // An ordinary port is exactly one slot. A spectrum port is one
          // slot per edge already joined to it, plus a trailing open one —
          // there is no numbered "a1, a2" identity to keep in step, since
          // every slot targets the same port name; removing a wire and
          // re-rendering from the edge list *is* the shift.
          if (port.kind !== 'spectrum') {
            return (
              <li key={port.name} className={missing(port) ? 'port missing' : 'port'}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={slotHandleId(port.name, 0)}
                  className={missing(port) ? 'missing' : ''}
                />
                <ParameterLabel
                  name={port.name}
                  unit={portUnit(port)}
                  title={port.description ?? ''}
                  nameClassName="port-name"
                  unitClassName="port-unit"
                />
                {port.kind === 'categorical' ? (
                  <span className="port-unit">{port.domain.join(' | ')}</span>
                ) : null}
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
                    title={port.description ?? ''}
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
                <span className="port-name" title={port.description ?? ''}>
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
          <ParameterLabel name={formula.output.name} unit={outputUnit} unitClassName="port-unit" />
        </span>
        <Handle type="source" position={Position.Right} id={formula.output.name} />
      </div>
    </NodeShell>
  );
}
