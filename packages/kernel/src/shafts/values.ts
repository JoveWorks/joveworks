/**
 * What the shafts domain's structured ports carry (ROADMAP item 19): a load
 * or support on the `load` kind, a whole shaft on the `shaft` kind. Both are
 * registered as structured kinds in `./index.ts`, so the core carries them
 * whole and never broadcasts one into an expression.
 */

import type { NumericSeries } from '../series.js';

/**
 * What a Load or Distributed load node produces: one load on a shaft, every
 * field its own series so a swept field (a load moving along the shaft, a
 * force over a range of magnitudes) broadcasts like any other value. Fields
 * left off the node are a zero series. Canonical units: mm, N, N·mm, N/mm.
 *
 * Like a bundle, it never reaches an expression — only a shaft diagram's
 * load port takes one (`resolveGraph` refuses it anywhere else).
 */
export interface PointLoadValue {
  readonly kind: 'load';
  readonly shape: 'point';
  readonly at: NumericSeries;
  readonly Fx: NumericSeries;
  readonly Fy: NumericSeries;
  readonly torque: NumericSeries;
  readonly Cx: NumericSeries;
  readonly Cy: NumericSeries;
}

export interface SpanLoadValue {
  readonly kind: 'load';
  readonly shape: 'span';
  readonly from: NumericSeries;
  readonly to: NumericSeries;
  readonly qx: NumericSeries;
  readonly qy: NumericSeries;
}

/** A Support node's value: where the shaft is held, and how (`SupportNode` in the schema). */
export interface SupportValue {
  readonly kind: 'load';
  readonly shape: 'support';
  readonly at: NumericSeries;
  readonly support: 'simple' | 'fixed' | 'locating' | 'floating';
}

/** Everything that acts on a shaft, on one wire kind: loads and supports alike. */
export type LoadValue = PointLoadValue | SpanLoadValue | SupportValue;

/** A load's fields as series, in its node's field order. */
export function loadSeries(value: LoadValue): readonly NumericSeries[] {
  return value.shape === 'point'
    ? [value.at, value.Fx, value.Fy, value.torque, value.Cx, value.Cy]
    : value.shape === 'span'
      ? [value.from, value.to, value.qx, value.qy]
      : [value.at];
}

/**
 * What a Shaft node produces: its extent, Young's modulus, and the second
 * moment of area of each section, every number a series so a swept diameter
 * or modulus broadcasts like any other value. Sections are in order along
 * the shaft; each runs from its `start` to the next one's, the first reaching
 * back past the shaft's start and the last on past its end.
 */
export interface ShaftValue {
  readonly kind: 'shaft';
  readonly from: NumericSeries;
  readonly to: NumericSeries;
  readonly E: NumericSeries;
  readonly sections: readonly { readonly start: number; readonly I: NumericSeries }[];
  /** The positions along the shaft its node introduces — what a diagram is drawn at unless told otherwise. */
  readonly z: NumericSeries;
}

/** A shaft's numbers as series, for broadcasting and zip checks. */
export function shaftSeries(value: ShaftValue): readonly NumericSeries[] {
  return [value.from, value.to, value.E, ...value.sections.map((section) => section.I)];
}
