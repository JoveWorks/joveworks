import { describe, expect, it } from 'vitest';

import { columnsAfterClick, rowsAfterClick } from './TableNodeView';

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
