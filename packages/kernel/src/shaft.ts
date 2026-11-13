/**
 * The closed forms behind a `shaft` record (`FormulaShaft` in the schema):
 * a shaft on any arrangement of supports, loaded in one transverse plane at
 * a time, with its stiffness EI constant within each section.
 *
 * Everything acting on the shaft is one list of **terms** of the bending
 * moment, `M(z) = Σ a·(z − p)^k` over the terms with `p ≤ z`:
 *
 * - a force F at p is `F·(z − p)`, k = 1;
 * - a couple C at p is `C`, k = 0 (positive clockwise with z to the right,
 *   so the moment steps up by it);
 * - a uniform load q from f to t is `q/2·(z − f)² − q/2·(z − t)²`, two k = 2
 *   terms — past t that is its total at its centroid, as it should be.
 *
 * The shear is the same terms differentiated, and the deflection the same
 * terms integrated twice over 1/EI, exactly, section by section — so a
 * stepped shaft is drawn with its real stiffness, not a sampled one.
 *
 * The reactions are more terms of the same kind, with unknown coefficients:
 * a force at every support, and a moment at every fixed one. They and the
 * two constants of integration are fixed by as many equations: the shear and
 * the moment close to zero past everything (equilibrium), the deflection is
 * zero at every support, and the slope is zero at every fixed one. That is a
 * small square linear system, solved once per grid cell — determinate and
 * statically indeterminate arrangements alike. An arrangement that cannot
 * hold the shaft (one simple support, two supports at one place) leaves it
 * singular, which is reported rather than answered.
 *
 * Canonical units throughout (mm, N, N·mm, N/mm²).
 */

import { KernelError } from './errors.js';

export interface Term {
  readonly coefficient: number;
  readonly at: number;
  readonly power: 0 | 1 | 2;
}

/** A stretch of constant stiffness, from `start` to the next segment's start. The first reaches back to −∞, the last on to +∞. */
export interface Segment {
  readonly start: number;
  readonly stiffness: number;
}

export interface Restraint {
  readonly at: number;
  /** Takes a moment as well as a force. */
  readonly fixed: boolean;
}

export interface Solution {
  /** The applied terms with the solved reactions added. */
  readonly terms: readonly Term[];
  /** Per restraint, in order: the force and (fixed only, else 0) the moment it applies to the shaft. */
  readonly reactions: readonly { readonly force: number; readonly moment: number }[];
  readonly segments: readonly Segment[];
  /** Where the constants of integration are taken. */
  readonly origin: number;
  readonly slope: number;
  readonly offset: number;
}

/** A point load, a couple, or both, at one position. */
export function pointTerms(at: number, force: number, couple: number): readonly Term[] {
  return [
    ...(force === 0 ? [] : [{ coefficient: force, at, power: 1 as const }]),
    ...(couple === 0 ? [] : [{ coefficient: couple, at, power: 0 as const }]),
  ];
}

/** A uniform load of `rate` per length from `from` to `to`. */
export function spanTerms(from: number, to: number, rate: number): readonly Term[] {
  if (rate === 0) return [];
  return [
    { coefficient: rate / 2, at: from, power: 2 },
    { coefficient: -rate / 2, at: to, power: 2 },
  ];
}

export function moment(terms: readonly Term[], z: number): number {
  let total = 0;
  for (const term of terms) if (term.at <= z) total += term.coefficient * (z - term.at) ** term.power;
  return total;
}

export function shear(terms: readonly Term[], z: number): number {
  let total = 0;
  for (const term of terms) {
    if (term.at > z || term.power === 0) continue;
    total += term.coefficient * term.power * (z - term.at) ** (term.power - 1);
  }
  return total;
}

/**
 * `∫ from origin to z` of one term over 1/EI — `weighted` false — or of
 * (z − t) times it, the Cauchy form of a double integral — `weighted` true.
 * Exact: within a segment past the term's position the integrand is a
 * polynomial in s = t − p.
 */
function integral(term: Term, segments: readonly Segment[], origin: number, z: number, weighted: boolean): number {
  const lo = Math.min(origin, z);
  const hi = Math.max(origin, z);
  const sign = z >= origin ? 1 : -1;
  const k = term.power;
  const arm = z - term.at;
  const antiderivative = (s: number): number =>
    weighted ? (arm * s ** (k + 1)) / (k + 1) - s ** (k + 2) / (k + 2) : s ** (k + 1) / (k + 1);
  let total = 0;
  segments.forEach((segment, i) => {
    const start = i === 0 ? -Infinity : segment.start;
    const end = segments[i + 1]?.start ?? Infinity;
    const from = Math.max(lo, start, term.at);
    const to = Math.min(hi, end);
    if (to <= from) return;
    total += (antiderivative(to - term.at) - antiderivative(from - term.at)) / segment.stiffness;
  });
  return sign * term.coefficient * total;
}

/** Gaussian elimination with partial pivoting, each row scaled to its largest entry first. */
function solveLinear(matrix: number[][], rhs: number[]): number[] | undefined {
  const n = rhs.length;
  for (let row = 0; row < n; row += 1) {
    const scale = Math.max(...(matrix[row] as number[]).map(Math.abs));
    if (scale === 0) return undefined;
    matrix[row] = (matrix[row] as number[]).map((value) => value / scale);
    rhs[row] = (rhs[row] as number) / scale;
  }
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs((matrix[row] as number[])[col] as number) > Math.abs((matrix[pivot] as number[])[col] as number)) pivot = row;
    }
    if (Math.abs((matrix[pivot] as number[])[col] as number) < 1e-10) return undefined;
    [matrix[col], matrix[pivot]] = [matrix[pivot] as number[], matrix[col] as number[]];
    [rhs[col], rhs[pivot]] = [rhs[pivot] as number, rhs[col] as number];
    const top = matrix[col] as number[];
    for (let row = col + 1; row < n; row += 1) {
      const current = matrix[row] as number[];
      const factor = (current[col] as number) / (top[col] as number);
      if (factor === 0) continue;
      for (let j = col; j < n; j += 1) current[j] = (current[j] as number) - factor * (top[j] as number);
      rhs[row] = (rhs[row] as number) - factor * (rhs[col] as number);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    const current = matrix[row] as number[];
    let sum = rhs[row] as number;
    for (let j = row + 1; j < n; j += 1) sum -= (current[j] as number) * (x[j] as number);
    x[row] = sum / (current[row] as number);
  }
  return x;
}

/**
 * The reactions and the constants of integration for one plane. Throws a
 * plain `KernelError` (no location — the caller names the node) when the
 * restraints cannot hold the shaft.
 */
export function solve(applied: readonly Term[], restraints: readonly Restraint[], segments: readonly Segment[], origin: number): Solution {
  // The unknowns, in order: each restraint's force, each fixed restraint's
  // moment, then the slope and the offset at the origin.
  const unknownTerms: Term[] = [
    ...restraints.map((restraint) => ({ coefficient: 1, at: restraint.at, power: 1 as const })),
    ...restraints.filter((restraint) => restraint.fixed).map((restraint) => ({ coefficient: 1, at: restraint.at, power: 0 as const })),
  ];
  const n = unknownTerms.length + 2;
  const beyond = Math.max(origin, ...applied.map((term) => term.at), ...restraints.map((restraint) => restraint.at)) + 1;

  const matrix: number[][] = [];
  const rhs: number[] = [];
  const row = (unknown: (term: Term) => number, slope: number, offset: number, known: number): void => {
    matrix.push([...unknownTerms.map(unknown), slope, offset]);
    rhs.push(-known);
  };
  // Equilibrium: past everything, nothing is left over.
  row((term) => shear([term], beyond), 0, 0, shear(applied, beyond));
  row((term) => moment([term], beyond), 0, 0, moment(applied, beyond));
  const deflectionOf = (terms: readonly Term[], z: number): number =>
    terms.reduce((total, term) => total + integral(term, segments, origin, z, true), 0);
  const slopeOf = (terms: readonly Term[], z: number): number =>
    terms.reduce((total, term) => total + integral(term, segments, origin, z, false), 0);
  for (const restraint of restraints) {
    row((term) => deflectionOf([term], restraint.at), restraint.at - origin, 1, deflectionOf(applied, restraint.at));
  }
  for (const restraint of restraints.filter((candidate) => candidate.fixed)) {
    row((term) => slopeOf([term], restraint.at), 1, 0, slopeOf(applied, restraint.at));
  }

  const x = matrix.length === n ? solveLinear(matrix, rhs) : undefined;
  if (x === undefined) {
    throw new KernelError(
      restraints.length === 0
        ? 'nothing holds this shaft — wire a Support node into its acting port'
        : 'these supports cannot hold the shaft — a single simple support lets it rotate, and two at one position act as one',
    );
  }
  const solvedTerms = unknownTerms.map((term, i) => ({ ...term, coefficient: x[i] as number }));
  let fixedIndex = restraints.length;
  const reactions = restraints.map((restraint, i) => ({
    force: x[i] as number,
    moment: restraint.fixed ? (x[fixedIndex++] as number) : 0,
  }));
  return {
    terms: [...applied, ...solvedTerms],
    reactions,
    segments,
    origin,
    slope: x[n - 2] as number,
    offset: x[n - 1] as number,
  };
}

/** y(z) for a solved plane. */
export function deflection(solution: Solution, z: number): number {
  let total = solution.offset + solution.slope * (z - solution.origin);
  for (const term of solution.terms) total += integral(term, solution.segments, solution.origin, z, true);
  return total;
}

/** θ(z) = dy/dz for a solved plane. */
export function slope(solution: Solution, z: number): number {
  let total = solution.slope;
  for (const term of solution.terms) total += integral(term, solution.segments, solution.origin, z, false);
  return total;
}

/** The running total of applied torque at or before z. */
export function torque(points: readonly { readonly at: number; readonly torque: number }[], z: number): number {
  let total = 0;
  for (const point of points) if (point.at <= z) total += point.torque;
  return total;
}
