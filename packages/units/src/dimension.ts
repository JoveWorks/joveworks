/**
 * Dimension algebra over the canonical base of S5: mm, N, s, rad, K.
 *
 * The base is a *force* base, not a mass base, so mass is derived: from F = m·a,
 * mass = force·time²/length = N·s²/mm = tonne. That is the trap S5 names — a
 * density given in kg/dm³ is 1e-9 t/mm³, and getting it wrong is silent.
 *
 * Angle is tracked as its own exponent rather than folded into dimensionless.
 * SI calls the radian dimensionless, so this is a deliberate strengthening: it
 * stops a length being wired into an angle port. The cost lands on the function
 * whitelist of S35 — `sin` has to accept a dimensionless argument as well as an
 * angle, because R&M tags belt's wrap angles `[]`. That rule belongs to the
 * expression checker, not here; this package only supplies the algebra.
 */

/** Force first, so formatted dimensions read the way R&M writes them: N·mm/s. */
export const BASE_DIMENSIONS = ['force', 'length', 'time', 'angle', 'temperature'] as const;

export type BaseDimension = (typeof BASE_DIMENSIONS)[number];

export type Dimension = Readonly<Record<BaseDimension, number>>;

/** The canonical unit symbol of each base dimension. */
export const BASE_UNIT_SYMBOL: Readonly<Record<BaseDimension, string>> = {
  length: 'mm',
  force: 'N',
  time: 's',
  angle: 'rad',
  temperature: 'K',
};

const ZERO: Dimension = { length: 0, force: 0, time: 0, angle: 0, temperature: 0 };

export function dimension(exponents: Partial<Record<BaseDimension, number>> = {}): Dimension {
  return {
    length: exponents.length ?? 0,
    force: exponents.force ?? 0,
    time: exponents.time ?? 0,
    angle: exponents.angle ?? 0,
    temperature: exponents.temperature ?? 0,
  };
}

export const DIMENSIONLESS: Dimension = ZERO;

export const LENGTH = dimension({ length: 1 });
export const FORCE = dimension({ force: 1 });
export const TIME = dimension({ time: 1 });
export const ANGLE = dimension({ angle: 1 });
export const TEMPERATURE = dimension({ temperature: 1 });

/** Derived dimensions that come up often enough to name. */
export const AREA = dimension({ length: 2 });
export const VOLUME = dimension({ length: 3 });
export const FREQUENCY = dimension({ time: -1 });
export const VELOCITY = dimension({ length: 1, time: -1 });
export const ACCELERATION = dimension({ length: 1, time: -2 });
/** Mass = force·time²/length — the tonne in an mm-N-s system. */
export const MASS = dimension({ force: 1, time: 2, length: -1 });
/** Density = mass/volume = N·s²/mm⁴ — t/mm³. */
export const DENSITY = dimension({ force: 1, time: 2, length: -4 });
export const STRESS = dimension({ force: 1, length: -2 });
export const TORQUE = dimension({ force: 1, length: 1 });
export const POWER = dimension({ force: 1, length: 1, time: -1 });

export function multiplyDimensions(a: Dimension, b: Dimension): Dimension {
  return {
    length: a.length + b.length,
    force: a.force + b.force,
    time: a.time + b.time,
    angle: a.angle + b.angle,
    temperature: a.temperature + b.temperature,
  };
}

export function divideDimensions(a: Dimension, b: Dimension): Dimension {
  return {
    length: a.length - b.length,
    force: a.force - b.force,
    time: a.time - b.time,
    angle: a.angle - b.angle,
    temperature: a.temperature - b.temperature,
  };
}

export function powerDimension(a: Dimension, exponent: number): Dimension {
  return {
    length: a.length * exponent,
    force: a.force * exponent,
    time: a.time * exponent,
    angle: a.angle * exponent,
    temperature: a.temperature * exponent,
  };
}

export function invertDimension(a: Dimension): Dimension {
  return powerDimension(a, -1);
}

export function dimensionsEqual(a: Dimension, b: Dimension): boolean {
  return BASE_DIMENSIONS.every((d) => a[d] === b[d]);
}

export function isDimensionless(a: Dimension): boolean {
  return dimensionsEqual(a, DIMENSIONLESS);
}

const NAMED: ReadonlyArray<readonly [Dimension, string]> = [
  [DIMENSIONLESS, 'dimensionless'],
  [LENGTH, 'length'],
  [AREA, 'area'],
  [VOLUME, 'volume'],
  [FORCE, 'force'],
  [TIME, 'time'],
  [FREQUENCY, 'frequency'],
  [VELOCITY, 'velocity'],
  [ACCELERATION, 'acceleration'],
  [MASS, 'mass'],
  [DENSITY, 'density'],
  [STRESS, 'stress'],
  [TORQUE, 'torque'],
  [POWER, 'power'],
  [ANGLE, 'angle'],
  [TEMPERATURE, 'temperature'],
];

/** A familiar name for a dimension, or `undefined` if it has none. */
export function dimensionName(a: Dimension): string | undefined {
  return NAMED.find(([d]) => dimensionsEqual(d, a))?.[1];
}

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '-': '⁻',
  '.': '·',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

function superscript(exponent: number): string {
  if (exponent === 1) return '';
  return [...String(exponent)].map((c) => SUPERSCRIPT[c] ?? c).join('');
}

/**
 * The dimension written in canonical base units — `N·mm/s` for power, `N/mm²`
 * for stress. This is what an error message should show, because it is the unit
 * the value is actually stored in.
 */
export function formatDimension(a: Dimension): string {
  const numerator: string[] = [];
  const denominator: string[] = [];
  for (const base of BASE_DIMENSIONS) {
    const exponent = a[base];
    if (exponent === 0) continue;
    const symbol = BASE_UNIT_SYMBOL[base];
    if (exponent > 0) numerator.push(symbol + superscript(exponent));
    else denominator.push(symbol + superscript(-exponent));
  }
  if (numerator.length === 0 && denominator.length === 0) return '—';
  const top = numerator.length > 0 ? numerator.join('·') : '1';
  return denominator.length > 0 ? `${top}/${denominator.join('·')}` : top;
}

/** `force (N)`, `density (N·s²/mm⁴)` — for error messages. */
export function describeDimension(a: Dimension): string {
  const name = dimensionName(a);
  const canonical = formatDimension(a);
  return name === undefined ? canonical : `${name} (${canonical})`;
}
