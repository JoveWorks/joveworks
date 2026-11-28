import { describe, expect, it } from 'vitest';

import type { TableNode } from '@joveworks/schema';
import { PLAIN_NUMBER_FORMAT, parseUnit } from '@joveworks/units';

import { displayUnitChoices } from './DisplayUnitPicker';
import {
  afterCellClick,
  allRowsToggled,
  cellText,
  columnUnit,
  columnsAfterCellClick,
  columnsAfterClick,
  gestureOf,
  rowsAfterGesture,
  selectionSummary,
  type RowSelection,
} from './TableNodeView';

/**
 * The two selections a table node holds, and the rules that keep each of them
 * honest: rows stay in the catalogue's order whatever order they were clicked
 * in, and a column with a wire on it cannot be clicked away.
 */
describe("a table node's selections", () => {
  const keys = ['71', '80', '90S', '90L', '100L'];
  const columns = ['h', 'a', 'F', 'profile'];

  const picked = (rows: readonly (number | string)[]): RowSelection => ({ rows, all: false });
  const none = picked([]);
  const every: RowSelection = { rows: [], all: true };

  it('reads the modifier keys as spreadsheet gestures', () => {
    expect(gestureOf({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe('only');
    expect(gestureOf({ shiftKey: false, ctrlKey: true, metaKey: false })).toBe('toggle');
    expect(gestureOf({ shiftKey: false, ctrlKey: false, metaKey: true })).toBe('toggle');
    expect(gestureOf({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe('range');
  });

  it('selects only the row a plain click lands on', () => {
    expect(rowsAfterGesture(picked(['71', '90S']), keys, '100L', 'only')).toEqual(picked(['100L']));
  });

  it('changes nothing on a plain click on the one row already picked', () => {
    expect(rowsAfterGesture(picked(['80']), keys, '80', 'only')).toEqual(picked(['80']));
  });

  it('narrows to one row on a plain click on a row already among several', () => {
    expect(rowsAfterGesture(picked(['71', '80']), keys, '80', 'only')).toEqual(picked(['80']));
  });

  it('adds and drops single rows with Ctrl/Cmd, keeping the table’s order', () => {
    let selection = none;
    for (const key of ['100L', '71', '90S']) selection = rowsAfterGesture(selection, keys, key, 'toggle');
    expect(selection).toEqual(picked(['71', '90S', '100L']));
    expect(rowsAfterGesture(selection, keys, '71', 'toggle')).toEqual(picked(['90S', '100L']));
  });

  it('adds a range with Shift, in either direction, to what is already picked', () => {
    expect(rowsAfterGesture(picked(['71']), keys, '90L', 'range', '80')).toEqual(picked(['71', '80', '90S', '90L']));
    expect(rowsAfterGesture(none, keys, '80', 'range', '90L')).toEqual(picked(['80', '90S', '90L']));
  });

  it('adds just the row on a Shift-click with no anchor yet', () => {
    expect(rowsAfterGesture(picked(['71']), keys, '90S', 'range')).toEqual(picked(['71', '90S']));
  });

  it('ends an all-rows selection as an explicit list on any row click', () => {
    expect(rowsAfterGesture(every, keys, '80', 'toggle')).toEqual(picked(['71', '90S', '90L', '100L']));
    expect(rowsAfterGesture(every, keys, '80', 'only')).toEqual(picked(['80']));
  });

  it('toggles every row from the key header, and back to none', () => {
    expect(allRowsToggled(picked(['71']))).toEqual(every);
    expect(allRowsToggled(every)).toEqual(none);
  });

  it('holds numeric row keys as numbers, so they stay coordinates', () => {
    expect(rowsAfterGesture(none, [10, 20, 30], 20, 'only')).toEqual(picked([20]));
  });

  it('projects a cell’s column, and never drops one, on a cell click', () => {
    expect(columnsAfterCellClick(['profile'], columns, 'h')).toEqual(['h', 'profile']);
    expect(columnsAfterCellClick(['h', 'profile'], columns, 'h')).toEqual(['h', 'profile']);
  });

  describe('a cell click', () => {
    const at = (rows: readonly string[], projected: readonly string[]) => ({ selection: picked(rows), columns: projected });

    it('with Ctrl/Cmd on a picked cell drops its column and keeps the row', () => {
      expect(afterCellClick(at(['80'], ['h', 'F']), keys, columns, new Set(), '80', 'h', 'toggle')).toEqual(
        at(['80'], ['F']),
      );
    });

    it('with Ctrl/Cmd in a picked row adds a column not yet projected, and keeps the row', () => {
      expect(afterCellClick(at(['80'], ['h']), keys, columns, new Set(), '80', 'F', 'toggle')).toEqual(
        at(['80'], ['h', 'F']),
      );
    });

    it('with Ctrl/Cmd keeps a wired column, as its header does', () => {
      expect(afterCellClick(at(['80'], ['h']), keys, columns, new Set(['h']), '80', 'h', 'toggle')).toEqual(
        at(['80'], ['h']),
      );
    });

    it('with Ctrl/Cmd in an unpicked row adds the row and the column', () => {
      expect(afterCellClick(at(['80'], ['h']), keys, columns, new Set(), '90S', 'F', 'toggle')).toEqual(
        at(['80', '90S'], ['h', 'F']),
      );
    });

    it('with Ctrl/Cmd in an all-rows selection drops the column, and every row stays', () => {
      const all = { selection: every, columns: ['h', 'F'] };
      expect(afterCellClick(all, keys, columns, new Set(), '80', 'h', 'toggle')).toEqual({ selection: every, columns: ['F'] });
    });

    it('plain picks only its row and projects its column', () => {
      expect(afterCellClick(at(['71', '80'], ['h']), keys, columns, new Set(), '90S', 'F', 'only')).toEqual(
        at(['90S'], ['h', 'F']),
      );
    });
  });

  it('says what a compact node has picked', () => {
    expect(selectionSummary(every, keys)).toBe('all 5 rows');
    expect(selectionSummary(picked(['80']), keys)).toBe('1 of 5 rows · 80');
    expect(selectionSummary(picked(['71', '80']), keys)).toBe('2 of 5 rows · 71, 80');
    expect(selectionSummary(picked(['80', '90S', '90L']), keys)).toBe('3 of 5 rows · 80…90L');
    expect(selectionSummary(none, keys)).toMatch(/no rows picked/u);
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
