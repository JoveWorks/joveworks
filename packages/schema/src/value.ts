/**
 * What an input node holds: one value, or a range that turns the whole
 * downstream graph into a study.
 *
 * The range kinds are a closed set, and the closure is the point. `linspace` and
 * `logspace` are meaningless over `{H7, K7}` — there is no spacing between fit
 * classes — so a categorical sweep is an explicit list and nothing else.
 * A spectrum is an explicit list too, but for the opposite reason: it is
 * *consumed* whole by an aggregation, so it introduces no axis and cannot be
 * swept.
 *
 * Point count is the primary control rather than step size: `linspace(20,
 * 60, 21)` says exactly what it means, a two-input study is exactly `n × m`, and
 * nobody has to reason about whether the endpoint survived the last addition.
 */

import {
  fail,
  join,
  readEnum,
  readInteger,
  readName,
  readNumber,
  readNumberArray,
  readObject,
  readStringArray,
  required,
  type JsonObject,
  type JsonValue,
} from './json.js';
import { parseUnitField } from './quantity.js';
import type { Unit } from '@mds/units';

export const VALUE_KINDS = [
  'scalar',
  'slider',
  'categorical',
  'spectrum',
  'linear',
  'logarithmic',
  'list',
  'renard',
  'tableColumn',
  'categoricalList',
] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];

export const RENARD_SERIES = ['R5', 'R10', 'R20', 'R40'] as const;
export type RenardSeries = (typeof RENARD_SERIES)[number];

/** A single number, in the unit it was typed with. */
export interface ScalarValue {
  readonly kind: 'scalar';
  readonly value: number;
  readonly unit: Unit;
}

/**
 * A single number with its own travel bounds, for dragging rather than
 * typing. `min`/`max` are the slider's own — not a port's declared
 * `validRange` — the same way a range kind carries its own `start`/`stop`
 * rather than reading a bound from anywhere downstream. `value` may fall
 * outside `[min, max]` (e.g. typed in directly): that stays a valid
 * document, rendered with the thumb pinned at whichever end it overshoots,
 * rather than silently clamped.
 */
export interface SliderValue {
  readonly kind: 'slider';
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit: Unit;
}

/** A single member of a categorical port's domain. */
export interface CategoricalValue {
  readonly kind: 'categorical';
  readonly value: string;
}

/** A load spectrum: an explicit list consumed by an aggregation. */
export interface SpectrumValue {
  readonly kind: 'spectrum';
  readonly values: readonly number[];
  readonly unit: Unit;
}

export interface LinearRange {
  readonly kind: 'linear';
  readonly start: number;
  readonly stop: number;
  /** Both endpoints included, so `points` is the length of the axis. */
  readonly points: number;
  readonly unit: Unit;
}

/**
 * Log spacing is a teaching requirement, not a convenience: Wöhler curves
 * are log–log by construction and bearing life is a power law, so a linear
 * sample across decades leaves the knee unresolved and the straight line a
 * student is meant to recognise looks bent.
 */
export interface LogarithmicRange {
  readonly kind: 'logarithmic';
  readonly start: number;
  readonly stop: number;
  readonly points: number;
  readonly unit: Unit;
}

/** Standard sizes — the range kind that answers "which part do I buy". */
export interface ListRange {
  readonly kind: 'list';
  readonly values: readonly number[];
  readonly unit: Unit;
}

/**
 * Preferred numbers (ISO 3) — the range kind for standard sizes the catalogue
 * itself doesn't enumerate: bolt diameters, bearing bores, stock shaft sizes.
 * `list` answers the same "which part do I buy" question by hand-typed
 * values; this answers it by formula, so the document keeps saying "R20 from
 * 10 to 100" rather than freezing the expansion at authoring time the way a
 * `list` would.
 */
export interface RenardRange {
  readonly kind: 'renard';
  readonly series: RenardSeries;
  readonly start: number;
  readonly stop: number;
  readonly unit: Unit;
}

/**
 * The rounded R5/R10/R20/R40 base values (ISO 3), one decade from 1 to just
 * under 10. Every other decade is this array scaled by a power of ten — the
 * series repeats geometrically by construction.
 */
const RENARD_BASE: Readonly<Record<RenardSeries, readonly number[]>> = {
  R5: [1.0, 1.6, 2.5, 4.0, 6.3],
  R10: [1.0, 1.25, 1.6, 2.0, 2.5, 3.15, 4.0, 5.0, 6.3, 8.0],
  R20: [
    1.0, 1.12, 1.25, 1.4, 1.6, 1.8, 2.0, 2.24, 2.5, 2.8, 3.15, 3.55, 4.0, 4.5, 5.0, 5.6, 6.3, 7.1,
    8.0, 9.0,
  ],
  R40: [
    1.0, 1.06, 1.12, 1.18, 1.25, 1.32, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.12, 2.24, 2.36, 2.5,
    2.65, 2.8, 3.0, 3.15, 3.35, 3.55, 3.75, 4.0, 4.25, 4.5, 4.75, 5.0, 5.3, 5.6, 6.0, 6.3, 6.7,
    7.1, 7.5, 8.0, 8.5, 9.0, 9.5,
  ],
};

/** Every standard number of `series` in `[start, stop]`, ascending. */
export function renardValues(
  series: RenardSeries,
  start: number,
  stop: number,
): readonly number[] {
  const base = RENARD_BASE[series];
  const minExponent = Math.floor(Math.log10(start)) - 1;
  const maxExponent = Math.ceil(Math.log10(stop)) + 1;
  const values: number[] = [];
  for (let exponent = minExponent; exponent <= maxExponent; exponent++) {
    const scale = 10 ** exponent;
    for (const digit of base) {
      const value = Number((digit * scale).toPrecision(10));
      if (value >= start && value <= stop) values.push(value);
    }
  }
  values.sort((a, b) => a - b);
  return values;
}

/** A column of catalogue table data, resolved by the kernel against the table. */
export interface TableColumnRange {
  readonly kind: 'tableColumn';
  readonly table: string;
  readonly column: string;
}

/** `{H7, H8, K7}` — an ordinal axis, and the only way a categorical sweeps. */
export interface CategoricalListRange {
  readonly kind: 'categoricalList';
  readonly values: readonly string[];
}

export type RangeSpec =
  | LinearRange
  | LogarithmicRange
  | ListRange
  | RenardRange
  | TableColumnRange
  | CategoricalListRange;

export type ValueSpec = ScalarValue | SliderValue | CategoricalValue | SpectrumValue | RangeSpec;

const RANGE_KINDS: readonly ValueKind[] = [
  'linear',
  'logarithmic',
  'list',
  'renard',
  'tableColumn',
  'categoricalList',
];

/** A range introduces a labelled axis; a plain value does not. */
export function isRange(value: ValueSpec): value is RangeSpec {
  return RANGE_KINDS.includes(value.kind);
}

/**
 * How long the axis is, where the document knows. A table column's length lives
 * in the table, so it resolves in the kernel and not here.
 */
export function axisLength(range: RangeSpec): number | undefined {
  switch (range.kind) {
    case 'linear':
    case 'logarithmic':
      return range.points;
    case 'list':
    case 'categoricalList':
      return range.values.length;
    case 'renard':
      return renardValues(range.series, range.start, range.stop).length;
    case 'tableColumn':
      return undefined;
  }
}

function parseEndpoints(
  object: JsonObject,
  path: string,
): { start: number; stop: number; points: number; unit: Unit } {
  const points = readInteger(required(object, 'points', path), join(path, 'points'), 2);
  return {
    start: readNumber(required(object, 'start', path), join(path, 'start')),
    stop: readNumber(required(object, 'stop', path), join(path, 'stop')),
    points,
    unit: parseUnitField(required(object, 'unit', path), join(path, 'unit')),
  };
}

export function parseValueSpec(value: JsonValue, path: string): ValueSpec {
  const object = readObject(value, path);
  const kind = readEnum(required(object, 'kind', path), join(path, 'kind'), VALUE_KINDS);

  switch (kind) {
    case 'scalar':
      return {
        kind,
        value: readNumber(required(object, 'value', path), join(path, 'value')),
        unit: parseUnitField(required(object, 'unit', path), join(path, 'unit')),
      };

    case 'slider': {
      const min = readNumber(required(object, 'min', path), join(path, 'min'));
      const max = readNumber(required(object, 'max', path), join(path, 'max'));
      if (min >= max) fail(path, 'a slider needs its low end below its high end');
      return {
        kind,
        value: readNumber(required(object, 'value', path), join(path, 'value')),
        min,
        max,
        unit: parseUnitField(required(object, 'unit', path), join(path, 'unit')),
      };
    }

    case 'categorical':
      return { kind, value: readName(required(object, 'value', path), join(path, 'value')) };

    case 'spectrum':
    case 'list': {
      const values = readNumberArray(required(object, 'values', path), join(path, 'values'));
      if (values.length === 0) fail(join(path, 'values'), 'is empty');
      return {
        kind,
        values,
        unit: parseUnitField(required(object, 'unit', path), join(path, 'unit')),
      };
    }

    case 'linear':
      return { kind, ...parseEndpoints(object, path) };

    case 'logarithmic': {
      const range = parseEndpoints(object, path);
      // A log axis through zero has no meaning, and a negative one has no
      // logarithm. Both are authoring mistakes worth naming here rather than
      // producing NaN halfway down a sweep.
      if (range.start <= 0 || range.stop <= 0) {
        fail(path, 'a logarithmic range needs both endpoints above zero');
      }
      return { kind, ...range };
    }

    case 'renard': {
      const series = readEnum(
        required(object, 'series', path),
        join(path, 'series'),
        RENARD_SERIES,
      );
      const start = readNumber(required(object, 'start', path), join(path, 'start'));
      const stop = readNumber(required(object, 'stop', path), join(path, 'stop'));
      // A Renard series is preferred numbers on a decade scale, same as the
      // logarithmic range it sits beside — zero and negative bounds have no
      // decade to belong to.
      if (start <= 0 || stop <= 0) {
        fail(path, 'a Renard series needs both endpoints above zero');
      }
      if (stop < start) fail(path, 'the high end must not be below the low end');
      return {
        kind,
        series,
        start,
        stop,
        unit: parseUnitField(required(object, 'unit', path), join(path, 'unit')),
      };
    }

    case 'tableColumn':
      return {
        kind,
        table: readName(required(object, 'table', path), join(path, 'table')),
        column: readName(required(object, 'column', path), join(path, 'column')),
      };

    case 'categoricalList': {
      const values = readStringArray(required(object, 'values', path), join(path, 'values'));
      if (values.length === 0) fail(join(path, 'values'), 'is empty');
      return { kind, values };
    }
  }
}

export function serializeValueSpec(value: ValueSpec): JsonObject {
  switch (value.kind) {
    case 'scalar':
      return { kind: value.kind, value: value.value, unit: value.unit.symbol };
    case 'slider':
      return {
        kind: value.kind,
        value: value.value,
        min: value.min,
        max: value.max,
        unit: value.unit.symbol,
      };
    case 'categorical':
      return { kind: value.kind, value: value.value };
    case 'spectrum':
    case 'list':
      return { kind: value.kind, values: [...value.values], unit: value.unit.symbol };
    case 'linear':
    case 'logarithmic':
      return {
        kind: value.kind,
        start: value.start,
        stop: value.stop,
        points: value.points,
        unit: value.unit.symbol,
      };
    case 'renard':
      return {
        kind: value.kind,
        series: value.series,
        start: value.start,
        stop: value.stop,
        unit: value.unit.symbol,
      };
    case 'tableColumn':
      return { kind: value.kind, table: value.table, column: value.column };
    case 'categoricalList':
      return { kind: value.kind, values: [...value.values] };
  }
}
