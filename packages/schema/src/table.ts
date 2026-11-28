/**
 * A catalogue table: a list of records, one row per part.
 *
 * R&M's tables of standard sizes — motor frames, belt profiles — are not
 * formulas. They have no expression and no inputs; a row *is* a part and its
 * columns are that part's properties. So a catalogue declares them as their
 * own entity, beside its formulas, and each one becomes a palette entry that
 * drops a table node already bound to it.
 *
 * One key column, by construction. A two-axis table (a profile × a diameter
 * band) cannot be written here: its row is not a part on its own, and it
 * stays a lookup formula with wired inputs.
 *
 * **Underneath, a table is read as a one-axis lookup formula** (`tableFormula`).
 * Everything that evaluates a table already evaluates that shape, so the
 * kernel keeps a single path for "a table of rows" and a document's reference
 * to a table looks exactly like its reference to a formula. The formula form
 * hashes as its table (`tableHash`), so translating a table's label never
 * flags a saved document changed.
 */

import {
  fail,
  join,
  optional,
  put,
  readArray,
  readInteger,
  readName,
  readObject,
  readString,
  required,
  type JsonObject,
  type JsonValue,
} from './json.js';
import { hashRecord } from './hash.js';
import { parseLocalizedText, serializeLocalizedText, type LocalizedText } from './localization.js';
import { parsePortUnitField } from './quantity.js';
import type { CategoricalPort, NumericPort, OutputPort } from './port.js';
import { rememberHash, type Formula, type LookupCell } from './formula.js';
import { dimensionsEqual, isGenericDimension, type Unit } from '@joveworks/units';

/**
 * One column of a table. `unit` absent means a column of **names** — a
 * profile, a coupling designation — the convention `LutColumn` and
 * `FileField` already use.
 */
export interface TableColumn {
  readonly name: string;
  readonly unit?: Unit;
  /** A same-dimension unit to show the column in by default. */
  readonly preferredUnit?: Unit;
  readonly description?: LocalizedText;
}

export interface CatalogueTable {
  /** Shares one namespace with the catalogue's formula ids. */
  readonly id: string;
  /** Bumped whenever the table changes meaning. Part of a graph's reference. */
  readonly version: number;
  readonly label?: LocalizedText;
  readonly description: LocalizedText;
  /** `Table 16-21`. */
  readonly citation?: string;
  /** Where the table is in the catalogue's book; see `Formula.href`. */
  readonly href?: string;
  /** The column that names each row. Never empty, never repeated. */
  readonly key: TableColumn;
  readonly columns: readonly TableColumn[];
  /** One entry per row: the key first, then one cell per column. */
  readonly rows: readonly (readonly LookupCell[])[];
}

function parseColumn(value: JsonValue, path: string): TableColumn {
  const object = readObject(value, path);
  const name = readName(required(object, 'name', path), join(path, 'name'));
  const description = optional(object, 'description', path, parseLocalizedText);
  const concrete = (field: string): Unit | undefined =>
    optional(object, field, path, (entry, entryPath) => {
      const unit = parsePortUnitField(entry, entryPath);
      if (isGenericDimension(unit)) fail(entryPath, 'must be a concrete unit — a table states its own');
      return unit;
    });
  const unit = concrete('unit');
  const preferredUnit = concrete('preferredUnit');
  if (preferredUnit !== undefined) {
    if (unit === undefined) fail(join(path, 'preferredUnit'), 'needs a unit to be preferred over');
    if (!dimensionsEqual(unit.dimension, preferredUnit.dimension)) {
      fail(join(path, 'preferredUnit'), 'must have the same dimension as the column unit');
    }
  }
  return {
    name,
    ...put('unit', unit),
    ...put('preferredUnit', preferredUnit),
    ...put('description', description),
  };
}

function serializeColumn(column: TableColumn): JsonObject {
  return {
    name: column.name,
    ...put('unit', column.unit?.symbol),
    ...put('preferredUnit', column.preferredUnit?.symbol),
    ...(column.description === undefined ? {} : { description: serializeLocalizedText(column.description) }),
  };
}

function readCell(value: JsonValue, path: string, column: TableColumn): LookupCell {
  if (value === null) return null;
  if (column.unit === undefined) {
    if (typeof value !== 'string') fail(path, `'${column.name}' is a column of names, so this needs to be a string or null`);
    return value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, `'${column.name}' is in ${column.unit.symbol}, so this needs to be a finite number or null`);
  }
  return value;
}

export function parseCatalogueTable(value: JsonValue, path: string): CatalogueTable {
  const object = readObject(value, path);
  const id = readName(required(object, 'id', path), join(path, 'id'));
  const version = readInteger(required(object, 'version', path), join(path, 'version'), 1);
  const key = parseColumn(required(object, 'key', path), join(path, 'key'));
  const columns = readArray(required(object, 'columns', path), join(path, 'columns')).map((entry, i) =>
    parseColumn(entry, `${join(path, 'columns')}[${i}]`),
  );
  if (columns.length === 0) fail(join(path, 'columns'), 'is empty — a table needs at least one column besides its key');

  // A formula's inputs and outputs share one namespace, and so do these: the
  // key becomes the formula form's input and every column one of its outputs.
  const names = new Set<string>([key.name]);
  for (const [i, column] of columns.entries()) {
    if (names.has(column.name)) {
      fail(`${join(path, 'columns')}[${i}].name`, `'${column.name}' is already a column of this table`);
    }
    names.add(column.name);
  }

  const all = [key, ...columns];
  const rowsPath = join(path, 'rows');
  const rows = readArray(required(object, 'rows', path), rowsPath).map((entry, r) => {
    const rowPath = `${rowsPath}[${r}]`;
    const cells = readArray(entry, rowPath);
    if (cells.length !== all.length) {
      fail(rowPath, `has ${cells.length} cells, but the key and ${columns.length} columns need ${all.length}`);
    }
    return cells.map((cell, c) => readCell(cell, `${rowPath}[${c}]`, all[c] as TableColumn));
  });
  if (rows.length === 0) fail(rowsPath, 'is empty — a table needs at least one row');

  // The key names a part, so it is always there and never names two. A
  // numeric key must also rise: the same table read through Interpolate or
  // the lookup machinery snaps to the next row up, which needs an order.
  const keys = rows.map((row) => row[0]);
  for (const [r, keyCell] of keys.entries()) {
    const cellPath = `${rowsPath}[${r}][0]`;
    if (keyCell === null) fail(cellPath, `is the key '${key.name}', which every row needs`);
    if (keys.indexOf(keyCell) !== r) fail(cellPath, `'${String(keyCell)}' names two rows`);
    if (key.unit !== undefined && r > 0 && (keyCell as number) <= (keys[r - 1] as number)) {
      fail(cellPath, `the key '${key.name}' has to rise from row to row`);
    }
  }
  // A column of names becomes a categorical port, which needs a domain.
  for (const [c, column] of columns.entries()) {
    if (column.unit !== undefined) continue;
    if (!rows.some((row) => row[c + 1] !== null)) {
      fail(`${join(path, 'columns')}[${c}]`, `'${column.name}' is a column of names with none in it`);
    }
  }

  return {
    id,
    version,
    ...put('label', optional(object, 'label', path, parseLocalizedText)),
    description: parseLocalizedText(required(object, 'description', path), join(path, 'description')),
    ...put('citation', optional(object, 'citation', path, readString)),
    ...put('href', optional(object, 'href', path, readString)),
    key,
    columns,
    rows,
  };
}

export function serializeCatalogueTable(table: CatalogueTable): JsonObject {
  return {
    id: table.id,
    version: table.version,
    ...(table.label === undefined ? {} : { label: serializeLocalizedText(table.label) }),
    description: serializeLocalizedText(table.description),
    ...put('citation', table.citation),
    ...put('href', table.href),
    key: serializeColumn(table.key),
    columns: table.columns.map(serializeColumn),
    rows: table.rows.map((row) => [...row]),
  };
}

/**
 * The content hash a reference to this table pins. Over what changes a
 * calculation — the key, the columns' names and units, the rows — and not
 * over what a reader sees: label, description, citation and link can all be
 * corrected without flagging a student's saved NodeBook changed.
 */
export function tableHash(table: CatalogueTable): string {
  const semantic = (column: TableColumn): JsonObject => ({
    name: column.name,
    ...put('unit', column.unit?.symbol),
  });
  return hashRecord({
    id: table.id,
    version: table.version,
    table: {
      key: semantic(table.key),
      columns: table.columns.map(semantic),
      rows: table.rows.map((row) => [...row]),
    },
  });
}

function columnPort(column: TableColumn, cells: readonly LookupCell[]): NumericPort | CategoricalPort {
  const description = put('description', column.description);
  if (column.unit === undefined) {
    const domain = [...new Set(cells.filter((cell): cell is string => typeof cell === 'string'))];
    return { kind: 'categorical', name: column.name, domain, ...description };
  }
  return {
    kind: 'numeric',
    name: column.name,
    unit: column.unit,
    ...put('preferredUnit', column.preferredUnit),
    ...description,
  };
}

const FORMULA_FORM = new WeakMap<CatalogueTable, Formula>();

/**
 * The table read as a one-axis lookup formula — the shape the kernel already
 * evaluates. The same object every time for one table, so the formulas a
 * graph resolves to can still be found by identity.
 */
export function tableFormula(table: CatalogueTable): Formula {
  const cached = FORMULA_FORM.get(table);
  if (cached !== undefined) return cached;
  const keys = table.rows.map((row) => row[0] as number | string);
  const columns = Object.fromEntries(
    table.columns.map((column, c) => [column.name, table.rows.map((row) => row[c + 1] ?? null)]),
  );
  const formula: Formula = {
    id: table.id,
    version: table.version,
    inputs: [columnPort(table.key, keys)],
    outputs: table.columns.map((column) => columnPort(column, columns[column.name] ?? []) as OutputPort),
    lookup: {
      axes: [{ input: table.key.name, kind: table.key.unit === undefined ? 'categorical' : 'numeric', values: keys }],
      columns,
    },
    ...put('label', table.label),
    description: table.description,
    ...put('citation', table.citation),
    ...put('href', table.href),
    // A table is data, not a derivation: there is nothing a golden value
    // could exercise, and nothing to quarantine. `unverified` is the honest
    // default the schema already has for that.
    status: 'unverified',
  };
  rememberHash(formula, tableHash(table));
  FORMULA_FORM.set(table, formula);
  TABLE_OF.set(formula, table);
  return formula;
}

const TABLE_OF = new WeakMap<Formula, CatalogueTable>();

/** The table `formula` is the formula form of, if it is one. */
export function formulaTable(formula: Formula): CatalogueTable | undefined {
  return TABLE_OF.get(formula);
}
