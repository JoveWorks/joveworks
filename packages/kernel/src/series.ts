/**
 * Labelled axes, and the broadcasting that makes a two-input sweep a grid (S43).
 *
 * Every value the kernel carries is a **series over zero or more axes**. A
 * scalar is the zero-axis case rather than a separate kind, which is the whole
 * economy of S43: there is no code path that special-cases 1-D or 2-D, no grid
 * node to wire, and adding a second range to a finished graph changes nothing
 * downstream except the shape of the answer.
 *
 * An axis is introduced by a range input node and **identified by that node**.
 * Two values that both vary along `d` share an axis and line up elementwise;
 * two values varying along `d` and `T` combine into `n × m`. That is the union
 * rule, and it is the only rule.
 *
 * Data is row-major over the axes as ordered here: the last axis is contiguous.
 * Axis order is the document's order of range nodes, carried on `order`, so a
 * grid's layout does not depend on which formula happened to combine first.
 */

import { KernelError } from './errors.js';

export interface Axis {
  /** The range input node that introduced it (S43) — a plot names an axis by it. */
  readonly id: string;
  /** What to write on the axis: the node's `axisLabel`, its label, or its id. */
  readonly label: string;
  readonly length: number;
  /** Position among the document's range nodes, so a union is deterministic. */
  readonly order: number;
}

export interface NumericSeries {
  readonly kind: 'numeric';
  readonly axes: readonly Axis[];
  /** Canonical values (S5), row-major over `axes`. */
  readonly data: readonly number[];
}

export interface CategoricalSeries {
  readonly kind: 'categorical';
  readonly axes: readonly Axis[];
  readonly data: readonly string[];
}

/** A load spectrum: consumed whole, introduces no axis, cannot be swept (S36). */
export interface Spectrum {
  readonly kind: 'spectrum';
  /** Canonical values. */
  readonly values: readonly number[];
}

export type PortValue = NumericSeries | CategoricalSeries | Spectrum;
export type Series = NumericSeries | CategoricalSeries;

export function isSeries(value: PortValue): value is Series {
  return value.kind !== 'spectrum';
}

export function scalarSeries(value: number): NumericSeries {
  return { kind: 'numeric', axes: [], data: [value] };
}

export function categoricalScalar(value: string): CategoricalSeries {
  return { kind: 'categorical', axes: [], data: [value] };
}

/** How many cells a grid over these axes has. A scalar's grid has one cell. */
export function gridSize(axes: readonly Axis[]): number {
  return axes.reduce((total, axis) => total * axis.length, 1);
}

/**
 * The union of several axis lists, in document order.
 *
 * Two axes with the same id must have the same length — they are the same range
 * node, so a disagreement means the graph was evaluated against two different
 * versions of it, which is a bug here rather than a user error.
 */
export function unionAxes(...lists: readonly (readonly Axis[])[]): readonly Axis[] {
  const byId = new Map<string, Axis>();
  for (const list of lists) {
    for (const axis of list) {
      const existing = byId.get(axis.id);
      if (existing === undefined) {
        byId.set(axis.id, axis);
        continue;
      }
      if (existing.length !== axis.length) {
        throw new KernelError(
          `axis '${axis.id}' appears with lengths ${existing.length} and ${axis.length}`,
        );
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

/**
 * Strides of a row-major grid, one per axis. The last axis is contiguous, so it
 * has stride 1 and the first has the largest.
 */
function strides(axes: readonly Axis[]): readonly number[] {
  const result = new Array<number>(axes.length).fill(1);
  for (let i = axes.length - 2; i >= 0; i -= 1) {
    result[i] = (result[i + 1] as number) * (axes[i + 1] as Axis).length;
  }
  return result;
}

/**
 * Map a cell of the target grid to a cell of `series`.
 *
 * An axis the series does not vary along contributes stride 0, which is exactly
 * what broadcasting means: the same value is read for every coordinate along it.
 * A series whose axes are not a subset of the target is a caller error — the
 * target is always built as a union that includes them.
 */
export function indexer(series: Series, target: readonly Axis[]): (cell: number) => number {
  if (series.axes.length === 0) return () => 0;

  const targetStrides = strides(target);
  const seriesStrides = strides(series.axes);

  const contributions: Array<{ divisor: number; length: number; stride: number }> = [];
  for (const [i, axis] of target.entries()) {
    const position = series.axes.findIndex((own) => own.id === axis.id);
    if (position === -1) continue;
    contributions.push({
      divisor: targetStrides[i] as number,
      length: axis.length,
      stride: seriesStrides[position] as number,
    });
  }

  if (contributions.length !== series.axes.length) {
    throw new KernelError('a series carries an axis the target grid does not');
  }

  return (cell) => {
    let index = 0;
    for (const { divisor, length, stride } of contributions) {
      index += (Math.floor(cell / divisor) % length) * stride;
    }
    return index;
  };
}

/** Read one cell of a numeric series, broadcast over `target`. */
export function reader(series: NumericSeries, target: readonly Axis[]): (cell: number) => number {
  const index = indexer(series, target);
  const { data } = series;
  return (cell) => data[index(cell)] as number;
}

/**
 * S43's guard: warn when a grid grows large enough to be felt.
 *
 * A warning and not a refusal — a 40 000-point study is a legitimate thing to
 * ask for, and the study is the primary use of this tool (S29). What is not
 * legitimate is discovering the cost after the browser stops responding.
 */
export const LARGE_GRID = 10_000;
