/**
 * A lookup table the student types in, drawn as an editable grid.
 *
 * The grid is `TableNodeView`'s, but every cell is a field: the header holds
 * each column's name (its port) and unit, the body its rows. A block copied
 * out of a spreadsheet pastes in as a block, growing the table to fit.
 *
 * The first column is the row key — what a sweep over the rows is labelled
 * with. Wired straight into a formula the rows are a sweep; wired into an
 * interpolator as `xs` and `ys` they are a function of something else.
 *
 * A column with a wire leaving it cannot be deleted, `TableNodeView`'s rule
 * for projection: the port is the far end of somebody else's connection.
 * Renaming one is fine — the wire is renamed with it (`model/lut.ts`).
 */

import type { ClipboardEvent, ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import type { LutNode } from '@joveworks/schema';
import type { Unit } from '@joveworks/units';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { csvSeparator } from '../model/csv';
import { nodeLabel, reframe, removeNodes, syncColumnLabels, updateNode } from '../model/document';
import {
  addColumn,
  addRow,
  cellText,
  parseCell,
  pasteGrid,
  readPastedGrid,
  removeColumn,
  removeRow,
  renameColumn,
  setCell,
  setColumnUnit,
  wiredColumns,
} from '../model/lut';
import { toUnitsFormat } from '../model/numberFormat';
import { axisLabel, reading, summarise } from '../model/values';
import { ParameterLabel } from '../ParameterLabel';
import { DisplayUnitPicker } from './DisplayUnitPicker';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import { TextField } from './fields';
import type { CanvasFlowNode } from './node-data';
import { TitleField, TitleText } from './TitleField';

/** What the unit field shows for a column of names rather than numbers. */
const NAMES = 'names';

export function LutNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat } = useSettings();
  const format = toUnitsFormat(numberFormat);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'lut') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const wired = wiredColumns(document, id);
  const rows = node.columns[0]?.values.length ?? 0;

  const setDisplayUnit = (name: string, unit: Unit): void =>
    edit((current) =>
      updateNode<LutNode>(current, id, (entry) => ({
        ...entry,
        displayUnits: { ...entry.displayUnits, [name]: unit },
      })),
    );

  /** A block from a spreadsheet lands as a block; a single value is left to the field. */
  const onPaste = (column: number, row: number) => (event: ClipboardEvent): void => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.replace(/\r?\n$/u, '').includes('\n')) return;
    event.preventDefault();
    const grid = readPastedGrid(text, csvSeparator(format));
    edit((current) => pasteGrid(current, id, column, row, grid, format));
  };

  return (
    <NodeShell
      kind="lut"
      state={analysis.states.get(id) ?? 'ok'}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      expanded={expanded.has(id)}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      title={
        <TitleField
          value={node.label ?? id}
          onCommit={(label) =>
            edit((current) => {
              // As a table node's rename: an axis label following the
              // node's name keeps following it.
              const oldLabel = nodeLabel(node);
              const renamed = updateNode<LutNode>(current, id, (entry) => {
                const { axisLabel: _stale, ...rest } = entry;
                return { ...rest, label };
              });
              return syncColumnLabels(renamed, id, oldLabel, label);
            })
          }
        />
      }
      subtitle={`lookup table · ${rows} ${rows === 1 ? 'row' : 'rows'}`}
      detail={
        <p className="node-table-about">
          The first column names the rows. Leave a cell empty where the table has no value — a first row with
          no value says where the first band starts. Paste a block from a spreadsheet into any cell.
        </p>
      }
    >
      <div className="node-table-grid node-lut-grid nodrag">
        <table>
          <thead>
            <tr>
              {node.columns.map((column, c) => (
                <th key={c} className={wired.has(column.name) ? 'wired' : undefined}>
                  <span className="node-lut-heading">
                    <TextField
                      className="node-lut-name"
                      value={column.name}
                      autoSize={2}
                      title={c === 0 ? 'The row key — its port, and what the rows are called' : 'This column’s port name'}
                      onCommit={(name) => edit((current) => renameColumn(current, id, c, name))}
                    />
                    <button
                      type="button"
                      className="node-lut-remove"
                      disabled={wired.has(column.name) || node.columns.length === 1}
                      title={
                        wired.has(column.name)
                          ? `'${column.name}' has a wire attached — disconnect it before deleting the column.`
                          : `Delete the column '${column.name}'.`
                      }
                      onClick={() => edit((current) => removeColumn(current, id, c))}
                    >
                      ×
                    </button>
                  </span>
                  <TextField
                    className="node-lut-unit"
                    value={column.unit === undefined ? NAMES : column.unit.symbol}
                    placeholder="unit"
                    autoSize={3}
                    title={`The unit every number in this column is in. Type '${NAMES}' for a column of names, or leave it empty for a plain number.`}
                    onCommit={(text) =>
                      edit((current) =>
                        setColumnUnit(current, id, c, text.trim() === NAMES ? undefined : text.trim()),
                      )
                    }
                  />
                </th>
              ))}
              <th className="node-lut-add">
                <button type="button" title="Add a column" onClick={() => edit((current) => addColumn(current, id))}>
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_unused, r) => (
              <tr key={r}>
                {node.columns.map((column, c) => (
                  <td key={c} onPaste={onPaste(c, r)}>
                    <TextField
                      className="node-lut-cell"
                      value={cellText(column.values[r] ?? null, format)}
                      placeholder="—"
                      autoSize={3}
                      selectOnFocus
                      onCommit={(text) =>
                        edit((current) => setCell(current, id, c, r, parseCell(text, column, format)))
                      }
                    />
                  </td>
                ))}
                <td className="node-lut-add">
                  <button
                    type="button"
                    className="node-lut-remove"
                    title="Delete this row"
                    disabled={rows === 1}
                    onClick={() => edit((current) => removeRow(current, id, r))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="node-table-expand nodrag" onClick={() => edit((current) => addRow(current, id))}>
        add a row
      </button>

      {/* A row per column — the reading/sparkline rows every multi-output node draws. */}
      <div className={node.columns.length > 1 ? 'node-values' : undefined}>
        {node.columns.map(({ name }) => {
          const value = reading(analysis, id, name);
          const unit = analysis.resolution?.sources.get(`${id}.${name}`)?.unit;
          const highlighted = highlightedPorts.has(name);
          return (
            <div
              key={name}
              className="node-value"
              onMouseEnter={() => data?.onPortHover?.({ nodeId: id, port: name })}
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
                <ParameterLabel name={name} />
                {unit === undefined ? null : (
                  <DisplayUnitPicker unit={unit} prefixes onChange={(next) => setDisplayUnit(name, next)} />
                )}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={name}
                className={highlighted ? 'port-highlighted' : ''}
              />
            </div>
          );
        })}
      </div>
    </NodeShell>
  );
}
