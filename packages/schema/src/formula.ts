/**
 * The formula record — the thing this whole project is a contract around.
 *
 * A formula is **data, not code**: its output ports, its input ports, an
 * expression as a string, and the metadata that makes it citable, checkable and
 * quarantinable. The expression stays a string here and is parsed by the kernel
 * — this package never evaluates and never compiles, and above all never
 * reaches for `eval`, because catalogues are files students pass to each other.
 *
 * Nothing in this file is R&M content. The examples in the tests are invented
 * for that reason.
 */

import {
  fail,
  join,
  optional,
  put,
  readArray,
  readBoolean,
  readEnum,
  readInteger,
  readName,
  readNumber,
  readObject,
  readString,
  required,
  type JsonObject,
  type JsonValue,
} from './json.js';
import { hashRecord } from './hash.js';
import {
  parseLocalizedText,
  serializeLocalizedText,
  type LocalizedText,
} from './localization.js';
import {
  asInputPort,
  asOutputPort,
  parsePort,
  portDimension,
  serializePort,
  type OutputPort,
  type Port,
} from './port.js';
import { readSchemaVersion } from './version.js';
import {
  dimensionsEqual,
  divideDimensions,
  genericVariables,
  isGenericDimension,
  multiplyDimensions,
  powerDimension,
  type Dimension,
} from '@joveworks/units';

/** The dimension variables a port mentions — none, unless it is generic. */
function portVariables(port: Port): readonly string[] {
  if (port.kind === 'categorical' || port.kind === 'bundle' || !isGenericDimension(port.unit)) return [];
  return genericVariables(port.unit);
}

/**
 * `verified` means a golden value exercises it and the result matched;
 * `unverified` is the honest default for everything no golden path touches;
 * `quarantined` cannot be evaluated at all — a known defect, or a unit tag that
 * could not be resolved. Quarantine is visible rather than silently dropped,
 * which is the whole difference from the predecessor library.
 */
export const FORMULA_STATUSES = ['verified', 'unverified', 'quarantined'] as const;
export type FormulaStatus = (typeof FORMULA_STATUSES)[number];

/**
 * A dense, typed lookup table. Axes are ordered; values are row-major with the
 * last axis contiguous. Numeric axes select the first upper bound greater than
 * or equal to the input, while categorical axes require an exact match.
 */
export interface LookupAxis {
  readonly input: string;
  readonly kind: 'numeric' | 'categorical';
  readonly values: readonly (number | string)[];
  /** Numeric axes may exclude everything at or below this lower table bound. */
  readonly lowerExclusive?: number;
}

export interface FormulaLookup {
  readonly axes: readonly LookupAxis[];
  /**
   * One column per output port, keyed by that port's name, each in that port's
   * own declared unit. `null` means undefined. The axes are shared: a camera
   * table names its models once and answers with every property of the model
   * picked, rather than repeating the model list per property.
   */
  readonly columns: Readonly<Record<string, readonly (number | null)[]>>;
}

/**
 * `kind`s of piecewise evaluator a formula may declare instead of (never
 * alongside) `lookup`:
 *
 * - `cumulativeStep` — a running total of `values`' entries whose matching
 *   `breakpoints` entry is at or before `axis`'s current value. A shear or
 *   torque diagram directly.
 * - `cumulativeMoment` — the same running total, each entry weighted by its
 *   distance from `axis`'s current value: `Σ value·(axis − breakpoint)` over
 *   breakpoints at or before `axis`. A bending-moment diagram directly —
 *   the closed-form integral of `cumulativeStep`'s result — and, evaluated
 *   at a support position instead of swept, the moment used to solve that
 *   support's reaction (ordinary `divide`/`subtract` base nodes take it
 *   from there; no third kind is needed for reactions).
 * - `cumulativeCubic` — `Σ value·(axis − breakpoint)³` over breakpoints at
 *   or before `axis`. `EI` times a beam's deflection, `y(z)`, is the
 *   second integral of the moment diagram — `cumulativeMoment` integrated
 *   twice more — up to two constants of integration a document composes
 *   from ordinary base nodes, the same way a reaction is: evaluate this
 *   kind at each support's own position (giving two equations in the
 *   constants from that support's `y = 0`), solve, then add
 *   `constant·axis + constant` and divide by `EI` for the swept curve.
 *   Distributed loads are not implemented for this kind — the closed form
 *   for a rectangular load's second-integral-of-moment contribution is
 *   more involved and no shaft feature needs it yet; declaring
 *   `distributedStart`/`End`/`Rate` alongside `cumulativeCubic` is rejected
 *   rather than silently computing the wrong curve.
 *
 * `breakpoints` and `values` each name one or more declared input ports,
 * concatenated in the order listed — not paired by wire order, which a
 * student could wire inconsistently between the two ports. This is what
 * lets a diagram formula take a spectrum of applied loads *and* a support's
 * separately-computed reaction as one more, single-valued entry: e.g.
 * `breakpoints: ['position', 'supportA']`, `values: ['force', 'reactionA']`
 * pairs `position`/`force` (a spectrum, many values) with `supportA`/
 * `reactionA` (plain numeric ports, one value each) by declared position,
 * not by however a student happened to wire them.
 *
 * `distributedStart`/`distributedEnd`/`distributedRate` add a uniform
 * distributed load's contribution to either kind, on top of whatever
 * `breakpoints`/`values` already total — a span of the axis (`start` to
 * `end`) carrying a constant `rate` per unit of axis. Writing
 * `a = clamp(axis − start, 0, end − start)`, `cumulativeStep` adds
 * `rate·a` and `cumulativeMoment` adds `rate·a·(axis − start − a/2)`: the
 * closed-form integral (and its own integral) of a rectangular load,
 * whether the axis sits before, inside, or past the span. A formula may
 * declare either group, or both — a shear diagram with point loads and a
 * distributed load in the same span totals both.
 */
export const PIECEWISE_KINDS = ['cumulativeStep', 'cumulativeMoment', 'cumulativeCubic'] as const;
export type PiecewiseKind = (typeof PIECEWISE_KINDS)[number];

export interface FormulaPiecewise {
  readonly kind: PiecewiseKind;
  /** Name of the declared numeric input evaluated against each breakpoint. */
  readonly axis: string;
  /** Declared spectrum/numeric input(s) holding each breakpoint's position, in `axis`'s dimension. Paired with `values`. */
  readonly breakpoints?: readonly string[];
  /** Declared spectrum/numeric input(s) holding the value added at each breakpoint. Paired with `breakpoints`. */
  readonly values?: readonly string[];
  /** Declared spectrum/numeric input(s) holding each distributed span's start, in `axis`'s dimension. Paired with `distributedEnd`/`distributedRate`. */
  readonly distributedStart?: readonly string[];
  /** Declared spectrum/numeric input(s) holding each distributed span's end, in `axis`'s dimension. Paired with `distributedStart`/`distributedRate`. */
  readonly distributedEnd?: readonly string[];
  /** Declared spectrum/numeric input(s) holding each distributed span's rate, per unit of `axis`. Paired with `distributedStart`/`distributedEnd`. */
  readonly distributedRate?: readonly string[];
}

/**
 * A beam/shaft deflection curve — `cumulativeCubic`'s raw term, but solved
 * and scaled all the way to a swept displacement rather than left as an
 * intermediate a document has to finish by hand.
 *
 * `shaftDeflectionTerm` (the `cumulativeCubic` primitive) is exactly zero
 * at `zeroAt[0]` only by construction — nothing precedes the leftmost
 * support — and generally nonzero at `zeroAt[1]`, which reads as "wrong
 * units, and it isn't even zero at the supports" to anyone who wires it
 * straight to a plot expecting a deflection curve. This kind exists so a
 * document doesn't have to: it evaluates the same running cubic sum at
 * both `zeroAt` positions to get two equations in the two constants of
 * integration a beam's `y = 0` at each support pins down, solves them, and
 * returns `(Σ value·(axis − breakpoint)³ / 6 + C₁·axis + C₂) / (modulus ×
 * secondMomentOfArea)` — a real displacement, zero at both supports.
 */
export interface FormulaDeflection {
  /** Name of the declared numeric input the curve is evaluated at. */
  readonly axis: string;
  /** Declared spectrum/numeric input(s) holding each breakpoint's position, in `axis`'s dimension. */
  readonly breakpoints: readonly string[];
  /** Declared spectrum/numeric input(s) holding the value added at each breakpoint. */
  readonly values: readonly string[];
  /** The two declared numeric inputs — support positions, in `axis`'s dimension — the curve is pinned to zero at. */
  readonly zeroAt: readonly [string, string];
  /** Declared numeric input: Young's modulus. */
  readonly modulus: string;
  /** Declared numeric input: the cross-section's second moment of area. */
  readonly secondMomentOfArea: string;
}

export interface Formula {
  /** Stable within its catalogue — the migration writes it from the method name. */
  readonly id: string;
  /** Bumped whenever the record changes meaning. Part of a graph's reference. */
  readonly version: number;
  /**
   * At least one. Several outputs share one set of inputs and one evaluator —
   * a camera picked once answers with its sensor size, pixel pitch and the
   * rest, rather than making a reader place a node per property. Written as a
   * bare object in JSON when there is one, as a list when there are several.
   */
  readonly outputs: readonly OutputPort[];
  readonly inputs: readonly Port[];
  /**
   * Parsed and compiled by the kernel, never here. Absent when a `lookup`
   * answers for every output: the table is the evaluator, and each output's
   * declared unit is what its column is read in, so there is nothing left for
   * an expression to state.
   */
  readonly expression?: string;
  /** Optional table-backed evaluator, one column per output. */
  readonly lookup?: FormulaLookup;
  /** Optional piecewise evaluator, mutually exclusive with `lookup`/`deflection`. Same role: the expression still declares/checks dimensions. */
  readonly piecewise?: FormulaPiecewise;
  /** Optional deflection-curve evaluator, mutually exclusive with `lookup`/`piecewise`. Same role: the expression still declares/checks dimensions. */
  readonly deflection?: FormulaDeflection;
  /** Short display name. Omit when a citation or id is the natural title. */
  readonly label?: LocalizedText;
  readonly description: LocalizedText;
  /** `R&M 17.1B`. Absent on the base node library, which cites nothing. */
  readonly citation?: string;
  /** Groups the rearranged forms of one relation. */
  readonly variantOf?: string;
  /**
   * The condition under which this form applies, as a predicate over its own
   * input ports — `D_A < d_w`. R&M states these in prose and the
   * predecessor library never read them, so a student could use a variant
   * outside its range and get a confident wrong number. Using a formula outside
   * it warns; it does not block.
   */
  readonly appliesWhen?: string;
  readonly status: FormulaStatus;
  /** Why it is quarantined. Required when it is, so the UI has something to show. */
  readonly quarantineReason?: LocalizedText;
}

function parseLookup(value: JsonValue, path: string, outputs: readonly OutputPort[]): FormulaLookup {
  const object = readObject(value, path);
  const axes = readArray(required(object, 'axes', path), join(path, 'axes')).map((entry, i) => {
    const axisPath = `${join(path, 'axes')}[${i}]`;
    const axis = readObject(entry, axisPath);
    const kind = readEnum(required(axis, 'kind', axisPath), join(axisPath, 'kind'), ['numeric', 'categorical'] as const);
    const values = readArray(required(axis, 'values', axisPath), join(axisPath, 'values')).map((cell, j) => {
      const cellPath = `${join(axisPath, 'values')}[${j}]`;
      return kind === 'numeric' ? readNumber(cell, cellPath) : readString(cell, cellPath);
    });
    if (values.length === 0) fail(join(axisPath, 'values'), 'is empty');
    const lowerExclusive = optional(axis, 'lowerExclusive', axisPath, readNumber);
    if (kind === 'categorical' && lowerExclusive !== undefined) fail(join(axisPath, 'lowerExclusive'), 'only belongs on numeric axes');
    return {
      input: readName(required(axis, 'input', axisPath), join(axisPath, 'input')),
      kind,
      values,
      ...put('lowerExclusive', lowerExclusive),
    };
  });
  if (axes.length === 0) fail(join(path, 'axes'), 'is empty');
  const expected = axes.reduce((size, axis) => size * axis.values.length, 1);
  const readColumn = (cells: JsonValue, columnPath: string): readonly (number | null)[] => {
    const column = readArray(cells, columnPath).map((cell, i) =>
      cell === null ? null : readNumber(cell, `${columnPath}[${i}]`),
    );
    if (column.length !== expected) fail(columnPath, `has ${column.length} entries; axes require ${expected}`);
    return column;
  };

  // One output keeps the bare `values` array it has always been written as, so
  // catalogues on disk stay valid untouched; several outputs name their columns.
  const values = required(object, 'values', path);
  const valuesPath = join(path, 'values');
  const columns: Record<string, readonly (number | null)[]> = {};
  if (Array.isArray(values)) {
    if (outputs.length !== 1) {
      fail(valuesPath, `must name a column per output when a formula declares ${outputs.length} of them`);
    }
    columns[(outputs[0] as OutputPort).name] = readColumn(values, valuesPath);
  } else {
    const named = readObject(values, valuesPath);
    for (const [name, cells] of Object.entries(named)) {
      if (!outputs.some((port) => port.name === name)) {
        fail(join(valuesPath, name), `'${name}' is not a declared output`);
      }
      columns[name] = readColumn(cells, join(valuesPath, name));
    }
    for (const port of outputs) {
      if (columns[port.name] === undefined) fail(valuesPath, `has no column for output '${port.name}'`);
    }
  }
  return { axes, columns };
}

function serializeLookup(lookup: FormulaLookup): JsonObject {
  const names = Object.keys(lookup.columns);
  const only = names.length === 1 ? (names[0] as string) : undefined;
  return {
    axes: lookup.axes.map((axis) => ({
      input: axis.input,
      kind: axis.kind,
      values: [...axis.values],
      ...put('lowerExclusive', axis.lowerExclusive),
    })),
    values:
      only === undefined
        ? Object.fromEntries(names.map((name) => [name, [...(lookup.columns[name] as readonly (number | null)[])]]))
        : [...(lookup.columns[only] as readonly (number | null)[])],
  };
}

function parsePortNameList(value: JsonValue, path: string): readonly string[] {
  const names = readArray(value, path).map((entry, i) => readName(entry, `${path}[${i}]`));
  if (names.length === 0) fail(path, 'is empty');
  return names;
}

/**
 * Each entry is a spectrum or a plain numeric port — concatenated in the
 * order listed to build the full breakpoint/value arrays, so a support's
 * separately-computed reaction can join a load spectrum as one more
 * single-valued entry without depending on wire order (see
 * `FormulaPiecewise`'s docstring). Shared by `piecewise` and `deflection`
 * validation, since a deflection curve's breakpoints/values are the exact
 * same shape as a `cumulativeCubic` formula's.
 */
function checkNamedPorts(
  inputs: readonly Port[],
  names: readonly string[] | undefined,
  namesPath: string,
  wantDimension: Dimension | undefined,
  mismatch: string,
): void {
  for (const [i, name] of (names ?? []).entries()) {
    const entryPath = `${namesPath}[${i}]`;
    const port = inputs.find((candidate) => candidate.name === name);
    const dimension = port === undefined ? undefined : portDimension(port);
    if (port === undefined || (port.kind !== 'spectrum' && port.kind !== 'numeric') || dimension === undefined) {
      fail(entryPath, `'${name}' must be a declared spectrum or numeric input with a concrete unit`);
    } else if (wantDimension !== undefined && !dimensionsEqual(wantDimension, dimension)) {
      fail(entryPath, mismatch);
    }
  }
}

function parsePiecewise(value: JsonValue, path: string): FormulaPiecewise {
  const object = readObject(value, path);
  const kind = readEnum(required(object, 'kind', path), join(path, 'kind'), PIECEWISE_KINDS);
  const list = (name: string) => optional(object, name, path, (v, p) => parsePortNameList(v, p));
  return {
    kind,
    axis: readName(required(object, 'axis', path), join(path, 'axis')),
    ...put('breakpoints', list('breakpoints')),
    ...put('values', list('values')),
    ...put('distributedStart', list('distributedStart')),
    ...put('distributedEnd', list('distributedEnd')),
    ...put('distributedRate', list('distributedRate')),
  };
}

function serializePiecewise(piecewise: FormulaPiecewise): JsonObject {
  const list = (names: readonly string[] | undefined) => (names === undefined ? undefined : [...names]);
  return {
    kind: piecewise.kind,
    axis: piecewise.axis,
    ...put('breakpoints', list(piecewise.breakpoints)),
    ...put('values', list(piecewise.values)),
    ...put('distributedStart', list(piecewise.distributedStart)),
    ...put('distributedEnd', list(piecewise.distributedEnd)),
    ...put('distributedRate', list(piecewise.distributedRate)),
  };
}

function parseDeflection(value: JsonValue, path: string): FormulaDeflection {
  const object = readObject(value, path);
  const zeroAt = parsePortNameList(required(object, 'zeroAt', path), join(path, 'zeroAt'));
  if (zeroAt.length !== 2) fail(join(path, 'zeroAt'), `needs exactly two entries, one per support — has ${zeroAt.length}`);
  return {
    axis: readName(required(object, 'axis', path), join(path, 'axis')),
    breakpoints: parsePortNameList(required(object, 'breakpoints', path), join(path, 'breakpoints')),
    values: parsePortNameList(required(object, 'values', path), join(path, 'values')),
    zeroAt: [zeroAt[0] as string, zeroAt[1] as string],
    modulus: readName(required(object, 'modulus', path), join(path, 'modulus')),
    secondMomentOfArea: readName(required(object, 'secondMomentOfArea', path), join(path, 'secondMomentOfArea')),
  };
}

function serializeDeflection(deflection: FormulaDeflection): JsonObject {
  return {
    axis: deflection.axis,
    breakpoints: [...deflection.breakpoints],
    values: [...deflection.values],
    zeroAt: [...deflection.zeroAt],
    modulus: deflection.modulus,
    secondMomentOfArea: deflection.secondMomentOfArea,
  };
}

/** The quarantine gate: a quarantined formula cannot be evaluated, by anyone, ever. */
export function isEvaluable(formula: Formula): boolean {
  return formula.status !== 'quarantined';
}

/** Every port of a formula, outputs first — the order the editor draws them in. */
export function ports(formula: Formula): readonly Port[] {
  return [...formula.outputs, ...formula.inputs];
}

/** The lookup column answering for `name`, when a table answers for it at all. */
export function lookupColumn(formula: Formula, name: string): readonly (number | null)[] | undefined {
  return formula.lookup?.columns[name];
}

export function findInput(formula: Formula, name: string): Port | undefined {
  return formula.inputs.find((port) => port.name === name);
}

export function parseFormula(value: JsonValue, path: string): Formula {
  const object = readObject(value, path);
  const id = readName(required(object, 'id', path), join(path, 'id'));
  const version = readInteger(required(object, 'version', path), join(path, 'version'), 1);
  // One output is written bare, several as a list — the shape a catalogue was
  // always written in stays the shape it parses from.
  const declared = required(object, 'output', path);
  const outputs = (
    Array.isArray(declared)
      ? readArray(declared, join(path, 'output')).map((entry, i) =>
          asOutputPort(parsePort(entry, `${join(path, 'output')}[${i}]`), `${join(path, 'output')}[${i}]`),
        )
      : [asOutputPort(parsePort(declared, join(path, 'output')), join(path, 'output'))]
  );
  if (outputs.length === 0) fail(join(path, 'output'), 'is empty — a formula answers with something');

  const inputs = readArray(required(object, 'inputs', path), join(path, 'inputs')).map((entry, i) =>
    asInputPort(parsePort(entry, `${join(path, 'inputs')}[${i}]`), `${join(path, 'inputs')}[${i}]`),
  );

  // A generic output can only be built from variables the inputs bind.
  const bound = new Set(inputs.flatMap(portVariables));
  for (const [i, output] of outputs.entries()) {
    if (output.kind !== 'numeric' || !isGenericDimension(output.unit)) continue;
    const unitPath = outputs.length === 1 ? join(path, 'output.unit') : `${join(path, 'output')}[${i}].unit`;
    for (const name of genericVariables(output.unit)) {
      if (!bound.has(name)) fail(unitPath, `'$${name}' is not bound by any input port`);
    }
  }

  const seen = new Set<string>();
  for (const [i, port] of outputs.entries()) {
    if (seen.has(port.name)) {
      fail(outputs.length === 1 ? join(path, 'output.name') : `${join(path, 'output')}[${i}].name`, `'${port.name}' is declared twice`);
    }
    seen.add(port.name);
  }
  for (const [i, port] of inputs.entries()) {
    if (seen.has(port.name)) {
      fail(`${join(path, 'inputs')}[${i}].name`, `'${port.name}' is declared twice`);
    }
    seen.add(port.name);
  }

  const lookup = optional(object, 'lookup', path, (value_, path_) => parseLookup(value_, path_, outputs));

  // A table-backed formula needs no expression: its columns are read in the
  // units its outputs declare, which is all an expression was ever there to
  // state. Everything else must still say how it computes.
  const expression = optional(object, 'expression', path, readString);
  if (expression !== undefined && expression.trim().length === 0) fail(join(path, 'expression'), 'is empty');
  if (expression === undefined && lookup === undefined) {
    fail(join(path, 'expression'), 'is required unless a lookup answers for every output');
  }

  if (lookup !== undefined) {
    for (const [i, output] of outputs.entries()) {
      if (output.kind !== 'numeric' || isGenericDimension(output.unit)) {
        fail(outputs.length === 1 ? join(path, 'output') : `${join(path, 'output')}[${i}]`, 'a lookup needs a concrete numeric output');
      }
    }
    const seenAxes = new Set<string>();
    for (const [i, axis] of lookup.axes.entries()) {
      const axisPath = `${join(path, 'lookup.axes')}[${i}]`;
      if (seenAxes.has(axis.input)) fail(join(axisPath, 'input'), `'${axis.input}' is listed twice`);
      seenAxes.add(axis.input);
      const port = inputs.find((candidate) => candidate.name === axis.input);
      if (port === undefined) fail(join(axisPath, 'input'), `'${axis.input}' is not a declared input`);
      if (axis.kind === 'numeric') {
        if (port.kind !== 'numeric' || isGenericDimension(port.unit)) {
          fail(axisPath, 'a numeric lookup axis needs a concrete numeric input');
        }
        for (let j = 1; j < axis.values.length; j += 1) {
          if ((axis.values[j] as number) <= (axis.values[j - 1] as number)) {
            fail(join(axisPath, 'values'), 'must be strictly increasing');
          }
        }
      } else {
        if (port.kind !== 'categorical') fail(axisPath, 'a categorical lookup axis needs a categorical input');
        const outside = axis.values.find((entry) => !port.domain.includes(entry as string));
        if (outside !== undefined) fail(join(axisPath, 'values'), `'${outside}' is outside the input domain`);
      }
    }
  }

  const piecewise = optional(object, 'piecewise', path, parsePiecewise);
  if (piecewise !== undefined) {
    if (lookup !== undefined) fail(join(path, 'piecewise'), 'cannot accompany a lookup — a formula is one or the other');
    if (outputs.length !== 1) fail(join(path, 'piecewise'), 'answers with one curve, so its formula declares one output');
    const output = outputs[0] as OutputPort;
    const outputDimension = portDimension(output);
    if (outputDimension === undefined) {
      fail(join(path, 'output'), 'a piecewise formula needs a concrete numeric output');
    }
    const axisPort = inputs.find((candidate) => candidate.name === piecewise.axis);
    const axisDimension = axisPort === undefined ? undefined : portDimension(axisPort);
    if (axisPort === undefined || axisPort.kind !== 'numeric' || axisDimension === undefined) {
      fail(join(path, 'piecewise.axis'), `'${piecewise.axis}' must be a declared input with a concrete numeric unit`);
    }
    const checkNames = (names: readonly string[] | undefined, namesPath: string, wantDimension: Dimension | undefined, mismatch: string): void =>
      checkNamedPorts(inputs, names, namesPath, wantDimension, mismatch);
    if ((piecewise.breakpoints === undefined) !== (piecewise.values === undefined)) {
      fail(join(path, 'piecewise'), 'breakpoints and values must be declared together, or not at all');
    }
    const distributedFields = [piecewise.distributedStart, piecewise.distributedEnd, piecewise.distributedRate];
    if (distributedFields.some((field) => field !== undefined) && distributedFields.some((field) => field === undefined)) {
      fail(join(path, 'piecewise'), 'distributedStart, distributedEnd and distributedRate must be declared together, or not at all');
    }
    if (piecewise.kind === 'cumulativeCubic' && distributedFields.some((field) => field !== undefined)) {
      fail(join(path, 'piecewise'), "a distributed load's cumulativeCubic contribution is not implemented — leave distributedStart/End/Rate off");
    }
    if (piecewise.breakpoints === undefined && piecewise.distributedStart === undefined) {
      fail(join(path, 'piecewise'), 'needs breakpoints/values, distributedStart/End/Rate, or both');
    }
    checkNames(piecewise.breakpoints, join(path, 'piecewise.breakpoints'), axisDimension, `must share '${piecewise.axis}''s dimension`);
    // `cumulativeStep`'s output is a plain total of `values`, so they share a
    // dimension. `cumulativeMoment`'s output is `Σ value·(axis − breakpoint)`,
    // so `values` carries the output's dimension divided by `axis`'s instead
    // — force in, force·length out, for a breakpoint measured in length.
    // `cumulativeCubic`'s output is `Σ value·(axis − breakpoint)³`, so
    // `values` carries the output's dimension divided by `axis`'s, cubed.
    const valuesDimension =
      outputDimension === undefined || axisDimension === undefined
        ? outputDimension
        : piecewise.kind === 'cumulativeMoment'
          ? divideDimensions(outputDimension, axisDimension)
          : piecewise.kind === 'cumulativeCubic'
            ? divideDimensions(outputDimension, powerDimension(axisDimension, 3))
            : outputDimension;
    const valuesMismatch =
      piecewise.kind === 'cumulativeMoment'
        ? `must have the output's dimension divided by '${piecewise.axis}''s`
        : piecewise.kind === 'cumulativeCubic'
          ? `must have the output's dimension divided by '${piecewise.axis}''s, cubed`
          : "must share the output's dimension";
    checkNames(piecewise.values, join(path, 'piecewise.values'), valuesDimension, valuesMismatch);

    checkNames(piecewise.distributedStart, join(path, 'piecewise.distributedStart'), axisDimension, `must share '${piecewise.axis}''s dimension`);
    checkNames(piecewise.distributedEnd, join(path, 'piecewise.distributedEnd'), axisDimension, `must share '${piecewise.axis}''s dimension`);
    // A rate is `values`' dimension per unit of axis, whichever kind this is
    // — a rectangular load's own rectangle, before either kind integrates it
    // further (`values`' dimension already carries the kind-specific
    // adjustment above: force for cumulativeStep, force per axis-unit —
    // i.e. this same rate dimension — for cumulativeMoment).
    const rateDimension =
      valuesDimension !== undefined && axisDimension !== undefined ? divideDimensions(valuesDimension, axisDimension) : undefined;
    const rateMismatch =
      piecewise.kind === 'cumulativeMoment'
        ? `must have the output's dimension divided by '${piecewise.axis}''s, squared`
        : `must have the output's dimension divided by '${piecewise.axis}''s`;
    checkNames(piecewise.distributedRate, join(path, 'piecewise.distributedRate'), rateDimension, rateMismatch);
  }

  const deflection = optional(object, 'deflection', path, parseDeflection);
  if (deflection !== undefined) {
    if (lookup !== undefined) fail(join(path, 'deflection'), 'cannot accompany a lookup — a formula is one or the other');
    if (piecewise !== undefined) fail(join(path, 'deflection'), 'cannot accompany a piecewise evaluator — a formula is one or the other');
    if (outputs.length !== 1) fail(join(path, 'deflection'), 'answers with one curve, so its formula declares one output');
    const output = outputs[0] as OutputPort;
    const outputDimension = portDimension(output);
    if (outputDimension === undefined) {
      fail(join(path, 'output'), 'a deflection formula needs a concrete numeric output');
    }
    const axisPort = inputs.find((candidate) => candidate.name === deflection.axis);
    const axisDimension = axisPort === undefined ? undefined : portDimension(axisPort);
    if (axisPort === undefined || axisPort.kind !== 'numeric' || axisDimension === undefined) {
      fail(join(path, 'deflection.axis'), `'${deflection.axis}' must be a declared input with a concrete numeric unit`);
    }
    const namedScalar = (name: string, namePath: string): Dimension | undefined => {
      const port = inputs.find((candidate) => candidate.name === name);
      const dimension = port === undefined ? undefined : portDimension(port);
      if (port === undefined || port.kind !== 'numeric' || dimension === undefined) {
        fail(namePath, `'${name}' must be a declared numeric input with a concrete unit`);
      }
      return dimension;
    };
    const [zeroAtA, zeroAtB] = deflection.zeroAt;
    if (zeroAtA === zeroAtB) fail(join(path, 'deflection.zeroAt'), 'names the same input twice — two different supports are needed');
    for (const [i, name] of deflection.zeroAt.entries()) {
      const dimension = namedScalar(name, `${join(path, 'deflection.zeroAt')}[${i}]`);
      if (dimension !== undefined && axisDimension !== undefined && !dimensionsEqual(dimension, axisDimension)) {
        fail(`${join(path, 'deflection.zeroAt')}[${i}]`, `must share '${deflection.axis}''s dimension`);
      }
    }
    const modulusDimension = namedScalar(deflection.modulus, join(path, 'deflection.modulus'));
    const secondMomentDimension = namedScalar(deflection.secondMomentOfArea, join(path, 'deflection.secondMomentOfArea'));

    checkNamedPorts(inputs, deflection.breakpoints, join(path, 'deflection.breakpoints'), axisDimension, `must share '${deflection.axis}''s dimension`);
    // `y = (Σ value·(axis − breakpoint)³ / 6 + C₁·axis + C₂) / (modulus ×
    // secondMomentOfArea)`, so the sum — and so `values` — carries the
    // output's dimension times modulus's and secondMomentOfArea's, divided
    // by axis's cubed (the exact `cumulativeCubic` relation, with the
    // modulus/section product folded into the output side).
    const valuesDimension =
      outputDimension === undefined || axisDimension === undefined || modulusDimension === undefined || secondMomentDimension === undefined
        ? undefined
        : divideDimensions(multiplyDimensions(outputDimension, multiplyDimensions(modulusDimension, secondMomentDimension)), powerDimension(axisDimension, 3));
    checkNamedPorts(
      inputs, deflection.values, join(path, 'deflection.values'), valuesDimension,
      `must have the output's dimension times '${deflection.modulus}''s and '${deflection.secondMomentOfArea}''s, divided by '${deflection.axis}''s cubed`,
    );
  }

  const status = readEnum(required(object, 'status', path), join(path, 'status'), FORMULA_STATUSES);
  const quarantineReason = optional(object, 'quarantineReason', path, parseLocalizedText);
  if (status === 'quarantined' && quarantineReason === undefined) {
    fail(join(path, 'quarantineReason'), 'is required when a formula is quarantined');
  }

  return {
    id,
    version,
    outputs,
    inputs,
    ...put('expression', expression),
    ...put('lookup', lookup),
    ...put('piecewise', piecewise),
    ...put('deflection', deflection),
    description: parseLocalizedText(required(object, 'description', path), join(path, 'description')),
    ...put('label', optional(object, 'label', path, parseLocalizedText)),
    ...put('citation', optional(object, 'citation', path, readString)),
    ...put('variantOf', optional(object, 'variantOf', path, readName)),
    ...put('appliesWhen', optional(object, 'appliesWhen', path, readName)),
    status,
    ...put('quarantineReason', quarantineReason),
  };
}

/**
 * One output serializes to the bare object it has always been, so a record
 * that gained nothing does not read — or hash — as though it changed.
 */
function serializeOutputs(outputs: readonly OutputPort[], port: (value: OutputPort) => JsonObject): JsonValue {
  return outputs.length === 1 ? port(outputs[0] as OutputPort) : outputs.map(port);
}

export function serializeFormula(formula: Formula): JsonObject {
  return {
    id: formula.id,
    version: formula.version,
    output: serializeOutputs(formula.outputs, serializePort),
    inputs: formula.inputs.map(serializePort),
    ...put('expression', formula.expression),
    ...put('lookup', formula.lookup === undefined ? undefined : serializeLookup(formula.lookup)),
    ...put('piecewise', formula.piecewise === undefined ? undefined : serializePiecewise(formula.piecewise)),
    ...put('deflection', formula.deflection === undefined ? undefined : serializeDeflection(formula.deflection)),
    ...(formula.label === undefined ? {} : { label: serializeLocalizedText(formula.label) }),
    description: serializeLocalizedText(formula.description),
    ...put('citation', formula.citation),
    ...put('variantOf', formula.variantOf),
    ...put('appliesWhen', formula.appliesWhen),
    status: formula.status,
    ...(formula.quarantineReason === undefined
      ? {}
      : { quarantineReason: serializeLocalizedText(formula.quarantineReason) }),
  };
}

/**
 * `formulaHash` results, keyed by the `Formula` object itself — every caller
 * in this codebase holds formulas as the stable references a catalogue was
 * parsed into once, never rebuilt per call, so identity is a safe cache key.
 *
 * `matchRef` calls this on every formula-kind node on every `resolveGraph`
 * (`packages/kernel/src/graph.ts`'s `lookupFormula`) — every edit, not just
 * a document's initial load. A lookup formula's `values` array can run to
 * tens of thousands of entries (`packages/nodes/src/iso286.ts`'s hole/shaft
 * deviation tables); re-serializing and re-hashing that on every keystroke,
 * for every node that references it, is exactly the redundant work a
 * WeakMap avoids — the record a formula hashes to cannot change without the
 * catalogue itself reloading into fresh objects, which invalidates the
 * cache for free (a new `Formula` object is a new key).
 */
const HASH_CACHE = new WeakMap<Formula, string>();

/** The content hash, taken over the serialized record. */
export function formulaHash(formula: Formula): string {
  const cached = HASH_CACHE.get(formula);
  if (cached !== undefined) return cached;

  // A graph reference pins calculation semantics, not words shown to a reader.
  // Catalogue translators must be able to correct text without invalidating
  // students' saved graphs.
  const withoutText = (port: Port): JsonObject => {
    const { description: _description, ...semantic } = serializePort(port);
    return semantic;
  };
  const hash = hashRecord({
    id: formula.id,
    version: formula.version,
    output: serializeOutputs(formula.outputs, withoutText),
    inputs: formula.inputs.map(withoutText),
    ...put('expression', formula.expression),
    ...put('lookup', formula.lookup === undefined ? undefined : serializeLookup(formula.lookup)),
    ...put('piecewise', formula.piecewise === undefined ? undefined : serializePiecewise(formula.piecewise)),
    ...put('deflection', formula.deflection === undefined ? undefined : serializeDeflection(formula.deflection)),
    ...put('citation', formula.citation),
    ...put('variantOf', formula.variantOf),
    ...put('appliesWhen', formula.appliesWhen),
    status: formula.status,
  });
  HASH_CACHE.set(formula, hash);
  return hash;
}

/**
 * How a graph names a formula: id, version and hash, **never the formula
 * itself**. Graph files circulate — email, git, hand-ins — so an embedded
 * expression would carry restricted content straight past the repository
 * boundary. The cost is that a graph needs its catalogue to open, which
 * is the deliberate trade.
 */
export interface FormulaRef {
  readonly id: string;
  readonly version: number;
  readonly hash: string;
}

export function formulaRef(formula: Formula): FormulaRef {
  return { id: formula.id, version: formula.version, hash: formulaHash(formula) };
}

export function parseFormulaRef(value: JsonValue, path: string): FormulaRef {
  const object = readObject(value, path);
  return {
    id: readName(required(object, 'id', path), join(path, 'id')),
    version: readInteger(required(object, 'version', path), join(path, 'version'), 1),
    hash: readName(required(object, 'hash', path), join(path, 'hash')),
  };
}

export function serializeFormulaRef(ref: FormulaRef): JsonObject {
  return { id: ref.id, version: ref.version, hash: ref.hash };
}

/**
 * Three answers, not two. A graph that opens against a *changed* formula must
 * say so rather than recompute silently, and that is a different situation from
 * the formula being missing altogether.
 */
export type RefMatch = 'match' | 'changed' | 'missing';

export function matchRef(ref: FormulaRef, formula: Formula | undefined): RefMatch {
  if (formula === undefined || formula.id !== ref.id) return 'missing';
  if (formula.version !== ref.version || formulaHash(formula) !== ref.hash) return 'changed';
  return 'match';
}

/**
 * A catalogue is just a file of formulas. `restricted` is the honest label
 * on one: the R&M catalogue is marked so the app can refuse to put its
 * expressions into an export. It is a statement of intent inside the app,
 * not the enforcement — the enforcement is the repository boundary.
 */
export interface Catalogue {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: LocalizedText;
  readonly restricted: boolean;
  readonly formulas: readonly Formula[];
}

export function parseCatalogue(value: JsonValue, path = ''): Catalogue {
  const object = readObject(value, path);
  const schemaVersion = readSchemaVersion(object, path);
  const formulas = readArray(required(object, 'formulas', path), join(path, 'formulas')).map(
    (entry, i) => parseFormula(entry, `${join(path, 'formulas')}[${i}]`),
  );

  const seen = new Set<string>();
  for (const [i, formula] of formulas.entries()) {
    if (seen.has(formula.id)) {
      fail(`${join(path, 'formulas')}[${i}].id`, `'${formula.id}' appears twice in this catalogue`);
    }
    seen.add(formula.id);
  }

  return {
    schemaVersion,
    id: readName(required(object, 'id', path), join(path, 'id')),
    name: parseLocalizedText(required(object, 'name', path), join(path, 'name')),
    restricted: readBoolean(required(object, 'restricted', path), join(path, 'restricted')),
    formulas,
  };
}

export function serializeCatalogue(catalogue: Catalogue): JsonObject {
  return {
    schemaVersion: catalogue.schemaVersion,
    id: catalogue.id,
    name: serializeLocalizedText(catalogue.name),
    restricted: catalogue.restricted,
    formulas: catalogue.formulas.map(serializeFormula),
  };
}

/** Look a reference up the way the editor does: by id, then check it matches. */
export function findFormula(catalogue: Catalogue, id: string): Formula | undefined {
  return catalogue.formulas.find((formula) => formula.id === id);
}
