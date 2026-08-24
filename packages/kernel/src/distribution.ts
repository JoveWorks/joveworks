import { indexer, type Axis, type NumericSeries } from './series.js';
import { normalCdf } from './normal.js';
import { percentile } from './statistics.js';
import type { Warning } from './warnings.js';

export interface HistogramBin { readonly x1: number; readonly x2: number; readonly count: number; readonly density: number }
export interface EcdfPoint { readonly value: number; readonly probability: number }
export interface NormalFitPoint { readonly value: number; readonly density: number; readonly probability: number }
export interface NormalFit { readonly mean: number; readonly stddev: number; readonly points: readonly NormalFitPoint[] }
export interface DistributionPanel {
  readonly facetIndex?: number;
  readonly samples: readonly number[];
  readonly bins: readonly HistogramBin[];
  readonly cdf: readonly EcdfPoint[];
  readonly percentiles: Readonly<Record<string, number>>;
  readonly fit?: NormalFit;
}
export interface DistributionResultData { readonly panels: readonly DistributionPanel[]; readonly warnings: readonly Warning[] }

export function distributionBinCount(samples: readonly number[]): number {
  if (samples.length < 2) return 1;
  const sorted = [...samples].sort((a, b) => a - b);
  const iqr = percentile(sorted, 75) - percentile(sorted, 25);
  const span = (sorted.at(-1) as number) - (sorted[0] as number);
  if (iqr <= 0 || span <= 0) return Math.max(1, Math.ceil(Math.log2(samples.length) + 1));
  const width = 2 * iqr * samples.length ** (-1 / 3);
  return Math.max(1, Math.ceil(span / width));
}

export function histogram(samples: readonly number[], requested?: number): readonly HistogramBin[] {
  if (samples.length === 0) return [];
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const count = requested ?? distributionBinCount(samples);
  const width = max === min ? 1 : (max - min) / count;
  const totals = new Array<number>(count).fill(0);
  for (const sample of samples) {
    const index = max === min ? 0 : Math.min(count - 1, Math.floor((sample - min) / width));
    totals[index] = (totals[index] ?? 0) + 1;
  }
  return totals.map((total, index) => ({
    x1: min + index * width,
    x2: min + (index + 1) * width,
    count: total,
    density: total / (samples.length * width),
  }));
}

export function ecdf(samples: readonly number[]): readonly EcdfPoint[] {
  return [...samples].sort((a, b) => a - b).map((value, index) => ({ value, probability: (index + 1) / samples.length }));
}

export function buildDistribution(
  series: NumericSeries,
  over: Axis,
  facet: Axis | undefined,
  nodeId: string,
  options: { readonly bins?: number; readonly percentiles?: readonly number[]; readonly fit?: boolean },
): DistributionResultData {
  const used = new Set([over.id, ...(facet === undefined ? [] : [facet.id])]);
  const dropped = series.axes.filter((axis) => !used.has(axis.id));
  const warnings: Warning[] = [];
  if (dropped.length > 0) warnings.push({ kind: 'distributionAxisDropped', nodeId, message: `the distribution dropped ${dropped.map((axis) => `'${axis.label}'`).join(', ')} — choose an over or facet axis instead of pooling it` });
  const ordered = [...dropped, ...(facet === undefined ? [] : [facet]), over];
  const read = indexer(series, ordered);
  const panelCount = facet?.length ?? 1;
  const panels: DistributionPanel[] = [];
  for (let panel = 0; panel < panelCount; panel += 1) {
    const samples = Array.from({ length: over.length }, (_unused, offset) => series.data[read(panel * over.length + offset)] as number).filter(Number.isFinite);
    if (samples.length === 0) warnings.push({ kind: 'distributionEmpty', nodeId, message: 'the distribution has no finite samples to show' });
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const stddev = samples.length < 2 ? Number.NaN : Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1));
    const fitPoints = Number.isFinite(stddev) && stddev > 0
      ? Array.from({ length: 81 }, (_unused, index) => {
          const value = mean + (index / 80 * 8 - 4) * stddev;
          const z = (value - mean) / stddev;
          return {
            value,
            density: Math.exp(-(z ** 2) / 2) / (stddev * Math.sqrt(2 * Math.PI)),
            probability: normalCdf(z),
          };
        })
      : [];
    panels.push({
      ...(facet === undefined ? {} : { facetIndex: panel }),
      samples,
      bins: histogram(samples, options.bins),
      cdf: ecdf(samples),
      percentiles: Object.fromEntries((options.percentiles ?? []).map((value) => [String(value), percentile(samples, value)])),
      ...(options.fit ? { fit: { mean, stddev, points: fitPoints } } : {}),
    });
  }
  return { panels, warnings };
}
