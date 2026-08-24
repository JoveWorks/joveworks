/**
 * A formula node: the catalogue record, its ports, and what it produced.
 *
 * The one thing this node must get right, and it is a restriction rather
 * than a feature: **a missing required input is visible while compact**,
 * because an incomplete graph should be obvious before it is evaluated.
 *
 * The expression itself renders on expand for every formula, restricted
 * catalogues included — `source.restricted` (the same flag the palette and
 * this node's own provenance line key off of) gates export, not in-app
 * display, since a wired formula's expression is already readable from any
 * equation output node regardless of its source catalogue.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import {
  appliesWhenOf,
  expressionOf,
  isGenericPort,
  localize,
  type FormulaNode,
  type Port,
  type ValueSpec,
} from '@joveworks/schema';
import { parseExpression, toLatex } from '@joveworks/kernel';
import { phrase } from '../i18n';
import type { Unit } from '@joveworks/units';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { Equation } from '../Equation';
import { Symbol } from '../Symbol';
import { ParameterLabel, UnitInLabel } from '../ParameterLabel';
import { axisLabel, reading, summarise } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './spectrumSlots';
import { TitleField, TitleText } from './TitleField';
import { DisplayUnitPicker } from './DisplayUnitPicker';
import { TextField } from './fields';
import { formatAuthored, parseAuthored } from '../model/quantity';

export function FormulaNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat, locale } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'formula') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
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
        highlighted={data?.highlighted === true || hovered.has(id)}
        expanded={expanded.has(id)}
        onToggleExpanded={() => toggleExpanded(id)}
        onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
        title={node.label ?? node.formula.id}
        subtitle={phrase(locale, 'formula not loaded')}
      >
        <div className="node-value">
          <span className="reading">—</span>
        </div>
      </NodeShell>
    );
  }

  const wired = new Set(
    document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port),
  );
  /** A lookup axis picked from a dropdown, e.g. "pick a camera": the choice
   * made right here is what applies, and the row reads as that choice rather
   * than as a labelled port — until something is wired in, which overrides
   * it the same way a wire overrides `CompareNode.threshold`. */
  const pickerPorts = new Set(
    formula.expressions === undefined
      ? (formula.lookup?.axes ?? []).filter((axis) => axis.kind === 'categorical').map((axis) => axis.input)
      : [],
  );

  /**
   * What a wire is actually feeding a categorical port, which is far more
   * use on the node than the domain it has to come from — a ten-body camera
   * library listed in full swamps the card, and the one name that arrived is
   * the answer to "which one is this". Several names mean a swept axis.
   */
  const arriving = (portName: string): string | undefined => {
    const edge = document.edges.find((entry) => entry.to.node === id && entry.to.port === portName);
    if (edge === undefined) return undefined;
    const series = analysis.evaluation?.values.get(`${edge.from.node}.${edge.from.port}`);
    if (series?.kind !== 'categorical') return undefined;
    const names = [...new Set(series.data)];
    return names.length > 2 ? `${names.length} choices` : names.join(' | ');
  };
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

  const outputUnitOf = (name: string): Unit | undefined =>
    analysis.resolution?.sources.get(`${id}.${name}`)?.unit;
  const setOutputDisplayUnit = (name: string, unit: Unit): void =>
    edit((current) =>
      updateNode(current, id, (entry) => ({
        ...entry,
        displayUnits: { ...entry.displayUnits, [name]: unit },
      })),
    );
  const setInputValue = (name: string, value: ValueSpec): void =>
    edit((current) =>
      updateNode<FormulaNode>(current, id, (entry) => ({
        ...entry,
        inputValues: { ...entry.inputValues, [name]: value },
      })),
    );

  // The title is the friendly name: a student's own label, else the catalogue's
  // citation, else the bare id. The subtitle is the provenance line underneath
  // it — always citation-or-id — shown only when it says something the title
  // doesn't already: a renamed R&M node still needs "R&M 16.19A" visible, but
  // an unrenamed one showing "R&M 16.19A" twice would not.
  const title = node.label ?? (formula.label === undefined ? formula.citation ?? formula.id : localize(formula.label, locale));
  const provenance = formula.citation ?? formula.id;

  return (
    <NodeShell
      kind="formula"
      {...(pickerPorts.size === 0 ? {} : { extraClassName: 'node-picker' })}
      state={state}
      {...(problem === undefined ? {} : { problem })}
      {...(warning.length === 0 ? {} : { warning })}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
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
          {/* One equation per output that an expression answers for, named
              when there is more than one — a merged node states three
              relations, and an unlabelled stack of them says nothing about
              which is which. */}
          {formula.outputs.map((output) => {
            const expression = expressionOf(formula, output.name);
            if (expression === undefined) return null;
            return (
              <p key={output.name} className="formula-equation">
                {formula.outputs.length === 1 ? null : (
                  <span className="equation-name">
                    <Symbol name={output.name} />
                    {' = '}
                  </span>
                )}
                <Equation latex={toLatex(parseExpression(expression))} displayMode={false} />
              </p>
            );
          })}
          <p className="description">{localize(formula.description, locale)}</p>
          {formula.outputs.map((output) => {
            const condition = appliesWhenOf(formula, output.name);
            if (condition === undefined) return null;
            return (
              <p key={output.name} className="applies">
                {formula.outputs.length === 1 ? null : <><Symbol name={output.name} />{' '}</>}
                {phrase(locale, 'applies when')} {condition}
              </p>
            );
          })}
          {formula.variantOf === undefined ? null : (
            <p className="applies">{phrase(locale, 'same relation as')} {formula.variantOf}</p>
          )}
          <p className="provenance">
            {/* Which catalogue this formula came from — the same name the palette
                groups it under — so a restricted R&M node reads as restricted on
                the canvas too, not only in the dropdown it was dragged from. */}
            {source === undefined ? null : (
              <span
                className={source.restricted ? 'source restricted' : 'source'}
                title={source.restricted ? phrase(locale, 'Restricted content — never exported.') : undefined}
              >
                From catalogue: {localize(source.name, locale)}
              </span>
            )}
            {/* Signs off content against R&M formula by formula — see
                ROADMAP.md. Drop this once the whole catalogue is verified. */}
            {formula.status === 'verified' ? <span className="status verified">{phrase(locale, 'verified')}</span> : null}
            {formula.status === 'unverified' ? (
              <span className="status unverified" title={phrase(locale, 'No golden value exercises this yet.')}>
                unverified
              </span>
            ) : null}
          </p>
        </>
      }
    >
      <ul className="ports">
        {formula.inputs.flatMap((port) => {
          const authored = node.inputValues?.[port.name];
          // On the row itself, not just the label — a student pointing at the
          // handle or the default field should see the same description a
          // pointer over the name would.
          const description = port.description === undefined ? undefined : localize(port.description, locale);
          // An ordinary port is exactly one slot. A spectrum port is one
          // slot per edge already joined to it, plus a trailing open one —
          // there is no numbered "a1, a2" identity to keep in step, since
          // every slot targets the same port name; removing a wire and
          // re-rendering from the edge list *is* the shift.
          if (port.kind === 'categorical' && pickerPorts.has(port.name) && !wired.has(port.name)) {
            return (
              <li
                key={port.name}
                className={`port port-picker${highlightedPorts.has(port.name) ? ' port-highlighted' : ''}`}
                {...(description === undefined ? {} : { title: description })}
                onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: port.name })}
                onMouseLeave={() => data?.onPortHover?.()}
              >
                {/* The dropdown is what applies while nothing is wired, and
                    the handle is how something gets wired — the same
                    typed-default-overridden-by-an-edge shape
                    `CompareNode.threshold` has, here so a photograph's own
                    camera name can drive the library it is a row of. The
                    label stays off: the choice reads as the node itself. */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={slotHandleId(port.name, 0)}
                  className={highlightedPorts.has(port.name) ? 'port-highlighted' : ''}
                />
                <select
                  className="nodrag port-picker-select"
                  aria-label={port.name}
                  value={authored?.kind === 'categorical' ? authored.value : port.default ?? port.domain[0]}
                  onChange={(event) => setInputValue(port.name, { kind: 'categorical', value: event.target.value })}
                >
                  {port.domain.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                </select>
              </li>
            );
          }

          if (port.kind !== 'spectrum') {
            return (
              <li
                key={port.name}
                className={`${missing(port) ? 'port missing' : 'port'}${highlightedPorts.has(port.name) ? ' port-highlighted' : ''}`}
                {...(description === undefined ? {} : { title: description })}
                onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: port.name })}
                onMouseLeave={() => data?.onPortHover?.()}
              >
                <Handle
                  type="target"
                  position={Position.Left}
                  id={slotHandleId(port.name, 0)}
                  className={`${missing(port) ? 'missing' : ''}${highlightedPorts.has(port.name) ? ' port-highlighted' : ''}`}
                />
                <ParameterLabel
                  name={port.name}
                  unit={portUnit(port)}
                  nameClassName="port-name"
                  unitClassName="port-unit"
                />
                {port.kind === 'categorical' ? (
                  wired.has(port.name) ? (
                    <span className="port-unit port-arriving">{arriving(port.name) ?? ''}</span>
                  ) : (
                    <select
                      className="nodrag port-default"
                      value={
                        authored?.kind === 'categorical'
                          ? authored.value
                          : port.default ?? port.domain[0]
                      }
                      onChange={(event) => setInputValue(port.name, { kind: 'categorical', value: event.target.value })}
                    >
                      {port.domain.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                    </select>
                  )
                ) : null}
                {port.kind === 'numeric' && !wired.has(port.name) && port.default !== undefined && !isGenericPort(port) ? (
                  <TextField
                    className="quantity port-default"
                    autoSize={5}
                    value={
                      authored?.kind === 'scalar'
                        ? formatAuthored(authored, format)
                        : formatAuthored({ value: port.default, unit: port.unit as Unit }, format)
                    }
                    onCommit={(text) => {
                      const quantity = parseAuthored(text, format);
                      setInputValue(port.name, { kind: 'scalar', ...quantity });
                    }}
                  />
                ) : null}
              </li>
            );
          }

          const count = edgesAt(port.name);
          const filled = Array.from({ length: count }, (_unused, i) => (
            <li
              key={`${port.name}-${i}`}
              className={`port${highlightedPorts.has(port.name) ? ' port-highlighted' : ''}`}
              {...(description === undefined ? {} : { title: description })}
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
              {...(description === undefined ? {} : { title: description })}
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

      {/* One row per declared output: a table-backed node answering with a
          camera's whole spec sheet draws a reading and a pin per property.
          Several of them read as one list — a rule above the group instead
          of between every pair, and each row on a single line — since seven
          properties otherwise cost seven dividers and fourteen lines. */}
      <div className={formula.outputs.length > 1 ? 'node-values' : undefined}>
        {formula.outputs.map((output) => {
          const value = reading(analysis, id, output.name);
          const outputUnit = outputUnitOf(output.name);
          const highlighted = highlightedPorts.has(output.name);
          return (
            <div
              key={output.name}
              className="node-value"
              // On the whole row, not only on the symbol at its right end: a
              // node answering with a camera's whole spec sheet is a stack of
              // one-letter names, and the row is what the pointer is over.
              {...(output.description === undefined
                ? {}
                : { title: localize(output.description, locale) })}
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: output.name })}
              onMouseLeave={() => data?.onPortHover?.()}
            >
              <span className={`reading${highlighted ? ' port-highlighted' : ''}`}>
                {value === undefined ? '—' : summarise(value, 4, format)}
              </span>
              {value === undefined ? null : <Sparkline reading={value} />}
              {value === undefined ? null : (
                <span className={`axis${highlighted ? ' port-highlighted' : ''}`}>
                  <TitleText value={axisLabel(value) ?? ''} />
                </span>
              )}
              <span className={`port-out${highlighted ? ' port-highlighted' : ''}`}>
                <ParameterLabel name={output.name} />
                {outputUnit === undefined ? null : (
                  <DisplayUnitPicker unit={outputUnit} onChange={(unit) => setOutputDisplayUnit(output.name, unit)} />
                )}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.name}
                className={highlighted ? 'port-highlighted' : ''}
              />
            </div>
          );
        })}
      </div>
    </NodeShell>
  );
}
