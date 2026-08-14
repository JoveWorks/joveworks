/**
 * The boundary: displayed numbers in, canonical numbers out, and back again.
 * Nothing inside the kernel ever sees a display unit.
 */

import { describeDimension, dimensionsEqual, isDimensionless } from './dimension.js';
import { parseUnit } from './parse.js';
import { UnitError, type Unit } from './unit.js';

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

/** Round to significant figures without switching to exponential notation early. */
export function toSignificantFigures(value: number, figures = 4): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const rounded = Number(value.toPrecision(figures));
  const magnitude = Math.abs(rounded);
  if (magnitude >= 1e6 || magnitude < 1e-4) return rounded.toExponential(figures - 1);
  return String(rounded);
}

/**
 * Render a canonical value in a display unit — `435.7 N`, `6.464 s-1`.
 *
 * The unit is printed exactly as it was written by whoever declared it, so a
 * port tagged `N/mm²` displays `N/mm²` and not a re-derived spelling.
 */
export function formatQuantity(canonicalValue: number, displayUnit: Unit, figures = 4): string {
  const text = toSignificantFigures(fromCanonical(canonicalValue, displayUnit), figures);
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
 * Read what a student types into a value field — `250 kW`, `1450 rpm`, `1.5`.
 *
 * A bare number is accepted only where the port is dimensionless; anywhere else
 * an undeclared unit is a hard error (S5), never a guess at the port's unit.
 * `expected` is the port's dimension, when there is one to check against.
 */
export function parseQuantity(text: string, expected?: Unit): ParsedQuantity {
  const match = QUANTITY.exec(text);
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
