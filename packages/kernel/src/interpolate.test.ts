import { describe, expect, it } from 'vitest';
import { LENGTH } from '@joveworks/units';

import type { JsonObject } from '@joveworks/schema';
import { evaluateDocument, valueAt } from './evaluate.js';
import { resolveGraph } from './graph.js';
import { evaluateSensitivity } from './sensitivity.js';
import {
  CATALOGUE,
  documentOf,
  formulaNode,
  input,
  interpolateNode,
  linear,
  list,
  lutNode,
  outputNode,
  refTo,
  scalar,
  wire,
} from './invented.fixtures.js';
import type { NumericSeries } from './series.js';

const catalogues = [CATALOGUE];

const column = (name: string, unit: string | undefined, values: readonly (number | string | null)[]) =>
  ({ name, ...(unit === undefined ? {} : { unit }), values }) as JsonObject;

const numeric = (value: ReturnType<typeof valueAt>): NumericSeries => {
  if (value === undefined || value.kind !== 'numeric') throw new Error('not a numeric series');
  return value;
};

/**
 * An invented band table: "over 10 up to 20 → 3, over 20 up to 30 → 7". The
 * first row has no value — it says where the first band starts.
 */
const bands = lutNode('t', [column('d', 'mm', [10, 20, 30]), column('b', 'mm', [null, 3, 7])]);

/** A lookup of `t.b` at the input `d`, in `mode`. */
function lookup(d: JsonObject, mode: string, extra: JsonObject = {}, table: JsonObject = bands) {
  return documentOf(
    [table, input('d', d), interpolateNode('k', mode, extra)],
    [wire('t.d', 'k.xs'), wire('t.b', 'k.ys'), wire('d.value', 'k.x')],
  );
}

const answer = (document: ReturnType<typeof documentOf>): readonly number[] =>
  numeric(valueAt(evaluateDocument(document, catalogues), 'k', 'y')).data;

describe('lookup table node', () => {
  it('answers with every column over one row axis, in canonical units', () => {
    const document = documentOf([lutNode('t', [column('d', 'm', [0.01, 0.02]), column('kind', undefined, ['A', 'B'])])], []);
    const evaluation = evaluateDocument(document, catalogues);
    const d = numeric(valueAt(evaluation, 't', 'd'));
    expect(d.data).toEqual([10, 20]);
    expect(d.axes.map((axis) => axis.id)).toEqual(['t']);
    const kind = valueAt(evaluation, 't', 'kind');
    expect(kind?.kind === 'categorical' ? kind.data : undefined).toEqual(['A', 'B']);
  });

  it('answers with scalars when it has a single row', () => {
    const document = documentOf([lutNode('t', [column('d', 'mm', [10])])], []);
    expect(numeric(valueAt(evaluateDocument(document, catalogues), 't', 'd')).axes).toEqual([]);
  });

  it('types each column from its unit', () => {
    const resolution = resolveGraph(documentOf([bands], []), catalogues);
    expect(resolution.sources.get('t.d')?.dimension).toEqual(LENGTH);
  });

  it('sweeps its rows when wired straight into a formula', () => {
    const document = documentOf(
      [lutNode('t', [column('w', 'mm', [2, 3]), column('h', 'mm', [5, 7])]), formulaNode('area', refTo('area'))],
      [wire('t.w', 'area.w'), wire('t.h', 'area.h')],
    );
    // Correlated by row, never crossed: 2×5 and 3×7, not a 2×2 grid.
    expect(numeric(valueAt(evaluateDocument(document, catalogues), 'area', 'A')).data).toEqual([10, 21]);
  });
});

describe('interpolate node', () => {
  it('takes the next row up, counting a key as its own band', () => {
    expect(answer(lookup(scalar(15, 'mm'), 'nextUp'))).toEqual([3]);
    expect(answer(lookup(scalar(20, 'mm'), 'nextUp'))).toEqual([3]);
    expect(answer(lookup(scalar(20.5, 'mm'), 'nextUp'))).toEqual([7]);
  });

  it('refuses a point on the row the table leaves undefined', () => {
    expect(() => answer(lookup(scalar(8, 'mm'), 'nextUp'))).toThrow(/undefined at 10/u);
  });

  it('takes the next row down', () => {
    expect(answer(lookup(scalar(25, 'mm'), 'nextDown'))).toEqual([3]);
    expect(answer(lookup(scalar(30, 'mm'), 'nextDown'))).toEqual([7]);
  });

  it('interpolates linearly between the rows either side', () => {
    const table = lutNode('t', [column('d', 'mm', [10, 20, 30]), column('b', 'mm', [1, 3, 7])]);
    expect(answer(lookup(scalar(15, 'mm'), 'linear', {}, table))).toEqual([2]);
    expect(answer(lookup(scalar(27.5, 'mm'), 'linear', {}, table))).toEqual([6]);
    expect(answer(lookup(scalar(30, 'mm'), 'linear', {}, table))).toEqual([7]);
  });

  it('matches exactly, and misses honestly', () => {
    expect(answer(lookup(scalar(30, 'mm'), 'exact'))).toEqual([7]);
    expect(() => answer(lookup(scalar(25, 'mm'), 'exact'))).toThrow(/no row of the table has the key 25/u);
  });

  it('refuses a point outside the table unless told otherwise', () => {
    expect(() => answer(lookup(scalar(35, 'mm'), 'nextUp'))).toThrow(/outside the table, which runs from 10 to 30/u);
    expect(answer(lookup(scalar(35, 'mm'), 'nextUp', { outOfRange: 'clamp' }))).toEqual([7]);
    const table = lutNode('t', [column('d', 'mm', [10, 20]), column('b', 'mm', [1, 3])]);
    expect(answer(lookup(scalar(30, 'mm'), 'linear', { outOfRange: 'extrapolate' }, table))).toEqual([5]);
    expect(answer(lookup(scalar(30, 'mm'), 'linear', { outOfRange: 'clamp' }, table))).toEqual([3]);
  });

  it('sorts rows typed out of order, and refuses a key given twice', () => {
    const shuffled = lutNode('t', [column('d', 'mm', [30, 10, 20]), column('b', 'mm', [7, 1, 3])]);
    expect(answer(lookup(scalar(15, 'mm'), 'linear', {}, shuffled))).toEqual([2]);
    const twice = lutNode('t', [column('d', 'mm', [10, 10]), column('b', 'mm', [1, 3])]);
    expect(() => answer(lookup(scalar(10, 'mm'), 'exact', {}, twice))).toThrow(/the key 10 twice/u);
  });

  it('reads the point in its own unit', () => {
    expect(answer(lookup(scalar(2.5, 'cm'), 'nextDown'))).toEqual([3]);
  });

  it('broadcasts over a swept point, reducing the table axis away', () => {
    const evaluation = evaluateDocument(lookup(list([12, 18, 22, 30], 'mm'), 'nextUp'), catalogues);
    const y = numeric(valueAt(evaluation, 'k', 'y'));
    expect(y.data).toEqual([3, 3, 7, 7]);
    expect(y.axes.map((axis) => axis.id)).toEqual(['d']);
  });

  it('answers in the value column’s dimension', () => {
    const resolution = resolveGraph(lookup(scalar(15, 'mm'), 'nextUp'), catalogues);
    expect(resolution.sources.get('k.y')?.dimension).toEqual(LENGTH);
  });

  it('refuses a point of another dimension at connection time', () => {
    expect(() => resolveGraph(lookup(scalar(15, 'N'), 'nextUp'), catalogues)).toThrow(/same kind of quantity/u);
  });

  it('refuses a point that varies along the table’s own rows', () => {
    const document = documentOf(
      [bands, interpolateNode('k', 'nextUp')],
      [wire('t.d', 'k.xs'), wire('t.b', 'k.ys'), wire('t.d', 'k.x')],
    );
    expect(() => evaluateDocument(document, catalogues)).toThrow(/the table's own rows/u);
  });

  it('looks up a categorical key exactly, and only exactly', () => {
    const table = lutNode('t', [column('profile', undefined, ['A', 'B']), column('b', 'mm', [4, 6])]);
    const document = (mode: string) =>
      documentOf(
        [table, input('p', { kind: 'categorical', value: 'B' }), interpolateNode('k', mode)],
        [wire('t.profile', 'k.xs'), wire('t.b', 'k.ys'), wire('p.value', 'k.x')],
      );
    expect(answer(document('exact'))).toEqual([6]);
    expect(() => answer(document('linear'))).toThrow(/only match exactly/u);
  });

  it('steps through a categorical value column, but will not interpolate one', () => {
    const table = lutNode('t', [column('d', 'mm', [10, 20]), column('key', undefined, ['small', 'large'])]);
    const document = (mode: string) =>
      documentOf(
        [table, input('d', scalar(15, 'mm')), interpolateNode('k', mode)],
        [wire('t.d', 'k.xs'), wire('t.key', 'k.ys'), wire('d.value', 'k.x')],
      );
    const y = valueAt(evaluateDocument(document('nextUp'), catalogues), 'k', 'y');
    expect(y?.kind === 'categorical' ? y.data : undefined).toEqual(['large']);
    expect(() => evaluateDocument(document('linear'), catalogues)).toThrow(/cannot be interpolated/u);
  });

  it('takes its mode from a wire, sweeping it like any categorical list', () => {
    const table = lutNode('t', [column('d', 'mm', [10, 20]), column('b', 'mm', [1, 3])]);
    const document = documentOf(
      [
        table,
        input('d', scalar(15, 'mm')),
        input('m', { kind: 'categoricalList', values: ['linear', 'nextUp', 'nextDown'] }),
        interpolateNode('k', 'exact'),
      ],
      [wire('t.d', 'k.xs'), wire('t.b', 'k.ys'), wire('d.value', 'k.x'), wire('m.value', 'k.mode')],
    );
    expect(answer(document)).toEqual([2, 3, 1]);
  });

  it('works on a one-row table', () => {
    const single = lutNode('t', [column('d', 'mm', [10]), column('b', 'mm', [4])]);
    expect(answer(lookup(scalar(10, 'mm'), 'exact', {}, single))).toEqual([4]);
    expect(answer(lookup(scalar(12, 'mm'), 'linear', { outOfRange: 'clamp' }, single))).toEqual([4]);
  });

  it('keeps the table whole when a sensitivity study collapses the other axes', () => {
    const table = lutNode('t', [column('d', 'mm', [10, 20, 30]), column('b', 'mm', [1, 3, 7])]);
    const document = documentOf(
      [
        table,
        input('d', linear(12, 18, 3, 'mm')),
        interpolateNode('k', 'linear'),
        outputNode('out', { kind: 'print' }),
      ],
      [wire('t.d', 'k.xs'), wire('t.b', 'k.ys'), wire('d.value', 'k.x'), wire('k.y', 'out.value')],
    );
    const [ranking] = evaluateSensitivity(document, catalogues, 'k', 'y');
    expect(ranking?.lowValue).toBeCloseTo(1.4);
    expect(ranking?.highValue).toBeCloseTo(2.6);
  });
});
