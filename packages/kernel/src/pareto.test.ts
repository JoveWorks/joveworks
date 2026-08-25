/**
 * Domination, tested against fronts small enough to check by eye — and against
 * a brute-force reference on random grids, which is what keeps the sort-and-
 * sweep implementation honest.
 *
 * Every number here is invented: pairs of scores with no units and no formula
 * behind them. What is under test is the comparison rule, not any equation.
 */

import { describe, expect, it } from 'vitest';

import { paretoFront, type ParetoDirection } from './pareto.js';

/** The definition, applied to every pair — deliberately the slow, obvious way. */
function bruteForce(
  x: readonly number[],
  y: readonly number[],
  feasible: readonly boolean[],
  xDirection: ParetoDirection,
  yDirection: ParetoDirection,
): readonly boolean[] {
  const xSign = xDirection === 'minimize' ? 1 : -1;
  const ySign = yDirection === 'minimize' ? 1 : -1;
  const competes = (i: number): boolean =>
    feasible[i] === true && Number.isFinite(x[i] as number) && Number.isFinite(y[i] as number);

  return x.map((_unused, i) => {
    if (!competes(i)) return false;
    const xi = xSign * (x[i] as number);
    const yi = ySign * (y[i] as number);
    return !x.some((_ignored, j) => {
      if (j === i || !competes(j)) return false;
      const xj = xSign * (x[j] as number);
      const yj = ySign * (y[j] as number);
      return xj <= xi && yj <= yi && (xj < xi || yj < yi);
    });
  });
}

const allFeasible = (n: number): readonly boolean[] => new Array<boolean>(n).fill(true);

describe('the front', () => {
  it('keeps the candidates nothing beats on both objectives', () => {
    // (1,5) (2,3) (4,2) trade off; (3,4) is beaten by (2,3), and (5,6) by all.
    const x = [1, 2, 4, 3, 5];
    const y = [5, 3, 2, 4, 6];
    const { onFront } = paretoFront(x, y, allFeasible(5), 'minimize', 'minimize');
    expect(onFront).toEqual([true, true, true, false, false]);
  });

  it('flips with the direction, without changing which points exist', () => {
    const x = [1, 2, 4, 3, 5];
    const y = [5, 3, 2, 4, 6];
    // Maximising both, the corner of the cloud that wins is the opposite one.
    const { onFront } = paretoFront(x, y, allFeasible(5), 'maximize', 'maximize');
    expect(onFront).toEqual(bruteForce(x, y, allFeasible(5), 'maximize', 'maximize'));
    expect(onFront[4]).toBe(true); // (5,6) — largest on both
  });

  it('keeps both copies of a duplicate, because neither is strictly better', () => {
    const x = [2, 2, 5];
    const y = [3, 3, 1];
    const { onFront } = paretoFront(x, y, allFeasible(3), 'minimize', 'minimize');
    expect(onFront).toEqual([true, true, true]);
  });

  it('drops a candidate tied on x but worse on y', () => {
    // Same x, so only a strictly smaller y dominates — the tie case a
    // one-cell-at-a-time sweep gets wrong in both directions.
    const x = [2, 2, 2];
    const y = [1, 3, 2];
    const { onFront } = paretoFront(x, y, allFeasible(3), 'minimize', 'minimize');
    expect(onFront).toEqual([true, false, false]);
  });

  it('is a single point when one candidate wins outright', () => {
    const { onFront } = paretoFront([1, 2, 3], [1, 2, 3], allFeasible(3), 'minimize', 'minimize');
    expect(onFront).toEqual([true, false, false]);
  });
});

describe('what cannot compete', () => {
  it('leaves an infeasible candidate off the front even when it would have won', () => {
    const x = [1, 2, 4];
    const y = [1, 3, 2];
    // (1,1) dominates everything, and fails a check.
    const { onFront } = paretoFront(x, y, [false, true, true], 'minimize', 'minimize');
    expect(onFront).toEqual([false, true, true]);
  });

  it('does not let an infeasible candidate dominate a feasible one', () => {
    const { onFront } = paretoFront([1, 2], [1, 2], [false, true], 'minimize', 'minimize');
    expect(onFront[1]).toBe(true);
  });

  it('counts a candidate with no value on an objective, and excludes it', () => {
    const { onFront, undefinedPoints } = paretoFront(
      [1, Number.NaN, 3],
      [3, 1, 1],
      allFeasible(3),
      'minimize',
      'minimize',
    );
    expect(undefinedPoints).toBe(1);
    expect(onFront).toEqual([true, false, true]);
  });

  it('returns an empty front when nothing is feasible, rather than throwing', () => {
    const { onFront } = paretoFront([1, 2], [2, 1], [false, false], 'minimize', 'minimize');
    expect(onFront).toEqual([false, false]);
  });
});

describe('the fast path agrees with the definition', () => {
  it('matches a brute-force pairwise search on random grids, in every direction', () => {
    // Deterministic, so a failure is reproducible: a small LCG rather than
    // Math.random, and coarse values so ties and duplicates actually occur.
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const directions: readonly ParetoDirection[] = ['minimize', 'maximize'];
    for (let trial = 0; trial < 40; trial += 1) {
      const size = 1 + Math.floor(next() * 60);
      const x = Array.from({ length: size }, () => Math.floor(next() * 8));
      const y = Array.from({ length: size }, () => Math.floor(next() * 8));
      const feasible = Array.from({ length: size }, () => next() > 0.25);
      for (const xDirection of directions) {
        for (const yDirection of directions) {
          expect(paretoFront(x, y, feasible, xDirection, yDirection).onFront).toEqual(
            bruteForce(x, y, feasible, xDirection, yDirection),
          );
        }
      }
    }
  });
});
