import type { Statistic } from '@joveworks/schema';

import { KernelError } from './errors.js';
import { broadcastSeries, gridSize, indexer, type Axis, type NumericSeries, type Series } from './series.js';
import type { Warning } from './warnings.js';

/** R type-7 / NumPy-default percentile, with linear interpolation. */
export function percentile(values: readonly number[], percent: number): number {
  if (values.length === 0) return Number.NaN;
  if (percent < 0 || percent > 100) throw new KernelError('percentile must be between 0 and 100');
  const sorted = [...values.filter(Number.isFinite)].sort((a, b) => a - b);
  return percentileSorted(sorted, percent);
}

function percentileSorted(sorted: readonly number[], percent: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (percent / 100) * (sorted.length - 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const fraction = position - low;
  return (sorted[low] as number) * (1 - fraction) + (sorted[high] as number) * fraction;
}

export interface StatisticRequest {
  readonly statistic: Statistic;
  readonly value: Series;
  readonly along?: NumericSeries;
  readonly percentile?: number;
  readonly match?: string;
  readonly running?: boolean;
  readonly nodeId: string;
}

export interface StatisticResult {
  readonly result: NumericSeries;
  readonly warnings: readonly Warning[];
}

function sample(values: readonly number[]): number {
  if (values.length < 2) return Number.NaN;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function calculate(request: StatisticRequest, values: readonly (number | string)[]): number {
  switch (request.statistic) {
    case 'count': return values.length;
    case 'probability': {
      const match = request.match ?? 'pass';
      return values.filter((value) => value === match).length / values.length;
    }
    default: {
      const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      if (numeric.length === 0) return Number.NaN;
      switch (request.statistic) {
        case 'mean': return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
        case 'median': return percentile(numeric, 50);
        case 'stddev': return sample(numeric);
        case 'min': return Math.min(...numeric);
        case 'max': return Math.max(...numeric);
        case 'percentile': return percentile(numeric, request.percentile ?? 50);
      }
    }
  }
  return Number.NaN;
}

function insertSorted(values: number[], value: number): void {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((values[middle] as number) <= value) low = middle + 1;
    else high = middle;
  }
  values.splice(low, 0, value);
}

/** Online scans for the statistics that admit them; quantiles retain one
 * incrementally sorted prefix. This avoids rebuilding every prefix and keeps
 * a 10,000-trial convergence plot practical. */
function runningValues(request: StatisticRequest, column: readonly (number | string)[]): readonly number[] {
  if (request.statistic === 'count') return column.map((_value, index) => index + 1);
  if (request.statistic === 'probability') {
    const match = request.match ?? 'pass';
    let matches = 0;
    return column.map((value, index) => {
      if (value === match) matches += 1;
      return matches / (index + 1);
    });
  }

  const output: number[] = [];
  const sorted: number[] = [];
  let count = 0;
  let mean = 0;
  let m2 = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of column) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      count += 1;
      const delta = value - mean;
      mean += delta / count;
      m2 += delta * (value - mean);
      min = Math.min(min, value);
      max = Math.max(max, value);
      if (request.statistic === 'median' || request.statistic === 'percentile') insertSorted(sorted, value);
    }
    switch (request.statistic) {
      case 'mean': output.push(count === 0 ? Number.NaN : mean); break;
      case 'stddev': output.push(count < 2 ? Number.NaN : Math.sqrt(m2 / (count - 1))); break;
      case 'min': output.push(count === 0 ? Number.NaN : min); break;
      case 'max': output.push(count === 0 ? Number.NaN : max); break;
      case 'median': output.push(percentileSorted(sorted, 50)); break;
      case 'percentile': output.push(percentileSorted(sorted, request.percentile ?? 50)); break;
    }
  }
  return output;
}

function selectedAxes(request: StatisticRequest): readonly Axis[] {
  if (request.along === undefined) return request.value.axes;
  if (request.along.axes.length !== 1) {
    throw new KernelError("'along' must vary along exactly one axis", `${request.nodeId}.along`);
  }
  const [axis] = request.along.axes;
  if (!request.value.axes.some((candidate) => candidate.id === axis?.id)) {
    throw new KernelError("'value' does not vary along the axis wired to 'along'", `${request.nodeId}.along`);
  }
  return [axis as Axis];
}

export function reduceAlong(request: StatisticRequest): StatisticResult {
  const reduced = selectedAxes(request);
  if (reduced.length === 0) throw new KernelError("'value' has no swept axis to reduce", `${request.nodeId}.value`);
  if (request.running && reduced.length !== 1) {
    throw new KernelError('a running statistic requires exactly one reduce axis', request.nodeId);
  }
  if (request.statistic === 'probability' && request.value.kind !== 'categorical') {
    throw new KernelError("'probability' needs a categorical value", `${request.nodeId}.value`);
  }
  if (request.statistic !== 'probability' && request.statistic !== 'count' && request.value.kind !== 'numeric') {
    throw new KernelError(`'${request.statistic}' needs a numeric value`, `${request.nodeId}.value`);
  }
  if (request.statistic === 'percentile' && ((request.percentile ?? 50) < 0 || (request.percentile ?? 50) > 100)) {
    throw new KernelError('percentile must be between 0 and 100', `${request.nodeId}.percentile`);
  }

  const warnings: Warning[] = [];
  if (request.along === undefined && reduced.length > 1) {
    warnings.push({
      kind: 'statisticPooledAxes',
      nodeId: request.nodeId,
      message: `this statistic pooled ${reduced.map((axis) => `'${axis.label}'`).join(', ')} into one number — wire the trial range into 'along' to keep the design axes`,
    });
  }

  const reducedIds = new Set(reduced.map((axis) => axis.id));
  const outAxes = request.running
    ? request.value.axes
    : request.value.axes.filter((axis) => !reducedIds.has(axis.id));
  const remaining = request.value.axes.filter((axis) => !reducedIds.has(axis.id));
  const ordered = [...remaining, ...reduced];
  const read = indexer(request.value, ordered);
  const reducedSize = gridSize(reduced);
  const remainingSize = gridSize(remaining);
  const output: number[] = [];
  let tooFew = false;

  for (let cell = 0; cell < remainingSize; cell += 1) {
    const column = Array.from({ length: reducedSize }, (_unused, offset) =>
      request.value.data[read(cell * reducedSize + offset)] as number | string,
    );
    if (request.running) {
      output.push(...runningValues(request, column));
      if (request.statistic === 'stddev' && column.filter(Number.isFinite).length < 2) tooFew = true;
    } else {
      if (request.statistic === 'stddev' && column.filter(Number.isFinite).length < 2) tooFew = true;
      output.push(calculate(request, column));
    }
  }
  if (tooFew) warnings.push({
    kind: 'statisticTooFewSamples',
    nodeId: request.nodeId,
    message: 'sample standard deviation needs at least two samples; the unavailable result is NaN',
  });
  const reducedResult: NumericSeries = { kind: 'numeric', axes: request.running ? ordered : outAxes, data: output };
  return {
    result: request.running ? broadcastSeries(reducedResult, request.value.axes) : reducedResult,
    warnings,
  };
}

export const scanAlong = reduceAlong;
