/**
 * The notebook side of marking: letters, ordering, and the per-cell lookup
 * every figure draws from.
 *
 * The matching itself belongs to the kernel (`candidates.test.ts`); what is
 * checked here is the part a reader actually sees — that a design carries the
 * same letter everywhere, and that the letter does not move when something else
 * is marked.
 */

import { describe, expect, it } from 'vitest';

import type { AxisReadout } from '@joveworks/kernel';
import type { GraphDocument } from '@joveworks/schema';

import { resolveMarks } from './marks';

const axis = (id: string, length: number, order: number) => ({ id, label: id, length, order });
const UNIT = { symbol: '', dimension: {}, scale: 1, offset: 0 } as unknown as AxisReadout['unit'];

const d = axis('d', 3, 0);
const T = axis('T', 2, 1);

const readouts = new Map<string, AxisReadout>([
  ['d', { axis: d, coordinates: { kind: 'numeric', axes: [d], data: [10, 20, 30] }, unit: UNIT }],
  ['T', { axis: T, coordinates: { kind: 'numeric', axes: [T], data: [20, 80] }, unit: UNIT }],
]);

const documentWith = (marks: GraphDocument['marks']): GraphDocument => ({
  schemaVersion: 1,
  id: 'g',
  title: 'T',
  nodes: [],
  edges: [],
  frames: [],
  ...(marks === undefined ? {} : { marks }),
});

describe('letters', () => {
  it('numbers marks A, B, C by their position in the document', () => {
    const index = resolveMarks(documentWith([{ at: { d: 10 } }, { at: { d: 30 } }]), [d], readouts);
    expect(index.marks.map((mark) => mark.letter)).toEqual(['A', 'B']);
  });

  it('gives one design the same letter on grids of different shapes', () => {
    // The whole promise of marking: A on the scatter is A in the table.
    const document = documentWith([{ at: { d: 20, T: 80 } }]);
    const onFullGrid = resolveMarks(document, [d, T], readouts);
    const onCurve = resolveMarks(document, [d], readouts);
    expect(onFullGrid.marks[0]?.letter).toBe('A');
    expect(onCurve.marks[0]?.letter).toBe('A');
    // …even though it pins one cell of the grid and one point of the curve.
    expect(onFullGrid.marks[0]?.cells).toEqual([3]);
    expect(onCurve.marks[0]?.cells).toEqual([1]);
  });

  it('keeps counting past Z', () => {
    const many = Array.from({ length: 27 }, (_unused, i) => ({ at: { d: i } }));
    const index = resolveMarks(documentWith(many), [d], readouts);
    expect(index.marks[25]?.letter).toBe('Z');
    expect(index.marks[26]?.letter).toBe('AA');
  });
});

describe('the per-cell lookup', () => {
  it('reports nothing marked when the document has no marks', () => {
    const index = resolveMarks(documentWith(undefined), [d], readouts);
    expect(index.any).toBe(false);
    expect(index.at(0)).toEqual([]);
  });

  it('finds a mark under the cell it pins', () => {
    const index = resolveMarks(documentWith([{ at: { d: 30 } }]), [d], readouts);
    expect(index.any).toBe(true);
    expect(index.at(2).map((mark) => mark.letter)).toEqual(['A']);
    expect(index.at(0)).toEqual([]);
  });

  it('lights a whole row for a mark that names fewer axes than the grid has', () => {
    const index = resolveMarks(documentWith([{ at: { d: 20 } }]), [d, T], readouts);
    expect(index.marks[0]?.cells).toEqual([2, 3]);
    expect(index.at(2)).toHaveLength(1);
    expect(index.at(3)).toHaveLength(1);
  });

  it('reports both marks on a cell two of them identify', () => {
    const index = resolveMarks(documentWith([{ at: { d: 20 } }, { at: { d: 20, T: 20 } }]), [d, T], readouts);
    expect(index.at(2).map((mark) => mark.letter)).toEqual(['A', 'B']);
    expect(index.at(3).map((mark) => mark.letter)).toEqual(['A']);
  });

  it('flags a mark it had to snap, so a figure can say so', () => {
    const moved = new Map<string, AxisReadout>([
      ['d', { axis: d, coordinates: { kind: 'numeric', axes: [d], data: [12, 22, 32] }, unit: UNIT }],
    ]);
    const index = resolveMarks(documentWith([{ at: { d: 20 } }]), [d], moved);
    expect(index.marks[0]?.approximate).toBe(true);
    expect(index.marks[0]?.cells).toEqual([1]);
  });

  it('leaves a mark the range no longer reaches with no cells, rather than moving it', () => {
    const elsewhere = new Map<string, AxisReadout>([
      ['d', { axis: d, coordinates: { kind: 'numeric', axes: [d], data: [100, 200, 300] }, unit: UNIT }],
    ]);
    const index = resolveMarks(documentWith([{ at: { d: 20 } }]), [d], elsewhere);
    expect(index.marks[0]?.cells).toEqual([]);
    expect(index.any).toBe(false);
  });
});
