/**
 * A formula node: the catalogue record, its ports, and what it produced.
 *
 * Three things this node must get right, and they are all restrictions rather
 * than features:
 *
 * - **The expression is not shown.** The node carries a citation, a description
 *   and numbers, which is what an export defaults to (S32) and what a graph file
 *   carries (S23). Milestone 1 has no need to display R&M expressions in the app,
 *   so it does not.
 * - **Units are text on the port** (S49). Colour is spent on state.
 * - **A missing required input is visible while compact** (S50), because an
 *   incomplete graph should be obvious before it is evaluated.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { isGenericPort, type Port } from '@mds/schema';
import type { Unit } from '@mds/units';

import { useGraph } from '../graph-context';
import { reframe, removeNodes, updateNode } from '../model/document';
import { Symbol } from '../Symbol';
import { unitLabel } from '../model/quantity';
import { axisLabel, reading, summarise } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { slotHandleId } from './spectrumSlots';
import { TextField } from './fields';
import type { FormulaNode } from '@mds/schema';

export function FormulaNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, pinned, togglePin } = useGraph();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'formula') return null;

  const formula = analysis.formulas.get(id);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const warning = analysis.warnings
    .filter((entry) => entry.nodeId === id)
    .map((entry) => entry.message)
    .join(' ');

  // Without the catalogue there is no port list to draw — which is exactly what
  // a graph opened without its catalogue looks like, and saying so is better
  // than drawing an empty box (S23).
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
  /** Every edge already arriving at one port — more than one only for a spectrum port (S71). */
  const edgesAt = (portName: string): number =>
    document.edges.filter((edge) => edge.to.node === id && edge.to.port === portName).length;

  const portUnit = (port: Port): string => {
    if (port.kind === 'categorical') return port.domain.join(' | ');
    // A generic port has no unit of its own until something is wired to it
    // (S59), so what it shows is the unit the binding gave it.
    const bound = analysis.resolution?.targets.get(`${id}.${port.name}`)?.unit;
    return unitLabel(isGenericPort(port) ? bound : (port.unit as Unit));
  };

  const missing = (port: Port): boolean =>
    !wired.has(port.name) &&
    !(port.kind === 'numeric' && port.default !== undefined && !isGenericPort(port)) &&
    !(port.kind === 'categorical' && port.default !== undefined);

  const outputUnit = analysis.resolution?.sources.get(`${id}.${formula.output.name}`)?.unit;

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
        <TextField
          className="title"
          value={node.label ?? formula.id}
          onCommit={(label) =>
            edit((current) =>
              updateNode<FormulaNode>(current, id, (formulaNode) => ({ ...formulaNode, label })),
            )
          }
        />
      }
      subtitle={
        <>
          <span className="citation">{formula.citation ?? formula.id}</span>
          {formula.status === 'verified' ? <span className="status verified">verified</span> : null}
          {formula.status === 'unverified' ? (
            <span className="status unverified" title="No golden value exercises this yet (S19).">
              unverified
            </span>
          ) : null}
        </>
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
        </>
      }
    >
      <ul className="ports">
        {formula.inputs.flatMap((port) => {
          // An ordinary port is exactly one slot. A spectrum port (S71) is one
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
                <span className="port-name" title={port.description ?? ''}>
                  <Symbol name={port.name} />
                </span>
                <span className="port-unit">{portUnit(port)}</span>
              </li>
            );
          }

          const count = edgesAt(port.name);
          const filled = Array.from({ length: count }, (_unused, i) => (
            <li key={`${port.name}-${i}`} className="port">
              <Handle type="target" position={Position.Left} id={slotHandleId(port.name, i)} />
              {i === 0 ? (
                <>
                  <span className="port-name" title={port.description ?? ''}>
                    <Symbol name={port.name} />
                  </span>
                  <span className="port-unit">{portUnit(port)}</span>
                </>
              ) : (
                <span className="port-unit">{portUnit(port)}</span>
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
        <span className="reading">{value === undefined ? '—' : summarise(value)}</span>
        {value === undefined ? null : <Sparkline reading={value} />}
        {value === undefined ? null : <span className="axis">{axisLabel(value) ?? ''}</span>}
        <span className="port-out">
          <Symbol name={formula.output.name} /> <span className="port-unit">{unitLabel(outputUnit)}</span>
        </span>
        <Handle type="source" position={Position.Right} id={formula.output.name} />
      </div>
    </NodeShell>
  );
}
