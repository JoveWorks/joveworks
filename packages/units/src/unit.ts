/**
 * Units: a dimension plus the factor that takes a displayed number into the
 * canonical base of S5.
 *
 *     canonical = displayed * factor
 *
 * Factors only, no offsets — which is why S5 fixes Kelvin rather than Celsius.
 */

import {
  ANGLE,
  BASE_DIMENSIONS,
  DIMENSIONLESS,
  FORCE,
  LENGTH,
  MASS,
  STRESS,
  TEMPERATURE,
  TIME,
  TORQUE,
  POWER,
  FREQUENCY,
  type Dimension,
  dimensionsEqual,
  describeDimension,
} from './dimension.js';

export interface Unit {
  /** As written by the author — `N/mm²`, `kg/dm³`, `rpm`. */
  readonly symbol: string;
  readonly dimension: Dimension;
  /** Multiply a displayed value by this to get the canonical value. */
  readonly factor: number;
}

export function unit(symbol: string, dim: Dimension, factor = 1): Unit {
  return { symbol, dimension: dim, factor };
}

/** The dimensionless unit written `[]` in the source tags. Declared, not absent. */
export const DIMENSIONLESS_UNIT: Unit = unit('', DIMENSIONLESS, 1);

/**
 * Atomic unit symbols. Anything not here is a hard error (S5) — there is no
 * fallback and no guess.
 *
 * `prefixable` marks the symbols an SI prefix may be attached to. `min`, `h`,
 * `rpm`, `°` and `%` are excluded so that `min` never reads as milli-inch and
 * `%` never as pico-something.
 */
interface AtomicUnit {
  readonly dimension: Dimension;
  readonly factor: number;
  readonly prefixable: boolean;
}

const atom = (dim: Dimension, factor: number, prefixable = false): AtomicUnit => ({
  dimension: dim,
  factor,
  prefixable,
});

const ATOMS: Readonly<Record<string, AtomicUnit>> = {
  // length
  m: atom(LENGTH, 1000, true),
  // force
  N: atom(FORCE, 1, true),
  // time
  s: atom(TIME, 1, true),
  min: atom(TIME, 60),
  h: atom(TIME, 3600),
  // angle. Degrees are a display unit; radians are canonical (S5).
  rad: atom(ANGLE, 1, true),
  deg: atom(ANGLE, Math.PI / 180),
  '°': atom(ANGLE, Math.PI / 180),
  // temperature
  K: atom(TEMPERATURE, 1),
  // mass — derived from force in an mm-N-s base, so the tonne is canonical and
  // a gram is 1e-6 of it. `kg` therefore parses to 1e-3, not to 1.
  g: atom(MASS, 1e-6, true),
  t: atom(MASS, 1),
  // pressure/stress. 1 Pa = 1 N/m² = 1e-6 N/mm², so MPa lands exactly on 1.
  Pa: atom(STRESS, 1e-6, true),
  // energy and power. 1 J = 1 N·m = 1000 N·mm.
  J: atom(TORQUE, 1000, true),
  W: atom(POWER, 1000, true),
  // frequency
  Hz: atom(FREQUENCY, 1, true),
  rpm: atom(FREQUENCY, 1 / 60),
  // dimensionless quantities that carry a display scale (S21).
  '%': atom(DIMENSIONLESS, 0.01, false),
  rev: atom(DIMENSIONLESS, 1, false),

  // Compounds written without a separator. The corpus writes torque as `Nm`,
  // and a greedy symbol splitter would be a source of silent misreadings for
  // the sake of two entries, so they are listed explicitly instead.
  Nm: atom(TORQUE, 1000, false),
  Nmm: atom(TORQUE, 1, false),
};

const PREFIXES: Readonly<Record<string, number>> = {
  n: 1e-9,
  µ: 1e-6,
  μ: 1e-6, // U+03BC, the one that survives most encoding round-trips
  u: 1e-6,
  m: 1e-3,
  c: 1e-2,
  d: 1e-1,
  da: 1e1,
  h: 1e2,
  k: 1e3,
  M: 1e6,
  G: 1e9,
};

export class UnitError extends Error {
  override readonly name = 'UnitError';
}

/**
 * Resolve a single symbol, with or without an SI prefix.
 *
 * Exact matches win over prefix decomposition, so `min` is a minute and not
 * milli-inch, and `m` is a metre and not a stray prefix.
 */
export function lookupAtomicUnit(
  symbol: string,
): { dimension: Dimension; factor: number } | undefined {
  const exact = ATOMS[symbol];
  if (exact !== undefined) return { dimension: exact.dimension, factor: exact.factor };

  for (const [prefix, scale] of Object.entries(PREFIXES)) {
    if (!symbol.startsWith(prefix) || symbol.length === prefix.length) continue;
    const rest = ATOMS[symbol.slice(prefix.length)];
    if (rest === undefined || !rest.prefixable) continue;
    return { dimension: rest.dimension, factor: rest.factor * scale };
  }
  return undefined;
}

/** A dimension that is already one bare base symbol — `mm`, not `mm²` or `N/mm`. */
function isSimpleBaseDimension(dim: Dimension): boolean {
  const nonzero = BASE_DIMENSIONS.filter((base) => dim[base] !== 0);
  return nonzero.length === 1 && dim[nonzero[0] as (typeof BASE_DIMENSIONS)[number]] === 1;
}

/**
 * The one named atomic unit for a dimension, if exactly one exists and the
 * dimension is not already a bare base symbol — `W` for power, not
 * `N·mm/s`, but plain length stays `mm` rather than becoming `m`.
 *
 * Ambiguous dimensions come back empty rather than guessing: torque and
 * energy both resolve to `TORQUE` here, so a generic port whose value is
 * physically a torque would be mislabelled `J` exactly as often as an energy
 * value would be mislabelled `Nm`. Frequency has the same problem (`Hz` vs
 * `rpm`). The dimension alone cannot settle which name is meant — only the
 * formula the value came from could, and formulas already declare their own
 * display unit rather than asking this function.
 */
export function namedUnit(dim: Dimension): Unit | undefined {
  if (isSimpleBaseDimension(dim)) return undefined;
  const matches = Object.entries(ATOMS).filter(([, atom]) => dimensionsEqual(atom.dimension, dim));
  if (matches.length !== 1) return undefined;
  const [symbol, atom] = matches[0] as [string, AtomicUnit];
  return { symbol, dimension: atom.dimension, factor: atom.factor };
}

/** Every symbol the parser accepts without a prefix. Used by tests and errors. */
export function knownUnitSymbols(): readonly string[] {
  return Object.keys(ATOMS);
}

/**
 * Reject a connection whose dimensions differ (S6). `source` and `target` are
 * named so the message reads in wiring order.
 */
export function assertDimensionsCompatible(
  source: Dimension,
  target: Dimension,
  context?: { readonly from?: string; readonly to?: string },
): void {
  if (dimensionsEqual(source, target)) return;
  const from = context?.from ?? 'output';
  const to = context?.to ?? 'input';
  throw new UnitError(
    `cannot connect ${from} of ${describeDimension(source)} ` +
      `to ${to} of ${describeDimension(target)}`,
  );
}
