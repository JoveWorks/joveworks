import type { ReactElement } from 'react';
import type { JsonObject, JsonValue } from '@joveworks/schema';

interface Point { readonly x: number; readonly y: number }

function record(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | undefined {
  return value !== null && value !== undefined && !Array.isArray(value) && typeof value === 'object' ? value : undefined;
}

function finite(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

function finiteNumbers(value: JsonValue | undefined): readonly number[] {
  return Array.isArray(value) ? value.flatMap((entry) => {
    const number = finite(entry);
    return number === undefined ? [] : [number];
  }) : [];
}

function displayed(values: readonly number[], unit: Readonly<Record<string, JsonValue>> | undefined): readonly number[] {
  const factor = finite(unit?.factor) ?? 1;
  return values.map((value) => value / factor);
}

function extent(values: readonly number[]): readonly [number, number] {
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [0, 1];
  if (minimum === maximum) {
    const padding = Math.abs(minimum) * 0.05 || 1;
    minimum -= padding;
    maximum += padding;
  }
  const padding = (maximum - minimum) * 0.06;
  return [minimum - padding, maximum + padding];
}

function ticks([minimum, maximum]: readonly [number, number]): readonly number[] {
  return Array.from({ length: 5 }, (_, index) => minimum + ((maximum - minimum) * index) / 4);
}

function reading(value: number): string {
  return value.toLocaleString(undefined, { maximumSignificantDigits: 4 });
}

/** A presentation-only line plot over compiled data; no graph or kernel is needed. */
export function CompiledPlotFigure({ result, label }: { readonly result: JsonObject; readonly label: string }): ReactElement {
  const series = record(result.series);
  const x = record(result.x);
  const xCoordinates = record(x?.coordinates);
  const xUnit = record(x?.unit);
  const yUnit = record(result.unit);
  const rawY = finiteNumbers(series?.data);
  const rawX = finiteNumbers(xCoordinates?.data);
  const ys = displayed(rawY, yUnit);
  const xs = displayed(rawX, xUnit);
  const count = Math.min(xs.length, ys.length);
  if (count === 0) return <p className="compiled-plot-empty">No finite plot values are available.</p>;

  const points: readonly Point[] = Array.from({ length: count }, (_, index) => ({ x: xs[index]!, y: ys[index]! }));
  const xExtent = extent(points.map((point) => point.x));
  const threshold = finite(result.threshold);
  const shownThreshold = threshold === undefined ? undefined : threshold / (finite(yUnit?.factor) ?? 1);
  const yExtent = extent([...points.map((point) => point.y), ...(shownThreshold === undefined ? [] : [shownThreshold])]);
  const width = 640;
  const height = 300;
  const margin = { left: 72, right: 20, top: 18, bottom: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const sx = (value: number): number => margin.left + ((value - xExtent[0]) / (xExtent[1] - xExtent[0])) * plotWidth;
  const sy = (value: number): number => margin.top + plotHeight - ((value - yExtent[0]) / (yExtent[1] - yExtent[0])) * plotHeight;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${sx(point.x).toFixed(2)},${sy(point.y).toFixed(2)}`).join(' ');
  const xAxis = record(x?.axis);
  const xLabel = `${text(xAxis?.label) || 'x'}${text(xUnit?.symbol) === '' ? '' : ` (${text(xUnit?.symbol)})`}`;
  const yLabel = `${label}${text(yUnit?.symbol) === '' ? '' : ` (${text(yUnit?.symbol)})`}`;

  return <div className="compiled-plot"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} plot`}>
    {ticks(yExtent).map((tick) => <g key={`y-${tick}`}><line className="plot-grid" x1={margin.left} x2={width - margin.right} y1={sy(tick)} y2={sy(tick)} /><text className="plot-tick" x={margin.left - 10} y={sy(tick) + 4} textAnchor="end">{reading(tick)}</text></g>)}
    {ticks(xExtent).map((tick) => <text className="plot-tick" key={`x-${tick}`} x={sx(tick)} y={height - margin.bottom + 22} textAnchor="middle">{reading(tick)}</text>)}
    <line className="plot-axis" x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} />
    <line className="plot-axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={height - margin.bottom} />
    {shownThreshold === undefined ? null : <g><line className="plot-threshold" x1={margin.left} x2={width - margin.right} y1={sy(shownThreshold)} y2={sy(shownThreshold)} /><text className="plot-threshold-label" x={margin.left + 5} y={sy(shownThreshold) - 7}>{reading(shownThreshold)}</text></g>}
    <path className="plot-line" d={path} />
    {points.map((point, index) => <circle className="plot-point" key={index} cx={sx(point.x)} cy={sy(point.y)} r="3" />)}
    <text className="plot-label" x={margin.left + plotWidth / 2} y={height - 7} textAnchor="middle">{xLabel}</text>
    <text className="plot-label" transform={`translate(16 ${margin.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
  </svg></div>;
}
