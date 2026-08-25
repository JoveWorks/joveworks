/**
 * The Pareto front over two objectives.
 *
 * A design question with two answers pulling against each other has no single
 * best design, and pretending otherwise is what a single-objective study does.
 * What it has is a *front*: the candidates no other candidate beats on both
 * objectives at once. Everything else is dominated, and can be set aside
 * without an argument — which is the actual service, because it turns "all
 * these designs" into "these six are worth discussing".
 *
 * Nothing here computes anything about a design. Domination is a comparison
 * between cells the graph has already evaluated, as forward-only as
 * `sensitivity.ts` or `select.ts`.
 *
 * **Sort and sweep, not every pair.** A grid may hold `LARGE_GRID` cells, where
 * the pairwise test is 10⁸ comparisons; sorting by x and keeping the best y
 * seen so far is the classic two-objective algorithm and is a sort. The test
 * suite asserts it against the brute-force version on random grids, which is
 * what keeps the fast path honest.
 */

/** Which way an objective is better. Minimisation is the internal form. */
export type ParetoDirection = 'minimize' | 'maximize';

export interface ParetoCandidate {
  readonly cell: number;
  /** Canonical, already normalised so that smaller is better on both. */
  readonly x: number;
  readonly y: number;
  readonly feasible: boolean;
}

/**
 * Which cells are on the front.
 *
 * `a` dominates `b` when it is at least as good on both objectives and strictly
 * better on at least one. Two candidates with identical scores therefore
 * dominate each other on neither count, and **both survive** — the honest
 * answer for two designs that trade identically, and the one a strict reading
 * would silently drop one half of.
 *
 * An infeasible candidate never dominates and never joins the front, but it is
 * still returned: seeing *why* the front stops where it does is most of what a
 * Pareto chart is for, so those points are drawn rather than filtered away
 * before the figure sees them.
 *
 * A candidate whose objective is not a finite number is excluded outright and
 * counted in `undefinedPoints`. That is the ordinary state of a partly-failing
 * study, not an exception.
 */
export function paretoFront(
  x: readonly number[],
  y: readonly number[],
  feasible: readonly boolean[],
  xDirection: ParetoDirection,
  yDirection: ParetoDirection,
): { readonly onFront: readonly boolean[]; readonly undefinedPoints: number } {
  const cells = x.length;
  const onFront = new Array<boolean>(cells).fill(false);
  const competitors: ParetoCandidate[] = [];
  let undefinedPoints = 0;

  // Normalise both objectives to "smaller is better" once, here, rather than
  // branching on direction inside the comparison — one rule instead of four.
  const xSign = xDirection === 'minimize' ? 1 : -1;
  const ySign = yDirection === 'minimize' ? 1 : -1;

  for (let cell = 0; cell < cells; cell += 1) {
    const xi = x[cell] as number;
    const yi = y[cell] as number;
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) {
      undefinedPoints += 1;
      continue;
    }
    if (feasible[cell] !== true) continue;
    competitors.push({ cell, x: xSign * xi, y: ySign * yi, feasible: true });
  }

  // Ascending in x, and ascending in y within a tie. Sweeping that order, a
  // candidate is on the front exactly when no earlier one had a y at least as
  // good — every earlier candidate already has an x at least as good, so a y
  // that also ties or beats it is a domination, and nothing later can rescue
  // it.
  competitors.sort((a, b) => a.x - b.x || a.y - b.y);

  // Candidates tied on x have to be judged against the front as it stood
  // *before* their group: within the group nobody is strictly better on x, so
  // only a strictly smaller y dominates. Sweeping one cell at a time would
  // wrongly let the first member of a tied pair dominate the second.
  let bestY = Number.POSITIVE_INFINITY;
  let index = 0;
  while (index < competitors.length) {
    const groupX = (competitors[index] as ParetoCandidate).x;
    let end = index;
    while (end < competitors.length && (competitors[end] as ParetoCandidate).x === groupX) end += 1;

    // The group is sorted ascending in y, so its first member holds its best.
    const before = bestY;
    const groupBestY = (competitors[index] as ParetoCandidate).y;

    for (let i = index; i < end; i += 1) {
      const candidate = competitors[i] as ParetoCandidate;
      // Dominated from outside the group when something with a strictly better
      // x is at least as good on y; dominated from inside it when a group
      // member's y is strictly better. Equal on both is a duplicate, and
      // dominates nothing — so both copies stay.
      const beaten = before <= candidate.y || candidate.y > groupBestY;
      if (!beaten) onFront[candidate.cell] = true;
    }

    bestY = Math.min(bestY, groupBestY);
    index = end;
  }

  return { onFront, undefinedPoints };
}
