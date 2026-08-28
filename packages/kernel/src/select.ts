/**
 * Reduce along the axis a coordinate series introduces, keeping every other
 * axis intact.
 *
 * This is the primitive the kernel was missing. Reductions in the base node
 * library (`arrayNodes`) run over a *variadic port*, which introduces no axis
 * at all; sweeps carry axes, but nothing collapsed one and recovered the
 * coordinate at which something happened. "Deflection crosses its limit at
 * 38.2 mm" needs exactly that, and so do the first passing standard size and
 * the position of an extremum.
 *
 * The reduce axis is **not named**: it is whatever single axis the `along`
 * series carries, which is why a Select node learns its axis by having the
 * swept range wired into a port rather than by picking an id from a dropdown.
 * Zero axes or more than one is an error with a real message, not a guess.
 *
 * A 1-D sweep collapses to a scalar; a 2-D study collapses to a 1-D result —
 * a crossing size per temperature — which stays broadcastable and plottable
 * like any other series. That falls out of keeping every axis but the reduced
 * one, and needs no special case.
 *
 * **Nothing found is a normal state**, not an exception: a partly-failing
 * study has cells where no crossing exists and cells where nothing passes.
 * Those become `NaN` plus a warning. Errors here stay reserved for wiring,
 * which is the line `warnings.ts` draws.
 */

import type { SelectDirection, SelectMode } from '@joveworks/schema';

import { KernelError } from './errors.js';
import {
  gridSize,
  indexer,
  unionAxes,
  type Axis,
  type CategoricalSeries,
  type NumericSeries,
  type Series,
} from './series.js';
import type { Warning } from './warnings.js';

/**
 * How far the linear estimate may sit from a quadratic through one extra
 * neighbouring sample before the sweep is called too coarse to interpolate on
 * — as a fraction of the bracketing interval's own width, so it is scale-free.
 *
 * A real numerical criterion rather than a point count: three points across a
 * gentle curve interpolate fine, and thirty across a knee do not.
 */
export const COARSE_SWEEP_TOLERANCE = 0.05;

export interface SelectRequest {
  readonly mode: SelectMode;
  /** Numeric for every mode but `firstPassing`, which reads a Compare verdict. */
  readonly value: Series;
  /** The swept coordinate: its single axis is the axis reduced. */
  readonly along: NumericSeries;
  /** Canonical, and required by `crossing` alone. */
  readonly threshold?: number;
  readonly direction?: SelectDirection;
  /** The node to attach warnings to. */
  readonly nodeId: string;
  /** Names the axis in a message — `along`'s own label reads better than its id. */
  readonly alongLabel?: string;
}

export interface SelectResult {
  /** The headline answer: the `along` coordinate, over every axis but the reduced one. */
  readonly at: NumericSeries;
  /** The objective's value at the winner — `argMin`/`argMax` only. */
  readonly best?: NumericSeries;
  /**
   * Every crossing found, one list per cell of `at`, in `along` order.
   *
   * A series has a fixed grid shape, so a variable number of roots per cell
   * cannot itself be the wired value — `at` is the first, and this rides
   * alongside for the canvas readout and the `selectExtraCrossings` warning.
   * Empty for every mode but `crossing`.
   */
  readonly crossings: readonly (readonly number[])[];
  readonly warnings: readonly Warning[];
}

/**
 * The axis being reduced, and the axes that survive.
 *
 * `ordered` is the output axes with the reduce axis appended last, which makes
 * cell `c` of the output at reduce index `k` the cell `c * length + k` of that
 * ordering — so `indexer` does all the broadcasting and there is no index
 * arithmetic here of its own.
 */
function reduceAxes(
  value: Series,
  along: NumericSeries,
  nodeId: string,
): { readonly axis: Axis; readonly out: readonly Axis[]; readonly ordered: readonly Axis[] } {
  const [axis, ...extra] = along.axes;
  if (axis === undefined) {
    throw new KernelError(
      "'along' does not vary — wire the swept range into 'along' so there is an axis to search",
      `${nodeId}.along`,
    );
  }
  if (extra.length > 0) {
    throw new KernelError(
      `'along' varies along ${along.axes.length} axes ` +
        `(${along.axes.map((entry) => entry.label).join(', ')}) — it must name exactly one to search`,
      `${nodeId}.along`,
    );
  }
  const out = unionAxes(value.axes, along.axes).filter((entry) => entry.id !== axis.id);
  return { axis, out, ordered: [...out, axis] };
}

/** Whether a sign change from `before` to `after` counts, given the direction asked for. */
function crosses(before: number, after: number, direction: SelectDirection): boolean {
  // `<= 0` on the near side and `> 0` on the far side, rather than a strict
  // sign test on both: a sample sitting exactly on the bound is a crossing,
  // and this reports it once — on the interval it opens, never again on the
  // one it closes.
  const rising = before <= 0 && after > 0;
  const falling = before >= 0 && after < 0;
  if (direction === 'rising') return rising;
  if (direction === 'falling') return falling;
  return rising || falling;
}

/**
 * The root of the quadratic through three samples, as an offset from `x0` —
 * the second opinion the coarse-sweep check compares the straight line
 * against. `undefined` when the three are collinear (nothing to disagree
 * with) or when no root of the parabola lands in the bracketing interval.
 */
function quadraticRoot(
  xs: readonly [number, number, number],
  ds: readonly [number, number, number],
  span: number,
): number | undefined {
  const [x0, x1, x2] = xs;
  const [d0, d1, d2] = ds;
  // Lagrange through the three points, shifted so x0 is the origin: the
  // shift keeps the coefficients well-conditioned on a sweep whose
  // coordinates are large compared with its steps.
  const u1 = x1 - x0;
  const u2 = x2 - x0;
  if (u1 === 0 || u2 === 0 || u1 === u2) return undefined;
  const a = d0 / (u1 * u2) + d1 / (u1 * (u1 - u2)) + d2 / (u2 * (u2 - u1));
  const b =
    (-d0 * (u1 + u2)) / (u1 * u2) - (d1 * u2) / (u1 * (u1 - u2)) - (d2 * u1) / (u2 * (u2 - u1));
  const c = d0;
  if (a === 0 || b === 0) return undefined;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return undefined;
  // The stable pair, not `(-b ± √D) / 2a`. Three samples off a nearly
  // straight line make `a` a rounding-error-sized number, and the textbook
  // form then computes the root *near* the bracket as a difference of two
  // almost-equal quantities divided by that — which returned 8 where the
  // answer was 5 and reported a perfectly linear ramp as too coarse to
  // interpolate. `c / q` never subtracts anything close to itself.
  const q = -(b + Math.sign(b) * Math.sqrt(discriminant)) / 2;
  const candidates = [c / q, q / a];
  const low = Math.min(0, span);
  const high = Math.max(0, span);
  const inside = candidates.filter((entry) => entry >= low && entry <= high);
  if (inside.length === 0) return undefined;
  // The one nearest the interval this crossing was bracketed on, so a
  // parabola with a second root elsewhere does not masquerade as disagreement.
  return inside.reduce((best, entry) => (Math.abs(entry) < Math.abs(best) ? entry : best));
}

/** Every crossing along one column, interpolated, in `along` order. */
export function crossingsAlong(
  values: readonly number[],
  coordinates: readonly number[],
  threshold: number,
  direction: SelectDirection,
): { readonly roots: readonly number[]; readonly coarse: boolean } {
  const roots: number[] = [];
  let coarse = false;
  const deviation = (index: number): number => (values[index] as number) - threshold;

  for (let k = 0; k + 1 < values.length; k += 1) {
    const d0 = deviation(k);
    const d1 = deviation(k + 1);
    if (!Number.isFinite(d0) || !Number.isFinite(d1)) continue;
    if (!crosses(d0, d1, direction)) continue;

    const x0 = coordinates[k] as number;
    const x1 = coordinates[k + 1] as number;
    const span = x1 - x0;
    // d1 === d0 cannot happen here: `crosses` requires a strict inequality on
    // one side, so the two deviations always differ.
    const linear = (-d0 / (d1 - d0)) * span;
    roots.push(x0 + linear);

    // The extra sample for the second opinion: the neighbour after the
    // bracket where there is one, else the neighbour before it.
    const third = k + 2 < values.length ? k + 2 : k - 1;
    if (third < 0 || third >= values.length) continue;
    const quadratic = quadraticRoot(
      [x0, x1, coordinates[third] as number],
      [d0, d1, deviation(third)],
      span,
    );
    if (quadratic === undefined) continue;
    if (Math.abs(quadratic - linear) > COARSE_SWEEP_TOLERANCE * Math.abs(span)) coarse = true;
  }

  // The last sample sitting exactly on the bound opens no interval of its
  // own, so the walk above cannot see it — and "the curve meets its limit
  // exactly at the largest size you swept" is a real answer, not a miss.
  const last = values.length - 1;
  const arrival = last > 0 ? deviation(last - 1) : Number.NaN;
  if (
    deviation(last) === 0 &&
    Number.isFinite(arrival) &&
    arrival !== 0 &&
    (direction === 'any' || (direction === 'rising' ? arrival < 0 : arrival > 0))
  ) {
    roots.push(coordinates[last] as number);
  }

  return { roots, coarse };
}

/**
 * Walk the reduce axis for every remaining-axis cell, and answer with the
 * coordinate where the mode's event happened.
 */
export function select(request: SelectRequest): SelectResult {
  const { mode, value, along, nodeId } = request;
  const { axis, out, ordered } = reduceAxes(value, along, nodeId);
  const axisLabel = request.alongLabel ?? axis.label;

  if (mode === 'firstPassing') {
    if (value.kind !== 'categorical') {
      throw new KernelError(
        "'firstPassing' reads a pass/fail verdict — wire a Compare node's verdict into 'value'",
        `${nodeId}.value`,
      );
    }
  } else if (value.kind !== 'numeric') {
    throw new KernelError(
      `'${mode}' needs a numeric value, not a categorical one`,
      `${nodeId}.value`,
    );
  }

  const readValue = indexer(value, ordered);
  const readAlong = indexer(along, ordered);
  const cells = gridSize(out);
  const at = new Array<number>(cells).fill(Number.NaN);
  const best = new Array<number>(cells).fill(Number.NaN);
  const crossings: (readonly number[])[] = [];
  const warnings: Warning[] = [];

  let empty = 0;
  let coarseCells = 0;
  let extraCells = 0;

  for (let cell = 0; cell < cells; cell += 1) {
    const base = cell * axis.length;
    const coordinates = Array.from(
      { length: axis.length },
      (_unused, k) => along.data[readAlong(base + k)] as number,
    );

    if (mode === 'firstPassing') {
      const data = (value as CategoricalSeries).data;
      const found = coordinates.findIndex(
        (_unused, k) => data[readValue(base + k)] === 'pass',
      );
      crossings.push([]);
      if (found === -1) empty += 1;
      else at[cell] = coordinates[found] as number;
      continue;
    }

    const data = (value as NumericSeries).data;
    const column = Array.from({ length: axis.length }, (_unused, k) => data[readValue(base + k)] as number);

    if (mode === 'crossing') {
      const { roots, coarse } = crossingsAlong(
        column,
        coordinates,
        request.threshold ?? 0,
        request.direction ?? 'any',
      );
      crossings.push(roots);
      if (roots.length === 0) empty += 1;
      else at[cell] = roots[0] as number;
      if (coarse) coarseCells += 1;
      if (roots.length > 1) extraCells += 1;
      continue;
    }

    crossings.push([]);
    let winner = -1;
    for (const [k, entry] of column.entries()) {
      if (!Number.isFinite(entry)) continue;
      if (winner === -1) {
        winner = k;
        continue;
      }
      const current = column[winner] as number;
      // Strictly better, so a tie keeps the first cell in axis order.
      if (mode === 'argMin' ? entry < current : entry > current) winner = k;
    }
    if (winner === -1) empty += 1;
    else {
      at[cell] = coordinates[winner] as number;
      best[cell] = column[winner] as number;
    }
  }

  const cellCount = (count: number): string =>
    cells === 1 ? '' : ` at ${count} of ${cells} point${cells === 1 ? '' : 's'}`;

  if (empty > 0) {
    warnings.push(
      mode === 'firstPassing'
        ? {
            kind: 'selectNothingPasses',
            nodeId,
            message: `nothing along '${axisLabel}' passes${cellCount(empty)} — there is no size to report`,
          }
        : {
            kind: 'selectNoCrossing',
            nodeId,
            message:
              mode === 'crossing'
                ? `the value never crosses its threshold along '${axisLabel}'${cellCount(empty)} — ` +
                  'widen the range, or check the bound'
                : `no usable value along '${axisLabel}'${cellCount(empty)} — there is no extremum to report`,
          },
    );
  }
  if (coarseCells > 0) {
    warnings.push({
      kind: 'selectCoarseSweep',
      nodeId,
      message:
        `the sweep along '${axisLabel}' is too coarse for the crossing to be trusted` +
        `${cellCount(coarseCells)} — add points and see whether the answer moves`,
    });
  }
  if (extraCells > 0) {
    warnings.push({
      kind: 'selectExtraCrossings',
      nodeId,
      message:
        `the value crosses its threshold more than once along '${axisLabel}'` +
        `${cellCount(extraCells)} — the first is what is wired onward`,
    });
  }

  return {
    at: { kind: 'numeric', axes: out, data: at },
    ...(mode === 'argMin' || mode === 'argMax'
      ? { best: { kind: 'numeric' as const, axes: out, data: best } }
      : {}),
    crossings,
    warnings,
  };
}
