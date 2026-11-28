import { describe, expect, it } from 'vitest';

import {
  findFormula,
  formulaHash,
  formulaRef,
  matchRef,
  parseCatalogue,
  referable,
  serializeCatalogue,
} from './formula.js';
import type { JsonObject } from './json.js';
import { formulaTable, parseCatalogueTable, tableFormula, tableHash } from './table.js';
import { CATALOGUE_SCHEMA_VERSION } from './version.js';

/**
 * An invented table: four widget sizes, two numeric columns and one column of
 * names. Not R&M content, which may not be a fixture (AGENTS.md).
 */
const widgets: JsonObject = {
  id: 'demo.widgets',
  version: 1,
  label: { en: 'Widget sizes' },
  description: { en: 'Invented widget sizes, used because a real table may not be redistributed.' },
  citation: 'Table 0-1',
  key: { name: 'size' },
  columns: [
    { name: 'w', unit: 'mm' },
    { name: 'P', unit: 'W', preferredUnit: 'kW' },
    { name: 'grade' },
  ],
  rows: [
    ['XS', 10, 250, 'soft'],
    ['S', 12, 500, 'soft'],
    ['M', 16, null, 'hard'],
    ['L', 20, 2000, null],
  ],
};

const catalogue: JsonObject = {
  schemaVersion: CATALOGUE_SCHEMA_VERSION,
  id: 'demo',
  name: { en: 'Invented demonstration tables' },
  restricted: false,
  formulas: [],
  tables: [widgets],
};

const withRows = (rows: unknown[][]): JsonObject => ({ ...widgets, rows: rows as JsonObject[] });

describe('catalogue tables', () => {
  it('round-trips inside a catalogue', () => {
    expect(serializeCatalogue(parseCatalogue(catalogue))).toEqual(catalogue);
  });

  it('leaves a catalogue without tables exactly as it was', () => {
    const { tables: _none, ...bare } = catalogue;
    const parsed = parseCatalogue(bare);
    expect(parsed.tables).toBeUndefined();
    expect(serializeCatalogue(parsed)).toEqual(bare);
  });

  it('refuses a row of the wrong length, with its path', () => {
    expect(() => parseCatalogueTable(withRows([['XS', 10, 250]]), 'tables[0]')).toThrow(
      /tables\[0\]\.rows\[0\]: has 3 cells, but the key and 3 columns need 4/,
    );
  });

  it('refuses a cell of the wrong kind', () => {
    expect(() => parseCatalogueTable(withRows([['XS', 'ten', 250, 'soft']]), 't')).toThrow(
      /t\.rows\[0\]\[1\]: 'w' is in mm/,
    );
    expect(() => parseCatalogueTable(withRows([['XS', 10, 250, 3]]), 't')).toThrow(
      /t\.rows\[0\]\[3\]: 'grade' is a column of names/,
    );
  });

  it('refuses a key that is missing or names two rows', () => {
    expect(() => parseCatalogueTable(withRows([[null, 10, 250, 'soft']]), 't')).toThrow(/every row needs/);
    expect(() =>
      parseCatalogueTable(withRows([['XS', 10, 250, 'soft'], ['XS', 12, 500, 'soft']]), 't'),
    ).toThrow(/'XS' names two rows/);
  });

  it('refuses a numeric key that does not rise', () => {
    const numeric = { ...widgets, key: { name: 'd', unit: 'mm' }, rows: [[12, 10, 250, 'soft'], [10, 12, 500, 'soft']] };
    expect(() => parseCatalogueTable(numeric, 't')).toThrow(/has to rise from row to row/);
  });

  it('refuses a column of an unknown unit', () => {
    expect(() =>
      parseCatalogueTable({ ...widgets, columns: [{ name: 'w', unit: 'furlong' }] }, 't'),
    ).toThrow(/t\.columns\[0\]\.unit/);
  });

  it('refuses a table and a formula of one id', () => {
    const formula = {
      id: 'demo.widgets',
      version: 1,
      output: { kind: 'numeric', name: 'y', unit: '' },
      inputs: [{ kind: 'numeric', name: 'x', unit: '' }],
      expression: 'x',
      description: { en: 'Invented.' },
      status: 'unverified',
    };
    expect(() => parseCatalogue({ ...catalogue, formulas: [formula] })).toThrow(
      /tables\[0\]\.id: 'demo\.widgets' appears twice/,
    );
  });

  it('hashes what changes a calculation, and not what a reader sees', () => {
    const base = tableHash(parseCatalogueTable(widgets, 't'));
    const reworded = parseCatalogueTable(
      { ...widgets, label: { en: 'Widgets' }, description: { en: 'Reworded.' }, citation: 'Table 9-9' },
      't',
    );
    expect(tableHash(reworded)).toBe(base);
    const changed = parseCatalogueTable(
      withRows([['XS', 11, 250, 'soft'], ['S', 12, 500, 'soft'], ['M', 16, null, 'hard'], ['L', 20, 2000, null]]),
      't',
    );
    expect(tableHash(changed)).not.toBe(base);
  });
});

describe("a table's formula form", () => {
  const parsed = parseCatalogue(catalogue);
  const table = parsed.tables?.[0];
  if (table === undefined) throw new Error('the fixture has a table');
  const formula = tableFormula(table);

  it('is a one-axis lookup over the key, one output per column', () => {
    expect(formula.inputs).toEqual([{ kind: 'categorical', name: 'size', domain: ['XS', 'S', 'M', 'L'] }]);
    expect(formula.outputs.map((port) => port.name)).toEqual(['w', 'P', 'grade']);
    expect(formula.outputs[2]).toEqual({ kind: 'categorical', name: 'grade', domain: ['soft', 'hard'] });
    expect(formula.lookup?.axes).toEqual([{ input: 'size', kind: 'categorical', values: ['XS', 'S', 'M', 'L'] }]);
    expect(formula.lookup?.columns.P).toEqual([250, 500, null, 2000]);
  });

  it('is the same object every time, and knows its table', () => {
    expect(tableFormula(table)).toBe(formula);
    expect(formulaTable(formula)).toBe(table);
  });

  it('hashes as its table, so a reference to it matches', () => {
    expect(formulaHash(formula)).toBe(tableHash(table));
    expect(matchRef(formulaRef(formula), formula)).toBe('match');
  });

  it('is referable from its catalogue, ahead of its formulas', () => {
    expect(referable(parsed)[0]).toBe(formula);
    expect(findFormula(parsed, 'demo.widgets')).toBe(formula);
  });
});
