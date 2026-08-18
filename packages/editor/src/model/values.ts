/**
 * What a node shows in its body: the value on its output port, in the unit that
 * port declares.
 *
 * A scalar shows a number and a series shows a sparkline — but they are
 * the same object with a different number of axes, so this file reads both
 * the same way and only the rendering differs.
 */

import { canonicalUnit, type Series } from '@joveworks/kernel';
import { DIMENSIONLESS, PLAIN_NUMBER_FORMAT, type NumberFormat, type Unit } from '@joveworks/units';
import { VALUE_PORT, type GraphNode } from '@joveworks/schema';

import type { Analysis } from './analysis';
import { display } from './quantity';

export interface Reading {
  readonly series: Series;
  readonly unit: Unit;
}

/** The output port a node produces on: its formula's output, or `value`. */
export function outputPort(analysis: Analysis, node: GraphNode): string | undefined {
  if (node.kind === 'input' || node.kind === 'monteCarloGenerator') return VALUE_PORT;
  if (node.kind === 'output' || node.kind === 'monteCarloReceiver') return undefined;
  return analysis.formulas.get(node.id)?.output.name;
}

export function reading(
  analysis: Analysis,
  nodeId: string,
  port: string,
): Reading | undefined {
  const key = `${nodeId}.${port}`;
  const series = analysis.evaluation?.values.get(key);
  if (series === undefined || series.kind === 'spectrum' || series.kind === 'bundle') return undefined;
  const type = analysis.resolution?.sources.get(key);
  return { series, unit: type?.unit ?? canonicalUnit(type?.dimension ?? DIMENSIONLESS) };
}

/** The extent of a series, in canonical units — `display` converts on the way out. */
export function extent(reading: Reading): readonly [number, number] | undefined {
  if (reading.series.kind !== 'numeric' || reading.series.data.length === 0) return undefined;
  const { data } = reading.series;
  return [Math.min(...data), Math.max(...data)];
}

/** One line for a node body or a notebook entry. */
export function summarise(
  { series, unit }: Reading,
  figures = 4,
  format: NumberFormat = PLAIN_NUMBER_FORMAT,
): string {
  if (series.kind === 'categorical') {
    return series.axes.length === 0 ? (series.data[0] ?? '—') : `${series.data.length} values`;
  }
  const [first] = series.data;
  if (first === undefined) return '—';
  if (series.axes.length === 0) return display(first, unit, figures, format);

  const [low, high] = extent({ series, unit }) as readonly [number, number];
  return `${display(low, unit, figures, format)} … ${display(high, unit, figures, format)}`;
}

/** `26 points along pad width w` — what a sparkline is labelled with. */
export function axisLabel({ series }: Reading): string | undefined {
  if (series.axes.length === 0) return undefined;
  return series.axes
    .map((axis) => `${axis.length} along ${axis.label}`)
    .join(' × ');
}
