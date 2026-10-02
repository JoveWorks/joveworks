import { describe, expect, it } from 'vitest';

import type { TableNode } from '@joveworks/schema';
import { PLAIN_NUMBER_FORMAT, parseUnit } from '@joveworks/units';

import { displayUnitChoices } from './DisplayUnitPicker';
import { cellText, columnUnit, columnsAfterClick, rowsAfterClick } from './TableNodeView';

/**
 * The two selections a table node holds, and the rules that keep each of them
 * honest: rows stay in the catalogue's order whatever order they were clicked
 * in, and a column with a wire on it cannot be clicked away.
 */
describe("a table node's selections", () => {
  const keys = ['71', '80', '90S', '90L', '100L'];
  const columns = ['h', 'a', 'F', 'profile'];

  it('keeps rows in the table’s order, not the order they were clicked', () => {
    let rows: readonly (number | string)[] = [];
    for (const key of ['100L', '71', '90S']) rows = rowsAfterClick(rows, keys, key);
    expect(rows).toEqual(['71', '90S', '100L']);
  });

  it('drops a row that is clicked again', () => {
    expect(rowsAfterClick(['71', '90S'], keys, '71')).toEqual(['90S']);
  });

  it('holds numeric row keys as numbers, so they stay coordinates', () => {
    expect(rowsAfterClick([], [10, 20, 30], 20)).toEqual([20]);
  });

  it('keeps projected columns in the table’s own column order', () => {
    let projected: readonly string[] = [];
    for (const name of ['profile', 'h']) projected = columnsAfterClick(projected, columns, new Set(), name);
    expect(projected).toEqual(['h', 'profile']);
  });

  it('refuses to drop a column that has a wire on it', () => {
    const wired = new Set(['h']);
    // The wire's far end is a port on another node; a click here does not get
    // to remove it. Every other column still toggles normally.
    expect(columnsAfterClick(['h', 'F'], columns, wired, 'h')).toEqual(['h', 'F']);
    expect(columnsAfterClick(['h', 'F'], columns, wired, 'F')).toEqual(['h']);
  });

  it('still adds a column whose name is wired but not currently projected', () => {
    // Not a state the editor can reach — a wire needs a port, and a port
    // needs the projection — but the rule is "a wired column cannot be
    // *dropped*", and it should not read as "a wired column is frozen".
    expect(columnsAfterClick([], columns, new Set(['h']), 'h')).toEqual(['h']);
  });
});

/**
 * A column's unit is picked in its header, and the grid, the port and the
 * wire leaving it all read the one choice.
 */
describe("a table column's unit", () => {
  const node: TableNode = {
    id: 'table',
    kind: 'table',
    position: { x: 0, y: 0 },
    table: { id: 'invented.table', version: 1, hash: '' },
    rows: [],
    columns: [],
  };
  const strength = { kind: 'numeric', name: 'S', unit: parseUnit('Pa') } as const;
  const symbols = (unit: string): readonly string[] =>
    displayUnitChoices(parseUnit(unit), true).map((choice) => choice.symbol);

  it('offers the SI steps of the unit the catalogue wrote, beside the compact menu', () => {
    expect(symbols('Pa')).toEqual(['GPa', 'MPa', 'kPa', 'Pa', 'mPa', 'µPa', 'nPa', 'N/mm²']);
  });

  it('offers the same steps to a column written in a compound unit', () => {
    // `N/mm²` takes no prefix itself, but it is a stress, and `MPa` is what
    // the picker would otherwise have no way to reach from it.
    expect(symbols('N/mm²')).toContain('MPa');
    expect(symbols('N/mm²')).toContain('N/mm²');
  });

  it('leaves the ordinary port picker without prefixed spellings', () => {
    expect(displayUnitChoices(parseUnit('Pa')).map((choice) => choice.symbol)).not.toContain('MPa');
  });

  it('reads a column in the catalogue’s unit until one is picked', () => {
    expect(columnUnit(node, strength)?.symbol).toBe('Pa');
    const picked = { ...node, displayUnits: { S: parseUnit('MPa') } };
    expect(columnUnit(picked, strength)?.symbol).toBe('MPa');
  });

  it('ignores a picked unit of another dimension rather than failing to draw', () => {
    const stale = { ...node, displayUnits: { S: parseUnit('mm') } };
    expect(columnUnit(stale, strength)?.symbol).toBe('Pa');
  });

  it('has no unit for a categorical column', () => {
    expect(columnUnit(node, { kind: 'categorical', name: 'profile', domain: ['A', 'B'] })).toBeUndefined();
  });

  it('respells a cell in the unit its header shows', () => {
    const pa = parseUnit('Pa');
    expect(cellText(250e6, PLAIN_NUMBER_FORMAT, pa, parseUnit('MPa'))).toBe('250');
    expect(cellText(null, PLAIN_NUMBER_FORMAT, pa, parseUnit('MPa'))).toBe('—');
    expect(cellText('SPZ', PLAIN_NUMBER_FORMAT)).toBe('SPZ');
  });
});
