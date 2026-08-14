/**
 * The formula record — the thing this whole project is a contract around.
 *
 * A formula is **data, not code** (S4): one output port, its input ports, an
 * expression as a string, and the metadata that makes it citable, checkable and
 * quarantinable. The expression stays a string here and is parsed by the kernel
 * (S34) — this package never evaluates and never compiles, and above all never
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
  readObject,
  readString,
  required,
  type JsonObject,
  type JsonValue,
} from './json.js';
import { hashRecord } from './hash.js';
import {
  asInputPort,
  asOutputPort,
  parsePort,
  serializePort,
  type OutputPort,
  type Port,
} from './port.js';
import { readSchemaVersion } from './version.js';
import { genericVariables, isGenericDimension } from '@mds/units';

/** The dimension variables a port mentions — none, unless it is generic (S59). */
function portVariables(port: Port): readonly string[] {
  if (port.kind === 'categorical' || !isGenericDimension(port.unit)) return [];
  return genericVariables(port.unit);
}

/**
 * S19/S20. `verified` means a golden value exercises it and the result matched;
 * `unverified` is the honest default for everything no golden path touches;
 * `quarantined` cannot be evaluated at all — a known defect, or a unit tag that
 * could not be resolved. Quarantine is visible rather than silently dropped,
 * which is the whole difference from the predecessor library.
 */
export const FORMULA_STATUSES = ['verified', 'unverified', 'quarantined'] as const;
export type FormulaStatus = (typeof FORMULA_STATUSES)[number];

export interface Formula {
  /** Stable within its catalogue — the migration writes it from the method name. */
  readonly id: string;
  /** Bumped whenever the record changes meaning. Part of a graph's reference (S23). */
  readonly version: number;
  readonly output: OutputPort;
  readonly inputs: readonly Port[];
  /** Parsed and compiled by the kernel, never here (S34). */
  readonly expression: string;
  readonly description: string;
  /** `R&M 17.1B`. Absent on the base node library, which cites nothing (S42). */
  readonly citation?: string;
  /** Groups the rearranged forms of one relation (S17). */
  readonly variantOf?: string;
  /**
   * The condition under which this form applies, as a predicate over its own
   * input ports (S39/S40) — `D_A < d_w`. R&M states these in prose and the
   * predecessor library never read them, so a student could use a variant
   * outside its range and get a confident wrong number. Using a formula outside
   * it warns; it does not block.
   */
  readonly appliesWhen?: string;
  readonly status: FormulaStatus;
  /** Why it is quarantined. Required when it is, so the UI has something to show. */
  readonly quarantineReason?: string;
}

/** S19's gate: a quarantined formula cannot be evaluated, by anyone, ever. */
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

  // A generic output can only be built from variables the inputs bind (S59).
  if (output.kind === 'numeric' && isGenericDimension(output.unit)) {
    const bound = new Set(inputs.flatMap(portVariables));
    for (const name of genericVariables(output.unit)) {
      if (!bound.has(name)) {
        fail(join(path, 'output.unit'), `'$${name}' is not bound by any input port (S59)`);
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

  const status = readEnum(required(object, 'status', path), join(path, 'status'), FORMULA_STATUSES);
  const quarantineReason = optional(object, 'quarantineReason', path, readString);
  if (status === 'quarantined' && quarantineReason === undefined) {
    fail(join(path, 'quarantineReason'), 'is required when a formula is quarantined (S19)');
  }

  return {
    id,
    version,
    output,
    inputs,
    expression,
    description: readString(required(object, 'description', path), join(path, 'description')),
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
    description: formula.description,
    ...put('citation', formula.citation),
    ...put('variantOf', formula.variantOf),
    ...put('appliesWhen', formula.appliesWhen),
    status: formula.status,
    ...put('quarantineReason', formula.quarantineReason),
  };
}

/** The content hash of S23, taken over the serialized record. */
export function formulaHash(formula: Formula): string {
  return hashRecord(serializeFormula(formula));
}

/**
 * How a graph names a formula: id, version and hash, **never the formula
 * itself** (S23). Graph files circulate — email, git, hand-ins — so an embedded
 * expression would carry restricted content straight past the repository
 * boundary of S45. The cost is that a graph needs its catalogue to open, which
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
 * A catalogue is just a file of formulas (S10). `restricted` is the honest label
 * on one: the R&M catalogue is marked so the app can refuse to put its
 * expressions into an export (S32). It is a statement of intent inside the app,
 * not the enforcement — the enforcement is the repository boundary of S45.
 */
export interface Catalogue {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
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
    name: readString(required(object, 'name', path), join(path, 'name')),
    restricted: readBoolean(required(object, 'restricted', path), join(path, 'restricted')),
    formulas,
  };
}

export function serializeCatalogue(catalogue: Catalogue): JsonObject {
  return {
    schemaVersion: catalogue.schemaVersion,
    id: catalogue.id,
    name: catalogue.name,
    restricted: catalogue.restricted,
    formulas: catalogue.formulas.map(serializeFormula),
  };
}

/** Look a reference up the way the editor does: by id, then check it matches. */
export function findFormula(catalogue: Catalogue, id: string): Formula | undefined {
  return catalogue.formulas.find((formula) => formula.id === id);
}
