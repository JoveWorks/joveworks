/**
 * What a student types into a field on a node, and what a node shows back.
 *
 * The editor is one of the two ends of the authored-to-canonical boundary —
 * the kernel is the other — so this file is small and deliberate. Two rules it must not break:
 *
 * - **A document stores the authored magnitude**, not the canonical one
 *   (`schema/quantity.ts`). `units.parseQuantity` returns the canonical value,
 *   which is right for reading a threshold into the kernel and wrong for storing
 *   what someone typed: `value * factor / factor` is not the identity in binary
 *   floating point, so `250 kW` would not survive a save and reload unchanged.
 *   Hence the split below — the same shape of read, keeping the magnitude.
 * - **An undeclared unit is a hard error**, never a guess at the port's
 *   unit. A bare number is a dimensionless value and nothing else.
 */

import {
  PLAIN_NUMBER_FORMAT,
  UnitError,
  formatPlainNumber,
  formatQuantity,
  fromCanonical,
  parseUnit,
  stripNumberFormatting,
  toSignificantFigures,
  type NumberFormat,
  type Unit,
} from '@mds/units';
import type { Quantity } from '@mds/schema';

/** `250 kW`, `1.5`, `-3.2e4 N/mm²` — a magnitude followed by a unit symbol. */
const AUTHORED = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*?)\s*$/su;

/**
 * Read a value field as the document stores it: the number as written, and the
 * unit it was written in. Throws `UnitError`, which the field renders in place.
 *
 * `format` undoes whatever grouping/decimal punctuation the settings dialog
 * chose ("read what was typed" boundary, extended to cover punctuation
 * as well as units) before the numeral pattern runs.
 */
export function parseAuthored(text: string, format: NumberFormat = PLAIN_NUMBER_FORMAT): Quantity {
  const match = AUTHORED.exec(stripNumberFormatting(text, format));
  if (match === null) throw new UnitError(`cannot read a value from ${JSON.stringify(text)}`);
  const [, numeral = '', symbol = ''] = match;
  return { value: Number(numeral), unit: parseUnit(symbol) };
}

/** The same text back — what a value field is populated with. */
export function formatAuthored(
  quantity: Quantity,
  format: NumberFormat = PLAIN_NUMBER_FORMAT,
): string {
  const symbol = quantity.unit.symbol.trim();
  const text = formatPlainNumber(quantity.value, format);
  return symbol.length === 0 ? text : `${text} ${symbol}`;
}

/** A canonical number in a display unit, for a node body or a notebook line. */
export function display(
  canonical: number,
  unit: Unit,
  figures = 4,
  format: NumberFormat = PLAIN_NUMBER_FORMAT,
): string {
  return formatQuantity(canonical, unit, figures, format);
}

/**
 * The number alone, no unit — for a table cell whose column header already
 * carries it (unit-once-per-column, not repeated down every row).
 */
export function displayNumber(
  canonical: number,
  unit: Unit,
  figures = 4,
  format: NumberFormat = PLAIN_NUMBER_FORMAT,
): string {
  return toSignificantFigures(fromCanonical(canonical, unit), figures, format);
}

/** A unit's symbol as its author spelled it — port labels are text, not colour. */
export function unitLabel(unit: Unit | undefined): string {
  const symbol = unit?.symbol.trim() ?? '';
  return symbol.length === 0 ? '—' : symbol;
}

/** Canonical data in a display unit — what a plot and a sparkline draw. */
export function displayed(data: readonly number[], unit: Unit): number[] {
  return data.map((value) => fromCanonical(value, unit));
}

/** The message of anything thrown by a field, without leaking a stack trace. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
