/**
 * Editing a lookup table node: every change a click or a keystroke in
 * `LutNodeView` makes, as a pure function of the document.
 *
 * Kept out of the view for the same reason `columnsAfterClick` is kept out of
 * `TableNodeView`'s body: the rules are where the risk is — a renamed column
 * has to take its wires with it, a column with a wire on it cannot be
 * deleted, and a pasted block from a spreadsheet has to land as typed values
 * rather than as text — and they are testable without a canvas.
 */

import {
  formatPlainNumber,
  parseUnit,
  PLAIN_NUMBER_FORMAT,
  stripNumberFormatting,
  UnitError,
  type NumberFormat,
} from '@joveworks/units';
import type { GraphDocument, LutColumn, LutNode } from '@joveworks/schema';

import { updateNode } from './document';

export type LutCell = LutColumn['values'][number];

/** What a fresh table from the palette holds: a key and a value, two rows, ready to overtype. */
export function starterColumns(): readonly LutColumn[] {
  return [
    { name: 'x', unit: parseUnit(''), values: [1, 2] },
    { name: 'y', unit: parseUnit(''), values: [1, 2] },
  ];
}

function setColumns(
  document: GraphDocument,
  id: string,
  change: (columns: readonly LutColumn[]) => readonly LutColumn[],
): GraphDocument {
  return updateNode<LutNode>(document, id, (node) => ({ ...node, columns: [...change(node.columns)] }));
}

/** The ports of this node with a wire leaving them — the far end of somebody else's connection. */
export function wiredColumns(document: GraphDocument, id: string): ReadonlySet<string> {
  return new Set(document.edges.filter((edge) => edge.from.node === id).map((edge) => edge.from.port));
}

/**
 * A cell as typed: empty is "undefined for this row", a categorical column
 * keeps the text, a numeric one must read as a plain number in the
 * settings' punctuation — the unit lives in the header, once.
 */
export function parseCell(text: string, column: LutColumn, format: NumberFormat = PLAIN_NUMBER_FORMAT): LutCell {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed === '—') return null;
  if (column.unit === undefined) return trimmed;
  const value = Number(stripNumberFormatting(trimmed, format));
  if (!Number.isFinite(value)) throw new UnitError(`cannot read a number from ${JSON.stringify(text)}`);
  return value;
}

export function cellText(cell: LutCell, format: NumberFormat = PLAIN_NUMBER_FORMAT): string {
  if (cell === null) return '';
  return typeof cell === 'number' ? formatPlainNumber(cell, format) : cell;
}

export function setCell(document: GraphDocument, id: string, column: number, row: number, cell: LutCell): GraphDocument {
  return setColumns(document, id, (columns) =>
    columns.map((entry, c) =>
      c === column ? { ...entry, values: entry.values.map((value, r) => (r === row ? cell : value)) } : entry,
    ),
  );
}

/** A new empty row at the bottom. */
export function addRow(document: GraphDocument, id: string): GraphDocument {
  return setColumns(document, id, (columns) => columns.map((entry) => ({ ...entry, values: [...entry.values, null] })));
}

export function removeRow(document: GraphDocument, id: string, row: number): GraphDocument {
  return setColumns(document, id, (columns) =>
    columns.map((entry) => ({ ...entry, values: entry.values.filter((_value, r) => r !== row) })),
  );
}

/** A name no column of `columns` has yet: `y`, `y2`, `y3`, … */
export function freeColumnName(columns: readonly LutColumn[], base = 'y'): string {
  const taken = new Set(columns.map((column) => column.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
}

/** A new dimensionless numeric column on the right, as long as the others. */
export function addColumn(document: GraphDocument, id: string): GraphDocument {
  return setColumns(document, id, (columns) => [
    ...columns,
    {
      name: freeColumnName(columns),
      unit: parseUnit(''),
      values: Array.from({ length: columns[0]?.values.length ?? 1 }, () => null),
    },
  ]);
}

/**
 * Dropping a column — refused while a wire leaves it, the rule
 * `columnsAfterClick` states for a catalogue table: removing the port would
 * break the graph elsewhere, silently, to serve a click made here.
 */
export function removeColumn(document: GraphDocument, id: string, column: number): GraphDocument {
  const node = document.nodes.find((entry) => entry.id === id);
  const name = node?.kind === 'lut' ? node.columns[column]?.name : undefined;
  if (name === undefined || wiredColumns(document, id).has(name)) return document;
  return setColumns(document, id, (columns) => columns.filter((_entry, c) => c !== column));
}

/**
 * Renaming a column renames its port, so every wire leaving it is renamed
 * with it. A name another column already has, or an empty one, is refused
 * as a no-op — two ports cannot share a name.
 */
export function renameColumn(document: GraphDocument, id: string, column: number, name: string): GraphDocument {
  const node = document.nodes.find((entry) => entry.id === id);
  if (node?.kind !== 'lut') return document;
  const current = node.columns[column];
  const next = name.trim();
  if (current === undefined || next.length === 0 || next === current.name) return document;
  if (node.columns.some((entry) => entry.name === next)) return document;
  const renamed = setColumns(document, id, (columns) =>
    columns.map((entry, c) => (c === column ? { ...entry, name: next } : entry)),
  );
  const { [current.name]: unit, ...otherUnits } = node.displayUnits ?? {};
  return {
    ...renamed,
    nodes: renamed.nodes.map((entry) =>
      entry.id === id && entry.kind === 'lut' && unit !== undefined
        ? { ...entry, displayUnits: { ...otherUnits, [next]: unit } }
        : entry,
    ),
    edges: renamed.edges.map((edge) =>
      edge.from.node === id && edge.from.port === current.name
        ? { ...edge, from: { ...edge.from, port: next } }
        : edge,
    ),
  };
}

/**
 * Setting a column's unit. `undefined` makes it a column of names; a unit
 * makes it numeric. Switching between the two carries every cell across as
 * text and back — a name that does not read as a number becomes an empty
 * cell rather than failing the whole edit. Re-unit-ing a numeric column
 * keeps the numbers as typed: `12` in a column changed from mm to cm is
 * `12 cm`, since the header is what was wrong, not the cells.
 */
export function setColumnUnit(document: GraphDocument, id: string, column: number, unit: string | undefined): GraphDocument {
  const parsed = unit === undefined ? undefined : parseUnit(unit);
  return setColumns(document, id, (columns) =>
    columns.map((entry, c) => {
      if (c !== column) return entry;
      const { unit: _old, ...rest } = entry;
      if (parsed === undefined) {
        return { ...rest, values: entry.values.map((value) => (value === null ? null : String(value))) };
      }
      const values = entry.values.map((value) => {
        if (value === null || typeof value === 'number') return value;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      });
      return { ...rest, unit: parsed, values };
    }),
  );
}

/**
 * Spreadsheet text — rows on lines, cells split by tabs, or by the CSV
 * separator when there are no tabs — as a grid of strings. A trailing empty
 * line, which every spreadsheet copy ends with, is dropped.
 */
export function readPastedGrid(text: string, separator: ',' | ';' = ','): readonly (readonly string[])[] {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  if (lines[lines.length - 1]?.trim() === '') lines.pop();
  const split = text.includes('\t') ? '\t' : separator;
  return lines.map((line) => line.split(split));
}

/**
 * A pasted block, landing with its top-left corner on (`column`, `row`).
 * The table grows to fit: new rows below, new columns on the right — the
 * way pasting into a spreadsheet does. A cell that does not parse in its
 * column becomes empty instead of failing the whole paste.
 */
export function pasteGrid(
  document: GraphDocument,
  id: string,
  column: number,
  row: number,
  grid: readonly (readonly string[])[],
  format: NumberFormat = PLAIN_NUMBER_FORMAT,
): GraphDocument {
  const width = Math.max(0, ...grid.map((line) => line.length));
  return setColumns(document, id, (existing) => {
    const columns = [...existing];
    while (columns.length < column + width) {
      columns.push({ name: freeColumnName(columns), unit: parseUnit(''), values: [] });
    }
    const rows = Math.max(columns[0]?.values.length ?? 0, ...columns.map((entry) => entry.values.length), row + grid.length);
    return columns.map((entry, c) => {
      const values = [...entry.values, ...Array.from({ length: rows - entry.values.length }, () => null)];
      if (c >= column && c < column + width) {
        for (const [r, line] of grid.entries()) {
          const text = line[c - column];
          if (text === undefined) continue;
          try {
            values[row + r] = parseCell(text, entry, format);
          } catch {
            values[row + r] = null;
          }
        }
      }
      return { ...entry, values };
    });
  });
}
