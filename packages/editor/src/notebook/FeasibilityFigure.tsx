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

interface Row {
  readonly x: number | string;
  readonly series: number | string;
  readonly facet?: number | string;
  readonly mask: 'pass' | 'fail';
}

/** No band to sit a single-axis strip on — Observable Plot still wants a `y`. */
const SINGLE_ROW = '';

function coordinates(axis: PlotAxis): readonly (number | string)[] {
  return axis.coordinates.kind === 'numeric'
    ? axis.coordinates.data.map((value) => fromCanonical(value, axis.unit))
    : axis.coordinates.data;
}

function rows(result: FeasibilityResult): readonly Row[] {
  const target = result.axes;
  const xAt = indexer(result.x.coordinates, target);
  const xs = coordinates(result.x);
  const seriesAt = result.series2 === undefined ? undefined : indexer(result.series2.coordinates, target);
  const seriesValues = result.series2 === undefined ? undefined : coordinates(result.series2);
  const facetAt = result.facet === undefined ? undefined : indexer(result.facet.coordinates, target);
  const facetValues = result.facet === undefined ? undefined : coordinates(result.facet);

  return Array.from({ length: gridSize(target) }, (_unused, cell) => ({
    x: xs[xAt(cell)] as number | string,
    series: seriesAt === undefined || seriesValues === undefined ? SINGLE_ROW : (seriesValues[seriesAt(cell)] as number | string),
    ...(facetAt === undefined || facetValues === undefined ? {} : { facet: facetValues[facetAt(cell)] as number | string }),
    mask: (result.mask[cell] === true ? 'pass' : 'fail') as 'pass' | 'fail',
  }));
}

interface Props {
  readonly result: FeasibilityResult;
}

export function FeasibilityFigure({ result }: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (container === null) return undefined;

    const data = rows(result);
    const xLabel = result.x.axis.label;
    const fx = result.facet === undefined ? undefined : 'facet';

    const chart = Plot.plot({
      width: result.facet === undefined ? 360 : Math.min(180 * result.facet.axis.length, 1080),
      height: result.series2 === undefined ? 80 : 240,
      marginLeft: 56,
      marginBottom: 40,
      x: { label: xLabel },
      y: { label: result.series2?.axis.label ?? '', ...(result.series2 === undefined ? { ticks: [] } : {}) },
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
      ],
    });

    container.append(chart);
    return () => chart.remove();
  }, [result]);

  return <div className="figure" ref={host} />;
}
