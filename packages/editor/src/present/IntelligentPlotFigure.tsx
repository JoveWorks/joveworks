import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import * as Plot from '@observablehq/plot';

import {
  candidateAt,
  gridSize,
  indexer,
  unionAxes,
  type Axis,
  type PlotAxis,
  type PlotMeasureResult,
  type PlotResult,
} from '@joveworks/kernel';
import { fromCanonical, type NumberFormat, type Unit } from '@joveworks/units';
import type { GraphDocument } from '@joveworks/schema';

import { useSettings } from '../settings-context';
import { inferPlotPanels, plotAxisFor, type PlotPanel, type PlotValueAxis } from '../model/plot';
import { axisNature, useDisplay } from './display';
import { chartTip, pointedRow, siAxisUnit, typesetChartLabels } from './PlotFigure';
import type { FigureMarking } from './marks';

export interface SmartRow {
  readonly cell: number;
  readonly x: number | string;
  /** Where this row plots on the shared y scale — identity for the primary
   * (index 0) value axis, and for every other axis the affine rescale of
   * its own reading onto the primary axis's display range
   * (`valueAxisPlacement`). Never the number to print: that is `reading`. */
  readonly value: number;
  /** The measure's own true reading, in its own value axis's unit —
   * unrescaled, always what a tip or a legend should print. */
  readonly reading: number;
  readonly axisIndex: number;
  readonly measure: string;
  readonly series?: number | string;
  readonly key?: string;
  readonly y?: number | string;
  readonly facet?: number | string;
}

/** Same qualitative palette Observable Plot's own default ordinal colour
 * scale assigns (`"observable10"`, the default for a nominal domain) — kept
 * here, rather than imported, because `PlotFigure.tsx`'s copy is private to
 * that module. Duplicated so a value axis's label can be coloured to match
 * the curve Plot itself draws for the same key, without reaching into
 * Plot's internal scale to ask it. */
const OBSERVABLE10 = [
  '#4269d0', '#efb118', '#ff725c', '#6cc5b0', '#3ca951',
  '#ff8ab7', '#a463f2', '#97bbf5', '#9c6b4e', '#9498a0',
];

/**
 * The colour a value axis's own label should use to match its curve — only
 * when that association is unambiguous: exactly one measure on the axis,
 * and no `series` role fanning that one measure into several colours of its
 * own. Anything else leaves the label uncoloured rather than guessing.
 */
function colorForValueAxis(panel: PlotPanel, axis: PlotValueAxis): string | undefined {
  if (panel.roles.series !== undefined || panel.measures.length <= 1 || axis.measures.length !== 1) return undefined;
  const index = panel.measures.findIndex((measure) => measure.id === axis.measures[0]?.id);
  return index === -1 ? undefined : OBSERVABLE10[index % OBSERVABLE10.length];
}

function canonicalExtentOf(measures: readonly PlotMeasureResult[]): readonly [number, number] {
  const data = measures.flatMap((measure) => measure.series.data).filter((value) => Number.isFinite(value));
  if (data.length === 0) return [0, 0];
  return [Math.min(...data), Math.max(...data)];
}

/** A linear map from one range onto another, degenerate ranges landing on the target's midpoint. */
export function rescaleValue(value: number, from: readonly [number, number], to: readonly [number, number]): number {
  const [minFrom, maxFrom] = from;
  const [minTo, maxTo] = to;
  if (maxFrom === minFrom) return (minTo + maxTo) / 2;
  return minTo + ((value - minFrom) / (maxFrom - minFrom)) * (maxTo - minTo);
}

export interface ValueAxisPlacement {
  readonly axisIndexOf: (measureId: string) => number;
  /** Where a measure's canonical value plots on the shared y scale. */
  readonly toChartValue: (measureId: string, canonicalValue: number) => number;
  /** The measure's own true reading, in its own axis's display unit — never rescaled. */
  readonly toOwnValue: (measureId: string, canonicalValue: number) => number;
  /** The inverse of `toChartValue`, for a right-side axis's own tick labels:
   * given a position already in the shared/primary display coordinate (a
   * tick Plot chose for the shared y scale), what number does axis
   * `axisIndex` actually read there. */
  readonly invertChartValue: (axisIndex: number, chartValue: number) => number;
}

/**
 * How each value axis's own reading maps onto the one y scale Observable
 * Plot actually draws. The primary (index 0) axis needs no mapping — its
 * own unit conversion is the chart's coordinate system by definition. Every
 * other axis is rescaled: its own canonical [min, max] is linearly mapped
 * onto the primary axis's *display* [min, max], so its curve occupies the
 * same pixels a primary-axis curve of that shape would, while a
 * right-anchored `Plot.axisY` (`PlotPanelFigure`) relabels those same tick
 * positions with `invertChartValue` so a reader still sees that axis's real
 * numbers.
 *
 * Deliberately rescales in *canonical* units, not each axis's display unit:
 * the ratio `(value - min) / (max - min)` is invariant under the affine
 * (scale-and-offset) unit conversions `fromCanonical` performs — mm to m,
 * K to °C, anything — so doing the division once in canonical units and
 * only converting the two endpoints afterwards is exactly the same map,
 * without re-deriving it per axis pair.
 */
export function valueAxisPlacement(panel: PlotPanel, valueUnits: readonly Unit[]): ValueAxisPlacement {
  const axisIndexByMeasure = new Map<string, number>();
  for (const axis of panel.valueAxes) {
    for (const measure of axis.measures) axisIndexByMeasure.set(measure.id, axis.index);
  }
  const axisIndexOf = (measureId: string): number => axisIndexByMeasure.get(measureId) ?? 0;

  const canonicalExtents = panel.valueAxes.map((axis) => canonicalExtentOf(axis.measures));
  const unitOf = (axisIndex: number): Unit => valueUnits[axisIndex] ?? (valueUnits[0] as Unit);
  const displayExtentOf = (axisIndex: number): readonly [number, number] => {
    const [low, high] = canonicalExtents[axisIndex] ?? [0, 0];
    const unit = unitOf(axisIndex);
    return [fromCanonical(low, unit), fromCanonical(high, unit)];
  };
  const primaryDisplay = displayExtentOf(0);

  const toOwnValue = (measureId: string, canonicalValue: number): number =>
    fromCanonical(canonicalValue, unitOf(axisIndexOf(measureId)));

  const toChartValue = (measureId: string, canonicalValue: number): number => {
    const axisIndex = axisIndexOf(measureId);
    if (axisIndex === 0) return toOwnValue(measureId, canonicalValue);
    return rescaleValue(canonicalValue, canonicalExtents[axisIndex] as readonly [number, number], primaryDisplay);
  };

  const invertChartValue = (axisIndex: number, chartValue: number): number =>
    axisIndex === 0 ? chartValue : rescaleValue(chartValue, primaryDisplay, displayExtentOf(axisIndex));

  return { axisIndexOf, toChartValue, toOwnValue, invertChartValue };
}

function displayedCoordinates(readout: PlotAxis): readonly (number | string)[] {
  return readout.coordinates.kind === 'numeric'
    ? readout.coordinates.data.map((value) => fromCanonical(value, readout.unit))
    : readout.coordinates.data;
}

function labelOf(axis: PlotAxis, panel: PlotPanel): string {
  const label = panel.measures[0]?.view?.axisLabels?.[axis.axis.id] ?? axis.axis.label;
  return `${label}${axis.unit.symbol.trim() === '' ? '' : ` (${axis.unit.symbol})`}`;
}

function panelGrid(panel: PlotPanel): readonly Axis[] {
  return unionAxes(...panel.measures.map((measure) => measure.series.axes));
}

/**
 * Build the shared, broadcast grid consumed by every intelligent plot mark.
 * `valueUnits[i]` is the display unit already chosen for `panel.valueAxes[i]`
 * (`siAxisUnit`, applied per axis rather than once for the whole panel) —
 * `value` is where the row plots (rescaled onto the primary axis for any
 * other value axis), `reading` is what it actually is.
 */
export function rowsForPanel(panel: PlotPanel, valueUnits: readonly Unit[]): readonly SmartRow[] {
  const placement = valueAxisPlacement(panel, valueUnits);

  if (panel.axes.length === 0) {
    return panel.measures.map((measure) => {
      const canonicalValue = measure.series.data[0] as number;
      return {
        cell: 0,
        x: measure.label,
        value: placement.toChartValue(measure.id, canonicalValue),
        reading: placement.toOwnValue(measure.id, canonicalValue),
        axisIndex: placement.axisIndexOf(measure.id),
        measure: measure.label,
      };
    });
  }

  const target = panelGrid(panel);
  const xAxis = plotAxisFor(panel, panel.roles.x);
  const yAxis = plotAxisFor(panel, panel.roles.y);
  const seriesAxis = plotAxisFor(panel, panel.roles.series);
  const facetAxis = plotAxisFor(panel, panel.roles.facet);
  if (xAxis === undefined) return [];
  const xAt = indexer(xAxis.coordinates, target);
  const xs = displayedCoordinates(xAxis);
  const yAt = yAxis === undefined ? undefined : indexer(yAxis.coordinates, target);
  const ys = yAxis === undefined ? undefined : displayedCoordinates(yAxis);
  const seriesAt = seriesAxis === undefined ? undefined : indexer(seriesAxis.coordinates, target);
  const seriesValues = seriesAxis === undefined ? undefined : displayedCoordinates(seriesAxis);
  const facetAt = facetAxis === undefined ? undefined : indexer(facetAxis.coordinates, target);
  const facetValues = facetAxis === undefined ? undefined : displayedCoordinates(facetAxis);

  return panel.measures.flatMap((measure) => {
    const valueAt = indexer(measure.series, target);
    return Array.from({ length: gridSize(target) }, (_unused, cell): SmartRow => {
      const series = seriesAt === undefined || seriesValues === undefined
        ? undefined
        : seriesValues[seriesAt(cell)];
      const needsMeasureKey = panel.measures.length > 1;
      const key = [needsMeasureKey ? measure.label : undefined, series]
        .filter((entry) => entry !== undefined)
        .join(' · ');
      const canonicalValue = measure.series.data[valueAt(cell)] as number;
      return {
        cell,
        value: placement.toChartValue(measure.id, canonicalValue),
        reading: placement.toOwnValue(measure.id, canonicalValue),
        axisIndex: placement.axisIndexOf(measure.id),
        x: xs[xAt(cell)] as number | string,
        measure: measure.label,
        ...(key === '' ? {} : { key }),
        ...(yAt === undefined || ys === undefined ? {} : { y: ys[yAt(cell)] as number | string }),
        ...(series === undefined ? {} : { series }),
        ...(facetAt === undefined || facetValues === undefined
          ? {}
          : { facet: facetValues[facetAt(cell)] as number | string }),
      };
    });
  });
}

/**
 * Observable's dense contour input is more reliable than its raster
 * interpolation for the regular two-axis grids produced by a study. Keep the
 * values in y-major order, which is the order `Plot.contour` expects, and let
 * the existing row data continue to drive tips and candidate marks.
 *
 * A faceted field retains the sample-based path below: each facet is an
 * independent dense grid, while this compact helper intentionally describes
 * one rectangle only.
 */
export function contourGridForPanel(panel: PlotPanel, valueUnit: Unit): {
  readonly values: readonly number[];
  readonly rectangle: {
    readonly width: number;
    readonly height: number;
    readonly x1: number;
    readonly x2: number;
    readonly y1: number;
    readonly y2: number;
  };
} | undefined {
  const xAxis = plotAxisFor(panel, panel.roles.x);
  const yAxis = plotAxisFor(panel, panel.roles.y);
  if (
    xAxis?.coordinates.kind !== 'numeric' ||
    yAxis?.coordinates.kind !== 'numeric' ||
    panel.roles.facet !== undefined ||
    panel.measures.length !== 1
  ) return undefined;
  const xs = displayedCoordinates(xAxis).map(Number);
  const ys = displayedCoordinates(yAxis).map(Number);
  if (
    xs.length === 0 || ys.length === 0 ||
    xs.some((value) => !Number.isFinite(value)) || ys.some((value) => !Number.isFinite(value))
  ) {
    return undefined;
  }
  const target = panelGrid(panel);
  const measure = panel.measures[0] as PlotMeasureResult;
  const valueAt = indexer(measure.series, target);
  const xAt = indexer(xAxis.coordinates, target);
  const yAt = indexer(yAxis.coordinates, target);
  const values = new Array<number>(xs.length * ys.length).fill(Number.NaN);
  for (let cell = 0; cell < gridSize(target); cell += 1) {
    values[yAt(cell) * xs.length + xAt(cell)] = fromCanonical(
      measure.series.data[valueAt(cell)] as number,
      valueUnit,
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

/** The numeric extent and reference levels shown on a contour's right-side key. */
export function contourLegendLevels(panel: PlotPanel, valueUnit: Unit): {
  readonly minimum: number;
  readonly maximum: number;
  readonly thresholds: readonly number[];
} | undefined {
  const values = panel.measures
    .flatMap((measure) => measure.series.data)
    .map((value) => fromCanonical(value, valueUnit))
    .filter(Number.isFinite);
  if (values.length === 0) return undefined;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return {
    minimum,
    maximum,
    thresholds: panel.measures
      .flatMap((measure) => measure.threshold === undefined ? [] : [fromCanonical(measure.threshold, valueUnit)])
      .filter((value) => Number.isFinite(value) && value >= minimum && value <= maximum),
  };
}

/**
 * Panel types that map one continuous value to colour over the same two
 * swept axes — a heatmap's cells, a contour's bands — and so share the
 * compact right-side colour-scale key (`contourColorbar`) instead of
 * Observable's own legend, which renders as a wide ramp above the chart.
 */
export function sharesColorScaleKey(panelType: PlotPanel['type']): boolean {
  return panelType === 'heatmap' || panelType === 'contour';
}

/**
 * The chart is narrowed to leave room for the colour-scale key, whenever a
 * panel actually got one — not merely whenever it is a contour. A panel with
 * no finite values (`contourColorbar` returns `undefined` there) falls back
 * to the full width with no key at all.
 */
export function chartWidth(width: number, hasColorbar: boolean): number {
  return hasColorbar ? Math.max(320, width - 102) : Math.max(320, width);
}

/**
 * Restore the compact, readable contour key used by the original Plot node.
 *
 * A heatmap draws the same value-to-colour mapping over the same two swept
 * axes as a contour — cells instead of bands — so it uses this key too,
 * rather than Observable's own legend, which renders as a wide ramp above the
 * chart. The name and the `.contour-*` classes stay contour-flavoured; treat
 * them as "the two-axis colour-scale key" wherever a heatmap reaches here.
 */
function contourColorbar(panel: PlotPanel, valueUnit: Unit, palette: string): HTMLElement | undefined {
  const levels = contourLegendLevels(panel, valueUnit);
  if (levels === undefined) return undefined;
  const format = (value: number): string => value.toLocaleString(undefined, { maximumSignificantDigits: 3 });
  const colorbar = document.createElement('aside');
  colorbar.className = 'contour-colorbar';
  colorbar.dataset.palette = palette;
  colorbar.style.height = `${panel.height}px`;

  const title = document.createElement('strong');
  title.textContent = measuredLabel(panel, valueUnit);
  const scale = document.createElement('div');
  scale.className = 'contour-colorbar-scale';
  const values = document.createElement('div');
  values.className = 'contour-colorbar-values';
  values.append(Object.assign(document.createElement('span'), { textContent: format(levels.maximum) }));
  values.append(Object.assign(document.createElement('span'), { textContent: format(levels.minimum) }));
  const ramp = document.createElement('i');
  ramp.className = 'contour-colorbar-ramp';
  const span = levels.maximum - levels.minimum;
  for (const threshold of levels.thresholds) {
    const position = span === 0 ? 50 : ((threshold - levels.minimum) / span) * 100;
    const tick = document.createElement('i');
    tick.className = 'contour-colorbar-threshold';
    tick.style.bottom = `${position}%`;
    ramp.append(tick);
    const reading = document.createElement('span');
    reading.className = 'contour-colorbar-threshold-value';
    reading.style.bottom = `${position}%`;
    reading.textContent = format(threshold);
    values.append(reading);
  }
  scale.append(values, ramp);
  colorbar.append(title, scale);
  return colorbar;
}

/** The primary value axis's label — every existing single-axis caller
 * (contour/heatmap's colorbar title, the left y label). */
function measuredLabel(panel: PlotPanel, valueUnit: Unit): string {
  return measuredLabelForAxis(panel, panel.valueAxes[0] ?? { index: 0, measures: panel.measures }, valueUnit);
}

/** A value axis's own label — `measuredLabel` is this for axis 0, and every
 * secondary+ axis's right-side `Plot.axisY` uses it for its own label too. */
function measuredLabelForAxis(panel: PlotPanel, axis: PlotValueAxis, unit: Unit): string {
  const lead = axis.measures[0] as PlotMeasureResult;
  const selected = lead.view?.valueLabel;
  if (selected !== undefined) return selected;
  const label = axis.measures.length === 1 ? lead.label : 'value';
  return `${label}${unit.symbol.trim() === '' ? '' : ` (${unit.symbol})`}`;
}

export function tipText(panel: PlotPanel, row: SmartRow, valueUnits: readonly Unit[]): string {
  const lines: string[] = [];
  const x = plotAxisFor(panel, panel.roles.x);
  const y = plotAxisFor(panel, panel.roles.y);
  const series = plotAxisFor(panel, panel.roles.series);
  const facet = plotAxisFor(panel, panel.roles.facet);
  if (panel.measures.length > 1) lines.push(row.measure);
  if (x !== undefined) lines.push(`${labelOf(x, panel)}: ${row.x}`);
  if (y !== undefined && row.y !== undefined) lines.push(`${labelOf(y, panel)}: ${row.y}`);
  if (series !== undefined && row.series !== undefined) lines.push(`${labelOf(series, panel)}: ${row.series}`);
  if (facet !== undefined && row.facet !== undefined) lines.push(`${labelOf(facet, panel)}: ${row.facet}`);
  // Every measure in its own unit, off its own axis — never `valueUnits[0]`
  // for a measure that lives on a secondary axis, and never `row.value`,
  // which is the rescaled plotting position rather than the reading.
  const axis = panel.valueAxes[row.axisIndex] ?? panel.valueAxes[0];
  const unit = valueUnits[row.axisIndex] ?? (valueUnits[0] as Unit);
  const label = axis === undefined ? measuredLabel(panel, unit) : measuredLabelForAxis(panel, axis, unit);
  lines.push(`${label}: ${row.reading.toLocaleString(undefined, { maximumSignificantDigits: 4 })}`);
  return lines.join('\n');
}

function PlotPanelFigure({
  panel,
  width,
  marking,
}: {
  readonly panel: PlotPanel;
  readonly width: number;
  readonly marking?: FigureMarking;
}): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const { format, contourPalette, titleMath: titleMathRendering, axes } = useDisplay();

  useEffect(() => {
    const container = host.current;
    if (container === null || panel.error !== undefined) return undefined;
    // One SI-prefixed unit per value axis, chosen from that axis's own
    // measures — a force axis and a length axis pick their own prefix
    // independently, exactly as they would as separate panels.
    const valueUnits = panel.valueAxes.map((valueAxis) => siAxisUnit(
      (valueAxis.measures[0] as PlotMeasureResult).unit,
      valueAxis.measures.flatMap((measure) => measure.series.data),
      format,
    ));
    const primaryUnit = valueUnits[0] as Unit;
    const placement = valueAxisPlacement(panel, valueUnits);
    const data = rowsForPanel(panel, valueUnits);
    if (data.length === 0) return undefined;
    const xAxis = plotAxisFor(panel, panel.roles.x);
    const yAxis = plotAxisFor(panel, panel.roles.y);
    const facetAxis = plotAxisFor(panel, panel.roles.facet);
    const contourGrid = panel.type === 'contour' ? contourGridForPanel(panel, primaryUnit) : undefined;
    const xLabel = xAxis === undefined ? '' : labelOf(xAxis, panel);
    const yLabel = yAxis === undefined ? measuredLabel(panel, primaryUnit) : labelOf(yAxis, panel);
    // A secondary (or ternary) value axis, right of the frame — line/dot
    // only; heatmap and contour never have more than one value axis. Plot
    // gives a chart one y scale, so these are drawn at the *same* tick
    // positions the primary axis picked (no `data`/`ticks` of their own)
    // with `tickFormat` inverting each position back into that axis's real
    // reading — see `valueAxisPlacement`'s doc comment for why the
    // underlying rescale is correct to do in canonical units.
    const secondaryAxes = (panel.type === 'line' || panel.type === 'dot')
      ? panel.valueAxes.slice(1)
      : [];
    const secondaryAxisMarks = secondaryAxes.map((valueAxis) => {
      const unit = valueUnits[valueAxis.index] as Unit;
      const color = colorForValueAxis(panel, valueAxis);
      return Plot.axisY({
        anchor: 'right',
        label: measuredLabelForAxis(panel, valueAxis, unit),
        dx: (valueAxis.index - 1) * 56,
        ...(color === undefined ? {} : { color }),
        tickFormat: (value: number) =>
          placement.invertChartValue(valueAxis.index, value).toLocaleString(undefined, { maximumSignificantDigits: 3 }),
      });
    });
    const channels = {
      ...(data.some((row) => row.key !== undefined) ? { stroke: 'key' } : {}),
      ...(facetAxis === undefined ? {} : { fx: 'facet' }),
    };
    const marks: Plot.Markish[] = [];

    if (panel.type === 'line') {
      marks.push(
        Plot.line(data, { x: 'x', y: 'value', ...channels }),
        Plot.dot(data, { x: 'x', y: 'value', r: 2.5, ...channels }),
      );
    } else if (panel.type === 'dot') {
      marks.push(Plot.dot(data, { x: 'x', y: 'value', r: 5, ...channels }));
    } else if (panel.type === 'heatmap') {
      marks.push(Plot.cell(data, {
        x: 'x',
        y: 'y',
        fill: 'value',
        inset: 0.5,
        ...(facetAxis === undefined ? {} : { fx: 'facet' }),
      }));
    } else {
      marks.push(contourGrid === undefined
        ? Plot.contour(data, {
            x: 'x', y: 'y', value: 'value', fill: Plot.identity,
            stroke: 'currentColor', strokeOpacity: 0.35,
            ...(facetAxis === undefined ? {} : { fx: 'facet' }),
          })
        : Plot.contour(contourGrid.values, {
            ...contourGrid.rectangle,
            fill: Plot.identity,
            stroke: 'currentColor',
            strokeOpacity: 0.35,
          }));
    }

    // A threshold rescales exactly like its measure's own readings do: a
    // secondary-axis measure's threshold has to land on the same rescaled
    // coordinate its curve does, or the rule is drawn against the wrong
    // axis's numbers entirely (`valueAxisPlacement`'s `toChartValue`).
    const references = panel.measures.flatMap((measure) =>
      measure.threshold === undefined
        ? []
        : [{
            measure: measure.label,
            value: placement.toChartValue(measure.id, measure.threshold),
          }],
    );
    if (references.length > 0 && (panel.type === 'line' || panel.type === 'dot')) {
      if (panel.axes.length === 0) {
        marks.push(Plot.tickY(references, { x: 'measure', y: 'value', stroke: '#c2410c', strokeWidth: 2 }));
      } else {
        marks.push(
          ...references.map((reference) => Plot.ruleY([reference.value], {
            stroke: '#c2410c',
            strokeDasharray: '4 3',
          })),
        );
      }
    }
    if (references.length > 0 && (panel.type === 'heatmap' || panel.type === 'contour')) {
      marks.push(
        ...references.map((reference) => contourGrid === undefined
          ? Plot.contour(data, {
              x: 'x', y: 'y', value: 'value', thresholds: [reference.value], smooth: false,
              stroke: '#c2410c', strokeWidth: 2,
              ...(facetAxis === undefined ? {} : { fx: 'facet' }),
            })
          : Plot.contour(contourGrid.values, {
              ...contourGrid.rectangle,
              thresholds: [reference.value],
              smooth: false,
              stroke: '#c2410c',
              strokeWidth: 2,
            })),
      );
    }

    const marked = marking === undefined
      ? []
      : data.filter((row) => marking.marks.at(row.cell).length > 0);
    if (marked.length > 0) {
      const markY = panel.type === 'line' || panel.type === 'dot' ? 'value' : 'y';
      marks.push(
        Plot.dot(marked, {
          x: 'x', y: markY,
          r: 7, stroke: 'currentColor', strokeWidth: 1.5,
          ...(facetAxis === undefined ? {} : { fx: 'facet' }),
        }),
        Plot.text(marked, {
          x: 'x', y: markY,
          text: (row: SmartRow) => marking?.marks.at(row.cell)[0]?.letter ?? '',
          dy: -14,
          fontWeight: 'bold',
          ...(facetAxis === undefined ? {} : { fx: 'facet' }),
        }),
      );
    }

    marks.push(chartTip(data, 'x', {
      x: 'x',
      y: panel.type === 'line' || panel.type === 'dot' ? 'value' : 'y',
      title: (row: SmartRow) => tipText(panel, row, valueUnits),
      ...(facetAxis === undefined ? {} : { fx: 'facet' }),
    }));
    marks.push(...secondaryAxisMarks);

    const xScale = panel.roles.x === undefined
      ? 'linear'
      : panel.scales[panel.roles.x] ?? (axisNature(axes, panel.roles.x).logarithmic ? 'log' : 'linear');
    const yScale = panel.roles.y === undefined
      ? panel.valueScale
      : panel.scales[panel.roles.y] ?? (axisNature(axes, panel.roles.y).logarithmic ? 'log' : 'linear');
    const colorbar = sharesColorScaleKey(panel.type)
      ? contourColorbar(panel, primaryUnit, contourPalette)
      : undefined;
    // Room for the secondary/ternary axes' own ticks and label, to the
    // right of the frame — otherwise they draw past the chart's own edge.
    const marginRight = secondaryAxes.length === 0 ? undefined : 40 + 56 * secondaryAxes.length;
    const chart = Plot.plot({
      width: chartWidth(width, colorbar !== undefined),
      height: panel.height,
      marginLeft: 64,
      marginBottom: 44,
      ...(marginRight === undefined ? {} : { marginRight }),
      x: { label: panel.axes.length === 0 ? '' : xLabel, ...(xScale === 'log' ? { type: 'log' } : {}) },
      y: {
        label: yLabel,
        grid: panel.type === 'line' || panel.type === 'dot',
        ...(yScale === 'log' ? { type: 'log' } : {}),
      },
      ...(sharesColorScaleKey(panel.type)
        ? { color: { scheme: contourPalette, legend: false, label: measuredLabel(panel, primaryUnit), ...(panel.valueScale === 'log' ? { type: 'log' } : {}) } }
        : data.some((row) => row.key !== undefined)
          ? { color: { legend: true } }
          : {}),
      ...(facetAxis === undefined ? {} : { fx: { label: labelOf(facetAxis, panel) } }),
      marks,
    });
    if (colorbar !== undefined) container.classList.add('contour-figure');
    // Swapped in place, never detached in the cleanup — see the note on this
    // in PlotFigure.tsx, which explains the scroll jump that caused.
    container.replaceChildren(chart, ...(colorbar === undefined ? [] : [colorbar]));

    const pointed = (): SmartRow | undefined => pointedRow<SmartRow>(chart);
    const grid = panelGrid(panel);
    const handleInput = (): void => {
      const row = pointed();
      marking?.hover(row === undefined ? undefined : candidateAt(grid, row.cell, marking.readouts));
    };
    const handleClick = (): void => {
      const row = pointed();
      if (row !== undefined && marking !== undefined && grid.length > 0) {
        marking.toggle(candidateAt(grid, row.cell, marking.readouts));
      }
    };
    const handleLeave = (): void => marking?.hover(undefined);
    if (marking !== undefined && grid.length > 0) {
      chart.addEventListener('input', handleInput);
      chart.addEventListener('click', handleClick);
      chart.addEventListener('pointerleave', handleLeave);
    }
    if (titleMathRendering && chart instanceof SVGSVGElement) {
      typesetChartLabels(chart, [
        xLabel,
        yLabel,
        measuredLabel(panel, primaryUnit),
        ...secondaryAxes.map((valueAxis) => measuredLabelForAxis(panel, valueAxis, valueUnits[valueAxis.index] as Unit)),
        ...(facetAxis === undefined ? [] : [labelOf(facetAxis, panel)]),
      ]);
    }
    return () => {
      chart.removeEventListener('input', handleInput);
      chart.removeEventListener('click', handleClick);
      chart.removeEventListener('pointerleave', handleLeave);
      container.classList.remove('contour-figure');
    };
  }, [panel, axes, width, format, marking, contourPalette, titleMathRendering]);

  return <div className="figure intelligent-plot-panel" ref={host} />;
}

export function IntelligentPlotFigure({
  result,
  markingFor,
}: {
  readonly result: PlotResult;
  readonly markingFor?: (axes: readonly Axis[]) => FigureMarking;
}): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const { axes } = useDisplay();
  const measures = result.measures ?? [];
  const panels = useMemo(() => inferPlotPanels(axes, measures), [axes, measures]);

  useEffect(() => {
    const element = host.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.max(320, entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="intelligent-plot" ref={host}>
      {panels.map((panel) => (
        <section className="intelligent-plot-view" key={panel.id}>
          <p className="plot-auto-reason" title={panel.reason}>{panel.reason}</p>
          {panel.error === undefined ? (
            <PlotPanelFigure
              panel={panel}
              width={width}
              {...(markingFor === undefined ? {} : { marking: markingFor(panelGrid(panel)) })}
            />
          ) : <p className="plot-configuration-error">{panel.error}</p>}
        </section>
      ))}
    </div>
  );
}
