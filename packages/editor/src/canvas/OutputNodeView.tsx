/**
 * An output node: a rendering choice over a value that already exists.
 *
 * All four kinds are offered here. A **table**'s columns are extra
 * target ports of its own, and exist only while something is wired to them —
 * the same rule a spectrum port's slots follow. Wiring onto the
 * trailing ghost slot creates a column named after the *node* on the wire's
 * other end (its own title, `nodeLabel` in Canvas.tsx — never the port
 * symbol, which is not what a student typed), and deleting that wire closes
 * the column with it (`closeEmptyColumns`, model/document.ts). Unlike a
 * spectrum's anonymous slots, a table's columns are named and have an order
 * a student cares about, so they also get a manual rename while still wired,
 * and drag to reorder — the same before/after-half drag Notebook.tsx's
 * sections use. Switching an output node's kind goes through
 * `changeOutputKind` (model/document.ts) rather than replacing `output`
 * outright, so a wire the student already made adapts to the new kind's
 * ports instead of being left pointing at one that no longer exists.
 *
 * The check node is the one that earns its place immediately — `S ≥ 1.5` as a
 * badge is what makes the notebook a dimensioning report rather than a list of
 * numbers, and it is the scalar counterpart of the plot's threshold line.
 */

import { useState, type MouseEvent, type ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { parseExpression, toLatex } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';
import {
  COMPARISONS,
  THRESHOLD_PORT,
  VALUE_PORT,
  axes as documentAxes,
  type Comparison,
  type Output,
  type OutputNode,
} from '@joveworks/schema';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import {
  changeOutputKind,
  NEW_COLUMN,
  reframe,
  removeColumn,
  removeNodes,
  renameColumn,
  renameNode,
  reorderColumn,
  updateNode,
} from '../model/document';
import { Equation } from '../Equation';
import { Symbol } from '../Symbol';
import { ParameterLabel } from '../ParameterLabel';
import { display, formatAuthored, parseAuthored, unitLabel } from '../model/quantity';
import { reading, summarise, summariseCheck } from '../model/values';
import { CheckReading } from '../CheckReading';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import type { CanvasFlowNode } from './node-data';
import { slotHandleId } from './spectrumSlots';
import { NumberField, TextField } from './fields';
import { TitleField, TitleText } from './TitleField';

type Range = ReturnType<typeof documentAxes>[number];

function rangeLabel(range: Range): string {
  return range.axisLabel ?? range.label ?? range.id;
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

/** What the node shows when the kernel has an answer for it. */
function Verdict({ nodeId }: { readonly nodeId: string }): ReactElement | null {
  const { analysis } = useGraph();
  const result = analysis.evaluation?.outputs.find((entry) => entry.nodeId === nodeId);
  if (result === undefined) return null;

  if (result.kind === 'check') {
    const failures = result.results.filter((passed) => !passed).length;
    return (
      <span className={`badge ${result.passed ? 'pass' : 'fail'}`}>
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

  return null;
}

export function OutputNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const [columnDrag, setColumnDrag] = useState<
    { readonly over: string; readonly position: 'before' | 'after' } | undefined
  >(undefined);
  const node = document.nodes.find((candidate) => candidate.id === id);
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
  const ports = output.kind === 'table' ? output.columns : [VALUE_PORT];
  const wired = new Set(
    document.edges.filter((edge) => edge.to.node === id).map((edge) => edge.to.port),
  );
  const thresholdWired = (output.kind === 'plot' || output.kind === 'check') && wired.has(THRESHOLD_PORT);

  return (
    <NodeShell
      kind="output"
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
                if (kind === 'plot' && ranges[0] === undefined) return;
                const next: Output =
                  kind === 'print'
                    ? { kind }
                    : kind === 'check'
                      ? { kind, comparison: '>=', threshold: { value: 1, unit: shown?.unit ?? parseUnit('') } }
                      : kind === 'plot'
                        ? { kind }
                        : kind === 'equation'
                          ? { kind }
                          : { kind, columns: [] };
                edit((current) => changeOutputKind(current, id, next));
              }}
            >
              <option value="print">print</option>
              <option value="check">check</option>
              <option value="plot" disabled={ranges.length === 0}>
                plot
              </option>
              <option value="table">table</option>
              <option value="equation">equation</option>
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

          {output.kind === 'plot' ? (
            <>
              {/* Each slot left unset (`''`, meaning `undefined` in the document)
                  is filled automatically at evaluate time from axes the plotted
                  value varies along — the "auto" option's own label shows what
                  that resolved to, so leaving a slot alone is a legible choice,
                  not a silent one. A slot the student does pick is pinned and
                  the kernel never touches it. */}
              <AxisPicker
                name="x axis"
                value={output.x}
                automatic={`auto${plotResult === undefined ? '' : ` (${plotResult.x.axis.label})`}`}
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
                automatic={`auto${plotResult?.series2 === undefined ? ' (none)' : ` (${plotResult.series2.axis.label})`}`}
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
                automatic={`auto${plotResult?.facet === undefined ? ' (none)' : ` (${plotResult.facet.axis.label})`}`}
                ranges={ranges}
                excluded={[output.x, output.series]}
                onChange={(chosen) => {
                  const { facet: _dropped, ...rest } = output;
                  setOutput(chosen === undefined ? rest : { ...rest, facet: chosen });
                }}
              />
              {/* threshold now lives on the port row below, always visible —
                  a typed default with a wire that can override it (the same
                  reasoning CompareNodeView's threshold field states) rather
                  than buried in this panel. */}
              {output.series === undefined && plotResult?.series2 === undefined ? null : (
                <label>
                  contour
                  <input
                    className="nodrag"
                    type="checkbox"
                    checked={output.contour ?? false}
                    onChange={(event) => setOutput({ ...output, contour: event.target.checked })}
                  />
                </label>
              )}
            </>
          ) : null}

          {output.kind === 'table' ? (
            <label className="wide">
              columns
              <ul className="table-columns">
                {output.columns.map((column) => (
                  <li
                    key={column}
                    className={`table-column nodrag${
                      columnDrag?.over === column ? ` drag-over-${columnDrag.position}` : ''
                    }`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', column);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const position = event.clientY - bounds.top < bounds.height / 2 ? 'before' : 'after';
                      setColumnDrag({ over: column, position });
                    }}
                    onDragLeave={() => setColumnDrag(undefined)}
                    onDrop={(event) => {
                      event.preventDefault();
                      const position = columnDrag?.position;
                      setColumnDrag(undefined);
                      if (position === undefined) return;
                      const source = event.dataTransfer.getData('text/plain');
                      if (source.length === 0) return;
                      edit((current) => reorderColumn(current, id, source, column, position));
                    }}
                  >
                    <span className="column-grip" aria-hidden="true">
                      ⠿
                    </span>
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
        {ports.map((name) => (
          <li
            key={name}
            className={`port${highlightedPorts.has(name) ? ' port-highlighted' : ''}`}
            onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: name })}
            onMouseLeave={() => data?.onPortHover?.()}
          >
            {/* Every target handle is slot-suffixed now (spectrumSlots.ts),
                even a single-occupancy one, since Canvas's edge projection
                does not know port kinds and suffixes uniformly. */}
            <Handle
              type="target"
              position={Position.Left}
              id={slotHandleId(name, 0)}
              className={highlightedPorts.has(name) ? 'port-highlighted' : ''}
            />
            <ParameterLabel
              name={name}
              unit={analysis.resolution?.targets.get(`${id}.${name}`)?.unit}
              nameClassName="port-name"
              unitClassName="port-unit"
            />
          </li>
        ))}
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
            <span className="quantity-split port-quantity">
              <TextField
                className="quantity"
                value={
                  thresholdWired
                    ? plotResult?.threshold === undefined
                      ? ''
                      : display(plotResult.threshold, plotResult.unit)
                    : output.threshold === undefined
                      ? ''
                      : formatAuthored(output.threshold, format)
                }
                placeholder="none"
                // Sized to its own content, same as compare's threshold
                // field on the same port-row layout — a full-width field
                // wraps and pushes the row below it.
                autoSize={4}
                disabled={thresholdWired}
                title={
                  thresholdWired
                    ? 'Set by the wire — unplug it to type one by hand again.'
                    : 'A number a student types, with its unit, unless something is wired in.'
                }
                onCommit={(text) => {
                  const { threshold: _dropped, ...rest } = output;
                  setOutput(
                    text.trim().length === 0 ? rest : { ...rest, threshold: parseAuthored(text, format) },
                  );
                }}
              />
            </span>
          </li>
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
                value={formatAuthored(output.threshold, format)}
                placeholder="1.5"
                autoSize={4}
                title={
                  thresholdWired
                    ? 'Overridden by the wire — this is what applies when it is removed.'
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
        ) : output.kind === 'table' ? null : (
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
            {value === undefined ? null : <Sparkline reading={value} />}
          </>
        )}
        <Verdict nodeId={id} />
      </div>
    </NodeShell>
  );
}
