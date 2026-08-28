/**
 * What the decision card actually says.
 *
 * The prose *is* the output here — the point of this node is that a sweep
 * becomes a sentence in the report — so the two lines it writes are what is
 * under test, the same way `FeasibilityFigure.test.ts` tests its `rows`.
 */

import { describe, expect, it } from 'vitest';

import type { Axis, BestDesignResult } from '@joveworks/kernel';
import { PLAIN_NUMBER_FORMAT, parseUnit } from '@joveworks/units';

import { detail, headline } from './BestDesignCard';

const mm = parseUnit('mm');
const mm2 = parseUnit('mm²');
const diameter: Axis = { id: 'd', label: 'diameter', length: 5, order: 0 };
const labels = { floor: 'area big enough', ceiling: 'area small enough' };

const base = {
  nodeId: 'best',
  kind: 'bestDesign' as const,
  checks: ['floor', 'ceiling'],
  direction: 'minimize' as const,
  axes: [diameter],
  feasible: [false, false, true, true, false],
  objective: { kind: 'numeric' as const, axes: [diameter], data: [20, 40, 60, 80, 100] },
  unit: mm2,
  feasibleCount: 2,
};

const won: BestDesignResult = {
  ...base,
  winner: {
    cell: 2,
    objective: 60,
    at: [{ axis: diameter, value: 30, unit: mm }],
    governing: { checkId: 'floor', margin: 0.2 },
    margins: [
      { checkId: 'floor', margin: 0.2 },
      { checkId: 'ceiling', margin: 1 / 3 },
    ],
  },
};

describe('a study with a winner', () => {
  it('names the winning coordinate, its unit, and what it scores', () => {
    expect(headline(won, PLAIN_NUMBER_FORMAT)).toBe('diameter 30 mm — smallest at 60 mm².');
  });

  it('says maximised when that is what was asked for', () => {
    expect(headline({ ...won, direction: 'maximize' }, PLAIN_NUMBER_FORMAT)).toContain('largest at');
  });

  it('counts the candidates and names the governing check', () => {
    expect(detail(won, labels, PLAIN_NUMBER_FORMAT)).toBe(
      '2 of 5 candidates feasible, governed by area big enough at 20% margin.',
    );
  });

  it('falls back to the raw id for a check with no label of its own', () => {
    expect(detail(won, {}, PLAIN_NUMBER_FORMAT)).toContain('governed by floor');
  });

  it('says nothing about governing when no check could be ranked', () => {
    const unranked: BestDesignResult = {
      ...won,
      winner: { ...(won.winner as NonNullable<BestDesignResult['winner']>), margins: [] },
    };
    const { governing: _dropped, ...bareWinner } = unranked.winner as NonNullable<BestDesignResult['winner']>;
    expect(detail({ ...unranked, winner: bareWinner }, labels, PLAIN_NUMBER_FORMAT)).toBe(
      '2 of 5 candidates feasible.',
    );
  });

  it('says so when nothing constrains the choice at all', () => {
    expect(
      detail({ ...won, checks: [], feasibleCount: 5, feasible: [true, true, true, true, true] }, labels, PLAIN_NUMBER_FORMAT),
    ).toContain('nothing constrains this');
  });

  it('reports a study with no varying axis by its value alone, having no coordinate to name', () => {
    const flat: BestDesignResult = {
      ...won,
      winner: { ...(won.winner as NonNullable<BestDesignResult['winner']>), at: [] },
    };
    expect(headline(flat, PLAIN_NUMBER_FORMAT)).toBe('The smallest feasible value is 60 mm².');
  });
});

describe('a study with nothing feasible', () => {
  const none: BestDesignResult = {
    ...base,
    feasible: [false, false, false, false, false],
    feasibleCount: 0,
    blocking: { checkId: 'ceiling', failures: 4 },
  };

  it('says so as an answer rather than reporting a failure', () => {
    expect(headline(none, PLAIN_NUMBER_FORMAT)).toBe('No candidate satisfies every check at once.');
  });

  it('names the check that fails at the most candidates — where to look next', () => {
    expect(detail(none, labels, PLAIN_NUMBER_FORMAT)).toBe(
      'area small enough fails at 4 of 5 candidates — the most of any check here.',
    );
  });

  it('has nothing to point at when there is no check to blame', () => {
    const { blocking: _dropped, ...bare } = none;
    expect(detail(bare, labels, PLAIN_NUMBER_FORMAT)).toBe('There is nothing to choose from.');
  });
});
