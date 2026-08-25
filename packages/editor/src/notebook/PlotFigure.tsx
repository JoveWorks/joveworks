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
 *   plot into an answer, so it is drawn as a rule with the value on it. On a
 *   contour the same fact is a *curve* — the isoline at that level, with the
 *   level marked on the colorbar — because a contour's y axis is the second
 *   swept input and a rule across it would say nothing.
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

import {
  candidateAt,
  gridSize,
  indexer,
  unionAxes,
  type Axis,
  type PlotAxis,
  type PlotResult,
} from '@joveworks/kernel';
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
import { NO_MARKS, type FigureMarking } from './marks';

export interface Row {
  /** Which cell of `plotGrid` this point is — what turns a click into a mark. */
  readonly cell: number;
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
export function plotGrid(result: PlotResult): readonly Axis[] {
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
    cell,
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

/** An axis's title with its unit appended, unitless axes printing bare. */
export function axisLabel(axis: PlotAxis): string {
  return `${axis.axis.label}${axis.unit.symbol.trim().length === 0 ? '' : ` (${axis.unit.symbol})`}`;
}

/** The plotted value's own label — the contour colorbar title, and (outside contour mode) the y axis title. */
export function plotValueLabel(result: PlotResult): string {
  return result.unit.symbol.trim().length === 0
    ? (result.label ?? '')
    : `${result.label ?? ''} (${result.unit.symbol})`;
}

/**
 * Whether this actually draws as a contour. A contour is a value over *two*
 * swept axes, so the request alone is not enough — the second axis has to be
 * there.
 *
 * It can stop being there while the plot is open: unwire the range feeding one
 * input and type a value on the port instead, and the plotted value now varies
 * along one axis. The stored `contour` choice is deliberately left alone
 * (`OutputNodeView` hides the checkbox in this state rather than clearing it),
 * so rewiring the range brings the contour straight back — what changes is
 * only what is drawable right now, which is a line.
 */
export function drawsContour(result: PlotResult): boolean {
  return result.contour && result.series2 !== undefined;
}

/**
 * The chart's y axis title. A contour plots the value as color, not
 * position, so its y axis is the second swept axis instead — using the
 * value's own label there mislabels the axis as the colorbar.
 */
export function plotYLabel(result: PlotResult): string {
  return drawsContour(result) ? axisLabel(result.series2 as PlotAxis) : plotValueLabel(result);
}

/**
 * Where a point sits vertically, for the marks drawn *on top of* the chart.
 *
 * The same distinction `plotYLabel` makes, in position rather than in text: a
 * contour maps the plotted value to colour, so its y axis carries the second
 * swept axis, and a mark placed at the row's value lands at the right x and an
 * arbitrary height. `Row.y` is the value and `Row.series` the second axis's
 * coordinate, so a contour reads the mark's height off the latter.
 */
export function markY(result: PlotResult): (row: Row) => number {
  return drawsContour(result) ? (row) => Number(row.series) : (row) => row.y;
}

/** A swept coordinate as a reader would say it — four significant figures, its own locale. */
function readout(value: number | string): string {
  return typeof value === 'number' ? value.toLocaleString(undefined, { maximumSignificantDigits: 4 }) : value;
}

/**
 * What the hover tip says: every coordinate of the pointed design, then its
 * value.
 *
 * A contour needs this more than a line does — its y axis is the second swept
 * axis and its value is a colour, so "which design is this and what does it
 * come to" is otherwise a two-step read off the colorbar.
 */
export function tipTitle(result: PlotResult, row: Row, xLabel: string, valueLabel: string): string {
  return [
    `${xLabel}: ${readout(row.x)}`,
    ...(result.series2 === undefined || row.series === undefined
      ? []
      : [`${axisLabel(result.series2)}: ${readout(row.series)}`]),
    ...(result.facet === undefined || row.facet === undefined
      ? []
      : [`${axisLabel(result.facet)}: ${readout(row.facet)}`]),
    `${valueLabel}: ${readout(row.y)}`,
  ].join('\n');
}

interface Props {
  readonly result: PlotResult;
  readonly document: GraphDocument;
  readonly format: NumberFormat;
  /** Absent in the read-only viewer: the curve draws, but nothing can be marked. */
  readonly marking?: FigureMarking;
}

/** Replace Observable's plain SVG text with KaTeX where an axis label needs it. */
export function typesetChartLabels(chart: SVGSVGElement, labels: readonly string[]): void {
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

/**
 * A themed `Plot.tip` bound to the nearest data point under the cursor.
 * `bias` picks which axis dominates "nearest" — 'x' for a chart swept along
 * x (a line, a set of dots, a heatmap's cells), 'y' for a horizontal-bar
 * chart keyed by a categorical y.
 *
 * `Plot.tip`'s own default box color is `fill: "var(--plot-background)"` —
 * a CSS variable reference set as a raw SVG presentation attribute on a
 * `<g>` built by `Plot.plot()` before it's ever attached to the page. That
 * doesn't reliably resolve, and when it fails the box falls back to
 * whatever `fill` value is otherwise active in that DOM position — for
 * Feasibility's cell heatmap, the hovered cell's own pass/fail color. Read
 * `--panel` for real via `getComputedStyle` (which does resolve custom
 * properties correctly, var() and all) and pass it as a literal, so the box
 * always matches app theme regardless of what mark it's tipping.
 */
export function chartTip<T>(data: readonly T[], bias: 'x' | 'y', options: Plot.TipOptions): Plot.Markish {
  const pointer = bias === 'y' ? Plot.pointerY : Plot.pointerX;
  const panel = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
  return Plot.tip(data, pointer({ ...(panel === '' ? {} : { fill: panel }), ...options }));
}

/** The colour a threshold is drawn in, wherever it appears: the rule, its label, the isoline. */
const THRESHOLD_COLOR = '#c2410c';

/**
 * The kernel's grid as the dense row-major array `Plot.contour` wants, with
 * the rectangle it spans.
 *
 * Built once and drawn twice — as the filled field, and (when there is one) as
 * the threshold's own isoline — because both are the *same* grid at different
 * levels, and recomputing it for the second would be inviting them to disagree.
 *
 * The rectangle is taken from the axis extremes, so a non-uniformly spaced
 * axis — a log range, an explicit list — is stretched onto a uniform one.
 */
export function contourGrid(result: PlotResult, series2: PlotAxis): {
  readonly values: readonly number[];
  readonly rectangle: { width: number; height: number; x1: number; x2: number; y1: number; y2: number };
} {
  const xs = coordinates(result.x).map(Number);
  const ys = coordinates(series2).map(Number);
  const values = new Array<number>(xs.length * ys.length).fill(Number.NaN);
  const target = plotGrid(result);
  const valueAt = indexer(result.series, target);
  const xAt = indexer(result.x.coordinates, target);
  const yAt = indexer(series2.coordinates, target);
  for (let cell = 0; cell < gridSize(target); cell += 1) {
    values[yAt(cell) * xs.length + xAt(cell)] = fromCanonical(
      result.series.data[valueAt(cell)] as number,
      result.unit,
    );
  }
  return {
    values,
    rectangle: {
      width: xs.length,
      height: ys.length,
      x1: Math.min(...xs),
      x2: Math.max(...xs),
      y1: Math.min(...ys),
      y2: Math.max(...ys),
    },
  };
}

/** A compact vertical key keeps the contour itself large enough to read. */
function contourColorbar(
  result: PlotResult,
  label: string,
  palette: string,
  typeset: boolean,
): HTMLElement {
  const colorbar = document.createElement('aside');
  colorbar.className = 'contour-colorbar';
  colorbar.dataset.palette = palette;

  const title = document.createElement('strong');
  if (typeset) {
    const html = typesetTitleHtml(label);
    if (html !== undefined) title.innerHTML = html;
    else title.textContent = label;
  } else {
    title.textContent = label;
  }

  const displayed = result.series.data
    .map((value) => fromCanonical(value, result.unit))
    .filter(Number.isFinite);
  const minimum = Math.min(...displayed);
  const maximum = Math.max(...displayed);
  const format = (value: number): string => value.toLocaleString(undefined, { maximumSignificantDigits: 3 });

  const scale = document.createElement('div');
  scale.className = 'contour-colorbar-scale';
  const values = document.createElement('div');
  values.className = 'contour-colorbar-values';
  values.append(Object.assign(document.createElement('span'), { textContent: format(maximum) }));
  values.append(Object.assign(document.createElement('span'), { textContent: format(minimum) }));
  const ramp = document.createElement('i');
  ramp.className = 'contour-colorbar-ramp';

  // The level the threshold isoline is drawn at, marked on the key that reads
  // levels. Without it the reader gets an orange curve across the field and no
  // way to say which value it is — the line plot prints its threshold beside
  // the rule for exactly the same reason.
  const threshold = result.threshold === undefined ? undefined : fromCanonical(result.threshold, result.unit);
  if (threshold !== undefined && threshold > minimum && threshold < maximum) {
    const height = `${((threshold - minimum) / (maximum - minimum)) * 100}%`;
    const tick = document.createElement('i');
    tick.className = 'contour-colorbar-threshold';
    tick.style.bottom = height;
    ramp.append(tick);
    const reading = document.createElement('span');
    reading.className = 'contour-colorbar-threshold-value';
    reading.style.bottom = height;
    reading.textContent = format(threshold);
    values.append(reading);
  }

  scale.append(values, ramp);
  colorbar.append(title, scale);
  return colorbar;
}

const OBSERVABLE10 = [
  '#4269d0',
  '#efb118',
  '#ff725c',
  '#6cc5b0',
  '#3ca951',
  '#ff8ab7',
  '#a463f2',
  '#97bbf5',
  '#9c6b4e',
  '#9498a0',
];

/** A series axis identifies named curves, so its key is swatches, not a ramp. */
function seriesLegend(label: string, values: readonly (number | string)[], typeset: boolean): HTMLElement {
  const legend = document.createElement('aside');
  legend.className = 'series-legend';
  const title = document.createElement('strong');
  if (typeset) {
    const html = typesetTitleHtml(label);
    if (html !== undefined) title.innerHTML = html;
    else title.textContent = label;
  } else {
    title.textContent = label;
  }
  const entries = document.createElement('div');
  entries.className = 'series-legend-entries';
  values.forEach((value, index) => {
    const entry = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.backgroundColor = OBSERVABLE10[index % OBSERVABLE10.length] as string;
    const text =
      typeof value === 'number'
        ? value.toLocaleString(undefined, { maximumSignificantDigits: 4 })
        : value;
    entry.append(swatch, document.createTextNode(text));
    entries.append(entry);
  });
  legend.append(title, entries);
  return legend;
}

export function PlotFigure({ result: rawResult, document: graph, format, marking }: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const { contourPalette, titleMathRendering } = useSettings();
  const result = useMemo(() => siResult(rawResult, format), [rawResult, format]);

  useEffect(() => {
    const container = host.current;
    if (container === null) return undefined;

    const data = rows(result);
    const threshold =
      result.threshold === undefined ? undefined : fromCanonical(result.threshold, result.unit);
    const xLabel = axisLabel(result.x);
    const valueLabel = plotValueLabel(result);
    const yLabel = plotYLabel(result);
    // A second axis makes separate curves. Even when its coordinates are
    // numeric (for example, one curve per pad length), it is a discrete
    // selection of lines rather than a continuous value map.
    const contouring = drawsContour(result);
    const lineSeries = contouring ? undefined : result.series2;

    const marks: Plot.Markish[] = [];
    if (contouring && result.series2 !== undefined) {
      // A grid the kernel already computed, redrawn as isolines.
      const { values, rectangle } = contourGrid(result, result.series2);
      marks.push(
        Plot.contour(values, {
          ...rectangle,
          fill: Plot.identity,
          stroke: 'currentColor',
          strokeOpacity: 0.4,
        }),
      );
      // A threshold is a *level of the plotted value*, and on a contour a level
      // is a curve rather than a height: `S = 1.5` is the isoline where the
      // design first passes, which is the same thing the rule means on a line
      // plot. Drawing the rule here instead would put a horizontal line at 1.5
      // of the *second axis's* units — °C, mm — which is not a fact about
      // anything.
      if (threshold !== undefined) {
        marks.push(
          Plot.contour(values, {
            ...rectangle,
            thresholds: [threshold],
            stroke: THRESHOLD_COLOR,
            strokeWidth: 2,
          }),
        );
      }
    } else {
      const stroke = result.series2 === undefined ? undefined : 'series';
      const fx = result.facet === undefined ? undefined : 'facet';
      const channels = { ...(stroke === undefined ? {} : { stroke }), ...(fx === undefined ? {} : { fx }) };
      marks.push(
        Plot.line(data as Row[], { x: 'x', y: 'y', ...channels }),
        Plot.dot(data as Row[], { x: 'x', y: 'y', r: 2, ...channels }),
      );
    }

    // A marked design, on the curve. Drawn as a ring plus its letter rather than
    // a differently-coloured point: a plot may already be using colour for a
    // series axis, and a mark that competes with that reads as another curve.
    const marked = data.filter((row) => (marking?.marks ?? NO_MARKS).at(row.cell).length > 0);
    if (marked.length > 0) {
      const y = markY(result);
      marks.push(
        Plot.dot(marked as Row[], { x: 'x', y, r: 7, stroke: 'currentColor', strokeWidth: 1.5 }),
        Plot.text(marked as Row[], {
          x: 'x',
          y,
          text: (row: Row) => (marking?.marks ?? NO_MARKS).at(row.cell)[0]?.letter ?? '',
          dy: -14,
          fontWeight: 'bold',
        }),
      );
    }

    // The rule is the *line plot's* threshold — the contour drew its own, above.
    if (threshold !== undefined && !contouring) {
      marks.push(
        Plot.ruleY([threshold], { stroke: THRESHOLD_COLOR, strokeDasharray: '4 3' }),
        Plot.text([threshold], {
          x: () => data[0]?.x ?? 0,
          y: (value) => value,
          text: [`${threshold}`],
          textAnchor: 'start',
          dy: -6,
          fill: THRESHOLD_COLOR,
        }),
      );
    }

    // The tip is also the *pointer*: Observable Plot's pointer transform is what
    // publishes the datum under the cursor as the chart's own `value`, which is
    // what the click below reads. Without it a plot draws marks it can never
    // gain — every click finds `value` undefined — so this mark is load-bearing
    // rather than decoration, exactly as in `FeasibilityFigure` and
    // `ParetoFigure`. It goes last so the box sits above the curve.
    marks.push(
      chartTip(data, 'x', {
        x: 'x',
        y: markY(result),
        title: (row: Row) => tipTitle(result, row, xLabel, valueLabel),
        ...(result.facet === undefined || contouring ? {} : { fx: 'facet' }),
      }),
    );

    const chart = Plot.plot({
      width: result.facet === undefined ? 360 : Math.min(180 * result.facet.axis.length, 1080),
      height: 240,
      marginLeft: 56,
      marginBottom: 40,
      x: {
        label: xLabel,
        ...(isLogAxis(graph, result.x.axis.id) ? { type: 'log' as const } : {}),
      },
      y: { label: yLabel, grid: true },
      ...(contouring || lineSeries !== undefined ? { figure: false } : {}),
      ...(contouring
        ? {
            color: {
              scheme: contourPalette,
            },
          }
        : result.series2 === undefined
          ? {}
          : {
              color: {
                scheme: 'observable10',
                legend: false,
                label: result.series2.axis.label,
              },
            }),
      ...(result.facet === undefined ? {} : { fx: { label: result.facet.axis.label } }),
      marks,
    });

    let rendered: Element;
    if (contouring) {
      const wrapper = document.createElement('div');
      wrapper.className = 'contour-figure';
      wrapper.append(chart, contourColorbar(result, valueLabel, contourPalette, titleMathRendering));
      rendered = wrapper;
    } else if (lineSeries !== undefined) {
      const wrapper = document.createElement('div');
      wrapper.className = 'series-figure';
      wrapper.append(
        chart,
        seriesLegend(
          lineSeries.axis.label,
          coordinates(lineSeries),
          titleMathRendering,
        ),
      );
      rendered = wrapper;
    } else {
      rendered = chart;
    }
    container.append(rendered);

    // Clicking the curve marks the design under the cursor. The pointer
    // transform behind `chartTip` already publishes that datum as the chart's
    // own `value`, so the tip and the click can never disagree about which
    // point was meant — which they would if this re-derived "nearest" itself.
    const grid = plotGrid(result);
    const pointed = (): Row | undefined => (chart as { value?: Row }).value;
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

    if (titleMathRendering && chart instanceof SVGSVGElement) {
      typesetChartLabels(chart, [
        xLabel,
        yLabel,
        valueLabel,
        ...(contouring || result.series2 === undefined ? [] : [result.series2.axis.label]),
        ...(result.facet === undefined ? [] : [result.facet.axis.label]),
      ]);
    }
    return () => {
      chart.removeEventListener('input', handleInput);
      chart.removeEventListener('click', handleClick);
      chart.removeEventListener('pointerleave', handleLeave);
      rendered.remove();
    };
  }, [graph, result, titleMathRendering, marking]);

  return <div className="figure" ref={host} />;
}
