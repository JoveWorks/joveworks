import { describe, expect, it } from 'vitest';
import { parseUnit } from '@joveworks/units';
import { emptyDocument, type GraphDocument, type LutNode } from '@joveworks/schema';

import {
  addColumn,
  addRow,
  parseCell,
  pasteGrid,
  readPastedGrid,
  removeColumn,
  removeRow,
  renameColumn,
  setCell,
  setColumnUnit,
} from './lut';

const table: LutNode = {
  kind: 'lut',
  id: 't',
  position: { x: 0, y: 0 },
  columns: [
    { name: 'd', unit: parseUnit('mm'), values: [10, 20] },
    { name: 'b', unit: parseUnit('mm'), values: [null, 3] },
  ],
};

function documentWith(...edges: GraphDocument['edges']): GraphDocument {
  return { ...emptyDocument('doc', 'Doc'), nodes: [table, { kind: 'interpolate', id: 'k', position: { x: 0, y: 0 }, mode: 'linear' }], edges };
}

const lut = (document: GraphDocument): LutNode => document.nodes.find((node) => node.id === 't') as LutNode;
const values = (document: GraphDocument) => lut(document).columns.map((column) => column.values);

const wireB = { id: 'e1', from: { node: 't', port: 'b' }, to: { node: 'k', port: 'ys' } };

describe('lookup table editing', () => {
  it('reads an empty cell as undefined, a number in the settings’ punctuation, and a name as text', () => {
    expect(parseCell('  ', table.columns[0]!)).toBeNull();
    expect(parseCell('12,5', table.columns[0]!, { notation: 'auto', thousands: '.', decimal: ',' } as const)).toBe(12.5);
    expect(parseCell('SPA', { name: 'p', values: [] })).toBe('SPA');
    expect(() => parseCell('12 mm', table.columns[0]!)).toThrow(/cannot read a number/);
  });

  it('sets a cell, and adds and removes rows across every column', () => {
    const edited = setCell(documentWith(), 't', 1, 0, 2);
    expect(values(edited)).toEqual([[10, 20], [2, 3]]);
    expect(values(addRow(edited, 't'))).toEqual([[10, 20, null], [2, 3, null]]);
    expect(values(removeRow(edited, 't', 0))).toEqual([[20], [3]]);
  });

  it('adds a column under a free name, as long as the others', () => {
    const added = lut(addColumn(documentWith(), 't')).columns[2];
    expect(added?.name).toBe('y');
    expect(added?.values).toEqual([null, null]);
  });

  it('will not delete a column with a wire leaving it', () => {
    const wired = documentWith(wireB);
    expect(removeColumn(wired, 't', 1)).toBe(wired);
    expect(lut(removeColumn(documentWith(), 't', 1)).columns.map((column) => column.name)).toEqual(['d']);
  });

  it('renames a column and the wires leaving it, and refuses a name already taken', () => {
    const renamed = renameColumn(documentWith(wireB), 't', 1, 'width');
    expect(lut(renamed).columns[1]?.name).toBe('width');
    expect(renamed.edges[0]?.from.port).toBe('width');
    const clash = documentWith(wireB);
    expect(renameColumn(clash, 't', 1, 'd')).toBe(clash);
  });

  it('turns a column into names and back, keeping what reads as a number', () => {
    const names = setColumnUnit(documentWith(), 't', 0, undefined);
    expect(lut(names).columns[0]?.unit).toBeUndefined();
    expect(values(names)[0]).toEqual(['10', '20']);
    const back = setColumnUnit(setCell(names, 't', 0, 1, 'large'), 't', 0, 'cm');
    expect(lut(back).columns[0]?.unit?.symbol).toBe('cm');
    expect(values(back)[0]).toEqual([10, null]);
  });

  it('pastes a spreadsheet block, growing the table to fit', () => {
    const grid = readPastedGrid('30\t7\n40\t9\textra\n');
    expect(grid).toEqual([['30', '7'], ['40', '9', 'extra']]);
    const pasted = pasteGrid(documentWith(), 't', 0, 1, grid);
    const node = lut(pasted);
    expect(node.columns.map((column) => column.name)).toEqual(['d', 'b', 'y']);
    // `extra` does not read as a number in the new numeric column, so it lands empty.
    expect(values(pasted)).toEqual([[10, 30, 40], [null, 7, 9], [null, null, null]]);
  });
});
