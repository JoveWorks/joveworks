/**
 * Ports: what may be wired to what.
 *
 * A port declares a **display unit**, not a dimension, because the unit already
 * carries one — `units` resolves `N/mm²` to its dimension and its factor in one
 * step. Declaring both would create two places to be wrong about the same fact,
 * and the failure would be silent whenever they disagreed in a way that still
 * parses. `portDimension` is the derivation, and it is what connection checking
 * compares.
 *
 * A numeric or spectrum port may declare a **generic signature** instead of a
 * unit — `$A`, `$A*$B` — which is how the base node library says "whatever is
 * wired here". No catalogue formula uses one: R&M names every unit. An
 * input's signature must be a bare variable, so that binding it is an assignment
 * rather than an equation; the output may be any monomial in those variables.
 *
 * Three kinds, and the third is the one that is easy to miss:
 *
 * - **numeric** — a dimensioned scalar. Sweepable by any range kind.
 * - **categorical** — a value from an enumerated domain, `H7` and friends.
 *   Sweepable by explicit list only; there is no spacing between `H7`
 *   and `K7`.
 * - **spectrum** — a whole series consumed at once, the load spectrum.
 *   A sweep *produces* a series and a spectrum *consumes* one, so a spectrum
 *   port cannot itself be swept; that is enforced where values are attached,
 *   in `value.ts`.
 */

import {
  DIMENSIONLESS,
  bareVariable,
  dimensionsEqual,
  isGenericDimension,
  parseGenericDimension,
  type Dimension,
  type GenericDimension,
} from '@mds/units';

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
import { parsePortUnitField } from './quantity.js';
import type { Unit } from '@mds/units';

/**
 * What a numeric or spectrum port declares: a concrete display unit, or a
 * generic signature standing for whatever is wired to it.
 */
export type PortUnit = Unit | GenericDimension;

export function isGenericPort(port: Port): boolean {
  if (port.kind === 'categorical' || port.kind === 'bundle') return false;
  return isGenericDimension(port.unit);
}

export const PORT_KINDS = ['numeric', 'categorical', 'spectrum', 'bundle'] as const;
export type PortKind = (typeof PORT_KINDS)[number];

/**
 * A port's valid range, in the port's own display unit.
 *
 * Load-bearing, not a UI nicety: it bounds a sweep, and it is the
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
  /**
   * Display unit; its dimension is the port's type. `''` is dimensionless. A
   * `GenericDimension` here means the port has no display unit of its own and
   * takes both unit and dimension from what is wired to it.
   */
  readonly unit: PortUnit;
  /** Optional same-dimension display preference for this node's port. */
  readonly preferredUnit?: Unit;
  /** A starting value, in `unit`. Never set on a generic port — no unit to be in. */
  readonly default?: number;
  /** In `unit`. See `ValidRange`. */
  readonly validRange?: ValidRange;
  /**
   * How the output moves with this input, when it is known and monotonic.
   * Recorded because a later per-node inversion needs it to pick a bracket,
   * and adding it afterwards would be a schema migration for no reason.
   */
  readonly monotonic?: Monotonicity;
}

export interface CategoricalPort extends PortBase {
  readonly kind: 'categorical';
  /** The enumerated domain. A value outside it is rejected at entry. */
  readonly domain: readonly string[];
  readonly default?: string;
}

export interface SpectrumPort extends PortBase {
  readonly kind: 'spectrum';
  readonly unit: PortUnit;
  readonly preferredUnit?: Unit;
}

/**
 * A whole ordered bundle of channels, each its own generic signature — the
 * ports `pack`/`unpack` synthesise for themselves at resolve/render time
 * (`packages/kernel/src/graph.ts`). Unlike every other port kind this
 * declares a *list* of signatures rather than one: `pack`'s output is
 * however many channels are currently wired, in index order. No catalogue
 * formula ever declares one — R&M names every unit, and there is nothing to
 * bundle in a hand-authored expression — but the kind has to exist and
 * round-trip like the others it sits beside.
 */
export interface BundlePort extends PortBase {
  readonly kind: 'bundle';
  readonly channels: readonly GenericDimension[];
}

export type Port = NumericPort | CategoricalPort | SpectrumPort | BundlePort;

/** What a formula may produce. A spectrum is consumed, never produced. */
export type OutputPort = NumericPort | CategoricalPort;

/**
 * The dimension a connection is checked against, or `undefined` for a
 * generic port — which has no dimension until the wiring binds one.
 */
export function portDimension(port: Port): Dimension | undefined {
  if (port.kind === 'bundle') return undefined;
  if (port.kind === 'categorical') return DIMENSIONLESS;
  return isGenericDimension(port.unit) ? undefined : port.unit.dimension;
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

function parsePreferredUnit(value: JsonValue, path: string): Unit {
  const preferred = parsePortUnitField(value, path);
  if (isGenericDimension(preferred)) fail(path, 'must be a concrete unit, not a generic signature');
  return preferred;
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

  if (kind === 'bundle') {
    const channels = readStringArray(required(object, 'channels', path), join(path, 'channels')).map(
      (text) => parseGenericDimension(text),
    );
    return { kind, name, channels, ...put('description', description) };
  }

  const unit = parsePortUnitField(required(object, 'unit', path), join(path, 'unit'));
  const preferredUnit = optional(object, 'preferredUnit', path, parsePreferredUnit);
  if (preferredUnit !== undefined) {
    if (isGenericDimension(unit)) fail(join(path, 'preferredUnit'), 'cannot accompany a generic unit');
    if (!dimensionsEqual(unit.dimension, preferredUnit.dimension)) {
      fail(join(path, 'preferredUnit'), 'must have the same dimension as the port unit');
    }
  }
  if (kind === 'spectrum') {
    return { kind, name, unit, ...put('description', description), ...put('preferredUnit', preferredUnit) };
  }

  const fallback = optional(object, 'default', path, readNumber);
  const validRange = optional(object, 'validRange', path, parseValidRange);
  const monotonic = optional(object, 'monotonic', path, (v, p) => readEnum(v, p, MONOTONICITY));
  if (isGenericDimension(unit) && (fallback !== undefined || validRange !== undefined)) {
    fail(path, `'${unit.symbol}' is generic, so there is no unit for a default or a range to be in`);
  }
  if (fallback !== undefined && validRange !== undefined && !withinRange(fallback, validRange)) {
    fail(join(path, 'default'), `${fallback} is outside the declared valid range`);
  }
  return {
    kind,
    name,
    unit,
    ...put('preferredUnit', preferredUnit),
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
  if (port.kind === 'bundle') {
    return { ...base, channels: port.channels.map((channel) => channel.symbol) };
  }
  if (port.kind === 'spectrum') {
    return { ...base, unit: port.unit.symbol, ...put('preferredUnit', port.preferredUnit?.symbol) };
  }
  return {
    ...base,
    unit: port.unit.symbol,
    ...put('preferredUnit', port.preferredUnit?.symbol),
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

/**
 * Reject a generic *input* whose signature is not a bare variable.
 *
 * `$A` wired to `N` binds `A` to force — an assignment. `$A*$B` wired to `N`
 * would be an equation with infinitely many solutions, and `$A**2` wired to `N`
 * has none. Outputs are exempt because they are computed from the bindings, not
 * used to make them: `$A*$B` is exactly what `multiply` produces.
 */
export function asInputPort(port: Port, path: string): Port {
  if (port.kind !== 'categorical' && port.kind !== 'bundle' && isGenericDimension(port.unit)) {
    if (bareVariable(port.unit) === undefined) {
      fail(
        join(path, 'unit'),
        `'${port.unit.symbol}' is not a bare variable — an input's generic unit must be ` +
          "one variable to the first power, like '$A'",
      );
    }
  }
  return port;
}

/** Reject an output port declared as a spectrum or a bundle, neither of which a formula may produce. */
export function asOutputPort(port: Port, path: string): OutputPort {
  if (port.kind === 'spectrum') {
    fail(path, 'a spectrum is an input only — a formula cannot produce one');
  }
  if (port.kind === 'bundle') {
    fail(path, "a bundle is 'pack's own output only — a catalogue formula cannot produce one");
  }
  return port;
}
