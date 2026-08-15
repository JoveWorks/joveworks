/**
 * The one plot (S26): a swept value against the range that produced it.
 *
 * Observable Plot, and the kernel has already done every part that is not
 * drawing. `PlotResult` arrives with the series, the axis it varies along, the
 * coordinates along that axis and the threshold — so this file converts out of
 * canonical units and picks marks, and computes nothing.
 *
 * Two behaviours are worth naming:
 *
 * - **A log range gets a log axis** (S29). That is not decoration: the straight
 *   line a student is meant to recognise on a Wöhler or bearing-life plot is only
 *   straight on log-log.
 * - **The threshold is the point.** A curve crossing `S = 1.5` is what turns a
 *   plot into an answer, so it is drawn as a rule with the value on it.
 *
 * The contour path is drawn from the kernel's grid, and S26 wants it verified
 * against the key-design case before it is trusted — it renders here, and that
 * verification is still owed.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import * as Plot from '@observablehq/plot';

import { gridSize, indexer, unionAxes, type Axis, type PlotResult } from '@mds/kernel';
import { fromCanonical } from '@mds/units';
import type { GraphDocument } from '@mds/schema';

export interface Row {
  readonly x: number | string;
  readonly y: number;
  readonly series?: number | string;
}

function coordinates(axis: PlotResult['x']): readonly (number | string)[] {
  return axis.coordinates.kind === 'numeric'
    ? axis.coordinates.data.map((value) => fromCanonical(value, axis.unit))
    : axis.coordinates.data;
}

/** Whether the range node behind an axis was logarithmic (S29). */
function isLogAxis(document: GraphDocument, axisId: string): boolean {
  const node = document.nodes.find((candidate) => candidate.id === axisId);
  return node?.kind === 'input' && node.value.kind === 'logarithmic';
}

/**
 * Every axis actually in play, not just the plotted value's own — a value
 * that does not vary along the x axis (or the second series axis) is a
 * legitimate flat curve, and evaluate.ts warns rather than refuses it
 * (`plotAxis`). Iterating the value's own axes alone would ask `indexer` to
 * broadcast the x coordinates onto a grid that does not contain the x axis,
 * which is exactly the "a series carries an axis the target grid does not"
 * crash this fixes.
 */
function plotGrid(result: PlotResult): readonly Axis[] {
  return unionAxes(
    result.series.axes,
    result.x.coordinates.axes,
    result.series2 === undefined ? [] : result.series2.coordinates.axes,
  );
}

export function rows(result: PlotResult): readonly Row[] {
  const target = plotGrid(result);
  const valueAt = indexer(result.series, target);
  const xAt = indexer(result.x.coordinates, target);
  const xs = coordinates(result.x);
  const seriesAt = result.series2 === undefined ? undefined : indexer(result.series2.coordinates, target);
  const seriesValues = result.series2 === undefined ? undefined : coordinates(result.series2);

  return Array.from({ length: gridSize(target) }, (_unused, cell) => ({
    x: xs[xAt(cell)] as number | string,
    y: fromCanonical(result.series.data[valueAt(cell)] as number, result.unit),
    ...(seriesAt === undefined || seriesValues === undefined
      ? {}
      : { series: seriesValues[seriesAt(cell)] as number | string }),
  }));
}

interface Props {
  readonly result: PlotResult;
  readonly document: GraphDocument;
}

export function PlotFigure({ result, document: graph }: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (container === null) return undefined;

    const data = rows(result);
    const threshold =
      result.threshold === undefined ? undefined : fromCanonical(result.threshold, result.unit);
    const xLabel = `${result.x.axis.label}${
      result.x.unit.symbol.trim().length === 0 ? '' : ` (${result.x.unit.symbol})`
    }`;
    const yLabel =
      result.unit.symbol.trim().length === 0 ? (result.label ?? '') : `${result.label ?? ''} (${result.unit.symbol})`;

    const marks: Plot.Markish[] = [];
    if (result.contour && result.series2 !== undefined) {
      // A grid the kernel already computed, redrawn as isolines. The rectangle
      // is taken from the axis extremes, so a non-uniformly spaced axis — a log
      // range, an explicit list — is stretched onto a uniform one.
      const xs = coordinates(result.x).map(Number);
      const ys = coordinates(result.series2).map(Number);
      const values = new Array<number>(xs.length * ys.length).fill(Number.NaN);
      const target = plotGrid(result);
      const valueAt = indexer(result.series, target);
      const xAt = indexer(result.x.coordinates, target);
      const yAt = indexer(result.series2.coordinates, target);
      for (let cell = 0; cell < gridSize(target); cell += 1) {
        values[yAt(cell) * xs.length + xAt(cell)] = fromCanonical(
          result.series.data[valueAt(cell)] as number,
          result.unit,
        );
      }
      marks.push(
        Plot.contour(values, {
          width: xs.length,
          height: ys.length,
          x1: Math.min(...xs),
          x2: Math.max(...xs),
          y1: Math.min(...ys),
          y2: Math.max(...ys),
          fill: Plot.identity,
          stroke: 'currentColor',
          strokeOpacity: 0.4,
        }),
      );
    } else {
      const stroke = result.series2 === undefined ? undefined : 'series';
      marks.push(
        Plot.line(data as Row[], { x: 'x', y: 'y', ...(stroke === undefined ? {} : { stroke }) }),
        Plot.dot(data as Row[], { x: 'x', y: 'y', r: 2, ...(stroke === undefined ? {} : { stroke }) }),
      );
    }

    if (threshold !== undefined) {
      marks.push(
        Plot.ruleY([threshold], { stroke: '#c2410c', strokeDasharray: '4 3' }),
        Plot.text([threshold], {
          x: () => data[0]?.x ?? 0,
          y: (value) => value,
          text: [`${threshold}`],
          textAnchor: 'start',
          dy: -6,
          fill: '#c2410c',
        }),
      );
    }

    const chart = Plot.plot({
      width: 360,
      height: 240,
      marginLeft: 56,
      marginBottom: 40,
      x: {
        label: xLabel,
        ...(isLogAxis(graph, result.x.axis.id) ? { type: 'log' as const } : {}),
      },
      y: { label: yLabel, grid: true },
      ...(result.series2 === undefined || result.contour
        ? {}
        : { color: { legend: true, label: result.series2.axis.label } }),
      marks,
    });

    container.append(chart);
    return () => chart.remove();
  }, [graph, result]);

  return <div className="figure" ref={host} />;
}
