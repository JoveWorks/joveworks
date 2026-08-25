/**
 * What the Pareto chart draws, checked without a DOM: the three standings, the
 * staircase order, and the letters.
 *
 * The staircase order is the part worth testing rather than eyeballing. It has
 * to turn through the corner that is *worse* on both objectives — the boundary
 * of what the front dominates — and which corner that is flips with the two
 * directions, so drawing it in display order would be right by accident in one
 * of the four combinations.
 */

import { describe, expect, it } from 'vitest';

import type { Axis, ParetoPoint, ParetoResult } from '@joveworks/kernel';
import { PLAIN_NUMBER_FORMAT, parseUnit } from '@joveworks/units';

import { rows, staircase } from './ParetoFigure';
import { NO_MARKS, resolveMarks } from './marks';

const mm = parseUnit('mm');
const d: Axis = { id: 'd', label: 'diameter', length: 4, order: 0 };

const point = (cell: number, x: number, y: number, feasible: boolean, onFront: boolean): ParetoPoint => ({
  cell,
  x,
  y,
  feasible,
  onFront,
  candidate: { at: { d: 10 * (cell + 1) } },
  at: [{ axis: d, value: 10 * (cell + 1), unit: mm }],
});

const result = (points: readonly ParetoPoint[], overrides: Partial<ParetoResult> = {}): ParetoResult => ({
  nodeId: 'front',
  kind: 'pareto',
  checks: [],
  axes: [d],
  points,
  xUnit: mm,
  yUnit: mm,
  xDirection: 'minimize',
  yDirection: 'minimize',
  xLabel: 'area',
  yLabel: 'deflection',
  frontCount: points.filter((entry) => entry.onFront).length,
  feasibleCount: points.filter((entry) => entry.feasible).length,
  ...overrides,
});

describe('the three standings', () => {
  const data = rows(
    result([
      point(0, 1, 4, true, true),
      point(1, 2, 3, true, false),
      point(2, 3, 2, false, false),
      point(3, 4, 1, true, true),
    ]),
    NO_MARKS,
    PLAIN_NUMBER_FORMAT,
  );

  it('separates on-front, dominated and infeasible', () => {
    expect(data.map((row) => row.standing)).toEqual(['front', 'dominated', 'infeasible', 'front']);
  });

  it('calls a failing candidate infeasible even where the kernel left it off the front', () => {
    // `feasible: false` wins over `onFront` — the two facts are different, and
    // "it failed a check" is the one a reader needs.
    const [only] = rows(result([point(0, 1, 1, false, false)]), NO_MARKS, PLAIN_NUMBER_FORMAT);
    expect(only?.standing).toBe('infeasible');
  });

  it('says which it is in the tip, alongside the coordinates', () => {
    expect(data[1]?.title).toContain('beaten on both objectives');
    expect(data[1]?.title).toContain('diameter: 20');
    expect(data[2]?.title).toContain('fails a referenced check');
  });

  it('leaves out a candidate with no value on an objective, rather than plotting a hole', () => {
    const data2 = rows(
      result([point(0, 1, 4, true, true), point(1, Number.NaN, 3, true, false)]),
      NO_MARKS,
      PLAIN_NUMBER_FORMAT,
    );
    expect(data2).toHaveLength(1);
  });
});

describe('the staircase', () => {
  const front = [point(0, 1, 4, true, true), point(1, 2, 3, true, true), point(2, 4, 1, true, true)];

  it('runs best-x first when both objectives are minimised', () => {
    const data = rows(result(front), NO_MARKS, PLAIN_NUMBER_FORMAT);
    expect(staircase(result(front), data).map((row) => row.x)).toEqual([1, 2, 4]);
  });

  it('reverses when x is maximised, so the step still turns the right way', () => {
    const maxX = result(front, { xDirection: 'maximize' });
    expect(staircase(maxX, rows(maxX, NO_MARKS, PLAIN_NUMBER_FORMAT)).map((row) => row.x)).toEqual([4, 2, 1]);
  });

  it('leaves dominated and infeasible points out of the line', () => {
    const mixed = result([point(0, 1, 4, true, true), point(1, 2, 3, true, false), point(2, 3, 2, false, false)]);
    expect(staircase(mixed, rows(mixed, NO_MARKS, PLAIN_NUMBER_FORMAT))).toHaveLength(1);
  });
});

describe('marks on the chart', () => {
  it('carries the letter of the design under each point', () => {
    const marked = resolveMarks(
      {
        schemaVersion: 1,
        id: 'g',
        title: 'T',
        nodes: [],
        edges: [],
        frames: [],
        marks: [{ at: { d: 20 } }],
      },
      [d],
      new Map([
        [
          'd',
          {
            axis: d,
            coordinates: { kind: 'numeric' as const, axes: [d], data: [10, 20, 30, 40] },
            unit: mm,
          },
        ],
      ]),
    );
    const data = rows(
      result([point(0, 1, 4, true, true), point(1, 2, 3, true, true)]),
      marked,
      PLAIN_NUMBER_FORMAT,
    );
    expect(data.map((row) => row.letter)).toEqual([undefined, 'A']);
  });

  it('carries each point’s candidate, so a click has something to mark', () => {
    const data = rows(result([point(2, 1, 4, true, true)]), NO_MARKS, PLAIN_NUMBER_FORMAT);
    expect(data[0]?.candidate).toEqual({ at: { d: 30 } });
  });
});
