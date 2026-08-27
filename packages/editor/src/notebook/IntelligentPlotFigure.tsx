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
import { inferPlotPanels, isLogarithmicAxis, plotAxisFor, type PlotPanel } from '../model/plot';
import { chartTip, siAxisUnit, typesetChartLabels } from './PlotFigure';
import type { FigureMarking } from './marks';

export interface SmartRow {
  readonly cell: number;
  readonly x: number | string;
  readonly value: number;
  readonly measure: string;
  readonly series?: number | string;
  readonly key?: string;
  readonly y?: number | string;
  readonly facet?: number | string;
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

/** Build the shared, broadcast grid consumed by every intelligent plot mark. */
export function rowsForPanel(panel: PlotPanel, valueUnit: Unit): readonly SmartRow[] {
  if (panel.axes.length === 0) {
    return panel.measures.map((measure) => ({
      cell: 0,
      x: measure.label,
      value: fromCanonical(measure.series.data[0] as number, valueUnit),
      measure: measure.label,
    }));
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
      return {
        cell,
        x: xs[xAt(cell)] as number | string,
        value: fromCanonical(measure.series.data[valueAt(cell)] as number, valueUnit),
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

function measuredLabel(panel: PlotPanel, valueUnit: Unit): string {
  const lead = panel.measures[0] as PlotMeasureResult;
  const selected = lead.view?.valueLabel;
  if (selected !== undefined) return selected;
  const label = panel.measures.length === 1 ? lead.label : 'value';
  return `${label}${valueUnit.symbol.trim() === '' ? '' : ` (${valueUnit.symbol})`}`;
}

function tipText(panel: PlotPanel, row: SmartRow, valueUnit: Unit): string {
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
  lines.push(`${measuredLabel(panel, valueUnit)}: ${row.value.toLocaleString(undefined, { maximumSignificantDigits: 4 })}`);
  return lines.join('\n');
}

function PlotPanelFigure({
  panel,
  document,
  width,
  format,
  marking,
}: {
  readonly panel: PlotPanel;
  readonly document: GraphDocument;
  readonly width: number;
  readonly format: NumberFormat;
  readonly marking?: FigureMarking;
}): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const { contourPalette, titleMathRendering } = useSettings();

  useEffect(() => {
    const container = host.current;
    if (container === null || panel.error !== undefined) return undefined;
    const valueUnit = siAxisUnit(
      (panel.measures[0] as PlotMeasureResult).unit,
      panel.measures.flatMap((measure) => measure.series.data),
      format,
    );
    const data = rowsForPanel(panel, valueUnit);
    if (data.length === 0) return undefined;
    const xAxis = plotAxisFor(panel, panel.roles.x);
    const yAxis = plotAxisFor(panel, panel.roles.y);
    const facetAxis = plotAxisFor(panel, panel.roles.facet);
    const xLabel = xAxis === undefined ? '' : labelOf(xAxis, panel);
    const yLabel = yAxis === undefined ? measuredLabel(panel, valueUnit) : labelOf(yAxis, panel);
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
      marks.push(Plot.contour(data, {
        x: 'x',
        y: 'y',
        value: 'value',
        fill: Plot.identity,
        stroke: 'currentColor',
        strokeOpacity: 0.35,
        ...(facetAxis === undefined ? {} : { fx: 'facet' }),
      }));
    }

    const references = panel.measures.flatMap((measure) =>
      measure.threshold === undefined
        ? []
        : [{
            measure: measure.label,
            value: fromCanonical(measure.threshold, valueUnit),
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
        ...references.map((reference) => Plot.contour(data, {
          x: 'x', y: 'y', value: 'value', thresholds: [reference.value], smooth: false,
          stroke: '#c2410c', strokeWidth: 2,
          ...(facetAxis === undefined ? {} : { fx: 'facet' }),
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
      title: (row: SmartRow) => tipText(panel, row, valueUnit),
      ...(facetAxis === undefined ? {} : { fx: 'facet' }),
    }));

    const xScale = panel.roles.x === undefined
      ? 'linear'
      : panel.scales[panel.roles.x] ?? (isLogarithmicAxis(document, panel.roles.x) ? 'log' : 'linear');
    const yScale = panel.roles.y === undefined
      ? panel.valueScale
      : panel.scales[panel.roles.y] ?? (isLogarithmicAxis(document, panel.roles.y) ? 'log' : 'linear');
    const chart = Plot.plot({
      width: Math.max(320, width),
      height: panel.height,
      marginLeft: 64,
      marginBottom: 44,
      x: { label: panel.axes.length === 0 ? '' : xLabel, ...(xScale === 'log' ? { type: 'log' } : {}) },
      y: { label: yLabel, grid: panel.type === 'line' || panel.type === 'dot', ...(yScale === 'log' ? { type: 'log' } : {}) },
      ...(panel.type === 'heatmap' || panel.type === 'contour'
        ? { color: { scheme: contourPalette, legend: true, label: measuredLabel(panel, valueUnit), ...(panel.valueScale === 'log' ? { type: 'log' } : {}) } }
        : data.some((row) => row.key !== undefined)
          ? { color: { legend: true } }
          : {}),
      ...(facetAxis === undefined ? {} : { fx: { label: labelOf(facetAxis, panel) } }),
      marks,
    });
    container.append(chart);

    const pointed = (): SmartRow | undefined => (chart as { value?: SmartRow }).value;
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
      typesetChartLabels(chart, [xLabel, yLabel, measuredLabel(panel, valueUnit), ...(facetAxis === undefined ? [] : [labelOf(facetAxis, panel)])]);
    }
    return () => {
      chart.removeEventListener('input', handleInput);
      chart.removeEventListener('click', handleClick);
      chart.removeEventListener('pointerleave', handleLeave);
      chart.remove();
    };
  }, [panel, document, width, format, marking, contourPalette, titleMathRendering]);

  return <div className="figure intelligent-plot-panel" ref={host} />;
}

export function IntelligentPlotFigure({
  result,
  document,
  format,
  markingFor,
}: {
  readonly result: PlotResult;
  readonly document: GraphDocument;
  readonly format: NumberFormat;
  readonly markingFor?: (axes: readonly Axis[]) => FigureMarking;
}): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const measures = result.measures ?? [];
  const panels = useMemo(() => inferPlotPanels(document, measures), [document, measures]);

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
              document={document}
              width={width}
              format={format}
              {...(markingFor === undefined ? {} : { marking: markingFor(panelGrid(panel)) })}
            />
          ) : <p className="plot-configuration-error">{panel.error}</p>}
        </section>
      ))}
    </div>
  );
}
