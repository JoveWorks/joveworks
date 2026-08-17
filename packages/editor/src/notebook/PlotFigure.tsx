/**
 * The one plot: a swept value against the range that produced it.
 *
 * Observable Plot, and the kernel has already done every part that is not
 * drawing. `PlotResult` arrives with the series, the axis it varies along, the
 * coordinates along that axis and the threshold — so this file converts out of
 * canonical units and picks marks, and computes nothing.
 *
 * Two behaviours are worth naming:
 *
 * - **A log range gets a log axis**. That is not decoration: the straight
 *   line a student is meant to recognise on a Wöhler or bearing-life plot is only
 *   straight on log-log.
 * - **The threshold is the point.** A curve crossing `S = 1.5` is what turns a
 *   plot into an answer, so it is drawn as a rule with the value on it.
 *
 * The contour path is drawn from the kernel's grid, and it wants verifying
 * against the key-design case before it is trusted — it renders here, and that
 * verification is still owed.
 *
 * A third axis facets: one small-multiple panel per value, via Observable
 * Plot's own `fx` channel. Contour ignores facet rather than half-supporting
 * faceted contours — the kernel already declines to attach `facet` to a
 * `PlotResult` when `contour` is on, and warns why (`plotContourFacet`).
 *
 * The `'si'` number format picks one shared prefix per axis — `MPa` rather
 * than a raw `Pa` axis printing millions — the same substitution
 * `formatQuantity` does for a single reading (`units/convert.ts`), applied
 * once to the whole series rather than per point, off the largest magnitude
 * on that axis. A categorical axis has nothing to prefix and passes through.
 */

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as Plot from '@observablehq/plot';

import { gridSize, indexer, unionAxes, type Axis, type PlotAxis, type PlotResult } from '@joveworks/kernel';
import {
  fromCanonical,
  prefixableAtomOf,
  siPrefixedUnit,
  type NumberFormat,
  type Unit,
} from '@joveworks/units';
import type { GraphDocument } from '@joveworks/schema';

import { typesetTitleHtml } from '../canvas/TitleField';
import { useSettings } from '../settings-context';

export interface Row {
  readonly x: number | string;
  readonly y: number;
  readonly series?: number | string;
  readonly facet?: number | string;
}

function coordinates(axis: PlotResult['x']): readonly (number | string)[] {
  return axis.coordinates.kind === 'numeric'
    ? axis.coordinates.data.map((value) => fromCanonical(value, axis.unit))
    : axis.coordinates.data;
}

/** Whether the range node behind an axis was logarithmic. */
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
    result.facet === undefined ? [] : result.facet.coordinates.axes,
  );
}

export function rows(result: PlotResult): readonly Row[] {
  const target = plotGrid(result);
  const valueAt = indexer(result.series, target);
  const xAt = indexer(result.x.coordinates, target);
  const xs = coordinates(result.x);
  const seriesAt = result.series2 === undefined ? undefined : indexer(result.series2.coordinates, target);
  const seriesValues = result.series2 === undefined ? undefined : coordinates(result.series2);
  const facetAt = result.facet === undefined ? undefined : indexer(result.facet.coordinates, target);
  const facetValues = result.facet === undefined ? undefined : coordinates(result.facet);

  return Array.from({ length: gridSize(target) }, (_unused, cell) => ({
    x: xs[xAt(cell)] as number | string,
    y: fromCanonical(result.series.data[valueAt(cell)] as number, result.unit),
    ...(seriesAt === undefined || seriesValues === undefined
      ? {}
      : { series: seriesValues[seriesAt(cell)] as number | string }),
    ...(facetAt === undefined || facetValues === undefined
      ? {}
      : { facet: facetValues[facetAt(cell)] as number | string }),
  }));
}

/** One shared SI prefix for a whole axis, off the largest magnitude on it. */
export function siAxisUnit(unit: Unit, data: readonly number[], format: NumberFormat): Unit {
  if (format.notation !== 'si') return unit;
  const atom = prefixableAtomOf(unit.symbol.trim());
  if (atom === undefined) return unit;
  const largest = data.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  return largest === 0 ? unit : siPrefixedUnit(atom, largest);
}

function siAxis(axis: PlotAxis, format: NumberFormat): PlotAxis {
  if (axis.coordinates.kind !== 'numeric') return axis;
  return { ...axis, unit: siAxisUnit(axis.unit, axis.coordinates.data, format) };
}

/** `result`, with each numeric axis (and the plotted value) re-scaled to one shared SI prefix. */
export function siResult(result: PlotResult, format: NumberFormat): PlotResult {
  return {
    ...result,
    unit: siAxisUnit(result.unit, result.series.data, format),
    x: siAxis(result.x, format),
    ...(result.series2 === undefined ? {} : { series2: siAxis(result.series2, format) }),
    ...(result.facet === undefined ? {} : { facet: siAxis(result.facet, format) }),
  };
}

interface Props {
  readonly result: PlotResult;
  readonly document: GraphDocument;
  readonly format: NumberFormat;
}

/** Replace Observable's plain SVG text with KaTeX where an axis label needs it. */
function typesetChartLabels(chart: SVGSVGElement, labels: readonly string[]): void {
  for (const text of chart.querySelectorAll('text')) {
    const label = text.textContent;
    if (label === null || !labels.includes(label)) continue;
    const html = typesetTitleHtml(label);
    if (html === undefined) continue;
    const bounds = text.getBBox();
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreign.setAttribute('x', `${bounds.x}`);
    foreign.setAttribute('y', `${bounds.y}`);
    foreign.setAttribute('width', `${bounds.width + 4}`);
    foreign.setAttribute('height', `${bounds.height + 4}`);
    const transform = text.getAttribute('transform');
    if (transform !== null) foreign.setAttribute('transform', transform);
    const content = document.createElement('div');
    content.style.whiteSpace = 'nowrap';
    content.style.fontSize = text.getAttribute('font-size') ?? '10px';
    content.style.lineHeight = '1';
    content.innerHTML = html;
    foreign.append(content);
    text.replaceWith(foreign);
  }
}

export function PlotFigure({ result: rawResult, document: graph, format }: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const { contourPalette, titleMathRendering } = useSettings();
  const result = useMemo(() => siResult(rawResult, format), [rawResult, format]);

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
      const fx = result.facet === undefined ? undefined : 'facet';
      const channels = { ...(stroke === undefined ? {} : { stroke }), ...(fx === undefined ? {} : { fx }) };
      marks.push(
        Plot.line(data as Row[], { x: 'x', y: 'y', ...channels }),
        Plot.dot(data as Row[], { x: 'x', y: 'y', r: 2, ...channels }),
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
      // A contour's ramp lives beside the chart; reserve enough notebook
      // width for it instead of forcing a horizontal scrollbar.
      width: result.contour ? 280 : result.facet === undefined ? 360 : Math.min(180 * result.facet.axis.length, 1080),
      height: 240,
      marginLeft: 56,
      marginBottom: 40,
      x: {
        label: xLabel,
        ...(isLogAxis(graph, result.x.axis.id) ? { type: 'log' as const } : {}),
      },
      y: { label: yLabel, grid: true },
      ...(result.contour ? { className: 'contour-colorbar' } : {}),
      ...(result.contour
        ? {
            color: {
              scheme: contourPalette,
              legend: true,
              label: yLabel,
            },
          }
        : result.series2 === undefined
          ? {}
          : {
              color: {
                // A categorical second axis identifies one curve per named
                // value, so it needs readable swatches rather than a ramp.
                legend: result.series2.coordinates.kind === 'categorical' ? 'swatches' : true,
                label: result.series2.axis.label,
              },
            }),
      ...(result.facet === undefined ? {} : { fx: { label: result.facet.axis.label } }),
      marks,
    });

    container.append(chart);
    if (titleMathRendering && chart instanceof SVGSVGElement) {
      typesetChartLabels(chart, [
        xLabel,
        yLabel,
        ...(result.contour || result.series2 === undefined ? [] : [result.series2.axis.label]),
        ...(result.facet === undefined ? [] : [result.facet.axis.label]),
      ]);
    }
    return () => chart.remove();
  }, [graph, result, titleMathRendering]);

  return <div className="figure" ref={host} />;
}
