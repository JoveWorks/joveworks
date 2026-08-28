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

import { useEffect, useId, useRef, type ReactElement } from 'react';
import * as Plot from '@observablehq/plot';

import {
  broadcastBoolean,
  candidateAt,
  gridSize,
  indexer,
  unionAxes,
  type Axis,
  type FeasibilityResult,
  type PlotAxis,
} from '@joveworks/kernel';
import { fromCanonical } from '@joveworks/units';

import { useSettings } from '../settings-context';
import { chartTip, pointedRow, typesetChartLabels } from './PlotFigure';
import { NO_MARKS, type FigureMarking, type MarkIndex } from './marks';

interface Row {
  /** Which cell of the drawn grid this is — what turns a click into a mark. */
  readonly cell: number;
  readonly x: number | string;
  readonly series: number | string;
  readonly facet?: number | string;
  readonly mask: 'pass' | 'fail';
  /** Swept coordinates + verdict, prose for the hover tip — see `chartTip`. */
  readonly title: string;
  /** A, B … when this cell is marked; absent otherwise. */
  readonly letter?: string;
}

/** No band to sit a single-axis strip on — Observable Plot still wants a `y`. */
const SINGLE_ROW = '';

/**
 * The plot's total width, single-panel or faceted alike: every panel needs
 * to fit its own x-axis ticks, not a flat guess — a mask only has two
 * colours to read a cell by, so ticks crushed too narrow to lay out read as
 * noise rather than a heatmap. A many-point sweep with long decimal
 * coordinates (e.g. `66.667`, `73.333`, …) collides its tick labels into a
 * fixed-width plot just as surely as it would crush a facet panel — same
 * bug, same fix, extended from the faceted case (`perFacetWidth`, added in
 * 897e2f6) to the single-panel one instead of inventing a second approach.
 *
 * A single panel has no sibling panel to divide space with, though, so a
 * facet's floor (120 — dense small multiples are expected to sit tight) is
 * too tight for it: reusing that floor verbatim is what made c517272 read
 * as a regression ("cramped too thin") for the common case of a handful of
 * ticks, which used to get the old flat 360 unconditionally. Keep 360 as
 * the single-panel floor and let the same per-tick growth push past it once
 * the ticks actually demand more room than that.
 */
export function feasibilityPlotWidth(xTickCount: number, facetCount: number | undefined): number {
  const perFacetWidth = Math.max(120, 22 * xTickCount + 48);
  return facetCount === undefined ? Math.max(360, perFacetWidth) : perFacetWidth * facetCount;
}

/**
 * A diagonal hatch, injected into the chart's own `<defs>` so a `fail` cell
 * carries a texture as well as a colour. Students hand in a printed
 * artefact — greyscale, sometimes a bad photocopy of that — where `#3ca951`
 * vs `#ff725c` can be the same grey; the SVG `fill` this draws prints
 * regardless of a browser's "print backgrounds" setting (unlike a CSS
 * `background`), which is why the texture lives here rather than as a
 * `.notebook`/print stylesheet rule. Only `fail` gets the hatch — hatching
 * both verdicts would just be a busier heatmap, not a more legible one; a
 * plain fill for `pass` is already how "nothing wrong here" reads. Stroked
 * in `--ink` rather than a fixed hex so it inherits the print stylesheet's
 * forced-light `--ink` (styles.css's `@media print` block) the same way the
 * rest of the report's text does.
 */
function hatchPattern(id: string): SVGPatternElement {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const pattern = document.createElementNS(svgNamespace, 'pattern') as SVGPatternElement;
  pattern.setAttribute('id', id);
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('width', '8');
  pattern.setAttribute('height', '8');
  pattern.setAttribute('patternTransform', 'rotate(45)');
  const line = document.createElementNS(svgNamespace, 'line');
  line.setAttribute('x1', '0');
  line.setAttribute('y1', '0');
  line.setAttribute('x2', '0');
  line.setAttribute('y2', '8');
  line.setAttribute('stroke', 'var(--ink)');
  line.setAttribute('stroke-width', '3');
  pattern.append(line);
  return pattern;
}

/**
 * Observable renders categorical legends separately from the plot itself.
 * Draw explicit lines inside its `fail` swatch rather than referring to the
 * plot's pattern: each swatch is its own SVG, and direct strokes keep the
 * texture visible in every browser and in greyscale print.
 */
function hatchFailLegendSwatch(chart: Element): void {
  const failSwatch = Array.from(chart.querySelectorAll('.feasibility-plot-swatch')).find(
    (swatch) => swatch.textContent?.trim() === 'fail',
  );
  const swatchSvg = failSwatch?.querySelector('svg');
  if (!(swatchSvg instanceof SVGSVGElement)) return;

  const strokes = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  strokes.setAttribute('stroke', 'var(--ink)');
  // A full cell uses 3px lines; that weight overwhelms this 15px swatch.
  strokes.setAttribute('stroke-width', '1.5');
  // Observable's swatches default to 15 × 15 px.
  for (const [x1, y1, x2, y2] of [
    [0, 6, 6, 0],
    [0, 15, 15, 0],
    [9, 15, 15, 9],
  ]) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    strokes.append(line);
  }
  swatchSvg.append(strokes);
}

function coordinates(axis: PlotAxis): readonly (number | string)[] {
  return axis.coordinates.kind === 'numeric'
    ? axis.coordinates.data.map((value) => fromCanonical(value, axis.unit))
    : axis.coordinates.data;
}

function formatCoordinate(value: number | string): string {
  return typeof value === 'number' ? value.toLocaleString(undefined, { maximumSignificantDigits: 3 }) : value;
}

/** The referenced Check node ids that failed a given cell, in `result.checks` order. */
function failedChecksAt(
  checks: readonly string[],
  perCheck: readonly (readonly boolean[])[],
  cell: number,
): readonly string[] {
  return checks.filter((_unused, i) => perCheck[i]?.[cell] === false);
}

/**
 * Every axis in play, not just the ones the verdict varies along — the mask's
 * own grid plus whichever axes this figure is drawn against.
 *
 * They are not always the same set. An axis can be pinned, or autofilled from
 * document order when no check varies at all, that the verdict does not depend
 * on: a check fed by a value typed on a node rather than by the range node
 * still on the canvas. `evaluate.ts` warns that the shading "will be flat" and
 * draws it anyway, so the mask broadcasts along that axis with stride 0 and
 * every column repeats. Iterating the mask's own axes alone would instead ask
 * `indexer` to place x coordinates on a grid without the x axis in it, which is
 * the "a series carries an axis the target grid does not" crash this avoids —
 * the same fix, for the same reason, as `PlotFigure`'s `plotGrid`.
 */
export function feasibilityGrid(result: FeasibilityResult): readonly Axis[] {
  return unionAxes(
    result.axes,
    result.x.coordinates.axes,
    result.series2 === undefined ? [] : result.series2.coordinates.axes,
    result.facet === undefined ? [] : result.facet.coordinates.axes,
  );
}

export function rows(
  result: FeasibilityResult,
  checkLabels: Readonly<Record<string, string>>,
  marks: MarkIndex = NO_MARKS,
): readonly Row[] {
  const target = feasibilityGrid(result);
  // Onto that grid, so a mask that varies along fewer axes than the figure
  // draws repeats down the ones it does not.
  const mask = broadcastBoolean(result.mask, result.axes, target);
  const perCheck = result.perCheck.map((entry) => broadcastBoolean(entry, result.axes, target));
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
    const verdict: 'pass' | 'fail' = mask[cell] === true ? 'pass' : 'fail';

    const lines = [`${xLabel}: ${formatCoordinate(x)}`];
    if (seriesLabel !== undefined) lines.push(`${seriesLabel}: ${formatCoordinate(series)}`);
    if (facetLabel !== undefined && facet !== undefined) lines.push(`${facetLabel}: ${formatCoordinate(facet)}`);
    if (verdict === 'pass') {
      lines.push('→ pass');
    } else {
      const failed = failedChecksAt(result.checks, perCheck, cell).map((id) => checkLabels[id] ?? id);
      lines.push(`→ fail (${failed.join(', ')})`);
    }

    const letter = marks.at(cell)[0]?.letter;
    return {
      cell,
      x,
      series,
      ...(facet === undefined ? {} : { facet }),
      mask: verdict,
      title: lines.join('\n'),
      ...(letter === undefined ? {} : { letter }),
    };
  });
}

interface Props {
  readonly result: FeasibilityResult;
  /** Referenced Check node id → its display label, for the fail tip's breakdown. */
  readonly checkLabels: Readonly<Record<string, string>>;
  /** Absent in the read-only viewer: the map draws, but nothing can be marked. */
  readonly marking?: FigureMarking;
}

export function FeasibilityFigure({ result, checkLabels, marking }: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const { titleMathRendering } = useSettings();
  // `useId`, not a module-level constant: a notebook can hold more than one
  // Feasibility figure at once, and an SVG `id` is document-scoped — two
  // charts sharing one id would have the second chart's hatch resolve
  // against the first chart's `<pattern>` (or vice versa) purely by DOM order.
  const hatchId = useId();

  useEffect(() => {
    const container = host.current;
    if (container === null) return undefined;

    const data = rows(result, checkLabels, marking?.marks ?? NO_MARKS);
    const marked = data.filter((row) => row.letter !== undefined);
    const failed = data.filter((row) => row.mask === 'fail');
    const xLabel = result.x.axis.label;
    const seriesLabel = result.series2?.axis.label ?? '';
    const fx = result.facet === undefined ? undefined : 'facet';

    const chart = Plot.plot({
      // Observable's default legend class is versioned (currently
      // `plot-d6a7b5`), so name this chart's legend ourselves before looking
      // up the fail swatch below.
      className: 'feasibility-plot',
      width: feasibilityPlotWidth(result.x.axis.length, result.facet?.axis.length),
      height: result.series2 === undefined ? 80 : 240,
      marginLeft: 56,
      marginBottom: 40,
      x: { label: xLabel },
      y: { label: seriesLabel, ...(result.series2 === undefined ? { ticks: [] } : {}) },
      color: {
        legend: true,
        domain: ['pass', 'fail'],
        range: ['var(--verdict-pass)', 'var(--verdict-fail)'],
      },
      ...(result.facet === undefined ? {} : { fx: { label: result.facet.axis.label } }),
      marks: [
        Plot.cell(data as Row[], {
          x: 'x',
          y: 'series',
          fill: 'mask',
          ...(fx === undefined ? {} : { fx }),
        }),
        // A second, narrower layer over just the `fail` cells: colour alone
        // does not survive a greyscale printout, so `fail` also gets a
        // texture (see `hatchPattern`). Drawn after the colour cells so the
        // hatch sits on top of them, before the letters so a mark is never
        // hatched over.
        Plot.cell(failed as Row[], {
          x: 'x',
          y: 'series',
          fill: `url(#${hatchId})`,
          ...(fx === undefined ? {} : { fx }),
        }),
        // The letter alone, no ring: a cell is already a filled block, so a
        // ring around it would read as a second, differently-shaped cell.
        Plot.text(marked as Row[], {
          x: 'x',
          y: 'series',
          text: 'letter',
          fontWeight: 'bold',
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

    // Swapped in place, never detached in the cleanup — see the note on this
    // in PlotFigure.tsx, which explains the scroll jump that caused.
    container.replaceChildren(chart);

    // A categorical `color.legend` makes `Plot.plot` return an HTML
    // `<figure>` wrapping the legend and then the chart, not a bare `<svg>`
    // (unlike PlotFigure, which draws its own legend precisely to avoid
    // this) — so the element the hatch and the typesetting below both need
    // is the chart's own inner `<svg>`, not necessarily `chart` itself.
    // Scoped to a direct child, not a bare descendant search: the legend's
    // own swatches are themselves tiny `<svg>` elements (see
    // `hatchFailLegendSwatch`) and sit earlier in document order than the
    // chart, so an unscoped `querySelector('svg')` hands back a 15×15
    // swatch — no axis label anywhere on it — and both the hatch and the
    // typesetting below silently do nothing.
    //
    // TypeScript only maps a bare tag-name selector to its element type, not
    // a compound one like this — `:scope > svg` comes back as plain
    // `Element`, hence the extra `instanceof` narrowing below.
    const directSvg = chart.querySelector(':scope > svg');
    const svg = chart instanceof SVGSVGElement ? chart : directSvg instanceof SVGSVGElement ? directSvg : null;
    if (svg !== null) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.append(hatchPattern(hatchId));
      svg.prepend(defs);
    }
    hatchFailLegendSwatch(chart);

    const grid = feasibilityGrid(result);
    const pointed = (): Row | undefined => pointedRow<Row>(chart);
    const handleInput = (): void => {
      const row = pointed();
      marking?.hover(row === undefined ? undefined : candidateAt(grid, row.cell, marking.readouts));
    };
    const handleClick = (): void => {
      const row = pointed();
      if (row !== undefined && marking !== undefined) {
        marking.toggle(candidateAt(grid, row.cell, marking.readouts));
      }
    };
    const handleLeave = (): void => marking?.hover(undefined);
    if (marking !== undefined) {
      chart.addEventListener('input', handleInput);
      chart.addEventListener('click', handleClick);
      chart.addEventListener('pointerleave', handleLeave);
    }

    if (titleMathRendering && svg !== null) {
      typesetChartLabels(svg, [xLabel, seriesLabel, ...(result.facet === undefined ? [] : [result.facet.axis.label])]);
    }
    return () => {
      chart.removeEventListener('input', handleInput);
      chart.removeEventListener('click', handleClick);
      chart.removeEventListener('pointerleave', handleLeave);
    };
  }, [result, checkLabels, titleMathRendering, marking]);

  return <div className="figure" ref={host} />;
}
