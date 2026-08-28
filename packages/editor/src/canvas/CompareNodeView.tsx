/**
 * A compare node: `value` against `threshold`, wired or typed, emitting a
 * `pass`/`fail` verdict as an ordinary wireable value.
 *
 * Unlike the output node's `check` kind — a badge over a value that already
 * exists and goes nowhere else — this is a first-class node so its
 * verdict can flow onward, most usefully into a table column that shows
 * which of a swept design's points fail. `threshold` is the
 * first port in the app with both a typed default *and* a wire that can
 * override it: unwired, the typed quantity below is what is compared
 * against; wired, the edge wins outright (model/document.ts's
 * `evaluateCompare` in the kernel is the authority, not this file).
 *
 * `value` has no default — there is nothing sensible to compare against
 * when nothing is wired — so it is "missing" exactly the way a formula's
 * own required port is.
 */

import type { ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { canonicalUnit, type PortType } from '@joveworks/kernel';
import { isDimensionless, type Unit } from '@joveworks/units';
import {
  COMPARISONS,
  THRESHOLD_PORT,
  VALUE_PORT,
  VERDICT_PORT,
  type CompareNode,
  type Comparison,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { reframe, removeNodes, renameNode, updateNode } from '../model/document';
import { toUnitsFormat } from '../model/numberFormat';
import { formatAuthored, parseAuthored, unitLabel } from '../model/quantity';
import { reading, summarise } from '../model/values';
import { Symbol } from '../Symbol';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { slotHandleId } from './portSlots';
import { TextField } from './fields';
import type { CanvasFlowNode } from './node-data';
import { TitleField } from './TitleField';

/**
 * What a bare, unitless threshold is actually compared in — `value`'s own
 * display unit, the same reading `evaluateCompare` in the kernel
 * gives it. An explicit unit the student typed is never overridden.
 */
function impliedThresholdUnit(node: CompareNode, valueType: PortType | undefined): Unit | undefined {
  if (!isDimensionless(node.threshold.unit.dimension)) return undefined;
  if (valueType?.dimension === undefined || isDimensionless(valueType.dimension)) return undefined;
  return valueType.unit ?? canonicalUnit(valueType.dimension);
}

/** `fails at 1 of 2 points`, or `passes` — the same badge idiom the check output uses. */
function Verdict({ nodeId }: { readonly nodeId: string }): ReactElement | null {
  const { analysis } = useGraph();
  const value = reading(analysis, nodeId, VERDICT_PORT);
  if (value === undefined || value.series.kind !== 'categorical') return null;
  const { data } = value.series;
  const failures = data.filter((cell) => cell !== 'pass').length;
  return (
    <span className={`badge ${failures === 0 ? 'pass' : 'fail'}`}>
      {failures === 0
        ? 'passes'
        : `fails at ${failures} of ${data.length} point${data.length === 1 ? '' : 's'}`}
    </span>
  );
}

export function CompareNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'compare') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const state = analysis.states.get(id) ?? 'ok';
  const problem = analysis.problems.get(id);
  const verdict = reading(analysis, id, VERDICT_PORT);

  const wired = new Set(
    document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port),
  );
  const valueMissing = !wired.has(VALUE_PORT);
  const valueUnit = analysis.resolution?.targets.get(`${id}.${VALUE_PORT}`)?.unit;
  const thresholdUnit = analysis.resolution?.targets.get(`${id}.${THRESHOLD_PORT}`)?.unit;
  const impliedUnit = impliedThresholdUnit(node, analysis.resolution?.targets.get(`${id}.${VALUE_PORT}`));
  const thresholdEdge = document.edges.find(
    (edge) => edge.to.node === id && edge.to.port === THRESHOLD_PORT,
  );
  const suppliedThreshold = thresholdEdge === undefined
    ? undefined
    : reading(analysis, thresholdEdge.from.node, thresholdEdge.from.port);

  const setNode = (change: Partial<Pick<CompareNode, 'comparison' | 'threshold'>>): void =>
    edit((current) =>
      updateNode<CompareNode>(current, id, (entry) => ({ ...entry, ...change })),
    );

  return (
    <NodeShell
      kind="compare"
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
      // The threshold's own value is on the port row now, always visible —
      // repeating it here would just be the same number twice. What still
      // only lives in `detail` is the comparison operator, so that's what
      // stays worth a glance without opening the node.
      subtitle={node.comparison}
      detail={
        <div className="output-editor">
          <label>
            is
            <select
              className="nodrag"
              value={node.comparison}
              onChange={(event) => setNode({ comparison: event.target.value as Comparison })}
            >
              {COMPARISONS.map((comparison) => (
                <option key={comparison} value={comparison}>
                  {comparison}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
    >
      <ul className="ports">
        <li
          className={`${valueMissing ? 'port missing' : 'port'}${highlightedPorts.has(VALUE_PORT) ? ' port-highlighted' : ''}`}
          onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: VALUE_PORT })}
          onMouseLeave={() => data?.onPortHover?.()}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={slotHandleId(VALUE_PORT, 0)}
            className={`${valueMissing ? 'missing' : ''}${highlightedPorts.has(VALUE_PORT) ? ' port-highlighted' : ''}`}
          />
          <ParameterLabel
            name={VALUE_PORT}
            unit={valueUnit}
            nameClassName="port-name"
            unitClassName="port-unit"
          />
        </li>
        <li
          className={`port${highlightedPorts.has(THRESHOLD_PORT) ? ' port-highlighted' : ''}`}
          onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: THRESHOLD_PORT })}
          onMouseLeave={() => data?.onPortHover?.()}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={slotHandleId(THRESHOLD_PORT, 0)}
            className={highlightedPorts.has(THRESHOLD_PORT) ? 'port-highlighted' : ''}
          />
          <ParameterLabel
            name={THRESHOLD_PORT}
            unit={thresholdUnit}
            nameClassName="port-name"
            unitClassName="port-unit"
          />
          {/* Editable right on the port row — a typed default with a wire
              that can override it is meant to be as quick to retype as an
              input node's own value, not require opening the node first. */}
          <span className="quantity-split port-quantity">
            <TextField
              className="quantity"
              value={
                wired.has(THRESHOLD_PORT)
                  ? suppliedThreshold === undefined ? '' : summarise(suppliedThreshold, 4, format)
                  : formatAuthored(node.threshold, format)
              }
              placeholder="1.5"
              // Sized to its own content, not `.output-editor .quantity`'s
              // width: 100% — that assumed a full-width label row, and this
              // now sits inline on the port row instead.
              autoSize={4}
              disabled={wired.has(THRESHOLD_PORT)}
              title={
                wired.has(THRESHOLD_PORT)
                  ? 'Set by the wire — unplug it to type one by hand again.'
                  : 'A number a student types, with its unit, unless something is wired in.'
              }
              onCommit={(text) => {
                const parsed = parseAuthored(text, format);
                // A bare number typed while a unit is only implied adopts
                // that unit outright, so the field stops relying on the
                // "implied" chip beside it to say what it means.
                const threshold =
                  isDimensionless(parsed.unit.dimension) && impliedUnit !== undefined
                    ? { ...parsed, unit: impliedUnit }
                    : parsed;
                setNode({ threshold });
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
        </li>
      </ul>

      <div
        className="node-value"
        onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: VERDICT_PORT })}
        onMouseLeave={() => data?.onPortHover?.()}
      >
        <span className={`reading${highlightedPorts.has(VERDICT_PORT) ? ' port-highlighted' : ''}`}>
          {verdict === undefined ? '—' : summarise(verdict, 4, format)}
        </span>
        {verdict === undefined ? null : <Sparkline reading={verdict} />}
        <Verdict nodeId={id} />
        <span className={`port-out${highlightedPorts.has(VERDICT_PORT) ? ' port-highlighted' : ''}`}>
          <Symbol name={VERDICT_PORT} />
        </span>
        <Handle
          type="source"
          position={Position.Right}
          id={VERDICT_PORT}
          className={highlightedPorts.has(VERDICT_PORT) ? 'port-highlighted' : ''}
        />
      </div>
    </NodeShell>
  );
}
