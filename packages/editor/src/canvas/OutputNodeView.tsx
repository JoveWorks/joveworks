/**
 * An output node: a rendering choice over a value that already exists.
 *
 * All four kinds are offered here. A **table**'s columns are extra
 * target ports of its own, and exist only while something is wired to them —
 * the same rule a variadic port's slots follow. Wiring onto the
 * trailing ghost slot creates a column named after the *node* on the wire's
 * other end (its own title, `nodeLabel` in Canvas.tsx — never the port
 * symbol, which is not what a student typed), and deleting that wire closes
 * the column with it (`closeEmptyColumns`, model/document.ts). Unlike a
 * variadic port's anonymous slots, a table's columns are named and have an order
 * a student cares about, so they get a manual rename here; order itself,
 * decimal figures and marked rows are edited in the notebook instead
 * (Notebook.tsx), where the rendered table is. Switching an output node's
 * kind goes through `changeOutputKind` (model/document.ts) rather than
 * replacing `output` outright, so a wire the student already made adapts to
 * the new kind's ports instead of being left pointing at one that no longer
 * exists.
 *
 * The check node is the one that earns its place immediately — `S ≥ 1.5` as a
 * badge is what makes the notebook a dimensioning report rather than a list of
 * numbers, and it is the scalar counterpart of the plot's threshold line.
 */

import { useEffect, type MouseEvent, type ReactElement } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';

import { parseExpression, toLatex } from '@joveworks/kernel';
import { parseUnit, type NumberFormat, type Unit } from '@joveworks/units';
import {
  COMPARISONS,
  OBJECTIVE_PORT,
  X_PORT,
  Y_PORT,
  THRESHOLD_PORT,
  VALUE_PORT,
  ALONG_PORT,
  plotMeasures,
  plotThresholdPort,
  axes as documentAxes,
  localize,
  type Comparison,
  type ObjectiveDirection,
  type Output,
  type OutputNode,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { OUTPUT_HELP_URLS } from '../help-links';
import { toUnitsFormat } from '../model/numberFormat';
import {
  changeOutputKind,
  defaultOutput,
  NEW_COLUMN,
  NEW_PLOT_MEASURE,
  reframe,
  removeColumn,
  removePlotMeasure,
  removeNodes,
  renameColumn,
  renameNode,
  updateNode,
} from '../model/document';
import { Equation } from '../Equation';
import { Symbol } from '../Symbol';
import { ParameterLabel } from '../ParameterLabel';
import { display, formatAuthored, parseAuthored, unitLabel } from '../model/quantity';
import { checkVerdict, reading, summarise, summariseCheck, type Reading } from '../model/values';
import { CheckReading } from '../CheckReading';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './portSlots';
import { NumberField, TextField } from './fields';
import { TitleField, TitleText } from './TitleField';

type Range = ReturnType<typeof documentAxes>[number];

function rangeLabel(range: Range): string {
  return range.axisLabel ?? range.label ?? range.id;
}

/** What a Check or Plot threshold field reads while a wire overrides its stored fallback. */
export function thresholdFieldText(
  wired: boolean,
  supplied: Reading | undefined,
  fallback: { readonly value: number; readonly unit: Unit } | undefined,
  format: NumberFormat,
): string {
  if (wired) return supplied === undefined ? '' : summarise(supplied, 4, format);
  return fallback === undefined ? '' : formatAuthored(fallback, format);
}

/** Native option elements cannot contain KaTeX markup, so axis choices use a small HTML menu. */
function AxisPicker({
  name,
  value,
  automatic,
  ranges,
  excluded,
  onChange,
}: {
  readonly name: string;
  readonly value: string | undefined;
  readonly automatic: string;
  readonly ranges: readonly Range[];
  readonly excluded: readonly (string | undefined)[];
  readonly onChange: (axis: string | undefined) => void;
}): ReactElement {
  const selected = ranges.find((range) => range.id === value);
  const chosen = value === undefined ? automatic : (selected === undefined ? value : rangeLabel(selected));
  const pick = (axis: string | undefined, event: MouseEvent<HTMLButtonElement>): void => {
    onChange(axis);
    event.currentTarget.closest('details')?.removeAttribute('open');
  };
  return (
    <label>
      {name}
      <details className="axis-picker nodrag">
        <summary>
          <TitleText value={chosen} />
        </summary>
        <div className="axis-picker-options">
          <button type="button" onClick={(event) => pick(undefined, event)}>
            <TitleText value={automatic} />
          </button>
          {ranges.filter((range) => !excluded.includes(range.id)).map((range) => (
            <button key={range.id} type="button" onClick={(event) => pick(range.id, event)}>
              <TitleText value={rangeLabel(range)} />
            </button>
          ))}
        </div>
      </details>
    </label>
  );
}

/**
 * The Check nodes an output references by id, as checkboxes.
 *
 * No wire connects these — Feasibility and Best Design both reference
 * existing Check nodes by id, the same "name it, don't wire it" pattern a
 * plot's axis picker already uses for range nodes. Hovering a row highlights
 * the Check node it names on the canvas (and lights back up here if that
 * Check is hovered from its own notebook entry instead), so the reference
 * stays visible even without a wire.
 */
function CheckPicker({
  checkNodes,
  checks,
  hovered,
  setHovered,
  onChange,
}: {
  readonly checkNodes: readonly OutputNode[];
  readonly checks: readonly string[];
  readonly hovered: ReadonlySet<string>;
  readonly setHovered: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;
  readonly onChange: (checks: readonly string[]) => void;
}): ReactElement {
  return (
    <label className="wide">
      checks
      <ul className="check-list nodrag">
        {checkNodes.length === 0 ? (
          <li className="check-list-empty">no Check nodes in this document yet</li>
        ) : (
          checkNodes.map((checkNode) => (
            <li key={checkNode.id}>
              <label
                className={`check-list-item${hovered.has(checkNode.id) ? ' check-list-item-active' : ''}`}
                onMouseEnter={() => setHovered(() => new Set([checkNode.id]))}
                onMouseLeave={() => setHovered(() => new Set())}
              >
                <input
                  type="checkbox"
                  checked={checks.includes(checkNode.id)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...checks, checkNode.id]
                        : checks.filter((entry) => entry !== checkNode.id),
                    )
                  }
                />
                <span className="check-list-label">{checkNode.label ?? checkNode.id}</span>
              </label>
            </li>
          ))
        )}
      </ul>
    </label>
  );
}

/** What the node shows when the kernel has an answer for it. */
function Verdict({ nodeId }: { readonly nodeId: string }): ReactElement | null {
  const { analysis } = useGraph();
  const result = analysis.evaluation?.outputs.find((entry) => entry.nodeId === nodeId);
  if (result === undefined) return null;

  if (result.kind === 'check') {
    const failures = result.results.filter((passed) => !passed).length;
    return (
      <span className={`badge ${checkVerdict(result.results)}`}>
        {result.passed
          ? 'passes'
          : `fails at ${failures} of ${result.results.length} point${
              result.results.length === 1 ? '' : 's'
            }`}
      </span>
    );
  }

  if (result.kind === 'plot') {
    return <span className="badge plot">plotted in the notebook</span>;
  }

  if (result.kind === 'table') {
    return (
      <span className="badge plot">
        {result.columns.length} column{result.columns.length === 1 ? '' : 's'}
      </span>
    );
  }

  if (result.kind === 'feasibility') {
    const passing = result.mask.filter(Boolean).length;
    const verdict = passing === result.mask.length ? 'pass' : passing === 0 ? 'fail' : 'partial';
    return (
      <span className={`badge ${verdict}`}>
        {passing === result.mask.length
          ? 'passes everywhere'
          : passing === 0
            ? 'fails everywhere'
            : `passes at ${passing} of ${result.mask.length} points`}
      </span>
    );
  }

  if (result.kind === 'sensitivity') {
    const top = result.rankings[0];
    return <span className="badge plot">{top === undefined ? 'no candidates' : `top driver: ${top.label}`}</span>;
  }

  if (result.kind === 'stress') {
    const rankable = result.traces.filter((trace) => trace.rankable).length;
    return <span className="badge plot">{rankable} margin trace{rankable === 1 ? '' : 's'}</span>;
  }

  if (result.kind === 'pareto') {
    if (result.feasibleCount === 0) return <span className="badge fail">nothing feasible</span>;
    return (
      <span className="badge plot">
        {result.frontCount} of {result.feasibleCount} on the front
      </span>
    );
  }

  if (result.kind === 'bestDesign') {
    if (result.winner === undefined) return <span className="badge fail">nothing feasible</span>;
    const where = result.winner.at
      .map((entry) => (typeof entry.value === 'number' ? `${entry.axis.label} ${display(entry.value, entry.unit)}` : entry.value))
      .join(', ');
    return <span className="badge pass">{where.length === 0 ? 'chosen' : where}</span>;
  }

  return null;
}

export function OutputNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered, setHovered } = useGraph();
  const { numberFormat, locale } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  const tableColumns = node?.kind === 'output' && node.output.kind === 'table' ? node.output.columns : undefined;
  const plotMeasureIds = node?.kind === 'output' && node.output.kind === 'plot'
    ? plotMeasures(node.output).map((measure) => measure.id)
    : undefined;
  // React Flow only remeasures a handle's screen position on a node resize
  // (its ResizeObserver) — reordering a table's columns (Notebook.tsx) keeps
  // the same port count and node height, so nothing triggers that on its
  // own. Without this, an edge stays visually anchored to a handle's old
  // position after a reorder even though the wire itself (keyed by port
  // name, not position) is still attached to the right one — the port and
  // its edge visibly disagree until something else forces a remeasure.
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    if (tableColumns !== undefined || plotMeasureIds !== undefined) updateNodeInternals(id);
  }, [id, updateNodeInternals, JSON.stringify(tableColumns), JSON.stringify(plotMeasureIds)]);
  if (node === undefined || node.kind !== 'output') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const output = node.output;
  // An output node produces nothing of its own — it renders what is wired to it
  // — so the value it shows is the source port's, in the unit this node
  // chose. Where the kernel has already produced the output result, that is the
  // authority, because it applied the same choice.
  const source = document.edges.find((edge) => edge.to.node === id && edge.to.port === VALUE_PORT);
  const shown =
    source === undefined ? undefined : reading(analysis, source.from.node, source.from.port);
  const result = analysis.evaluation?.outputs.find((entry) => entry.nodeId === id);
  const value =
    result?.kind === 'print' || result?.kind === 'check' || result?.kind === 'plot'
      ? { series: result.series, unit: result.unit }
      : shown;
  const plotResult = result?.kind === 'plot' ? result : undefined;
  const checkResult = result?.kind === 'check' ? result : undefined;
  const equationResult = result?.kind === 'equation' ? result : undefined;
  const feasibilityResult = result?.kind === 'feasibility' ? result : undefined;
  const sensitivityResult = result?.kind === 'sensitivity' ? result : undefined;
  // Not the upstream formula's own id — a closure's is always the literal
  // 'closure' (kernel/closure.ts), which would be a useless caption default
  // repeated across every closure-sourced equation node.
  const captionPlaceholder =
    output.kind === 'equation'
      ? (equationResult?.citation ?? node.label ?? id)
      : 'the 1.5 threshold is crossed at 38 mm';

  const setOutput = (next: Output): void =>
    edit((current) => updateNode<OutputNode>(current, id, (entry) => ({ ...entry, output: next })));

  const ranges = documentAxes(document);
  const checkNodes = document.nodes.filter(
    (candidate): candidate is OutputNode => candidate.kind === 'output' && candidate.output.kind === 'check',
  );
  const ports =
    output.kind === 'table'
      ? output.columns
      : output.kind === 'plot'
        ? plotMeasures(output).map((measure) => measure.id)
      : output.kind === 'feasibility'
        ? []
        : output.kind === 'reliability'
          ? []
          : output.kind === 'stress'
            ? [ALONG_PORT]
        : output.kind === 'bestDesign'
          ? [OBJECTIVE_PORT]
          : output.kind === 'pareto'
            ? [X_PORT, Y_PORT]
            : [VALUE_PORT];
  const wired = new Set(
    document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port),
  );
  const thresholdWired = (output.kind === 'plot' || output.kind === 'check') && wired.has(THRESHOLD_PORT);
  const thresholdSource = document.edges.find(
    (edge) => edge.to.node === id && edge.to.port === THRESHOLD_PORT,
  );
  const suppliedThreshold = thresholdSource === undefined
    ? undefined
    : reading(analysis, thresholdSource.from.node, thresholdSource.from.port);

  return (
    <NodeShell
      kind="output"
      helpUrl={OUTPUT_HELP_URLS[output.kind]}
      state={analysis.states.get(id) ?? 'ok'}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
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
      subtitle={output.kind}
      detail={
        <div className="output-editor">
          <label>
            kind
            <select
              className="nodrag"
              value={output.kind}
              onChange={(event) => {
                const kind = event.target.value as Output['kind'];
                edit((current) => changeOutputKind(current, id, defaultOutput(kind, shown?.unit)));
              }}
            >
              <option value="print">print</option>
              <option value="check">check</option>
              <option value="plot">plot</option>
              <option value="table">table</option>
              <option value="equation">equation</option>
              <option value="feasibility">feasibility</option>
              <option value="sensitivity">sensitivity</option>
              <option value="stress">assumption stress</option>
              <option value="bestDesign">best design</option>
              <option value="pareto">pareto</option>
              <option value="distribution">distribution</option>
              <option value="reliability">reliability</option>
            </select>
          </label>

          {output.kind === 'print' ? (
            <>
              <label>
                unit
                <TextField
                  className="unit"
                  value={output.unit?.symbol ?? ''}
                  placeholder={unitLabel(shown?.unit)}
                  title="Empty means the unit the source port declares."
                  onCommit={(text) =>
                    setOutput(
                      text.trim().length === 0
                        ? { kind: 'print', ...(output.figures === undefined ? {} : { figures: output.figures }) }
                        : { ...output, unit: parseUnit(text) },
                    )
                  }
                />
              </label>
              <label>
                figures
                <NumberField
                  value={output.figures ?? 4}
                  integer
                  minimum={1}
                  onCommit={(figures) => setOutput({ ...output, figures })}
                />
              </label>
            </>
          ) : null}
          {/* `figures` is a whole-number count, not a value with the document's own
              punctuation, so it stays on the default plain formatting above — a
              global thousands separator has nothing to group in a number under 20. */}

          {output.kind === 'check' ? (
            <label>
              is
              <select
                className="nodrag"
                value={output.comparison}
                onChange={(event) =>
                  setOutput({ ...output, comparison: event.target.value as Comparison })
                }
              >
                {COMPARISONS.map((comparison) => (
                  <option key={comparison} value={comparison}>
                    {comparison}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {output.kind === 'plot' ? <p>Axes, labels and plot types are inferred. Fine-tune them beside the NodeBook figure.</p> : null}

          {output.kind === 'stress' ? (
            <CheckPicker
              checkNodes={checkNodes}
              checks={output.checks}
              hovered={hovered}
              setHovered={setHovered}
              onChange={(checks) => setOutput({ ...output, checks })}
            />
          ) : null}

          {output.kind === 'bestDesign' ? (
            <>
              <label>
                wants the
                <select
                  className="nodrag"
                  value={output.direction}
                  onChange={(event) =>
                    setOutput({ ...output, direction: event.target.value as 'minimize' | 'maximize' })
                  }
                >
                  <option value="minimize">smallest</option>
                  <option value="maximize">largest</option>
                </select>
              </label>
              {/* The same picker Feasibility uses, and deliberately so: the
                  bounds a student already built are the constraints here
                  too. Unlike Feasibility, an empty list is legal — it means
                  an unconstrained min or max. */}
              <CheckPicker
                checkNodes={checkNodes}
                checks={output.checks}
                hovered={hovered}
                setHovered={setHovered}
                onChange={(checks) => setOutput({ ...output, checks })}
              />
            </>
          ) : null}

          {output.kind === 'pareto' ? (
            <>
              <label>
                x wants the
                <select
                  className="nodrag"
                  value={output.xDirection}
                  onChange={(event) =>
                    setOutput({ ...output, xDirection: event.target.value as ObjectiveDirection })
                  }
                >
                  <option value="minimize">smallest</option>
                  <option value="maximize">largest</option>
                </select>
              </label>
              <label>
                y wants the
                <select
                  className="nodrag"
                  value={output.yDirection}
                  onChange={(event) =>
                    setOutput({ ...output, yDirection: event.target.value as ObjectiveDirection })
                  }
                >
                  <option value="minimize">smallest</option>
                  <option value="maximize">largest</option>
                </select>
              </label>
              {/* The same picker again — a candidate that fails a bound the
                  student already wrote should not be allowed to win a
                  trade-off. Empty is legal and means every candidate competes. */}
              <CheckPicker
                checkNodes={checkNodes}
                checks={output.checks}
                hovered={hovered}
                setHovered={setHovered}
                onChange={(checks) => setOutput({ ...output, checks })}
              />
            </>
          ) : null}

          {output.kind === 'feasibility' ? (
            <>
              <CheckPicker
                checkNodes={checkNodes}
                checks={output.checks}
                hovered={hovered}
                setHovered={setHovered}
                onChange={(checks) => setOutput({ ...output, checks })}
              />
              <AxisPicker
                name="x axis"
                value={output.x}
                automatic={`auto${feasibilityResult === undefined ? '' : ` (${feasibilityResult.x.axis.label})`}`}
                ranges={ranges}
                excluded={[output.series, output.facet]}
                onChange={(chosen) => {
                  const { x: _dropped, ...rest } = output;
                  setOutput(chosen === undefined ? rest : { ...rest, x: chosen });
                }}
              />
              <AxisPicker
                name="series"
                value={output.series}
                automatic={`auto${feasibilityResult?.series2 === undefined ? ' (none)' : ` (${feasibilityResult.series2.axis.label})`}`}
                ranges={ranges}
                excluded={[output.x, output.facet]}
                onChange={(chosen) => {
                  const { series: _dropped, ...rest } = output;
                  setOutput(chosen === undefined ? rest : { ...rest, series: chosen });
                }}
              />
              <AxisPicker
                name="facet"
                value={output.facet}
                automatic={`auto${feasibilityResult?.facet === undefined ? ' (none)' : ` (${feasibilityResult.facet.axis.label})`}`}
                ranges={ranges}
                excluded={[output.x, output.series]}
                onChange={(chosen) => {
                  const { facet: _dropped, ...rest } = output;
                  setOutput(chosen === undefined ? rest : { ...rest, facet: chosen });
                }}
              />
            </>
          ) : null}

          {output.kind === 'distribution' ? (
            <>
              <label>view
                <select value={output.view} onChange={(event) => setOutput({ ...output, view: event.target.value as 'histogram' | 'cdf' })}>
                  <option value="histogram">histogram</option>
                  <option value="cdf">CDF</option>
                </select>
              </label>
              <label>bins
                <NumberField value={output.bins ?? 20} integer minimum={1} onCommit={(bins) => setOutput({ ...output, bins })} />
              </label>
              <label>percentiles
                <TextField value={(output.percentiles ?? []).join(', ')} placeholder="5, 50, 95" onCommit={(text) => {
                  const percentiles = text.split(',').map(Number).filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
                  setOutput({ ...output, percentiles });
                }} />
              </label>
              <AxisPicker name="over" value={output.over} automatic="auto (trial)" ranges={ranges} excluded={[output.facet]} onChange={(chosen) => {
                const { over: _dropped, ...rest } = output;
                setOutput(chosen === undefined ? rest : { ...rest, over: chosen });
              }} />
              <AxisPicker name="facet" value={output.facet} automatic="none" ranges={ranges} excluded={[output.over]} onChange={(chosen) => {
                const { facet: _dropped, ...rest } = output;
                setOutput(chosen === undefined ? rest : { ...rest, facet: chosen });
              }} />
              <label><input type="checkbox" checked={output.fit ?? false} onChange={(event) => setOutput({ ...output, fit: event.target.checked })} /> normal fit</label>
            </>
          ) : null}

          {output.kind === 'reliability' ? (
            <>
              <CheckPicker checkNodes={checkNodes} checks={output.checks} hovered={hovered} setHovered={setHovered} onChange={(checks) => setOutput({ ...output, checks })} />
              <label>confidence
                <NumberField value={(output.confidence ?? 0.95) * 100} minimum={1} onCommit={(confidence) => setOutput({ ...output, confidence: Math.min(99.99, confidence) / 100 })} />%
              </label>
            </>
          ) : null}

          {output.kind === 'table' ? (
            <label className="wide">
              columns
              {/* Order, per-column decimal figures and marked rows are all
                  edited in the notebook (Notebook.tsx), where the rendered
                  table actually is — this list is rename and remove only. */}
              <ul className="table-columns">
                {output.columns.map((column) => (
                  <li key={column} className="table-column nodrag">
                    <TextField
                      className="column-name"
                      value={column}
                      autoSize={1}
                      title="Wires stay attached across a rename — a rename is a relabel, not a rewire."
                      onCommit={(next) => {
                        if (next.trim().length === 0) throw new Error('a column needs a name');
                        if (next !== column && output.columns.includes(next)) {
                          throw new Error(`'${next}' is already a column here`);
                        }
                        edit((current) => renameColumn(current, id, column, next));
                      }}
                    />
                    <button
                      type="button"
                      className="column-remove"
                      title={`remove column '${column}'`}
                      onClick={() => edit((current) => removeColumn(current, id, column))}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {output.columns.length === 0 ? (
                  <li className="table-column table-column-empty">wire something to add a column</li>
                ) : null}
              </ul>
            </label>
          ) : null}

          <label className="wide">
            caption
            <TextField
              className="caption"
              value={node.caption ?? ''}
              placeholder={captionPlaceholder}
              multiline
              onCommit={(caption) =>
                edit((current) =>
                  updateNode<OutputNode>(current, id, (entry) => {
                    const { caption: _cleared, ...rest } = entry;
                    return caption.trim().length === 0 ? rest : { ...rest, caption };
                  }),
                )
              }
            />
          </label>
        </div>
      }
    >
      <ul className="ports">
        {ports.map((name) => {
          // Neither a table column nor a plot/check's value port describes
          // itself — it shows whatever is wired to it, so its tooltip is
          // borrowed from the upstream formula's own output description.
          const portSource = document.edges.find((edge) => edge.to.node === id && edge.to.port === name);
          const description =
            portSource === undefined
              ? undefined
              : analysis.formulas
                  .get(portSource.from.node)
                  ?.outputs.find((output) => output.name === portSource.from.port)?.description;
          return (
            <li
              key={name}
              className={`port${highlightedPorts.has(name) ? ' port-highlighted' : ''}`}
              {...(description === undefined ? {} : { title: localize(description, locale) })}
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: name })}
              onMouseLeave={() => data?.onPortHover?.()}
            >
              {/* Every target handle is slot-suffixed now (portSlots.ts),
                  even a single-occupancy one, since Canvas's edge projection
                  does not know port kinds and suffixes uniformly. */}
              <Handle
                type="target"
                position={Position.Left}
                id={slotHandleId(name, 0)}
                className={highlightedPorts.has(name) ? 'port-highlighted' : ''}
              />
              {output.kind === 'plot' ? (
                <>
                  <span className="port-name"><TitleText value={plotMeasures(output).find((measure) => measure.id === name)?.label ?? name} /></span>
                  {expanded.has(id) ? (
                    <button
                      type="button"
                      className="remove-column nodrag"
                      title="Remove this plotted value"
                      onClick={() => edit((current) => removePlotMeasure(current, id, name))}
                    >×</button>
                  ) : null}
                </>
              ) : (
                <ParameterLabel
                  name={name}
                  unit={analysis.resolution?.targets.get(`${id}.${name}`)?.unit}
                  nameClassName="port-name"
                  unitClassName="port-unit"
                />
              )}
            </li>
          );
        })}
        {output.kind === 'table' ? (
          <li
            className={`port port-open${highlightedPorts.has(NEW_COLUMN) ? ' port-highlighted' : ''}`}
            title="Wire something here to add a column named after it."
            onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: NEW_COLUMN })}
            onMouseLeave={() => data?.onPortHover?.()}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={slotHandleId(NEW_COLUMN, 'open')}
              className={highlightedPorts.has(NEW_COLUMN) ? 'port-highlighted' : ''}
            />
          </li>
        ) : null}
        {output.kind === 'plot' ? (
          <li
            className={`port port-open${highlightedPorts.has(NEW_PLOT_MEASURE) ? ' port-highlighted' : ''}`}
            title="Wire a numeric value here to add it to this plot."
            onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: NEW_PLOT_MEASURE })}
            onMouseLeave={() => data?.onPortHover?.()}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={slotHandleId(NEW_PLOT_MEASURE, 'open')}
              className={highlightedPorts.has(NEW_PLOT_MEASURE) ? 'port-highlighted' : ''}
            />
          </li>
        ) : null}
        {output.kind === 'plot' ? (
          <>{plotMeasures(output).map((measure) => {
            const thresholdPort = plotThresholdPort(measure.id);
            const thresholdSourceForMeasure = document.edges.find(
              (edge) => edge.to.node === id && edge.to.port === thresholdPort,
            );
            const wiredForMeasure = thresholdSourceForMeasure !== undefined;
            const suppliedForMeasure = thresholdSourceForMeasure === undefined
              ? undefined
              : reading(analysis, thresholdSourceForMeasure.from.node, thresholdSourceForMeasure.from.port);
            return (
              <li
                key={thresholdPort}
                className={`port${highlightedPorts.has(thresholdPort) ? ' port-highlighted' : ''}`}
                onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: thresholdPort })}
                onMouseLeave={() => data?.onPortHover?.()}
              >
                <Handle type="target" position={Position.Left} id={slotHandleId(thresholdPort, 0)} />
                <span className="port-name">{measure.label ?? measure.id} threshold</span>
                <span className="quantity-split port-quantity">
                  <TextField
                    className="quantity"
                    value={thresholdFieldText(wiredForMeasure, suppliedForMeasure, measure.threshold, format)}
                    placeholder="none"
                    autoSize={4}
                    disabled={wiredForMeasure}
                    onCommit={(text) => setOutput({
                      kind: 'plot',
                      measures: plotMeasures(output).map((entry) => {
                        if (entry.id !== measure.id) return entry;
                        const { threshold: _dropped, ...rest } = entry;
                        return text.trim().length === 0 ? rest : { ...rest, threshold: parseAuthored(text, format) };
                      }),
                    })}
                  />
                </span>
              </li>
            );
          })}</>
        ) : null}
        {output.kind === 'check' ? (
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
              unit={analysis.resolution?.targets.get(`${id}.${THRESHOLD_PORT}`)?.unit}
              nameClassName="port-name"
              unitClassName="port-unit"
            />
            {/* Mandatory, unlike plot's — always shows and always accepts the
                typed default, the same way CompareNodeView's threshold row
                does, since a check's fallback stays meaningful even while a
                wire overrides it (there's no "clear it" affordance). */}
            <span className="quantity-split port-quantity">
              <TextField
                className="quantity"
                value={thresholdFieldText(thresholdWired, suppliedThreshold, output.threshold, format)}
                placeholder="1.5"
                autoSize={4}
                disabled={thresholdWired}
                title={
                  thresholdWired
                    ? 'Set by the wire — unplug it to type one by hand again.'
                    : 'A number a student types, with its unit, unless something is wired in.'
                }
                onCommit={(text) => {
                  if (text.trim().length === 0) return;
                  setOutput({ ...output, threshold: parseAuthored(text, format) });
                }}
              />
            </span>
          </li>
        ) : null}
      </ul>

      <div className="node-value">
        {output.kind === 'equation' ? (
          equationResult === undefined ? (
            <span className="reading">—</span>
          ) : (
            <Equation latex={toLatex(parseExpression(equationResult.expression))} displayMode={false} />
          )
        ) : output.kind === 'table' ||
          output.kind === 'feasibility' ||
          output.kind === 'sensitivity' ||
          output.kind === 'stress' ||
          output.kind === 'bestDesign' ||
          output.kind === 'reliability' ? null : (
          <>
            <span className="reading">
              {value === undefined ? (
                '—'
              ) : checkResult === undefined ? (
                summarise(value, output.kind === 'print' ? output.figures ?? 4 : 4, format)
              ) : (
                <CheckReading segments={summariseCheck(value, checkResult.results, 4, format)} />
              )}
            </span>
            {value === undefined ? null : (
              <Sparkline reading={value} {...(checkResult === undefined ? {} : { threshold: checkResult.threshold })} />
            )}
          </>
        )}
        <Verdict nodeId={id} />
      </div>
    </NodeShell>
  );
}
