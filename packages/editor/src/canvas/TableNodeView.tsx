/**
 * A catalogue table, drawn on the canvas, with its rows picked by pointing.
 *
 * The table is the interface. Everything this node can answer was already
 * expressible — a categorical list wired into a lookup formula's axis sweeps
 * the same rows and yields the same correlated columns — but only if you
 * already knew which rows you wanted, which for a table of twenty columns of
 * standard sizes means having the book open beside the screen. So the whole
 * feature is here, in the grid: you read the table, you click, and the click
 * *is* the selection the document stores.
 *
 * The node is bound to its table when it is dropped from the palette — each
 * table a catalogue declares is its own entry — and never switches: a row
 * of one table means nothing in another.
 *
 * Two states. **Compact**, the node reads like any other source: the key
 * port and one port per projected column, under a line saying what is
 * picked. **Open** — hovered, selected, pinned, or with nothing picked yet —
 * the whole grid. Clicking in the grid never changes which, so the table
 * never vanishes from under the pointer.
 *
 * The click rules (`rowsAfterGesture`, `docs/table-input-node-plan.md` §4):
 *
 * - a plain click on a cell or row key selects **only** that row — one
 *   design is the common case; Ctrl/Cmd-click toggles one row; Shift-click
 *   adds the range from the last plain or Ctrl click;
 * - the key column's header, or Ctrl/Cmd+A in the grid, selects every row —
 *   stored as "all", so rows the catalogue adds later join the sweep;
 * - a cell click also projects its column. Ctrl/Cmd on a cell of a picked
 *   row drops that column instead and leaves the row: unpicking a value means
 *   "not this output". A column with a wire on it is never dropped, from a
 *   cell or its header, and the header marks it with a lock.
 *
 * The rows are held in the *table's* order, never in click order, so the
 * sweep always runs the way the catalogue is written — which is what an
 * engineer means by "the next size up".
 */

import { useState, type ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import { localize, type Formula, type LookupCell, type TableNode } from '@joveworks/schema';
import {
  convert,
  dimensionsEqual,
  isGenericDimension,
  toSignificantFigures,
  type NumberFormat,
  type Unit,
} from '@joveworks/units';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { nodeLabel, reframe, removeNodes, syncColumnLabels, updateNode } from '../model/document';
import { axisLabel, reading, summarise } from '../model/values';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell, formulaHelp } from './NodeShell';
import { Sparkline } from './Sparkline';
import type { CanvasFlowNode } from './node-data';
import { TitleField, TitleText } from './TitleField';
import { DisplayUnitPicker } from './DisplayUnitPicker';

/**
 * The unit a column is read in: the one picked in its header, else the one
 * the catalogue prefers. Undefined for a categorical column, which has none.
 *
 * Asked of the node rather than of the analysis because every column is drawn
 * and only the projected ones are ports — an unprojected column still has a
 * header to click, and keeps what was chosen there for when it is projected.
 */
export function columnUnit(node: TableNode, port: Formula['outputs'][number]): Unit | undefined {
  if (port.kind !== 'numeric' || isGenericDimension(port.unit)) return undefined;
  const picked = node.displayUnits?.[port.name];
  // A picked unit of another dimension is the kernel's error to report, on
  // the port; the grid falls back rather than fail to draw the table.
  return picked !== undefined && dimensionsEqual(picked.dimension, port.unit.dimension)
    ? picked
    : port.preferredUnit ?? port.unit;
}

/**
 * A cell as the catalogue writes it, respelled in the unit its header shows —
 * the grid and the port underneath it must not disagree about one number.
 */
export function cellText(
  cell: LookupCell | undefined,
  format: NumberFormat,
  written?: Unit,
  shown?: Unit,
): string {
  if (cell === undefined || cell === null) return '—';
  if (typeof cell === 'string') return cell;
  const value = written === undefined || shown === undefined ? cell : convert(cell, written, shown);
  return toSignificantFigures(value, 4, format);
}

/** A table node's row selection: an explicit list, or every row there is. */
export interface RowSelection {
  readonly rows: readonly (number | string)[];
  readonly all: boolean;
}

/**
 * How a row was clicked. `only` is a plain click, `toggle` Ctrl/Cmd, `range`
 * Shift — the spreadsheet conventions, so nothing here has to be learned.
 */
export type RowGesture = 'only' | 'toggle' | 'range';

/** The gesture a click's modifier keys mean. */
export function gestureOf(event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean }): RowGesture {
  if (event.shiftKey) return 'range';
  return event.ctrlKey || event.metaKey ? 'toggle' : 'only';
}

/**
 * The row selection after clicking row `key`, always left in the table's own
 * order — an engineer's "the next size up" is the catalogue's order, not the
 * order the rows happened to be clicked in, and the sweep is what that order
 * ends up meaning.
 *
 * - `only` selects that row alone. On the one row already selected, it
 *   changes nothing: that is already what was asked for.
 * - `toggle` adds or removes that row. From "all", removing one leaves an
 *   explicit list of the rest.
 * - `range` adds every row from `anchor` to `key`, both included. With no
 *   anchor it adds `key` alone.
 *
 * Any of them ends an "all" selection as an explicit list: the click was
 * about particular rows.
 */
export function rowsAfterGesture(
  current: RowSelection,
  keys: readonly (number | string)[],
  key: number | string,
  gesture: RowGesture,
  anchor?: number | string,
): RowSelection {
  const held = current.all ? keys : current.rows;
  let next: readonly (number | string)[];
  if (gesture === 'only') {
    next = [key];
  } else if (gesture === 'toggle') {
    next = held.includes(key) ? held.filter((row) => row !== key) : [...held, key];
  } else {
    const from = anchor === undefined ? -1 : keys.indexOf(anchor);
    const to = keys.indexOf(key);
    const span = from < 0 ? [key] : keys.slice(Math.min(from, to), Math.max(from, to) + 1);
    next = [...held, ...span];
  }
  return { rows: keys.filter((candidate) => next.includes(candidate)), all: false };
}

/** The key column's header, or Ctrl/Cmd+A: every row, or — from every row — none. */
export function allRowsToggled(current: RowSelection): RowSelection {
  return current.all ? { rows: [], all: false } : { rows: [], all: true };
}

/**
 * The projection with column `name` added, in the table's own column order —
 * what a cell click does to the columns whenever it picks a value.
 */
export function columnsAfterCellClick(
  current: readonly string[],
  order: readonly string[],
  name: string,
): readonly string[] {
  return current.includes(name) ? current : order.filter((candidate) => candidate === name || current.includes(candidate));
}

/** Both selections a cell click can change. */
export interface CellSelection {
  readonly selection: RowSelection;
  readonly columns: readonly string[];
}

/**
 * A click on the cell at row `key`, column `name`. A cell is a value the node
 * answers with, so:
 *
 * - **Ctrl/Cmd on a cell of a picked row** toggles the *column* — the output
 *   that value is on — and leaves the row alone: unpicking a value means "not
 *   this output", not "not this part". A wired column stays, as from its
 *   header. To drop a row, Ctrl/Cmd-click its key.
 * - Every other click picks the row by `rowsAfterGesture` and projects the
 *   column whenever the row ends up picked.
 */
export function afterCellClick(
  current: CellSelection,
  keys: readonly (number | string)[],
  order: readonly string[],
  wired: ReadonlySet<string>,
  key: number | string,
  name: string,
  gesture: RowGesture,
  anchor?: number | string,
): CellSelection {
  const rowPicked = current.selection.all || current.selection.rows.includes(key);
  if (gesture === 'toggle' && rowPicked) {
    return { selection: current.selection, columns: columnsAfterClick(current.columns, order, wired, name) };
  }
  const selection = rowsAfterGesture(current.selection, keys, key, gesture, anchor);
  const picked = selection.all || selection.rows.includes(key);
  return { selection, columns: picked ? columnsAfterCellClick(current.columns, order, name) : current.columns };
}

/**
 * What a compact node says it has picked: `all 25 rows`, `3 of 25 rows ·
 * 132S…200L`, or a prompt when nothing is.
 */
export function selectionSummary(selection: RowSelection, keys: readonly (number | string)[]): string {
  if (selection.all) return `all ${keys.length} rows`;
  const rows = selection.rows.filter((row) => keys.includes(row));
  if (rows.length === 0) return 'no rows picked — open the table to pick';
  const named = rows.length <= 2 ? rows.join(', ') : `${String(rows[0])}…${String(rows[rows.length - 1])}`;
  return `${rows.length} of ${keys.length} ${keys.length === 1 ? 'row' : 'rows'} · ${named}`;
}

/**
 * The projection after clicking column `name`, in the table's own column
 * order — and unchanged when the click would drop a column that has a wire
 * on it. That port is the far end of somebody else's connection: dropping it
 * from here would break the graph elsewhere to serve a click made here, and
 * silently, which is the one outcome none of the three ways out of this can
 * be allowed to have.
 */
export function columnsAfterClick(
  current: readonly string[],
  order: readonly string[],
  wired: ReadonlySet<string>,
  name: string,
): readonly string[] {
  if (current.includes(name) && wired.has(name)) return current;
  const next = current.includes(name)
    ? current.filter((column) => column !== name)
    : [...current, name];
  return order.filter((candidate) => next.includes(candidate));
}

/** A padlock, for the header of a column whose port has a wire on it. */
function Lock(): ReactElement {
  return (
    <svg className="node-catalogue-lock" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

export function TableNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, catalogues, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat, locale } = useSettings();
  const format = toUnitsFormat(numberFormat);
  /** Where a Shift-click range starts: the last row clicked without Shift. View state, never saved. */
  const [anchor, setAnchor] = useState<number | string>();
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'table') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const formula = analysis.formulas.get(id);
  const lookup = formula?.lookup;
  const axis = lookup?.axes[0];
  const keys = axis?.values ?? [];
  const selection: RowSelection = { rows: node.rows, all: node.allRows === true };
  const pickedRows = new Set<number | string>(selection.all ? keys : node.rows);
  const projected = new Set(node.columns);
  // A port with a wire leaving it is the far end of somebody else's
  // connection; the projection is not free to drop it.
  const wired = new Set(
    document.edges.filter((edge) => edge.from.node === id).map((edge) => edge.from.port),
  );

  const columnOrder = (formula?.outputs ?? []).map((port) => port.name);

  const select = (next: RowSelection, columns?: readonly string[]): void =>
    edit((current) =>
      updateNode<TableNode>(current, id, (entry) => {
        const { allRows: _was, ...rest } = entry;
        return {
          ...rest,
          rows: next.all ? [] : [...next.rows],
          ...(next.all ? { allRows: true as const } : {}),
          columns: columns === undefined ? entry.columns : [...columns],
        };
      }),
    );

  type Modifiers = { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean };

  /** A row key: the row alone, by the click's modifiers. */
  const clickRow = (key: number | string, event: Modifiers): void => {
    const gesture = gestureOf(event);
    if (gesture !== 'range') setAnchor(key);
    select(rowsAfterGesture(selection, keys, key, gesture, anchor));
  };

  /** A cell: its row and its column together (`afterCellClick`). */
  const clickCell = (key: number | string, name: string, event: Modifiers): void => {
    const gesture = gestureOf(event);
    if (gesture !== 'range') setAnchor(key);
    const next = afterCellClick(
      { selection, columns: node.columns },
      keys,
      columnOrder,
      wired,
      key,
      name,
      gesture,
      anchor,
    );
    select(next.selection, next.columns);
  };

  const toggleAll = (): void => select(allRowsToggled(selection));

  const toggleColumn = (name: string): void =>
    edit((current) =>
      updateNode<TableNode>(current, id, (entry) => ({
        ...entry,
        columns: [...columnsAfterClick(entry.columns, columnOrder, wired, name)],
      })),
    );

  const setDisplayUnit = (name: string, unit: Unit): void =>
    edit((current) =>
      updateNode<TableNode>(current, id, (entry) => ({
        ...entry,
        displayUnits: { ...entry.displayUnits, [name]: unit },
      })),
    );

  const ports = axis === undefined ? node.columns : [axis.input, ...node.columns];
  const nothingPicked = !selection.all && node.rows.length === 0;

  const grid =
    lookup === undefined || axis === undefined ? null : (
      <div
        className="node-table-grid node-catalogue-grid nodrag nowheel"
        tabIndex={0}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            // The grid's own "select all", not the canvas's or the page's.
            event.preventDefault();
            event.stopPropagation();
            toggleAll();
          }
        }}
      >
        <table>
          <thead>
            <tr>
              <th
                className={`row-key${selection.all ? ' all' : ''}`}
                title={
                  selection.all
                    ? 'Every row is in the sweep, including rows the catalogue adds later. Click to clear.'
                    : 'Pick every row, including rows the catalogue adds later (Ctrl/Cmd+A).'
                }
                onClick={toggleAll}
              >
                <ParameterLabel name={axis.input} />
              </th>
              {formula?.outputs.map((port) => {
                const unit = columnUnit(node, port);
                const isWired = wired.has(port.name);
                return (
                  <th
                    key={port.name}
                    className={`${projected.has(port.name) ? 'projected' : ''}${isWired ? ' wired' : ''}`}
                    title={
                      isWired
                        ? `'${port.name}' has a wire attached — disconnect it before dropping the column.`
                        : projected.has(port.name)
                          ? `Stop reading '${port.name}' off this table.`
                          : `Read '${port.name}' off this table.`
                    }
                    onClick={() => toggleColumn(port.name)}
                  >
                    {isWired ? <Lock /> : null}
                    <ParameterLabel name={port.name} />
                    {unit === undefined ? null : (
                      // The unit is its own control inside a header that is
                      // itself a button: choosing MPa must not also toggle
                      // the column it was chosen for.
                      <span onClick={(event) => event.stopPropagation()}>
                        {' '}
                        <DisplayUnitPicker
                          unit={unit}
                          prefixes
                          onChange={(next) => setDisplayUnit(port.name, next)}
                        />
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {keys.map((key, row) => {
              const picked = pickedRows.has(key);
              return (
                <tr key={String(key)} className={picked ? 'selected' : undefined}>
                  <th
                    scope="row"
                    title="Click to pick this row alone; Ctrl/Cmd-click to add or drop it; Shift-click to add a range."
                    onClick={(event) => clickRow(key, event)}
                  >
                    {String(key)}
                  </th>
                  {formula?.outputs.map((port) => {
                    const isProjected = projected.has(port.name);
                    return (
                      <td
                        key={port.name}
                        className={`${isProjected ? 'projected' : ''}${picked && isProjected ? ' picked' : ''}`}
                        onClick={(event) => clickCell(key, port.name, event)}
                      >
                        {cellText(
                          lookup.columns[port.name]?.[row],
                          format,
                          port.kind === 'numeric' && !isGenericDimension(port.unit) ? port.unit : undefined,
                          columnUnit(node, port),
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <NodeShell
      kind="table"
      {...formulaHelp(catalogues, formula, locale)}
      state={analysis.states.get(id) ?? 'ok'}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      expanded={expanded.has(id)}
      // Nothing picked yet means the table is all this node has to show — a
      // compact card of no ports would be a node with nothing to click.
      forceOpen={nothingPicked && grid !== null}
      onToggleExpanded={() => toggleExpanded(id)}
      onDelete={() => edit((current) => reframe(removeNodes(current, new Set([id]))))}
      dataTour={`table-${id}`}
      title={
        <TitleField
          value={node.label ?? id}
          onCommit={(label) =>
            edit((current) => {
              // As an input node's rename: an axis label that was following
              // the node's name keeps following it.
              const oldLabel = nodeLabel(node);
              const renamed = updateNode<TableNode>(current, id, (entry) => {
                const { axisLabel: _stale, ...rest } = entry;
                return { ...rest, label };
              });
              return syncColumnLabels(renamed, id, oldLabel, label);
            })
          }
        />
      }
      subtitle={
        formula === undefined
          ? node.table.id
          : formula.label === undefined
            ? formula.citation ?? formula.id
            : localize(formula.label, locale)
      }
      detail={
        grid === null ? undefined : (
          <>
            {grid}
            {formula?.description === undefined ? null : (
              <p className="node-table-about">{localize(formula.description, locale)}</p>
            )}
            {formula?.citation === undefined ? null : (
              <p className="node-table-about">{formula.citation}</p>
            )}
          </>
        )
      }
    >
      {lookup === undefined || axis === undefined ? (
        <p className="node-table-missing">this table is not in the loaded catalogues</p>
      ) : (
        <p className="node-catalogue-summary">{selectionSummary(selection, keys)}</p>
      )}

      {/* The row key first, then a row per projected column: the same
          reading/sparkline/pin rows every other multi-output node draws,
          because that is what these are. */}
      <div className={ports.length > 1 ? 'node-values' : undefined}>
        {ports.map((name) => {
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
