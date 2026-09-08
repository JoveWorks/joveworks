/**
 * Turning an evaluated table `OutputResult` into a downloadable CSV — kept
 * pure and out of `OutputNodeView.tsx` so it is testable without rendering,
 * the pattern the rest of `model/` follows.
 *
 * Header and cells are built to match how `present/ResultView.tsx` actually
 * renders a table: a column's heading is its name plus its unit exactly as
 * `ParameterLabel` shows it (including the `—` a dimensionless column gets,
 * since `column.unit` is never absent there), the row index is the cell
 * index because every column already arrived broadcast onto the same axes,
 * and a cell is `displayNumber(cell, column.unit, figures, format)` at the
 * author's own per-column decimal-figure count (falling back to
 * `DEFAULT_COLUMN_FIGURES`, the same fallback the table heading itself
 * uses) — so a number a student exports is the number they signed off on in
 * the NodeBook, not a re-rounded one.
 *
 * Separator: this app lets a student choose a comma as the *decimal*
 * separator (`numberFormat.ts`) — Thomas's own locale is exactly this, so
 * it is a real setting, not a hypothetical. A comma-separated file full of
 * comma decimals does not open into columns. Worse, spreadsheets on a
 * comma-decimal locale (the European majority) auto-detect a `.csv`'s
 * fields using the OS's regional *list* separator, which for that locale is
 * `;`, not `,` — so matching `;` there is what makes a plain double-click
 * open cleanly, not just what avoids ambiguity. The field separator
 * therefore follows the decimal separator: `;` whenever the decimal point
 * is a comma, `,` otherwise. Either way, a field that happens to contain
 * the chosen separator regardless — a `,`-separator file whose thousands
 * grouping is also `,` (the `comma-thousands` style) is the case that
 * bites — is still quoted per RFC 4180, so the file stays valid even then.
 */

import type { Series, TableColumnResult } from '@joveworks/kernel';
import type { NumberFormat } from '@joveworks/units';

import { displayNumber, unitLabel } from './quantity';

/**
 * Digits after the decimal point for a table column that has not been given
 * a preference — kept as its own constant rather than imported from
 * `present/ResultView.tsx`, which owns the same default for the on-screen
 * table (and must be kept equal to it): a plain `model/` module has no
 * business pulling in a React component's module graph just to read one
 * number back out of it.
 */
const DEFAULT_COLUMN_FIGURES = 4;

/** The separator this file's decimal punctuation calls for — see the module doc. */
export function csvSeparator(format: NumberFormat): ',' | ';' {
  return format.decimal === ',' ? ';' : ',';
}

/** RFC 4180 quoting, applied only to a field that actually needs it. */
function csvField(text: string, separator: string): string {
  if (!text.includes(separator) && !text.includes('"') && !text.includes('\n') && !text.includes('\r')) {
    return text;
  }
  return `"${text.replace(/"/gu, '""')}"`;
}

function cellText(
  series: Series,
  row: number,
  unit: TableColumnResult['unit'],
  figures: number,
  format: NumberFormat,
): string {
  const cell = series.data[row];
  if (cell === undefined) return '';
  return typeof cell === 'number' ? displayNumber(cell, unit, figures, format) : cell;
}

/**
 * The full CSV text for a table result: one header row, then one row per
 * evaluated point. `figures` is the author's per-column decimal-figure
 * preference (`output.figures` on the table node), keyed by column name —
 * the same map `columnFigures` on `ResultViewProps` carries.
 */
export function tableCsv(
  columns: readonly TableColumnResult[],
  figures: Readonly<Record<string, number>> | undefined,
  format: NumberFormat,
): string {
  const separator = csvSeparator(format);
  const rows = columns.reduce((max, column) => Math.max(max, column.series.data.length), 0);
  const header = columns.map((column) =>
    csvField(`${column.name} (${unitLabel(column.unit)})`, separator),
  );
  const lines = [header.join(separator)];
  for (let row = 0; row < rows; row += 1) {
    const cells = columns.map((column) => {
      const columnFigures = figures?.[column.name] ?? DEFAULT_COLUMN_FIGURES;
      return csvField(cellText(column.series, row, column.unit, columnFigures, format), separator);
    });
    lines.push(cells.join(separator));
  }
  return lines.join('\r\n');
}
