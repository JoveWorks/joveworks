/**
 * The Pareto front: every candidate as a point, and the ones worth arguing
 * about joined by a staircase.
 *
 * The kernel has already decided which points are on the front, which are
 * feasible, and where each one sits — so this file converts units and picks
 * marks, and computes nothing, the same division `PlotFigure` keeps.
 *
 * Three states, drawn three ways, because the *reason* the front stops where it
 * does is most of what a reader takes away:
 *
 * - **on the front** — filled, and joined by the staircase;
 * - **dominated** — muted, still there, because "beaten by these" is a real
 *   thing to see;
 * - **infeasible** — hollow, because it failed a check and never competed at
 *   all, which is a different fact from losing.
 *
 * The staircase, not a straight line between points. A straight line implies
 * designs that were never evaluated; the step through the corner that is worse
 * on both objectives is the actual boundary of what the front dominates, and it
 * makes clear that the front is a set of discrete designs rather than a curve.
 *
 * Clicking a point marks it (`document.marks`), which is how a candidate
 * becomes the same lettered design on every other figure in the notebook.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import * as Plot from '@observablehq/plot';

import type { AxisCoordinate, ParetoResult } from '@joveworks/kernel';
import type { Candidate } from '@joveworks/schema';
import { fromCanonical, type NumberFormat } from '@joveworks/units';

import { useSettings } from '../settings-context';
import { chartTip, pointedRow, siAxisUnit, typesetChartLabels } from './PlotFigure';
import { NO_MARKS, type FigureMarking, type MarkIndex } from './marks';

interface Row {
  readonly cell: number;
  readonly x: number;
  readonly y: number;
  /** How the point is drawn, and what the legend calls it. */
  readonly standing: 'front' | 'dominated' | 'infeasible';
  readonly title: string;
  readonly candidate: Candidate;
  /** A, B … when this point is marked; absent otherwise. */
  readonly letter?: string;
}

const STANDING_COLOR: Readonly<Record<Row['standing'], string>> = {
  front: '#4269d0',
  dominated: '#9498a0',
  infeasible: '#ff725c',
};

function formatCoordinate(coordinate: AxisCoordinate, format: NumberFormat): string {
  const { value, unit } = coordinate;
  if (typeof value === 'string') return `${coordinate.axis.label}: ${value}`;
  const shown = fromCanonical(value, unit).toLocaleString(undefined, { maximumSignificantDigits: 4 });
  return `${coordinate.axis.label}: ${shown}${unit.symbol === '' ? '' : ` ${unit.symbol}`}`;
}

/** Ready-to-draw rows, in the kernel's own cell order. */
export function rows(result: ParetoResult, marks: MarkIndex, format: NumberFormat): readonly Row[] {
  const xUnit = siAxisUnit(
    result.xUnit,
    result.points.map((point) => point.x),
    format,
  );
  const yUnit = siAxisUnit(
    result.yUnit,
    result.points.map((point) => point.y),
    format,
  );

  return result.points.flatMap((point): readonly Row[] => {
    // A candidate with no value on an objective could not be compared and is
    // not on the chart — the kernel has already warned about it, and plotting
    // NaN would be a hole rather than a fact.
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
    const standing: Row['standing'] = !point.feasible ? 'infeasible' : point.onFront ? 'front' : 'dominated';
    const letter = marks.at(point.cell)[0]?.letter;
    const lines = [
      ...point.at.map((coordinate) => formatCoordinate(coordinate, format)),
      `${result.xLabel}: ${fromCanonical(point.x, xUnit).toLocaleString(undefined, { maximumSignificantDigits: 4 })}`,
      `${result.yLabel}: ${fromCanonical(point.y, yUnit).toLocaleString(undefined, { maximumSignificantDigits: 4 })}`,
      standing === 'front'
        ? 'on the front'
        : standing === 'dominated'
          ? 'beaten on both objectives'
          : 'fails a referenced check',
    ];
    return [
      {
        cell: point.cell,
        x: fromCanonical(point.x, xUnit),
        y: fromCanonical(point.y, yUnit),
        standing,
        title: lines.join('\n'),
        candidate: point.candidate,
        ...(letter === undefined ? {} : { letter }),
      },
    ];
  });
}

/**
 * The front in staircase order: best-x first, and within a tie best-y first.
 *
 * Sorted in the kernel's normalised "smaller is better" space rather than in
 * display space, so `step-after` always turns through the corner that is worse
 * on both objectives — the boundary of what the front dominates — whichever way
 * round the two directions happen to be.
 */
export function staircase(result: ParetoResult, data: readonly Row[]): readonly Row[] {
  const xSign = result.xDirection === 'minimize' ? 1 : -1;
  const ySign = result.yDirection === 'minimize' ? 1 : -1;
  return data
    .filter((row) => row.standing === 'front')
    .sort((a, b) => xSign * (a.x - b.x) || ySign * (a.y - b.y));
}

interface Props {
  readonly result: ParetoResult;
  readonly format: NumberFormat;
  /** Absent in the read-only viewer: the chart draws, but nothing can be marked. */
  readonly marking?: FigureMarking;
}

export function ParetoFigure({ result, format, marking }: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const { titleMathRendering } = useSettings();

  useEffect(() => {
    const container = host.current;
    if (container === null) return undefined;

    const marks = marking?.marks ?? NO_MARKS;
    const data = rows(result, marks, format);
    const front = staircase(result, data);
    const marked = data.filter((row) => row.letter !== undefined);
    const xLabel = `${result.xLabel} (${result.xDirection === 'minimize' ? 'lower is better' : 'higher is better'})`;
    const yLabel = `${result.yLabel} (${result.yDirection === 'minimize' ? 'lower is better' : 'higher is better'})`;

    const chart = Plot.plot({
      width: 420,
      height: 300,
      marginLeft: 64,
      marginBottom: 44,
      x: { label: xLabel, grid: true },
      y: { label: yLabel, grid: true },
      color: {
        legend: true,
        domain: ['front', 'dominated', 'infeasible'],
        range: ['front', 'dominated', 'infeasible'].map((key) => STANDING_COLOR[key as Row['standing']]),
      },
      marks: [
        Plot.line(front as Row[], { x: 'x', y: 'y', curve: 'step-after', stroke: STANDING_COLOR.front }),
        // Hollow for infeasible: it did not lose the trade-off, it never
        // entered it. Filled dots for everything that competed.
        Plot.dot(data.filter((row) => row.standing === 'infeasible') as Row[], {
          x: 'x',
          y: 'y',
          stroke: 'standing',
          fill: 'none',
          r: 3.5,
        }),
        Plot.dot(data.filter((row) => row.standing === 'dominated') as Row[], {
          x: 'x',
          y: 'y',
          fill: 'standing',
          r: 3,
          fillOpacity: 0.55,
        }),
        Plot.dot(data.filter((row) => row.standing === 'front') as Row[], {
          x: 'x',
          y: 'y',
          fill: 'standing',
          r: 5,
        }),
        // A marked candidate gets a ring and its letter, in one accent that is
        // deliberately not from the standing palette — a mark has to stay
        // readable on top of whatever the point underneath it is.
        Plot.dot(marked as Row[], { x: 'x', y: 'y', r: 9, stroke: 'currentColor', strokeWidth: 1.5 }),
        Plot.text(marked as Row[], { x: 'x', y: 'y', text: 'letter', dy: -16, fontWeight: 'bold' }),
        chartTip(data, 'x', { x: 'x', y: 'y', title: 'title' }),
      ],
    });

    // Swapped in place, never detached in the cleanup — see the note on this
    // in PlotFigure.tsx, which explains the scroll jump that caused.
    container.replaceChildren(chart);

    // Observable Plot's pointer transform (used by `chartTip`) publishes the
    // datum under the cursor as the plot element's own `value`, and fires
    // `input` when it changes. So hovering and clicking need no hit-testing of
    // ours — the tip and the interaction always agree on which point is meant,
    // which they would not if we re-derived "nearest" independently.
    const pointed = (): Row | undefined => pointedRow<Row>(chart);
    const handleInput = (): void => marking?.hover(pointed()?.candidate);
    const handleClick = (): void => {
      const row = pointed();
      if (row !== undefined) marking?.toggle(row.candidate);
    };
    const handleLeave = (): void => marking?.hover(undefined);
    if (marking !== undefined) {
      chart.addEventListener('input', handleInput);
      chart.addEventListener('click', handleClick);
      chart.addEventListener('pointerleave', handleLeave);
    }

    const svg = chart instanceof SVGSVGElement ? chart : chart.querySelector('svg');
    if (titleMathRendering && svg !== null) typesetChartLabels(svg, [xLabel, yLabel]);

    return () => {
      chart.removeEventListener('input', handleInput);
      chart.removeEventListener('click', handleClick);
      chart.removeEventListener('pointerleave', handleLeave);
    };
  }, [result, marking, format, titleMathRendering]);

  return <div className="figure pareto" ref={host} />;
}
