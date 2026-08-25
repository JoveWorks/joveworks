/**
 * A selection node: search a finished study along one axis and answer with
 * the coordinate — "the deflection limit is crossed at 38.2 mm", "the first
 * Renard size that passes is 40 mm", "mass is least at 32 mm".
 *
 * The wiring, not a dropdown, is what tells it which axis to search: a swept
 * range goes into `along`, and `at` takes that port's dimension. That is why
 * there are two required inputs here where a compare node has one, and why
 * neither of them is optional.
 *
 * `threshold` (crossing only) is `CompareNodeView`'s port-row field, verbatim
 * in idiom: a typed default with a wire that overrides it, editable right on
 * the row, with the implied unit shown beside it when nothing was typed.
 *
 * Its four modes are one node kind, not four — switching mode keeps `value`
 * and `along` wired (`changeSelectMode` in model/document.ts is the authority
 * on exactly what is pruned).
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { canonicalUnit, selectPortNames, type PortType } from '@joveworks/kernel';
import { isDimensionless, type Unit } from '@joveworks/units';
import {
  AT_PORT,
  BEST_PORT,
  SELECT_DIRECTIONS,
  SELECT_MODES,
  THRESHOLD_PORT,
  VALUE_PORT,
  type CrossingSelectNode,
  type SelectDirection,
  type SelectMode,
  type SelectNode,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { changeSelectMode, reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { toUnitsFormat } from '../model/numberFormat';
import { display, formatAuthored, parseAuthored, unitLabel } from '../model/quantity';
import { reading, summarise } from '../model/values';
import { Symbol } from '../Symbol';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { slotHandleId } from './spectrumSlots';
import { TextField } from './fields';
import type { CanvasFlowNode } from './node-data';
import { TitleField } from './TitleField';

/** What each mode is called where a student reads it, rather than in the schema. */
const MODE_LABELS: Readonly<Record<SelectMode, string>> = {
  crossing: 'threshold crossing',
  firstPassing: 'first passing',
  argMin: 'smallest at',
  argMax: 'largest at',
};

/**
 * What a bare, unitless threshold is actually compared in — `value`'s own
 * display unit, the same reading `evaluateSelect` in the kernel gives it.
 * An explicit unit the student typed is never overridden.
 */
function impliedThresholdUnit(node: SelectNode, valueType: PortType | undefined): Unit | undefined {
  if (node.mode !== 'crossing' || !isDimensionless(node.threshold.unit.dimension)) return undefined;
  if (valueType?.dimension === undefined || isDimensionless(valueType.dimension)) return undefined;
  return valueType.unit ?? canonicalUnit(valueType.dimension);
}

export function SelectNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'select') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const { inputs, outputs } = selectPortNames(node);
  const at = reading(analysis, id, AT_PORT);
  const best = reading(analysis, id, BEST_PORT);
  const found = analysis.evaluation?.selections.get(id);

  const wired = new Set(
    document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port),
  );
  const targetType = (port: string): PortType | undefined => analysis.resolution?.targets.get(`${id}.${port}`);
  const impliedUnit = impliedThresholdUnit(node, targetType(VALUE_PORT));
  const thresholdEdge = document.edges.find(
    (edge) => edge.to.node === id && edge.to.port === THRESHOLD_PORT,
  );
  const suppliedThreshold = thresholdEdge === undefined
    ? undefined
    : reading(analysis, thresholdEdge.from.node, thresholdEdge.from.port);

  const setThreshold = (change: Partial<Pick<CrossingSelectNode, 'threshold' | 'direction'>>): void =>
    edit((current) =>
      updateNode<CrossingSelectNode>(current, id, (entry) => ({ ...entry, ...change })),
    );

  // Every crossing found, not just the wired first one. A series has a fixed
  // shape, so the extras cannot be a port — but a student reading "38.2 mm"
  // off a curve that meets its threshold twice needs to be told so, and this
  // is where.
  const extras = found?.crossings.length === 1 ? (found.crossings[0] ?? []) : [];
  const extraCrossings =
    extras.length > 1 && at !== undefined
      ? extras.slice(1).map((value) => display(value, at.unit, 4, format)).join(', ')
      : undefined;

  const portRow = (port: string): ReactElement => (
    <li
      key={port}
      className={`${wired.has(port) || port === THRESHOLD_PORT ? 'port' : 'port missing'}${
        highlightedPorts.has(port) ? ' port-highlighted' : ''
      }`}
      onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port })}
      onMouseLeave={() => data?.onPortHover?.()}
    >
      <Handle
        type="target"
        position={Position.Left}
        id={slotHandleId(port, 0)}
        className={`${wired.has(port) || port === THRESHOLD_PORT ? '' : 'missing'}${
          highlightedPorts.has(port) ? ' port-highlighted' : ''
        }`}
      />
      <ParameterLabel
        name={port}
        unit={targetType(port)?.unit}
        nameClassName="port-name"
        unitClassName="port-unit"
      />
      {port !== THRESHOLD_PORT || node.mode !== 'crossing' ? null : (
        /* Editable right on the port row, exactly as CompareNodeView's is —
           a typed default with an overriding wire is meant to be as quick to
           retype as an input node's own value. */
        <span className="quantity-split port-quantity">
          <TextField
            className="quantity"
            value={
              wired.has(THRESHOLD_PORT)
                ? suppliedThreshold === undefined ? '' : summarise(suppliedThreshold, 4, format)
                : formatAuthored(node.threshold, format)
            }
            placeholder="1.5"
            autoSize={4}
            disabled={wired.has(THRESHOLD_PORT)}
            title={
              wired.has(THRESHOLD_PORT)
                ? 'Set by the wire — unplug it to type one by hand again.'
                : 'The bound the value has to cross. A wire overrides it.'
            }
            onCommit={(text) => {
              const parsed = parseAuthored(text, format);
              const threshold =
                isDimensionless(parsed.unit.dimension) && impliedUnit !== undefined
                  ? { ...parsed, unit: impliedUnit }
                  : parsed;
              setThreshold({ threshold });
            }}
          />
          {impliedUnit === undefined || wired.has(THRESHOLD_PORT) ? null : (
            <span
              className="unit implied"
              title="No unit typed — taken from the value's own unit. Type one to fix it instead."
            >
              {unitLabel(impliedUnit)}
            </span>
          )}
        </span>
      )}
    </li>
  );

  const outputRow = (port: string, value: ReturnType<typeof reading>): ReactElement => (
    <div
      key={port}
      className="node-value"
      onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port })}
      onMouseLeave={() => data?.onPortHover?.()}
    >
      <span className={`reading${highlightedPorts.has(port) ? ' port-highlighted' : ''}`}>
        {value === undefined ? '—' : summarise(value, 4, format)}
      </span>
      {value === undefined ? null : <Sparkline reading={value} />}
      <span className={`port-out${highlightedPorts.has(port) ? ' port-highlighted' : ''}`}>
        <Symbol name={port} />
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id={port}
        className={highlightedPorts.has(port) ? 'port-highlighted' : ''}
      />
    </div>
  );

  return (
    <NodeShell
      kind="select"
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
      subtitle={MODE_LABELS[node.mode]}
      detail={
        <div className="output-editor">
          <label>
            finds
            <select
              className="nodrag"
              value={node.mode}
              onChange={(event) =>
                edit((current) => changeSelectMode(current, id, event.target.value as SelectMode))
              }
            >
              {SELECT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          {node.mode !== 'crossing' ? null : (
            <label>
              going
              <select
                className="nodrag"
                value={node.direction}
                title="Which way the value has to be going through the bound for the crossing to count."
                onChange={(event) =>
                  setThreshold({ direction: event.target.value as SelectDirection })
                }
              >
                {SELECT_DIRECTIONS.map((direction) => (
                  <option key={direction} value={direction}>
                    {direction === 'any' ? 'either way' : direction}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      }
    >
      <ul className="ports">{inputs.map(portRow)}</ul>

      {outputs.map((port) => outputRow(port, port === AT_PORT ? at : best))}

      {extraCrossings === undefined ? null : (
        <p className="select-extra" title="A series has one value per point, so only the first is wired onward.">
          also crosses at {extraCrossings}
        </p>
      )}
    </NodeShell>
  );
}
