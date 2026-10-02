/**
 * The points a plot draws, as a downloadable CSV.
 *
 * Built from the same rows the figures themselves draw from (`rows`,
 * `inferPlotPanels`), so the file is what is on screen: the same axis and
 * value headings, in the same display units — including the one shared SI
 * prefix an axis was given — rather than the kernel's canonical ones.
 *
 * What it does not share with the table export (`model/csv.ts`) is rounding.
 * A table column has digits its author chose; a plotted point has none, so a
 * number is written out in full, less the binary-fraction noise a unit
 * conversion leaves behind, and without thousands grouping — the file is for
 * a spreadsheet to compute with, not to be read. Decimal punctuation and the
 * field separator still follow the reader's own number format, for the reason
 * that module's doc gives.
 *
 * An intelligent plot is one block per panel, one row per swept design and
 * one column per measure — the shape a spreadsheet charts directly. Several
 * panels become several blocks, each under its own header and a blank line
 * apart, because panels differ in the axes they vary along and no single
 * header row is true of all of them.
 */

import { gridSize, indexer, type PlotAxis, type PlotResult } from '@joveworks/kernel';
import { formatPlainNumber, type NumberFormat, type Unit } from '@joveworks/units';

import { csvSeparator, csvText } from '../model/csv';
import { inferPlotPanels, type PlotPanel } from '../model/plot';
import type { AxisNatures } from './display';
import {
  displayedCoordinates,
  labelOf,
  panelGrid,
  panelValueUnits,
  valueAxisPlacement,
} from './IntelligentPlotFigure';
import { axisLabel, plotValueLabel, rows, siResult } from './PlotFigure';

/** Enough digits to round-trip any reading, few enough to drop `0.30000000000000004`. */
const CSV_PRECISION = 12;

function field(value: number | string | undefined, format: NumberFormat): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  // A point the calculation could not produce is an empty cell, not the text `NaN`.
  return Number.isFinite(value) ? formatPlainNumber(Number(value.toPrecision(CSV_PRECISION)), format) : '';
}

function withUnit(label: string, unit: Unit): string {
  return unit.symbol.trim() === '' ? label : `${label} (${unit.symbol})`;
}

function classicRows(raw: PlotResult, format: NumberFormat): readonly (readonly string[])[] {
  const result = siResult(raw, format);
  const extra = [result.series2, result.facet];
  const valueLabel = plotValueLabel(result).trim();
  const header = [
    axisLabel(result.x),
    ...extra.flatMap((axis) => (axis === undefined ? [] : [axisLabel(axis)])),
    valueLabel === '' ? 'value' : valueLabel,
  ];
  return [
    header,
    ...rows(result).map((row) => [
      field(row.x, format),
      ...(result.series2 === undefined ? [] : [field(row.series, format)]),
      ...(result.facet === undefined ? [] : [field(row.facet, format)]),
      field(row.y, format),
    ]),
  ];
}

function panelRows(panel: PlotPanel, format: NumberFormat): readonly (readonly string[])[] {
  const valueUnits = panelValueUnits(panel, format);
  const placement = valueAxisPlacement(panel, valueUnits);
  const target = panelGrid(panel);
  const axes = panel.axes.map((axis: PlotAxis) => ({
    label: labelOf(axis, panel),
    values: displayedCoordinates(axis),
    at: indexer(axis.coordinates, target),
  }));
  // Each measure in its own value axis's unit — the reading, never the
  // position it was rescaled to for a secondary axis (`SmartRow.value`).
  const measures = panel.measures.map((measure) => {
    const valueAt = indexer(measure.series, target);
    return {
      label: withUnit(measure.label, valueUnits[placement.axisIndexOf(measure.id)] ?? measure.unit),
      read: (cell: number): number =>
        placement.toOwnValue(measure.id, measure.series.data[valueAt(cell)] as number),
    };
  });
  return [
    [...axes.map((axis) => axis.label), ...measures.map((measure) => measure.label)],
    ...Array.from({ length: gridSize(target) }, (_unused, cell) => [
      ...axes.map((axis) => field(axis.values[axis.at(cell)], format)),
      ...measures.map((measure) => field(measure.read(cell), format)),
    ]),
  ];
}

/** The CSV text for a plot result — see the module doc for its shape. */
export function plotCsv(result: PlotResult, natures: AxisNatures, format: NumberFormat): string {
  const plain: NumberFormat = { ...format, thousands: '' };
  const separator = csvSeparator(plain);
  if (result.measures === undefined) return csvText(classicRows(result, plain), separator);
  return inferPlotPanels(natures, result.measures)
    // A panel that refused to draw has no points on screen to export.
    .filter((panel) => panel.error === undefined)
    .map((panel) => csvText(panelRows(panel, plain), separator))
    .join('\r\n\r\n');
}
