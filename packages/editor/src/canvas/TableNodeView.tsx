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
 * Three gestures, one model underneath:
 *
 * - a **row key** toggles that row — the rows are the sweep;
 * - a **column header** toggles that column's port — the projection, because
 *   a twenty-column table would otherwise be a twenty-port node;
 * - a **cell** does both at once, which is what "select cells" means when the
 *   thing being selected has to stay a whole part.
 *
 * A column with a wire attached cannot be un-projected: its port is the far
 * end of that wire, and removing it silently would break the graph elsewhere
 * to serve a click made here. The header says so rather than going dead.
 *
 * The rows are held in the *table's* order, never in click order, so the
 * sweep always runs the way the catalogue is written — which is what an
 * engineer means by "the next size up".
 */

import { useState, type ReactElement } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

import {
  formulaRef,
  localize,
  type Catalogue,
  type Formula,
  type LookupCell,
  type TableNode,
} from '@joveworks/schema';
import { isGenericDimension, toSignificantFigures, type NumberFormat } from '@joveworks/units';

import { useGraph } from '../graph-context';
import { useSettings } from '../settings-context';
import { toUnitsFormat } from '../model/numberFormat';
import { nodeLabel, reframe, removeNodes, syncColumnLabels, updateNode } from '../model/document';
import { axisLabel, reading, summarise } from '../model/values';
import { ParameterLabel } from '../ParameterLabel';
import { NodeShell } from './NodeShell';
import { Sparkline } from './Sparkline';
import type { CanvasFlowNode } from './node-data';
import { TitleField, TitleText } from './TitleField';
import { DisplayUnitPicker } from './DisplayUnitPicker';

/**
 * Every table a node like this can be bound to: a lookup over exactly one
 * axis. A two-axis table's row is not a part on its own — picking the
 * profile still leaves the diameter band unanswered — and a source node has
 * nothing to answer a second axis with, so those stay ordinary formula nodes.
 */
export function selectableTables(catalogues: readonly Catalogue[]): readonly Formula[] {
  return catalogues.flatMap((catalogue) =>
    catalogue.formulas.filter((formula) => formula.lookup?.axes.length === 1),
  );
}

/** A cell exactly as the catalogue writes it, in its column's own unit. */
function cellText(cell: LookupCell | undefined, format: NumberFormat): string {
  if (cell === undefined || cell === null) return '—';
  return typeof cell === 'string' ? cell : toSignificantFigures(cell, 4, format);
}

/**
 * The selection after clicking row `key`, always left in the table's own
 * order — an engineer's "the next size up" is the catalogue's order, not the
 * order the rows happened to be clicked in, and the sweep is what that order
 * ends up meaning.
 */
export function rowsAfterClick(
  current: readonly (number | string)[],
  keys: readonly (number | string)[],
  key: number | string,
): readonly (number | string)[] {
  const next = current.includes(key) ? current.filter((row) => row !== key) : [...current, key];
  return keys.filter((candidate) => next.includes(candidate));
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

export function TableNodeView({ id, selected, data }: NodeProps<CanvasFlowNode>): ReactElement | null {
  const { document, analysis, catalogues, edit, expanded, toggleExpanded, hovered } = useGraph();
  const { numberFormat, locale } = useSettings();
  const format = toUnitsFormat(numberFormat);
  /** Whether the whole table is shown, or only what has been picked out of it. */
  const [showAll, setShowAll] = useState(false);
  const node = document.nodes.find((candidate) => candidate.id === id);
  if (node === undefined || node.kind !== 'table') return null;

  const highlightedPorts = new Set(data?.highlightedPorts ?? []);
  const formula = analysis.formulas.get(id);
  const lookup = formula?.lookup;
  const axis = lookup?.axes[0];
  const keys = axis?.values ?? [];
  const pickedRows = new Set<number | string>(node.rows);
  const projected = new Set(node.columns);
  // A port with a wire leaving it is the far end of somebody else's
  // connection; the projection is not free to drop it.
  const wired = new Set(
    document.edges.filter((edge) => edge.from.node === id).map((edge) => edge.from.port),
  );

  const columnOrder = (formula?.outputs ?? []).map((port) => port.name);

  const toggleRow = (key: number | string): void =>
    edit((current) =>
      updateNode<TableNode>(current, id, (entry) => ({
        ...entry,
        rows: [...rowsAfterClick(entry.rows, keys, key)],
      })),
    );

  const toggleColumn = (name: string): void =>
    edit((current) =>
      updateNode<TableNode>(current, id, (entry) => ({
        ...entry,
        columns: [...columnsAfterClick(entry.columns, columnOrder, wired, name)],
      })),
    );

  /** A cell means both selections at once — its row, and its column. */
  const pickCell = (key: number | string, name: string): void => {
    // Both already on: the click can only mean "not this part after all".
    if (pickedRows.has(key) && projected.has(name)) {
      toggleRow(key);
      return;
    }
    edit((current) =>
      updateNode<TableNode>(current, id, (entry) => ({
        ...entry,
        rows: entry.rows.includes(key) ? entry.rows : [...rowsAfterClick(entry.rows, keys, key)],
        columns: entry.columns.includes(name)
          ? entry.columns
          : [...columnsAfterClick(entry.columns, columnOrder, wired, name)],
      })),
    );
  };

  /** Switching tables cannot carry a selection across; nothing means the same. */
  const bindTable = (formulaId: string): void => {
    const picked = selectableTables(catalogues).find((candidate) => candidate.id === formulaId);
    if (picked === undefined) return;
    edit((current) =>
      updateNode<TableNode>(current, id, (entry) => ({
        ...entry,
        table: formulaRef(picked),
        rows: [],
        columns: [],
      })),
    );
  };

  const setDisplayUnit = (name: string, unit: Parameters<typeof DisplayUnitPicker>[0]['unit']): void =>
    edit((current) =>
      updateNode<TableNode>(current, id, (entry) => ({
        ...entry,
        displayUnits: { ...entry.displayUnits, [name]: unit },
      })),
    );

  // Once something is picked, the node shows what was picked — a
  // twenty-five-row table is not a thing to keep on the canvas after you
  // have chosen three sizes out of it — with the whole table one click away.
  const visibleKeys = showAll || pickedRows.size === 0 ? keys : keys.filter((key) => pickedRows.has(key));
  const ports = axis === undefined ? node.columns : [axis.input, ...node.columns];

  return (
    <NodeShell
      kind="table"
      state={analysis.states.get(id) ?? 'ok'}
      selected={selected ?? false}
      highlighted={data?.highlighted === true || hovered.has(id)}
      {...(analysis.problems.has(id) ? { problem: analysis.problems.get(id) } : {})}
      expanded={expanded.has(id)}
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
        <>
          <label className="node-table-pick">
            table
            <select
              className="nodrag"
              value={node.table.id}
              title="Which catalogue table this node draws. Changing it clears the selection — a row of one table means nothing in another."
              onChange={(event) => bindTable(event.target.value)}
            >
              {selectableTables(catalogues).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label === undefined ? candidate.id : localize(candidate.label, locale)}
                </option>
              ))}
            </select>
          </label>
          {formula?.description === undefined ? null : (
            <p className="node-table-about">{localize(formula.description, locale)}</p>
          )}
          {formula?.citation === undefined ? null : (
            <p className="node-table-about">{formula.citation}</p>
          )}
        </>
      }
    >
      {lookup === undefined || axis === undefined ? (
        <p className="node-table-missing">this table is not in the loaded catalogues</p>
      ) : (
        <>
          <div className="node-table-grid nodrag">
            <table>
              <thead>
                <tr>
                  <th className="row-key" title="Each row is one entry of the table — one part.">
                    <ParameterLabel name={axis.input} />
                  </th>
                  {formula?.outputs.map((port) => (
                    <th
                      key={port.name}
                      className={`${projected.has(port.name) ? 'projected' : ''}${wired.has(port.name) ? ' wired' : ''}`}
                      title={
                        wired.has(port.name)
                          ? `'${port.name}' has a wire attached — disconnect it before dropping the column.`
                          : projected.has(port.name)
                            ? `Stop reading '${port.name}' off this table.`
                            : `Read '${port.name}' off this table.`
                      }
                      onClick={() => toggleColumn(port.name)}
                    >
                      <ParameterLabel
                        name={port.name}
                        {...(port.kind === 'numeric' && !isGenericDimension(port.unit)
                          ? { unit: port.unit }
                          : {})}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleKeys.map((key) => (
                  <tr key={String(key)} className={pickedRows.has(key) ? 'selected' : undefined}>
                    <th
                      scope="row"
                      title={pickedRows.has(key) ? 'Drop this row from the sweep.' : 'Add this row to the sweep.'}
                      onClick={() => toggleRow(key)}
                    >
                      {String(key)}
                    </th>
                    {formula?.outputs.map((port) => (
                      <td
                        key={port.name}
                        className={projected.has(port.name) ? 'projected' : undefined}
                        onClick={() => pickCell(key, port.name)}
                      >
                        {cellText(lookup.columns[port.name]?.[keys.indexOf(key)], format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pickedRows.size === 0 ? null : (
            <button
              type="button"
              className="node-table-expand nodrag"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? `show the ${pickedRows.size} selected`
                : `show all ${keys.length} rows`}
            </button>
          )}
        </>
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
                  <DisplayUnitPicker unit={unit} onChange={(next) => setDisplayUnit(name, next)} />
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
