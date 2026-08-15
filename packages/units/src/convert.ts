/**
 * The boundary: displayed numbers in, canonical numbers out, and back again.
 * Nothing inside the kernel ever sees a display unit.
 */

import { describeDimension, dimensionsEqual, isDimensionless } from './dimension.js';
import { parseUnit } from './parse.js';
import { UnitError, prefixableAtomOf, siPrefixedUnit, type Unit } from './unit.js';

/** Displayed value → canonical value (mm, N, s, rad, K). */
export function toCanonical(value: number, from: Unit): number {
  return value * from.factor;
}

/** Canonical value → displayed value in `to`. */
export function fromCanonical(value: number, to: Unit): number {
  return value / to.factor;
}

/** Convert between two units of the same dimension. */
export function convert(value: number, from: Unit, to: Unit): number {
  if (!dimensionsEqual(from.dimension, to.dimension)) {
    throw new UnitError(
      `cannot convert ${from.symbol || '—'} (${describeDimension(from.dimension)}) ` +
        `to ${to.symbol || '—'} (${describeDimension(to.dimension)})`,
    );
  }
  return fromCanonical(toCanonical(value, from), to);
}

/**
 * How a number is written — a display concern only, chosen by whoever is
 * reading it (a global preference in the editor), never by the kernel or by
 * a formula. `'auto'` is today's only behaviour before this setting existed:
 * fixed notation, switching to exponential once a value is too large or too
 * small to read comfortably. It stays the default so nobody's display
 * changes until they open a settings dialog and choose otherwise.
 */
/**
 * `'si'` is engineering's SI-prefixed sibling: `250 MPa` rather than
 * `250e+6 Pa`, mantissa printed fixed-style rather than stepped. Only
 * available where `formatQuantity` has a `Unit` to substitute the prefix
 * into and `prefixableAtomOf` recognizes it — a compound unit (`N/mm²`) or a
 * bare numeral falls back to plain fixed notation instead.
 */
export type NumberNotation = 'auto' | 'fixed' | 'scientific' | 'engineering' | 'si';

export interface NumberFormat {
  readonly notation: NumberNotation;
  /** Grouping character for the integer part, or `''` for none. */
  readonly thousands: '' | ',' | '.' | ' ';
  readonly decimal: '.' | ',';
}

/** Today's only behaviour, unchanged: plain punctuation, auto notation. */
export const PLAIN_NUMBER_FORMAT: NumberFormat = { notation: 'auto', thousands: '', decimal: '.' };

function insertThousands(intDigits: string, separator: NumberFormat['thousands']): string {
  if (separator === '') return intDigits;
  const negative = intDigits.startsWith('-');
  const digits = negative ? intDigits.slice(1) : intDigits;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return negative ? `-${grouped}` : grouped;
}

/** Swap in the chosen grouping and decimal punctuation, after rounding. */
function punctuate(numeral: string, format: NumberFormat): string {
  const [mantissa, exponent] = numeral.split('e');
  const [intPart = '', fracPart] = (mantissa ?? '').split('.');
  const grouped = insertThousands(intPart, format.thousands);
  const body = fracPart === undefined ? grouped : `${grouped}${format.decimal}${fracPart}`;
  return exponent === undefined ? body : `${body}e${exponent}`;
}

/** Fixed notation at `figures` significant figures, however large or small. */
function toFixedSignificant(value: number, figures: number): string {
  const rounded = Number(value.toPrecision(figures));
  if (rounded === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(rounded)));
  const decimals = Math.max(0, figures - 1 - exponent);
  return rounded.toFixed(decimals);
}

/**
 * Engineering notation: the exponent is always a multiple of 3 (kΩ, not
 * 1.2e4 Ω) — except a value already in [1, 1000), which is exponent 0 and
 * printed with no `e+0` at all. That case is not scaled by anything, so
 * showing an exponent would only say "this number is itself".
 */
function toEngineering(value: number, figures: number): string {
  if (value === 0) return '0';
  const rawExponent = Math.floor(Math.log10(Math.abs(value)));
  let exponent = Math.floor(rawExponent / 3) * 3;
  let mantissa = Number((value / 10 ** exponent).toPrecision(figures));
  if (Math.abs(mantissa) >= 1000) {
    mantissa /= 1000;
    exponent += 3;
  }
  const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(mantissa))) + 1);
  const decimals = Math.max(0, figures - intDigits);
  const printed = mantissa.toFixed(decimals);
  if (exponent === 0) return printed;
  const sign = exponent < 0 ? '-' : '+';
  return `${printed}e${sign}${Math.abs(exponent)}`;
}

/**
 * A value exactly as JS would print it, only with the chosen grouping and
 * decimal punctuation applied — no rounding. This is the "read it back
 * exactly as typed" side of the boundary (S5): an authored magnitude like
 * `250` must come back as `250`, not padded to some figure count.
 */
export function formatPlainNumber(value: number, format: NumberFormat = PLAIN_NUMBER_FORMAT): string {
  if (!Number.isFinite(value)) return String(value);
  return punctuate(String(value), format);
}

/** Round to significant figures without switching to exponential notation early. */
export function toSignificantFigures(
  value: number,
  figures = 4,
  format: NumberFormat = PLAIN_NUMBER_FORMAT,
): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';

  if (format.notation === 'scientific') {
    return punctuate(Number(value.toPrecision(figures)).toExponential(figures - 1), format);
  }
  if (format.notation === 'engineering') {
    return punctuate(toEngineering(value, figures), format);
  }
  // 'si' falls back to plain fixed notation wherever there is no unit to
  // substitute a prefix into — `formatQuantity` is the one place that
  // actually resolves a prefix; everywhere else 'si' just means 'fixed'.
  if (format.notation === 'fixed' || format.notation === 'si') {
    return punctuate(toFixedSignificant(value, figures), format);
  }

  // 'auto': today's behaviour, unchanged.
  const rounded = Number(value.toPrecision(figures));
  const magnitude = Math.abs(rounded);
  const numeral =
    magnitude >= 1e6 || magnitude < 1e-4 ? rounded.toExponential(figures - 1) : String(rounded);
  return punctuate(numeral, format);
}

/**
 * Render a canonical value in a display unit — `435.7 N`, `6.464 s-1`.
 *
 * The unit is printed exactly as it was written by whoever declared it, so a
 * port tagged `N/mm²` displays `N/mm²` and not a re-derived spelling.
 */
export function formatQuantity(
  canonicalValue: number,
  displayUnit: Unit,
  figures = 4,
  format: NumberFormat = PLAIN_NUMBER_FORMAT,
): string {
  if (format.notation === 'si') {
    const atom = prefixableAtomOf(displayUnit.symbol.trim());
    if (atom !== undefined) {
      const prefixed = siPrefixedUnit(atom, canonicalValue);
      const text = toSignificantFigures(fromCanonical(canonicalValue, prefixed), figures, {
        ...format,
        notation: 'fixed',
      });
      return `${text} ${prefixed.symbol}`;
    }
  }

  const text = toSignificantFigures(fromCanonical(canonicalValue, displayUnit), figures, format);
  const symbol = displayUnit.symbol.trim();
  return symbol.length === 0 ? text : `${text} ${symbol}`;
}

export interface ParsedQuantity {
  /** The value in canonical units. */
  readonly value: number;
  /** The unit as typed, kept for display. */
  readonly unit: Unit;
}

const QUANTITY = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*?)\s*$/s;

/**
 * Undo a chosen format's grouping and decimal punctuation, so what is typed
 * back reads the same as `PLAIN_NUMBER_FORMAT` would have written it. Safe to
 * run over the whole string, unit and all: a grouping character never
 * appears inside a unit symbol, and stripping it does not merge the numeral
 * into the unit — the numeral regex still separates digits from letters.
 */
export function stripNumberFormatting(text: string, format: NumberFormat): string {
  let result = text;
  if (format.thousands !== '') result = result.split(format.thousands).join('');
  if (format.decimal !== '.') result = result.split(format.decimal).join('.');
  return result;
}

/**
 * Read what a student types into a value field — `250 kW`, `1450 rpm`, `1.5`.
 *
 * A bare number is accepted only where the port is dimensionless; anywhere else
 * an undeclared unit is a hard error (S5), never a guess at the port's unit.
 * `expected` is the port's dimension, when there is one to check against.
 */
export function parseQuantity(
  text: string,
  expected?: Unit,
  format: NumberFormat = PLAIN_NUMBER_FORMAT,
): ParsedQuantity {
  const match = QUANTITY.exec(stripNumberFormatting(text, format));
  if (match === null) {
    throw new UnitError(`cannot read a value from ${JSON.stringify(text)}`);
  }
  const [, numeral = '', symbol = ''] = match;
  const magnitude = Number(numeral);

  if (symbol.length === 0) {
    if (expected !== undefined && !isDimensionless(expected.dimension)) {
      throw new UnitError(
        `${numeral} has no unit — expected ${describeDimension(expected.dimension)}, ` +
          `for example '${numeral} ${expected.symbol}'`,
      );
    }
    const unit = expected ?? parseUnit('');
    return { value: toCanonical(magnitude, unit), unit };
  }

  const unit = parseUnit(symbol);
  if (expected !== undefined && !dimensionsEqual(unit.dimension, expected.dimension)) {
    throw new UnitError(
      `${text.trim()} is ${describeDimension(unit.dimension)}, ` +
        `but ${describeDimension(expected.dimension)} was expected`,
    );
  }
  return { value: toCanonical(magnitude, unit), unit };
}
