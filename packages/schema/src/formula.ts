/**
 * The formula record — the thing this whole project is a contract around.
 *
 * A formula is **data, not code**: one output port, its input ports, an
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
import { dimensionsEqual, divideDimensions, genericVariables, isGenericDimension, type Dimension } from '@joveworks/units';

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
  /** Values in the formula output's declared unit. `null` means undefined. */
  readonly values: readonly (number | null)[];
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
 */
export const PIECEWISE_KINDS = ['cumulativeStep', 'cumulativeMoment'] as const;
export type PiecewiseKind = (typeof PIECEWISE_KINDS)[number];

export interface FormulaPiecewise {
  readonly kind: PiecewiseKind;
  /** Name of the declared numeric input evaluated against each breakpoint. */
  readonly axis: string;
  /** Declared spectrum/numeric input(s) holding each breakpoint's position, in `axis`'s dimension. */
  readonly breakpoints: readonly string[];
  /** Declared spectrum/numeric input(s) holding the value added at each breakpoint, in the output's dimension. */
  readonly values: readonly string[];
}

export interface Formula {
  /** Stable within its catalogue — the migration writes it from the method name. */
  readonly id: string;
  /** Bumped whenever the record changes meaning. Part of a graph's reference. */
  readonly version: number;
  readonly output: OutputPort;
  readonly inputs: readonly Port[];
  /** Parsed and compiled by the kernel, never here. */
  readonly expression: string;
  /** Optional table-backed evaluator. The expression still declares/checks dimensions. */
  readonly lookup?: FormulaLookup;
  /** Optional piecewise evaluator, mutually exclusive with `lookup`. Same role: the expression still declares/checks dimensions. */
  readonly piecewise?: FormulaPiecewise;
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

function parseLookup(value: JsonValue, path: string): FormulaLookup {
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
  const values = readArray(required(object, 'values', path), join(path, 'values')).map((cell, i) =>
    cell === null ? null : readNumber(cell, `${join(path, 'values')}[${i}]`),
  );
  const expected = axes.reduce((size, axis) => size * axis.values.length, 1);
  if (values.length !== expected) fail(join(path, 'values'), `has ${values.length} entries; axes require ${expected}`);
  return { axes, values };
}

function serializeLookup(lookup: FormulaLookup): JsonObject {
  return {
    axes: lookup.axes.map((axis) => ({
      input: axis.input,
      kind: axis.kind,
      values: [...axis.values],
      ...put('lowerExclusive', axis.lowerExclusive),
    })),
    values: [...lookup.values],
  };
}

function parsePortNameList(value: JsonValue, path: string): readonly string[] {
  const names = readArray(value, path).map((entry, i) => readName(entry, `${path}[${i}]`));
  if (names.length === 0) fail(path, 'is empty');
  return names;
}

function parsePiecewise(value: JsonValue, path: string): FormulaPiecewise {
  const object = readObject(value, path);
  const kind = readEnum(required(object, 'kind', path), join(path, 'kind'), PIECEWISE_KINDS);
  return {
    kind,
    axis: readName(required(object, 'axis', path), join(path, 'axis')),
    breakpoints: parsePortNameList(required(object, 'breakpoints', path), join(path, 'breakpoints')),
    values: parsePortNameList(required(object, 'values', path), join(path, 'values')),
  };
}

function serializePiecewise(piecewise: FormulaPiecewise): JsonObject {
  return {
    kind: piecewise.kind,
    axis: piecewise.axis,
    breakpoints: [...piecewise.breakpoints],
    values: [...piecewise.values],
  };
}

/** The quarantine gate: a quarantined formula cannot be evaluated, by anyone, ever. */
export function isEvaluable(formula: Formula): boolean {
  return formula.status !== 'quarantined';
}

/** Every port of a formula, output first — the order the editor draws them in. */
export function ports(formula: Formula): readonly Port[] {
  return [formula.output, ...formula.inputs];
}

export function findInput(formula: Formula, name: string): Port | undefined {
  return formula.inputs.find((port) => port.name === name);
}

export function parseFormula(value: JsonValue, path: string): Formula {
  const object = readObject(value, path);
  const id = readName(required(object, 'id', path), join(path, 'id'));
  const version = readInteger(required(object, 'version', path), join(path, 'version'), 1);
  const output = asOutputPort(
    parsePort(required(object, 'output', path), join(path, 'output')),
    join(path, 'output'),
  );

  const inputs = readArray(required(object, 'inputs', path), join(path, 'inputs')).map((entry, i) =>
    asInputPort(parsePort(entry, `${join(path, 'inputs')}[${i}]`), `${join(path, 'inputs')}[${i}]`),
  );

  // A generic output can only be built from variables the inputs bind.
  if (output.kind === 'numeric' && isGenericDimension(output.unit)) {
    const bound = new Set(inputs.flatMap(portVariables));
    for (const name of genericVariables(output.unit)) {
      if (!bound.has(name)) {
        fail(join(path, 'output.unit'), `'$${name}' is not bound by any input port`);
      }
    }
  }

  const seen = new Set([output.name]);
  for (const [i, port] of inputs.entries()) {
    if (seen.has(port.name)) {
      fail(`${join(path, 'inputs')}[${i}].name`, `'${port.name}' is declared twice`);
    }
    seen.add(port.name);
  }

  const expression = readString(required(object, 'expression', path), join(path, 'expression'));
  if (expression.trim().length === 0) fail(join(path, 'expression'), 'is empty');
  const lookup = optional(object, 'lookup', path, parseLookup);
  if (lookup !== undefined) {
    if (output.kind !== 'numeric' || isGenericDimension(output.unit)) {
      fail(join(path, 'output'), 'a lookup needs a concrete numeric output');
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
    const outputDimension = portDimension(output);
    if (outputDimension === undefined) {
      fail(join(path, 'output'), 'a piecewise formula needs a concrete numeric output');
    }
    const axisPort = inputs.find((candidate) => candidate.name === piecewise.axis);
    const axisDimension = axisPort === undefined ? undefined : portDimension(axisPort);
    if (axisPort === undefined || axisPort.kind !== 'numeric' || axisDimension === undefined) {
      fail(join(path, 'piecewise.axis'), `'${piecewise.axis}' must be a declared input with a concrete numeric unit`);
    }
    // Each entry is a spectrum or a plain numeric port — concatenated in the
    // order listed to build the full breakpoint/value arrays, so a support's
    // separately-computed reaction can join a load spectrum as one more
    // single-valued entry without depending on wire order (see the
    // `FormulaPiecewise` docstring).
    const checkNames = (names: readonly string[], namesPath: string, wantDimension: Dimension | undefined, mismatch: string): void => {
      for (const [i, name] of names.entries()) {
        const entryPath = `${namesPath}[${i}]`;
        const port = inputs.find((candidate) => candidate.name === name);
        const dimension = port === undefined ? undefined : portDimension(port);
        if (port === undefined || (port.kind !== 'spectrum' && port.kind !== 'numeric') || dimension === undefined) {
          fail(entryPath, `'${name}' must be a declared spectrum or numeric input with a concrete unit`);
        } else if (wantDimension !== undefined && !dimensionsEqual(wantDimension, dimension)) {
          fail(entryPath, mismatch);
        }
      }
    };
    checkNames(piecewise.breakpoints, join(path, 'piecewise.breakpoints'), axisDimension, `must share '${piecewise.axis}''s dimension`);
    // `cumulativeStep`'s output is a plain total of `values`, so they share a
    // dimension. `cumulativeMoment`'s output is `Σ value·(axis − breakpoint)`,
    // so `values` carries the output's dimension divided by `axis`'s instead
    // — force in, force·length out, for a breakpoint measured in length.
    const valuesDimension =
      piecewise.kind === 'cumulativeMoment' && outputDimension !== undefined && axisDimension !== undefined
        ? divideDimensions(outputDimension, axisDimension)
        : outputDimension;
    const valuesMismatch =
      piecewise.kind === 'cumulativeMoment'
        ? `must have the output's dimension divided by '${piecewise.axis}''s`
        : "must share the output's dimension";
    checkNames(piecewise.values, join(path, 'piecewise.values'), valuesDimension, valuesMismatch);
  }

  const status = readEnum(required(object, 'status', path), join(path, 'status'), FORMULA_STATUSES);
  const quarantineReason = optional(object, 'quarantineReason', path, parseLocalizedText);
  if (status === 'quarantined' && quarantineReason === undefined) {
    fail(join(path, 'quarantineReason'), 'is required when a formula is quarantined');
  }

  return {
    id,
    version,
    output,
    inputs,
    expression,
    ...put('lookup', lookup),
    ...put('piecewise', piecewise),
    description: parseLocalizedText(required(object, 'description', path), join(path, 'description')),
    ...put('label', optional(object, 'label', path, parseLocalizedText)),
    ...put('citation', optional(object, 'citation', path, readString)),
    ...put('variantOf', optional(object, 'variantOf', path, readName)),
    ...put('appliesWhen', optional(object, 'appliesWhen', path, readName)),
    status,
    ...put('quarantineReason', quarantineReason),
  };
}

export function serializeFormula(formula: Formula): JsonObject {
  return {
    id: formula.id,
    version: formula.version,
    output: serializePort(formula.output),
    inputs: formula.inputs.map(serializePort),
    expression: formula.expression,
    ...put('lookup', formula.lookup === undefined ? undefined : serializeLookup(formula.lookup)),
    ...put('piecewise', formula.piecewise === undefined ? undefined : serializePiecewise(formula.piecewise)),
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
    output: withoutText(formula.output),
    inputs: formula.inputs.map(withoutText),
    expression: formula.expression,
    ...put('lookup', formula.lookup === undefined ? undefined : serializeLookup(formula.lookup)),
    ...put('piecewise', formula.piecewise === undefined ? undefined : serializePiecewise(formula.piecewise)),
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
