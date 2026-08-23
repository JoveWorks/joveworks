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

/**
 * The output port a node produces on: its formula's first output, or `value`.
 * Callers wanting every port of a node answering with several read
 * `formula.outputs` directly.
 */
export function outputPort(analysis: Analysis, node: GraphNode): string | undefined {
  if (node.kind === 'input' || node.kind === 'monteCarloGenerator') return VALUE_PORT;
  if (node.kind === 'output' || node.kind === 'monteCarloReceiver') return undefined;
  return analysis.formulas.get(node.id)?.outputs[0]?.name;
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

export type CheckVerdict = 'pass' | 'partial' | 'fail';

/**
 * Whether every point passes, every point fails, or it's a mix — "some
 * pass" is a different thing to tell a student than "none do", so a swept
 * check's mark/badge is three-way, not the binary pass/fail a scalar one is.
 */
export function checkVerdict(results: readonly boolean[]): CheckVerdict {
  if (results.every(Boolean)) return 'pass';
  if (results.every((passed) => !passed)) return 'fail';
  return 'partial';
}

export type CheckState = 'pass' | 'boundary' | 'fail' | 'mixed';

export interface CheckSegment {
  readonly text: string;
  readonly state: CheckState;
}

/**
 * A check's reading, broken into colour-coded segments so a sweep shows
 * *where* it starts failing, not just its extremes. A single pass/fail
 * transition becomes three segments — start, the point it crosses, end —
 * each in its own state colour; two transitions (one contiguous region
 * dipping into the other state, e.g. briefly exceeding a limit) becomes
 * four — start, the two points it crosses, end. A uniform sweep collapses
 * to one segment in its overall colour, and more than two crossings falls
 * back to the plain extent range (`summarise`'s own text) rather than
 * guessing which crossing matters.
 */
export function summariseCheck(
  reading: Reading,
  results: readonly boolean[],
  figures = 4,
  format: NumberFormat = PLAIN_NUMBER_FORMAT,
): readonly CheckSegment[] {
  const { series, unit } = reading;
  if (series.kind !== 'numeric' || series.data.length === 0) return [];
  const { data } = series;
  const at = (index: number): string => display(data[index] as number, unit, figures, format);
  const last = data.length - 1;

  if (series.axes.length === 0) {
    return [{ text: at(0), state: results[0] === true ? 'pass' : 'fail' }];
  }

  const range = (): string => {
    const [low, high] = extent(reading) as readonly [number, number];
    return `${display(low, unit, figures, format)} … ${display(high, unit, figures, format)}`;
  };

  if (results.every(Boolean)) return [{ text: range(), state: 'pass' }];
  if (results.every((passed) => !passed)) return [{ text: range(), state: 'fail' }];

  const transitions: number[] = [];
  for (let index = 1; index <= last; index += 1) {
    if (results[index] !== results[index - 1]) transitions.push(index);
  }
  if (transitions.length === 1) {
    const [boundary] = transitions as [number];
    return [
      { text: at(0), state: results[0] === true ? 'pass' : 'fail' },
      { text: at(boundary), state: 'boundary' },
      { text: at(last), state: results[last] === true ? 'pass' : 'fail' },
    ];
  }

  if (transitions.length === 2) {
    const [first, second] = transitions as [number, number];
    return [
      { text: at(0), state: results[0] === true ? 'pass' : 'fail' },
      { text: at(first), state: 'boundary' },
      { text: at(second), state: 'boundary' },
      { text: at(last), state: results[last] === true ? 'pass' : 'fail' },
    ];
  }

  return [{ text: range(), state: 'mixed' }];
}

/** `26 points along pad width w` — what a sparkline is labelled with. */
export function axisLabel({ series }: Reading): string | undefined {
  if (series.axes.length === 0) return undefined;
  return series.axes
    .map((axis) => `${axis.length} along ${axis.label}`)
    .join(' × ');
}
