/**
 * Read a table's value column at a point: the `interpolate` node's kernel.
 *
 * The table is two series over one shared axis — `xs` the key, `ys` the
 * value — and that axis is **learned from `xs`**, exactly as `select.ts`
 * learns its reduce axis from `along`: whatever single axis `xs` varies along
 * is the table's rows. It is looked up and reduced away; every other axis
 * broadcasts. A `ys` that also varies per material answers once per
 * material, and a swept `x` answers once per point of the sweep.
 *
 * `xs` with no axis at all is a one-row table, which is still a table: an
 * exact or a clamped lookup into it has an honest answer.
 *
 * Unlike a Select node's "nothing found", every miss here is an error. A
 * point outside a table of key widths, or on a row the table leaves
 * undefined, has no answer — and a `NaN` quietly carried into a stress
 * calculation downstream looks like a result. Exactly what the catalogue
 * lookup evaluator (`evaluate.ts`) does with a miss, and for that reason.
 */

import { INTERPOLATION_MODES, type InterpolationMode, type OutOfRangeRule } from '@joveworks/schema';

import { KernelError } from './errors.js';
import {
  gridSize,
  indexer,
  unionAxes,
  type Axis,
  type CategoricalSeries,
  type Series,
} from './series.js';

export interface InterpolateRequest {
  readonly xs: Series;
  readonly ys: Series;
  readonly x: Series;
  /** The node's own mode, or a categorical series of modes when `mode` is wired. */
  readonly mode: InterpolationMode | CategoricalSeries;
  readonly outOfRange: OutOfRangeRule;
  /** The node to attach errors to. */
  readonly nodeId: string;
}

/** Keys that agree to this relative tolerance are the same key — `20 mm` converted from inches still matches. */
const SAME_KEY = 1e-9;

function sameKey(a: number, b: number): boolean {
  return Math.abs(a - b) <= SAME_KEY * Math.max(1, Math.abs(a), Math.abs(b));
}

function isMode(value: string): value is InterpolationMode {
  return (INTERPOLATION_MODES as readonly string[]).includes(value);
}

/**
 * The table's row order, sorted by key: rows need not be typed in order,
 * and a step lookup means nothing until they are. Returns indices into the
 * axis, ascending by key. A key the table left empty, or one that appears
 * twice, is refused here — once, for the whole table, rather than per point.
 */
function sortedRows(keys: readonly number[], nodeId: string): readonly number[] {
  const at = `${nodeId}.xs`;
  for (const [row, key] of keys.entries()) {
    if (!Number.isFinite(key)) throw new KernelError(`row ${row + 1} of 'xs' has no key`, at);
  }
  const order = keys.map((_key, row) => row).sort((a, b) => (keys[a] as number) - (keys[b] as number));
  for (let k = 1; k < order.length; k += 1) {
    if (sameKey(keys[order[k - 1] as number] as number, keys[order[k] as number] as number)) {
      throw new KernelError(`'xs' has the key ${keys[order[k] as number]} twice — a lookup needs each key once`, at);
    }
  }
  return order;
}

/**
 * Which sorted row a step lookup lands on, or `undefined` for a miss. `k` is
 * a position in `sorted`, not a row of the table.
 */
function stepRow(
  sorted: readonly number[],
  point: number,
  mode: 'nextUp' | 'nextDown' | 'exact',
  outOfRange: OutOfRangeRule,
): number | undefined {
  const last = sorted.length - 1;
  if (mode === 'exact') {
    const k = sorted.findIndex((key) => sameKey(key, point));
    return k < 0 ? undefined : k;
  }
  if (mode === 'nextUp') {
    // An exact hit on a key is that key's own row: "up to 12" includes 12.
    const k = sorted.findIndex((key) => point <= key || sameKey(key, point));
    if (k >= 0) return k;
    return outOfRange === 'error' ? undefined : last;
  }
  let found: number | undefined;
  for (const [k, key] of sorted.entries()) {
    if (key <= point || sameKey(key, point)) found = k;
  }
  if (found !== undefined) return found;
  return outOfRange === 'error' ? undefined : 0;
}

export function interpolate(request: InterpolateRequest): Series {
  const { xs, ys, x, mode, outOfRange, nodeId } = request;
  const [axis, ...extra] = xs.axes;
  if (extra.length > 0) {
    throw new KernelError(
      `'xs' varies along ${xs.axes.length} axes (${xs.axes.map((entry) => entry.label).join(', ')}) — ` +
        "wire a table's key column, which varies along its rows alone",
      `${nodeId}.xs`,
    );
  }
  if (axis !== undefined && !ys.axes.some((entry) => entry.id === axis.id)) {
    throw new KernelError(
      `'ys' does not vary along '${axis.label}', the rows 'xs' does — wire two columns of the same table`,
      `${nodeId}.ys`,
    );
  }
  if (axis !== undefined && x.axes.some((entry) => entry.id === axis.id)) {
    throw new KernelError(
      `'x' varies along '${axis.label}', the table's own rows — it should be the point to look up, not a column of the table`,
      `${nodeId}.x`,
    );
  }
  const modes = typeof mode === 'string' ? undefined : mode;
  if (modes !== undefined && axis !== undefined && modes.axes.some((entry) => entry.id === axis.id)) {
    throw new KernelError(`'mode' varies along the table's own rows`, `${nodeId}.mode`);
  }

  const out: readonly Axis[] = unionAxes(ys.axes, x.axes, modes?.axes ?? []).filter((entry) => entry.id !== axis?.id);
  const ordered = axis === undefined ? out : [...out, axis];
  const length = axis?.length ?? 1;
  const cells = gridSize(out);
  const readX = indexer(x, ordered);
  const readY = indexer(ys, ordered);
  const readMode = modes === undefined ? undefined : indexer(modes, ordered);

  // `xs` varies along the rows alone, so its column is the same in every
  // cell: read and sort it once.
  const readXs = indexer(xs, ordered);
  const categoricalKeys = xs.kind === 'categorical';
  if (categoricalKeys !== (x.kind === 'categorical')) {
    throw new KernelError(
      categoricalKeys
        ? "'xs' holds names, so 'x' has to be one of them, not a number"
        : "'xs' holds numbers, so 'x' has to be a number, not a name",
      `${nodeId}.x`,
    );
  }
  const keyAt = (k: number): number | string => xs.data[readXs(k)] as number | string;
  const rowKeys = Array.from({ length }, (_unused, k) => keyAt(k));
  const order = categoricalKeys ? undefined : sortedRows(rowKeys as readonly number[], nodeId);
  const sortedKeys = order?.map((row) => rowKeys[row] as number);

  const numericOut = new Array<number>(cells);
  const categoricalOut = new Array<string>(cells);

  for (let cell = 0; cell < cells; cell += 1) {
    const base = cell * length;
    const cellMode = readMode === undefined ? (mode as InterpolationMode) : (modes?.data[readMode(base)] as string);
    if (!isMode(cellMode)) {
      throw new KernelError(
        `'${cellMode}' is not an interpolation — use one of ${INTERPOLATION_MODES.join(', ')}`,
        `${nodeId}.mode`,
      );
    }
    const point = x.data[readX(base)] as number | string;
    const yAt = (row: number): number | string => ys.data[readY(base + row)] as number | string;

    /** The row's value, refusing a cell the table left undefined. */
    const defined = (row: number): number | string => {
      const value = yAt(row);
      if (value === '' || (typeof value === 'number' && !Number.isFinite(value))) {
        throw new KernelError(
          `the table leaves 'ys' undefined at ${String(rowKeys[row])}, which is where ${String(point)} lands`,
          `${nodeId}.x`,
        );
      }
      return value;
    };
    const write = (value: number | string): void => {
      if (typeof value === 'number') numericOut[cell] = value;
      else categoricalOut[cell] = value;
    };

    if (categoricalKeys) {
      if (cellMode !== 'exact') {
        throw new KernelError(
          `'xs' holds names, which only match exactly — '${cellMode}' needs numbers to go between`,
          `${nodeId}.mode`,
        );
      }
      const row = rowKeys.indexOf(point);
      if (row < 0) {
        throw new KernelError(`no row of the table is called '${String(point)}'`, `${nodeId}.x`);
      }
      write(defined(row));
      continue;
    }

    const at = point as number;
    const sorted = sortedKeys as readonly number[];
    const rows = order as readonly number[];
    const missed = (): KernelError => {
      const low = sorted[0] as number;
      const high = sorted[sorted.length - 1] as number;
      return new KernelError(
        cellMode === 'exact'
          ? `no row of the table has the key ${at}`
          : `${at} is outside the table, which runs from ${low} to ${high}`,
        `${nodeId}.x`,
      );
    };

    if (cellMode !== 'linear') {
      const k = stepRow(sorted, at, cellMode, outOfRange);
      if (k === undefined) throw missed();
      write(defined(rows[k] as number));
      continue;
    }

    if (ys.kind === 'categorical') {
      throw new KernelError(
        "'ys' holds names, which cannot be interpolated between — use next up, next down or exact",
        `${nodeId}.mode`,
      );
    }
    const last = sorted.length - 1;
    const low = sorted[0] as number;
    const high = sorted[last] as number;
    const outside = at < low && !sameKey(at, low) ? 'below' : at > high && !sameKey(at, high) ? 'above' : undefined;
    if (outside !== undefined && outOfRange === 'error') throw missed();
    if (sorted.length === 1) {
      if (outside !== undefined && outOfRange === 'extrapolate') {
        throw new KernelError('a one-row table has no slope to extrapolate along', `${nodeId}.x`);
      }
      write(defined(rows[0] as number));
      continue;
    }
    if (outside !== undefined && outOfRange === 'clamp') {
      write(defined(rows[outside === 'below' ? 0 : last] as number));
      continue;
    }
    // The segment the point sits on, or — extrapolating — the end segment
    // nearest it.
    let k = 0;
    while (k < last - 1 && at > (sorted[k + 1] as number)) k += 1;
    const x0 = sorted[k] as number;
    const x1 = sorted[k + 1] as number;
    const y0 = defined(rows[k] as number) as number;
    const y1 = defined(rows[k + 1] as number) as number;
    write(sameKey(at, x0) ? y0 : sameKey(at, x1) ? y1 : y0 + ((y1 - y0) * (at - x0)) / (x1 - x0));
  }

  return ys.kind === 'numeric'
    ? { kind: 'numeric', axes: out, data: numericOut }
    : { kind: 'categorical', axes: out, data: categoricalOut };
}
