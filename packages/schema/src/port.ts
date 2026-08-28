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
 * A numeric port may declare a **generic signature** instead of a unit —
 * `$A`, `$A*$B` — which is how the base node library says "whatever is wired
 * here". No catalogue formula uses one: R&M names every unit. An input's
 * signature must be a bare variable, so that binding it is an assignment
 * rather than an equation; the output may be any monomial in those variables.
 *
 * Two kinds:
 *
 * - **numeric** — a dimensioned scalar. Sweepable by any range kind. Its
 *   `variadic` flag marks a port that takes several wires instead of one —
 *   `sum`'s addends, a shaft's breakpoints — rendered by the editor's
 *   ghost-slot mechanism (`portSlots.ts`... see that file's own history
 *   for the name). Ordinarily each wire still carries one value per grid
 *   cell; the one exception is a Monte Carlo generator's own `values` and
 *   `weights` ports (`NumericPort.variadic`'s own comment has the reason).
 *   A variadic port introduces no axis of its own regardless of which
 *   reading applies; that is unaffected by whether any of its wires happen
 *   to be swept.
 * - **categorical** — a value from an enumerated domain, `H7` and friends.
 *   Sweepable by explicit list only; there is no spacing between `H7`
 *   and `K7`.
 */

import {
  DIMENSIONLESS,
  bareVariable,
  dimensionsEqual,
  isGenericDimension,
  parseGenericDimension,
  type Dimension,
  type GenericDimension,
} from '@joveworks/units';

import {
  fail,
  join,
  optional,
  put,
  readBoolean,
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
import {
  parseLocalizedText,
  serializeLocalizedText,
  type LocalizedText,
} from './localization.js';
import type { Unit } from '@joveworks/units';

/**
 * What a numeric port declares: a concrete display unit, or a generic
 * signature standing for whatever is wired to it.
 */
export type PortUnit = Unit | GenericDimension;

export function isGenericPort(port: Port): boolean {
  if (port.kind === 'categorical' || port.kind === 'bundle') return false;
  return isGenericDimension(port.unit);
}

export const PORT_KINDS = ['numeric', 'categorical', 'bundle'] as const;
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
  readonly description?: LocalizedText;
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
  /**
   * This port accepts several wires instead of one — `sum`'s addends, a
   * shaft's breakpoints, Monte Carlo's discrete-distribution values and
   * weights. The editor renders it as `port::0`, `port::1`, … plus a
   * trailing `port::open` ghost slot (`portSlots.ts`).
   *
   * Ordinarily one value per wire per grid cell, broadcast the same as any
   * other numeric input — that is the rule at a shaft's `force` port, where
   * a multi-valued wire legitimately means "sweep this load and give me a
   * diagram per magnitude". The one exception is a Monte Carlo generator's
   * own `values` and `weights` ports: that node's parameters admit no swept
   * edge at all (`generatorParam` in evaluate.ts), so there is no axis for a
   * multi-valued wire to line up against, and every number on every wire can
   * only mean one more choice or weight. Those two ports consume each wire
   * whole instead — `discreteWireValues` in evaluate.ts — so one wire
   * carrying a `list` of three, three wires of one each, or a mix, all
   * express the same distribution. Do not generalize this: it holds only
   * where sweeping is already impossible.
   *
   * It still introduces no axis of its own either way, so a variadic port
   * cannot itself be swept. Freely combined with a generic signature —
   * `sum`'s addends are both, and `draft.ts`'s `genericVariadic` is how the
   * base node library says so. Never true on an `OutputPort` though: a
   * formula produces one value, not several, which `asOutputPort` refuses
   * below.
   */
  readonly variadic?: boolean;
}

export interface CategoricalPort extends PortBase {
  readonly kind: 'categorical';
  /** The enumerated domain. A value outside it is rejected at entry. */
  readonly domain: readonly string[];
  /**
   * Other spellings that name a domain member: `'Canon EOS R6m3'` is what the
   * camera writes into its own files, `'Canon EOS R6 Mark III'` is what the
   * domain calls it. Many-to-one on purpose — one body sells under a different
   * name per market, and every one of those names the same entry.
   *
   * It lives on the domain rather than on whatever produced the odd spelling,
   * because "what else this thing is called" is a property of the thing. A
   * wire keeps carrying the spelling its source actually produced; only a
   * consumer that has to land on a domain member resolves through this, so a
   * table column still prints what the source said.
   */
  readonly aliases?: Readonly<Record<string, string>>;
  readonly default?: string;
}

/** The domain member `value` names, directly or through an alias. */
export function domainMember(port: CategoricalPort, value: string): string | undefined {
  if (port.domain.includes(value)) return value;
  if (port.aliases === undefined || !Object.hasOwn(port.aliases, value)) return undefined;
  return port.aliases[value];
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

export type Port = NumericPort | CategoricalPort | BundlePort;

/** What a formula may produce. A `NumericPort` here is never `variadic` — a formula produces one value, not several. */
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

function parseAliases(
  value: JsonValue,
  path: string,
  domain: readonly string[],
): Readonly<Record<string, string>> {
  const object = readObject(value, path);
  const aliases: Record<string, string> = {};
  for (const [alias, member] of Object.entries(object)) {
    const target = readString(member, join(path, alias));
    if (!domain.includes(target)) {
      fail(join(path, alias), `'${target}' is not in the declared domain`);
    }
    // An alias that is itself a domain entry would shadow that entry's own
    // row, which is never what a translation table means to say.
    if (domain.includes(alias)) fail(join(path, alias), `'${alias}' is already a domain entry`);
    aliases[alias] = target;
  }
  if (Object.keys(aliases).length === 0) fail(path, 'is empty — leave it out instead');
  return aliases;
}

export function parsePort(value: JsonValue, path: string): Port {
  const object = readObject(value, path);
  const name = readName(required(object, 'name', path), join(path, 'name'));
  const description = optional(object, 'description', path, parseLocalizedText);
  const kind = readEnum(required(object, 'kind', path), join(path, 'kind'), PORT_KINDS);

  if (kind === 'categorical') {
    const domain = readStringArray(required(object, 'domain', path), join(path, 'domain'));
    if (domain.length === 0) fail(join(path, 'domain'), 'is empty — a categorical port needs one');
    const duplicate = domain.find((entry, i) => domain.indexOf(entry) !== i);
    if (duplicate !== undefined) fail(join(path, 'domain'), `lists '${duplicate}' twice`);
    const aliases = optional(object, 'aliases', path, (entry, entryPath) =>
      parseAliases(entry, entryPath, domain),
    );
    const fallback = optional(object, 'default', path, readString);
    if (fallback !== undefined && !domain.includes(fallback)) {
      fail(join(path, 'default'), `'${fallback}' is not in the declared domain`);
    }
    return {
      kind,
      name,
      domain,
      ...put('aliases', aliases),
      ...put('description', description),
      ...put('default', fallback),
    };
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
  const fallback = optional(object, 'default', path, readNumber);
  const validRange = optional(object, 'validRange', path, parseValidRange);
  const monotonic = optional(object, 'monotonic', path, (v, p) => readEnum(v, p, MONOTONICITY));
  const variadic = optional(object, 'variadic', path, readBoolean);
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
    ...put('variadic', variadic),
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
    ...(port.description === undefined ? {} : { description: serializeLocalizedText(port.description) }),
  };
  if (port.kind === 'categorical') {
    return {
      ...base,
      domain: [...port.domain],
      ...put('aliases', port.aliases === undefined ? undefined : { ...port.aliases }),
      ...put('default', port.default),
    };
  }
  if (port.kind === 'bundle') {
    return { ...base, channels: port.channels.map((channel) => channel.symbol) };
  }
  return {
    ...base,
    unit: port.unit.symbol,
    ...put('preferredUnit', port.preferredUnit?.symbol),
    ...put('default', port.default),
    ...put('variadic', port.variadic),
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

/**
 * Reject an output port declared as a bundle, or a numeric one declared
 * `variadic` — a formula produces exactly one value, never several, so
 * neither shape is something an output can be.
 */
export function asOutputPort(port: Port, path: string): OutputPort {
  if (port.kind === 'bundle') {
    fail(path, "a bundle is 'pack's own output only — a catalogue formula cannot produce one");
  }
  if (port.kind === 'numeric' && port.variadic === true) {
    fail(path, "'variadic' is an input-only flag — a formula cannot produce several values");
  }
  return port;
}
