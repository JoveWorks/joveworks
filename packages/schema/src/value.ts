/**
 * What an input node holds: one value, or a range that turns the whole
 * downstream graph into a study (S29, S43).
 *
 * The range kinds are a closed set, and the closure is the point. `linspace` and
 * `logspace` are meaningless over `{H7, K7}` — there is no spacing between fit
 * classes — so a categorical sweep is an explicit list and nothing else (S38).
 * A spectrum is an explicit list too, but for the opposite reason: it is
 * *consumed* whole by an aggregation, so it introduces no axis and cannot be
 * swept (S36).
 *
 * Point count is the primary control rather than step size (S29): `linspace(20,
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
  'categorical',
  'spectrum',
  'linear',
  'logarithmic',
  'list',
  'tableColumn',
  'categoricalList',
] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];

/** A single number, in the unit it was typed with. */
export interface ScalarValue {
  readonly kind: 'scalar';
  readonly value: number;
  readonly unit: Unit;
}

/** A single member of a categorical port's domain (S38). */
export interface CategoricalValue {
  readonly kind: 'categorical';
  readonly value: string;
}

/** A load spectrum: an explicit list consumed by an aggregation (S36). */
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
 * Log spacing is a teaching requirement, not a convenience (S29): Wöhler curves
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
  | TableColumnRange
  | CategoricalListRange;

export type ValueSpec = ScalarValue | CategoricalValue | SpectrumValue | RangeSpec;

const RANGE_KINDS: readonly ValueKind[] = [
  'linear',
  'logarithmic',
  'list',
  'tableColumn',
  'categoricalList',
];

/** A range introduces a labelled axis (S43); a plain value does not. */
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
    case 'tableColumn':
      return { kind: value.kind, table: value.table, column: value.column };
    case 'categoricalList':
      return { kind: value.kind, values: [...value.values] };
  }
}
