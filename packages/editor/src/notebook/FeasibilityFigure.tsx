/**
 * Feasibility: where every referenced Check node's verdict passes at once.
 *
 * Mirrors `PlotFigure.tsx`'s structure, but a mask has no line to draw —
 * `series` absent renders a single shaded band along `x` (a one-row
 * heatmap strip); `series` present renders a genuine two-color heatmap.
 * Pass/fail coloring, not the numeric contour palette: a mask is
 * categorical, not a gradient. `facet` gets the same `fx` small-multiples
 * treatment `PlotFigure` uses.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import * as Plot from '@observablehq/plot';

import { gridSize, indexer, type FeasibilityResult, type PlotAxis } from '@joveworks/kernel';
import { fromCanonical } from '@joveworks/units';

import { useSettings } from '../settings-context';
import { chartTip, typesetChartLabels } from './PlotFigure';

interface Row {
  readonly x: number | string;
  readonly series: number | string;
  readonly facet?: number | string;
  readonly mask: 'pass' | 'fail';
  /** Swept coordinates + verdict, prose for the hover tip — see `chartTip`. */
  readonly title: string;
}

/** No band to sit a single-axis strip on — Observable Plot still wants a `y`. */
const SINGLE_ROW = '';

function coordinates(axis: PlotAxis): readonly (number | string)[] {
  return axis.coordinates.kind === 'numeric'
    ? axis.coordinates.data.map((value) => fromCanonical(value, axis.unit))
    : axis.coordinates.data;
}

function formatCoordinate(value: number | string): string {
  return typeof value === 'number' ? value.toLocaleString(undefined, { maximumSignificantDigits: 3 }) : value;
}

/** The referenced Check node ids that failed a given cell, in `result.checks` order. */
function failedChecksAt(result: FeasibilityResult, cell: number): readonly string[] {
  return result.checks.filter((_unused, i) => result.perCheck[i]?.[cell] === false);
}

function rows(result: FeasibilityResult, checkLabels: Readonly<Record<string, string>>): readonly Row[] {
  const target = result.axes;
  const xAt = indexer(result.x.coordinates, target);
  const xs = coordinates(result.x);
  const xLabel = result.x.axis.label;
  const seriesAt = result.series2 === undefined ? undefined : indexer(result.series2.coordinates, target);
  const seriesValues = result.series2 === undefined ? undefined : coordinates(result.series2);
  const seriesLabel = result.series2?.axis.label;
  const facetAt = result.facet === undefined ? undefined : indexer(result.facet.coordinates, target);
  const facetValues = result.facet === undefined ? undefined : coordinates(result.facet);
  const facetLabel = result.facet?.axis.label;

  return Array.from({ length: gridSize(target) }, (_unused, cell) => {
    const x = xs[xAt(cell)] as number | string;
    const series = seriesAt === undefined || seriesValues === undefined ? SINGLE_ROW : (seriesValues[seriesAt(cell)] as number | string);
    const facet = facetAt === undefined || facetValues === undefined ? undefined : (facetValues[facetAt(cell)] as number | string);
    const mask: 'pass' | 'fail' = result.mask[cell] === true ? 'pass' : 'fail';

    const lines = [`${xLabel}: ${formatCoordinate(x)}`];
    if (seriesLabel !== undefined) lines.push(`${seriesLabel}: ${formatCoordinate(series)}`);
    if (facetLabel !== undefined && facet !== undefined) lines.push(`${facetLabel}: ${formatCoordinate(facet)}`);
    if (mask === 'pass') {
      lines.push('→ pass');
    } else {
      const failed = failedChecksAt(result, cell).map((id) => checkLabels[id] ?? id);
      lines.push(`→ fail (${failed.join(', ')})`);
    }

    return {
      x,
      series,
      ...(facet === undefined ? {} : { facet }),
      mask,
      title: lines.join('\n'),
    };
  });
}

interface Props {
  readonly result: FeasibilityResult;
  /** Referenced Check node id → its display label, for the fail tip's breakdown. */
  readonly checkLabels: Readonly<Record<string, string>>;
}

export function FeasibilityFigure({ result, checkLabels }: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const { titleMathRendering } = useSettings();

  useEffect(() => {
    const container = host.current;
    if (container === null) return undefined;

    const data = rows(result, checkLabels);
    const xLabel = result.x.axis.label;
    const seriesLabel = result.series2?.axis.label ?? '';
    const fx = result.facet === undefined ? undefined : 'facet';

    // Each facet panel needs to fit its own x-axis ticks, not just a fixed
    // share of an overall cap — a mask only has two colours to read a facet
    // by, so a facet crushed too narrow to show its own ticks reads as
    // noise rather than a small multiple. `PlotFigure`'s facet width (used
    // for a line, which stays legible smaller) is the wrong model here.
    const perFacetWidth = Math.max(120, 22 * result.x.axis.length + 48);
    const chart = Plot.plot({
      width: result.facet === undefined ? 360 : perFacetWidth * result.facet.axis.length,
      height: result.series2 === undefined ? 80 : 240,
      marginLeft: 56,
      marginBottom: 40,
      x: { label: xLabel },
      y: { label: seriesLabel, ...(result.series2 === undefined ? { ticks: [] } : {}) },
      color: {
        legend: true,
        domain: ['pass', 'fail'],
        range: ['#3ca951', '#ff725c'],
      },
      ...(result.facet === undefined ? {} : { fx: { label: result.facet.axis.label } }),
      marks: [
        Plot.cell(data as Row[], {
          x: 'x',
          y: 'series',
          fill: 'mask',
          ...(fx === undefined ? {} : { fx }),
        }),
        chartTip(data, 'x', {
          x: 'x',
          y: 'series',
          title: 'title',
          ...(fx === undefined ? {} : { fx }),
        }),
      ],
    });

    container.append(chart);
    // A categorical `color.legend` makes `Plot.plot` return an HTML
    // `<figure>` wrapping the chart and a separate legend swatch, not a bare
    // `<svg>` (unlike PlotFigure, which draws its own legend precisely to
    // avoid this) — so the element to typeset is the chart's own inner
    // `<svg>`, not necessarily `chart` itself.
    const svg = chart instanceof SVGSVGElement ? chart : chart.querySelector('svg');
    if (titleMathRendering && svg !== null) {
      typesetChartLabels(svg, [xLabel, seriesLabel, ...(result.facet === undefined ? [] : [result.facet.axis.label])]);
    }
    return () => chart.remove();
  }, [result, checkLabels, titleMathRendering]);

  return <div className="figure" ref={host} />;
}
