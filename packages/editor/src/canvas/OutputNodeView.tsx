/**
 * An output node: a rendering choice over a value that already exists (S60).
 *
 * All four of S33's kinds are offered here. A **table**'s columns are extra
 * target ports of its own, and exist only while something is wired to them —
 * the same rule a spectrum port's slots follow (S71). Wiring onto the
 * trailing ghost slot creates a column named after the *node* on the wire's
 * other end (its own title, `nodeLabel` in Canvas.tsx — never the port
 * symbol, which is not what a student typed), and deleting that wire closes
 * the column with it (`closeEmptyColumns`, model/document.ts). Unlike a
 * spectrum's anonymous slots, a table's columns are named and have an order
 * a student cares about, so they also get a manual rename while still wired,
 * and drag to reorder — the same before/after-half drag Notebook.tsx's
 * sections use.
 *
 * The check node is the one that earns its place immediately — `S ≥ 1.5` as a
 * badge is what makes the notebook a dimensioning report rather than a list of
 * numbers, and it is the scalar counterpart of the plot's threshold line (S33).
 */

import { useState, type ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { parseUnit } from '@mds/units';
import {
  COMPARISONS,
  VALUE_PORT,
  axes as documentAxes,
  type Comparison,
  type Output,
  type OutputNode,
} from '@mds/schema';

import { useGraph } from '../graph-context';
import {
  NEW_COLUMN,
  pruneEdgesTo,
  reframe,
  removeColumn,
  removeNodes,
  renameColumn,
  reorderColumn,
  updateNode,
} from '../model/document';
import { Symbol } from '../Symbol';
import { formatAuthored, parseAuthored, unitLabel } from '../model/quantity';
import { reading, summarise } from '../model/values';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { slotHandleId } from './spectrumSlots';
import { NumberField, TextField } from './fields';

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

export function OutputNodeView({ id, selected }: NodeProps): ReactElement | null {
  const { document, analysis, edit, pinned, togglePin } = useGraph();
  const [columnDrag, setColumnDrag] = useState<
    { readonly over: string; readonly position: 'before' | 'after' } | undefined
  >(undefined);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'output') return null;

  const output = node.output;
  // An output node produces nothing of its own — it renders what is wired to it
  // (S60) — so the value it shows is the source port's, in the unit this node
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

  const setOutput = (next: Output): void =>
    edit((current) => updateNode<OutputNode>(current, id, (entry) => ({ ...entry, output: next })));

  const ranges = documentAxes(document);
  const ports = output.kind === 'table' ? output.columns : [VALUE_PORT];

  return (
    <NodeShell
      kind="output"
      state={analysis.states.get(id) ?? 'ok'}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      selected={selected ?? false}
      pinned={pinned.has(id)}
      onTogglePin={() => togglePin(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={
        <TextField
          className="title"
          value={node.label ?? id}
          onCommit={(label) =>
            edit((current) =>
              updateNode<OutputNode>(current, id, (entry) => ({ ...entry, label })),
            )
          }
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
                // Leaving `table` behind: only its `value` column, if any,
                // means the same thing under the new kind — the rest of its
                // columns are ports the new kind does not have.
                const keep = new Set([VALUE_PORT]);
                edit((current) => {
                  const withPrunedEdges =
                    output.kind === 'table' ? pruneEdgesTo(current, id, keep) : current;
                  const next: Output =
                    kind === 'print'
                      ? { kind }
                      : kind === 'check'
                        ? {
                            kind,
                            comparison: '>=',
                            threshold: { value: 1, unit: shown?.unit ?? parseUnit('') },
                          }
                        : kind === 'plot'
                          ? { kind, x: ranges[0]?.id ?? '' }
                          : { kind, columns: [] };
                  if (kind === 'plot' && ranges[0] === undefined) return withPrunedEdges;
                  return updateNode<OutputNode>(withPrunedEdges, id, (entry) => ({
                    ...entry,
                    output: next,
                  }));
                });
              }}
            >
              <option value="print">print</option>
              <option value="check">check</option>
              <option value="plot" disabled={ranges.length === 0}>
                plot
              </option>
              <option value="table">table</option>
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

          {output.kind === 'check' ? (
            <>
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
              <label>
                threshold
                <TextField
                  className="quantity"
                  value={formatAuthored(output.threshold)}
                  placeholder="1.5"
                  title="A number a student types, with its unit (S58)."
                  onCommit={(text) => setOutput({ ...output, threshold: parseAuthored(text) })}
                />
              </label>
            </>
          ) : null}

          {output.kind === 'plot' ? (
            <>
              <label>
                x axis
                <select
                  className="nodrag"
                  value={output.x}
                  onChange={(event) => setOutput({ ...output, x: event.target.value })}
                >
                  {ranges.map((range) => (
                    <option key={range.id} value={range.id}>
                      {range.axisLabel ?? range.label ?? range.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                series
                <select
                  className="nodrag"
                  value={output.series ?? ''}
                  onChange={(event) => {
                    const chosen = event.target.value;
                    const { series: _dropped, ...rest } = output;
                    setOutput(chosen === '' ? rest : { ...rest, series: chosen });
                  }}
                >
                  <option value="">none</option>
                  {ranges
                    .filter((range) => range.id !== output.x)
                    .map((range) => (
                      <option key={range.id} value={range.id}>
                        {range.axisLabel ?? range.label ?? range.id}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                threshold
                <TextField
                  className="quantity"
                  value={output.threshold === undefined ? '' : formatAuthored(output.threshold)}
                  placeholder="none"
                  onCommit={(text) => {
                    const { threshold: _dropped, ...rest } = output;
                    setOutput(
                      text.trim().length === 0 ? rest : { ...rest, threshold: parseAuthored(text) },
                    );
                  }}
                />
              </label>
              {output.series === undefined ? null : (
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
              placeholder="the 1.5 threshold is crossed at 38 mm"
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
          <li key={name} className="port">
            {/* Every target handle is slot-suffixed now (spectrumSlots.ts),
                even a single-occupancy one, since Canvas's edge projection
                does not know port kinds and suffixes uniformly. */}
            <Handle type="target" position={Position.Left} id={slotHandleId(name, 0)} />
            <span className="port-name">
              <Symbol name={name} />
            </span>
          </li>
        ))}
        {output.kind === 'table' ? (
          <li className="port port-open" title="Wire something here to add a column named after it.">
            <Handle type="target" position={Position.Left} id={slotHandleId(NEW_COLUMN, 'open')} />
          </li>
        ) : null}
      </ul>

      <div className="node-value">
        {output.kind === 'table' ? null : (
          <>
            <span className="reading">
              {value === undefined ? '—' : summarise(value, output.kind === 'print' ? output.figures ?? 4 : 4)}
            </span>
            {value === undefined ? null : <Sparkline reading={value} />}
          </>
        )}
        <Verdict nodeId={id} />
      </div>
    </NodeShell>
  );
}
