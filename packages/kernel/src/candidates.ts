/**
 * A candidate: one design in the study, identified by where it sits.
 *
 * The document holds marks as coordinates — `40` on the diameter axis,
 * `'steel'` on a material one — never as an index into a figure. Row indices
 * were the previous answer and they are wrong in the way that matters:
 * re-sample a range and the mark silently points at a different design. This
 * file is the whole of the conversion, both directions.
 *
 * **One rule, and it removes every special case:** a figure highlights every
 * cell consistent with the candidate *on the axes they share*. An axis the
 * candidate does not name is unconstrained; an axis the figure does not have is
 * ignored. So clicking a point on a Pareto scatter — which knows the whole
 * union grid — pins one design, while clicking a 1-D plot of a value that
 * varies only along `d` pins `d = 40 mm`, which then lights the whole `d = 40`
 * column on a 2-D feasibility map. Both readings are correct, and neither needs
 * code of its own.
 *
 * Resolution is exact where an exact coordinate exists. Where it does not, a
 * numeric coordinate **snaps to the nearest sample and says so** rather than
 * being silently relocated or silently dropped: the range moved under a mark
 * that was set honestly, and the reader is owed that fact. Beyond one sample
 * gap there is no neighbourhood left to snap within, and the coordinate is
 * reported missing instead. A categorical coordinate has no nearest — it
 * matches exactly or not at all.
 */

import type { Candidate } from '@joveworks/schema';
import type { Unit } from '@joveworks/units';

import { gridSize, indexer, type Axis, type Series } from './series.js';

/**
 * An axis, the coordinates along it, and the unit to read them in — everything
 * needed to say *where* a cell is. `PlotAxis` is this; a figure and a mark want
 * exactly the same three things about an axis, so they share one shape.
 */
export interface AxisReadout {
  readonly axis: Axis;
  /** The coordinates along it: the range node's own values. */
  readonly coordinates: Series;
  readonly unit: Unit;
}

/** One axis of a cell's position, ready to print. */
export interface AxisCoordinate {
  readonly axis: Axis;
  readonly value: number | string;
  /** The axis node's own display unit — meaningless for a categorical coordinate. */
  readonly unit: Unit;
}

/**
 * How a candidate landed on one figure's grid.
 *
 * `mask` is the answer; the other two are why it looks the way it does, and
 * exist so a figure can *say* that a mark moved rather than quietly drawing it
 * somewhere new.
 */
export interface CandidateMatch {
  /** One flag per cell of the grid asked about. */
  readonly mask: readonly boolean[];
  /** Axis ids whose coordinate was snapped to a neighbouring sample. */
  readonly approximate: readonly string[];
  /** Axis ids the candidate names, that this grid has, and that no sample matches. */
  readonly missing: readonly string[];
}

/**
 * Two coordinates are the same sample when they agree to within rounding.
 *
 * Coordinates come from the same range node that produced the grid, so they are
 * normally bit-identical; the tolerance is for values that have been through a
 * unit conversion and back, not for values that are genuinely different.
 */
function sameCoordinate(a: number, b: number): boolean {
  return a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Whether an axis still covers where a mark pointed.
 *
 * This is what separates "the range was re-sampled under this mark" from "the
 * range moved away from it". Inside the swept span, a coordinate that no longer
 * lands on a sample is the same design at a coarser resolution, and snapping to
 * the nearest sample is the useful answer. Outside it, the axis offers no
 * evidence at all — a mark at 40 mm on a range that now runs 100–300 mm has not
 * drifted slightly, it has stopped describing anything the study contains, and
 * pinning it to the 100 mm end would invent a design nobody chose.
 *
 * A single-sample axis therefore accepts nothing but an exact match, which is
 * right rather than degenerate: its span is one point wide.
 */
function covers(values: readonly number[], wanted: number): boolean {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return wanted >= low && wanted <= high;
}

interface AxisMatch {
  readonly index: number;
  readonly approximate: boolean;
}

/** Which sample of one axis a coordinate names, if any. */
function matchAxis(coordinates: Series, wanted: number | string): AxisMatch | undefined {
  if (coordinates.kind === 'categorical') {
    if (typeof wanted !== 'string') return undefined;
    const index = coordinates.data.indexOf(wanted);
    return index === -1 ? undefined : { index, approximate: false };
  }
  if (typeof wanted !== 'number') return undefined;

  let nearest = -1;
  let distance = Number.POSITIVE_INFINITY;
  for (const [index, value] of coordinates.data.entries()) {
    if (sameCoordinate(value, wanted)) return { index, approximate: false };
    const gap = Math.abs(value - wanted);
    if (gap < distance) {
      distance = gap;
      nearest = index;
    }
  }
  if (nearest === -1 || !covers(coordinates.data, wanted)) return undefined;
  return { index: nearest, approximate: true };
}

/**
 * The coordinate on each axis at one cell of a grid — a cell's position, said
 * in the axes' own values.
 *
 * `readouts` is keyed by axis id. An axis with no readout is skipped rather
 * than guessed at: it means the axis node's own value never resolved, which is
 * already an error reported elsewhere.
 */
export function coordinatesAt(
  axes: readonly Axis[],
  cell: number,
  readouts: ReadonlyMap<string, AxisReadout>,
): readonly AxisCoordinate[] {
  return axes.flatMap((axis): readonly AxisCoordinate[] => {
    const readout = readouts.get(axis.id);
    if (readout === undefined) return [];
    // `indexer` does the broadcasting: the coordinate series carries only its
    // own axis, and the cell is over the whole grid.
    const value = readout.coordinates.data[indexer(readout.coordinates, axes)(cell)];
    if (value === undefined) return [];
    return [{ axis, value, unit: readout.unit }];
  });
}

/** The candidate at one cell of a grid: every axis of that grid, named. */
export function candidateAt(
  axes: readonly Axis[],
  cell: number,
  readouts: ReadonlyMap<string, AxisReadout>,
): Candidate {
  return {
    at: Object.fromEntries(
      coordinatesAt(axes, cell, readouts).map((coordinate) => [coordinate.axis.id, coordinate.value]),
    ),
  };
}

/**
 * Which cells of a grid a candidate identifies.
 *
 * The intersection of the per-axis constraints it does place — so naming more
 * axes narrows the answer, and naming none would match everything, which is
 * why the schema refuses a candidate with an empty `at`.
 */
export function candidateMask(
  axes: readonly Axis[],
  candidate: Candidate,
  readouts: ReadonlyMap<string, AxisReadout>,
): CandidateMatch {
  const cells = gridSize(axes);
  const approximate: string[] = [];
  const missing: string[] = [];
  const constraints: { readonly at: (cell: number) => number; readonly index: number }[] = [];

  for (const axis of axes) {
    const wanted = candidate.at[axis.id];
    if (wanted === undefined) continue; // unconstrained on this axis
    const readout = readouts.get(axis.id);
    if (readout === undefined) {
      missing.push(axis.id);
      continue;
    }
    const match = matchAxis(readout.coordinates, wanted);
    if (match === undefined) {
      missing.push(axis.id);
      continue;
    }
    if (match.approximate) approximate.push(axis.id);
    constraints.push({ at: indexer(readout.coordinates, axes), index: match.index });
  }

  // A coordinate that matches nothing is not a weaker constraint, it is an
  // unsatisfiable one: the mark identifies no cell of this grid, and drawing it
  // at a "closest available" point would be inventing a design.
  const mask =
    missing.length > 0
      ? new Array<boolean>(cells).fill(false)
      : Array.from({ length: cells }, (_unused, cell) =>
          constraints.every((constraint) => constraint.at(cell) === constraint.index),
        );

  return { mask, approximate, missing };
}

/** Whether two candidates name the same design — the equality a toggle needs. */
export function sameCandidate(a: Candidate, b: Candidate): boolean {
  const keys = Object.keys(a.at);
  if (keys.length !== Object.keys(b.at).length) return false;
  return keys.every((key) => {
    const left = a.at[key];
    const right = b.at[key];
    if (typeof left === 'number' && typeof right === 'number') return sameCoordinate(left, right);
    return left === right;
  });
}
