/**
 * Comparing dimensions, once thirds are in play.
 *
 * `units.dimensionsEqual` compares exponents with `===`, which is right for
 * everything that package produces: a parsed unit has integer exponents, because
 * no unit symbol is written to a fractional power. The kernel is where that
 * stops being true. `cbrt` of a force is force^(1/3) — a real dimension no unit
 * names — and `$A**(1/3)` resolved against `N` gives exponents that came out of
 * a division by three.
 *
 * Those do not survive `===` reliably. `3 * (1/3)` is exactly 1 in IEEE
 * doubles, but `(1/3) + (1/3) + (1/3)` is not, and the exponent arithmetic here
 * does both: `powerDimension` multiplies, `multiplyDimensions` adds. Wire a
 * cube root into three multiplied ports and the strict comparison rejects a
 * connection that is dimensionally identical.
 *
 * **So the kernel compares with a tolerance and `units` does not.** The
 * tolerance is absolute rather than relative because exponents are small
 * integers or simple fractions — nothing legitimate lands within 1e-9 of a
 * different exponent, and a genuine mismatch is off by at least a third.
 *
 * The other rule here belongs to connections alone: angle and dimensionless
 * connect **in both directions**, and implemented here and nowhere else. The
 * base library declares `sine`'s input `rad`, but R&M tags belt's wrap
 * angles `[]`, so a dimensionless source has to drive an angle target. The
 * reverse matters too: the belt formulas that produce that wrap angle feed it
 * straight into `exp(mu * beta)` (the capstan equation, a `pure` function)
 * and into an arc fraction `z_k * beta_k / (2*pi)` that yields a count — both
 * need the angle back as a plain number, because a radian *is* a ratio (m/m),
 * which is exactly why SI calls it dimensionless. Nothing is swallowed going
 * either way: a value's magnitude is fixed at its own canonical unit before
 * it ever reaches this check (`toCanonical`, `evaluate.ts`), and `rad`'s
 * canonical scale is 1 — the same as a pure number's — so the two share a
 * magnitude, not just a name.
 */

import {
  ANGLE,
  BASE_DIMENSIONS,
  describeDimension,
  dimensionsEqual,
  isDimensionless,
  type Dimension,
} from '@joveworks/units';

import { KernelError } from './errors.js';

/**
 * Absolute tolerance on a single exponent. A third is 0.333…; the error from
 * multiplying and adding a handful of those is at the 1e-16 scale, so 1e-9
 * leaves nine orders of headroom and still separates 1/3 from 1/2.
 */
export const EXPONENT_TOLERANCE = 1e-9;

export function dimensionsClose(a: Dimension, b: Dimension): boolean {
  return BASE_DIMENSIONS.every((base) => Math.abs(a[base] - b[base]) <= EXPONENT_TOLERANCE);
}

export function assertSameDimension(
  a: Dimension,
  b: Dimension,
  what: string,
  where?: string,
): void {
  if (dimensionsClose(a, b)) return;
  throw new KernelError(
    `${what}: ${describeDimension(a)} and ${describeDimension(b)} are different dimensions`,
    where,
  );
}

/**
 * May a value of `source` dimension drive a port of `target` dimension?
 *
 * Equal dimensions connect. Angle and dimensionless connect too, in either
 * direction — see the module comment for why that bridge is sound rather
 * than merely convenient. Nothing else does: this stays a narrow, named
 * exception, not a loosening of the equality check above it.
 *
 * The equality check uses `dimensionsClose`, because this is the kernel,
 * where exponent arithmetic (`cbrt`, `$A**(1/3)`, …) can miss `===` by
 * floating-point dust. The angle/dimensionless check uses `dimensionsEqual`
 * instead: `ANGLE` and `DIMENSIONLESS` are exact constants, never the
 * product of exponent arithmetic, so there is nothing here for a tolerance
 * to forgive.
 */
export function connectable(source: Dimension, target: Dimension): boolean {
  if (dimensionsClose(source, target)) return true;
  return (
    (isDimensionless(source) && dimensionsEqual(target, ANGLE)) ||
    (dimensionsEqual(source, ANGLE) && isDimensionless(target))
  );
}

export function assertConnectable(source: Dimension, target: Dimension, where: string): void {
  if (connectable(source, target)) return;
  throw new KernelError(
    `cannot connect ${describeDimension(source)} to a port of ${describeDimension(target)}`,
    where,
  );
}
