/**
 * Ports: what may be wired to what (S6, S38).
 *
 * A port declares a **display unit**, not a dimension, because the unit already
 * carries one — `units` resolves `N/mm²` to its dimension and its factor in one
 * step. Declaring both would create two places to be wrong about the same fact,
 * and the failure would be silent whenever they disagreed in a way that still
 * parses. `portDimension` is the derivation, and it is what connection checking
 * compares.
 *
 * Three kinds, and the third is the one that is easy to miss:
 *
 * - **numeric** — a dimensioned scalar. Sweepable by any range kind (S29).
 * - **categorical** — a value from an enumerated domain, `H7` and friends
 *   (S38). Sweepable by explicit list only; there is no spacing between `H7`
 *   and `K7`.
 * - **spectrum** — a whole series consumed at once, the load spectrum of S36.
 *   A sweep *produces* a series and a spectrum *consumes* one, so a spectrum
 *   port cannot itself be swept; that is enforced where values are attached,
 *   in `value.ts`.
 */

import { DIMENSIONLESS, type Dimension } from '@mds/units';

import {
  fail,
  join,
  optional,
  put,
  readEnum,
  readNumber,
  readObject,
  readName,
  readString,
  readStringArray,
  required,
  type JsonObject,
  type JsonValue,
} from './json.js';
import { parseUnitField } from './quantity.js';
import type { Unit } from '@mds/units';

export const PORT_KINDS = ['numeric', 'categorical', 'spectrum'] as const;
export type PortKind = (typeof PORT_KINDS)[number];

/**
 * A port's valid range, in the port's own display unit.
 *
 * Load-bearing, not a UI nicety: it bounds a sweep, and S17 makes it the
 * bracketing interval a future 1-D inversion would need. That is why it lives
 * on the port rather than in the editor's state.
 */
export interface ValidRange {
  readonly min?: number;
  readonly max?: number;
}

export const MONOTONICITY = ['increasing', 'decreasing'] as const;
export type Monotonicity = (typeof MONOTONICITY)[number];

interface PortBase {
  /** The symbol as R&M writes it — `F_t`, `d_dg`. Unique within a formula. */
  readonly name: string;
  readonly description?: string;
}

export interface NumericPort extends PortBase {
  readonly kind: 'numeric';
  /** Display unit; its dimension is the port's type. `''` is dimensionless. */
  readonly unit: Unit;
  /** A starting value, in `unit`. */
  readonly default?: number;
  /** In `unit`. See `ValidRange`. */
  readonly validRange?: ValidRange;
  /**
   * How the output moves with this input, when it is known and monotonic.
   * Recorded for S17: a later per-node inversion needs it to pick a bracket,
   * and adding it afterwards would be a schema migration for no reason.
   */
  readonly monotonic?: Monotonicity;
}

export interface CategoricalPort extends PortBase {
  readonly kind: 'categorical';
  /** The enumerated domain. A value outside it is rejected at entry (S38). */
  readonly domain: readonly string[];
  readonly default?: string;
}

export interface SpectrumPort extends PortBase {
  readonly kind: 'spectrum';
  readonly unit: Unit;
}

export type Port = NumericPort | CategoricalPort | SpectrumPort;

/** What a formula may produce. A spectrum is consumed, never produced (S36). */
export type OutputPort = NumericPort | CategoricalPort;

/** The dimension a connection is checked against (S6). */
export function portDimension(port: Port): Dimension {
  return port.kind === 'categorical' ? DIMENSIONLESS : port.unit.dimension;
}

function parseValidRange(value: JsonValue, path: string): ValidRange {
  const object = readObject(value, path);
  const min = optional(object, 'min', path, readNumber);
  const max = optional(object, 'max', path, readNumber);
  if (min === undefined && max === undefined) {
    fail(path, 'declares neither a min nor a max');
  }
  if (min !== undefined && max !== undefined && min > max) {
    fail(path, `min ${min} is above max ${max}`);
  }
  return { ...put('min', min), ...put('max', max) };
}

export function parsePort(value: JsonValue, path: string): Port {
  const object = readObject(value, path);
  const name = readName(required(object, 'name', path), join(path, 'name'));
  const description = optional(object, 'description', path, readString);
  const kind = readEnum(required(object, 'kind', path), join(path, 'kind'), PORT_KINDS);

  if (kind === 'categorical') {
    const domain = readStringArray(required(object, 'domain', path), join(path, 'domain'));
    if (domain.length === 0) fail(join(path, 'domain'), 'is empty — a categorical port needs one');
    const duplicate = domain.find((entry, i) => domain.indexOf(entry) !== i);
    if (duplicate !== undefined) fail(join(path, 'domain'), `lists '${duplicate}' twice`);
    const fallback = optional(object, 'default', path, readString);
    if (fallback !== undefined && !domain.includes(fallback)) {
      fail(join(path, 'default'), `'${fallback}' is not in the declared domain`);
    }
    return { kind, name, domain, ...put('description', description), ...put('default', fallback) };
  }

  const unit = parseUnitField(required(object, 'unit', path), join(path, 'unit'));
  if (kind === 'spectrum') {
    return { kind, name, unit, ...put('description', description) };
  }

  const fallback = optional(object, 'default', path, readNumber);
  const validRange = optional(object, 'validRange', path, parseValidRange);
  const monotonic = optional(object, 'monotonic', path, (v, p) => readEnum(v, p, MONOTONICITY));
  if (fallback !== undefined && validRange !== undefined && !withinRange(fallback, validRange)) {
    fail(join(path, 'default'), `${fallback} is outside the declared valid range`);
  }
  return {
    kind,
    name,
    unit,
    ...put('description', description),
    ...put('default', fallback),
    ...put('validRange', validRange),
    ...put('monotonic', monotonic),
  };
}

export function withinRange(value: number, range: ValidRange): boolean {
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

export function serializePort(port: Port): JsonObject {
  const base = {
    kind: port.kind,
    name: port.name,
    ...put('description', port.description),
  };
  if (port.kind === 'categorical') {
    return { ...base, domain: [...port.domain], ...put('default', port.default) };
  }
  if (port.kind === 'spectrum') {
    return { ...base, unit: port.unit.symbol };
  }
  return {
    ...base,
    unit: port.unit.symbol,
    ...put('default', port.default),
    ...put(
      'validRange',
      port.validRange === undefined
        ? undefined
        : { ...put('min', port.validRange.min), ...put('max', port.validRange.max) },
    ),
    ...put('monotonic', port.monotonic),
  };
}

/** Reject an output port declared as a spectrum, which S36 forbids. */
export function asOutputPort(port: Port, path: string): OutputPort {
  if (port.kind === 'spectrum') {
    fail(path, 'a spectrum is an input only — a formula cannot produce one (S36)');
  }
  return port;
}
