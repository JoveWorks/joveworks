/**
 * A formula record, made ready to evaluate: the quarantine gate, the dimension check,
 * and the compiled closures.
 *
 * **The gate comes first.** A quarantined formula cannot be evaluated, by
 * anyone, ever — not by the editor, not by a test, not by a graph that already
 * had it wired. That is the promise the predecessor library could not make, and
 * it is one line here because `status` was made part of the record rather than a
 * note in a document.
 *
 * The dimension check is the other half, and it is deliberately *not* behind the
 * gate: a quarantined formula is still worth checking, since that is one of the
 * ways a record earns its way out of quarantine.
 *
 * It answers for a generic record too, by binding each dimension variable to a
 * **distinct base dimension**. That is not sampling: exponent arithmetic is
 * linear, so agreeing on a basis is agreeing everywhere. It is why `multiply`
 * can be checked once rather than argued about.
 */

import {
  BASE_DIMENSIONS,
  dimension as makeDimension,
  describeDimension,
  isGenericDimension,
  resolveGeneric,
  type BaseDimension,
  type Dimension,
} from '@joveworks/units';
import {
  appliesWhenOf,
  expressionOf,
  isEvaluable,
  localize,
  type Formula,
  type Port,
} from '@joveworks/schema';

import {
  checkPredicateDimensions,
  compileExpression,
  compilePredicate,
  expressionDimension,
  type CompiledExpression,
  type CompiledPredicate,
  type DimensionScope,
} from './compile.js';
import { dimensionsClose } from './dimensions.js';
import { KernelError } from './errors.js';
import { parseExpression, parsePredicate } from './parse.js';

/** The quarantine gate, stated once so every path through the kernel uses the same one. */
export function assertEvaluable(formula: Formula, where?: string): void {
  if (isEvaluable(formula)) return;
  throw new KernelError(
    `'${formula.id}' is quarantined and cannot be evaluated: ` +
      `${formula.quarantineReason === undefined ? 'no reason recorded' : localize(formula.quarantineReason, 'en')}`,
    where,
  );
}

export interface CompiledFormula {
  readonly formula: Formula;
  /** One per output that an expression answers for; empty when a table answers for every one. */
  readonly evaluate: ReadonlyMap<string, CompiledExpression>;
  /** The condition R&M states in prose, per output the record states one for. */
  readonly appliesWhen: ReadonlyMap<string, CompiledPredicate>;
  /** Every input port's dimension under this node's bindings. */
  readonly scope: DimensionScope;
}

type Bindings = Readonly<Record<string, Dimension>>;

/**
 * Compile a formula for one node's bindings.
 *
 * Bindings matter because a generic port has no dimension of its own: the
 * same `add` record compiles against forces on one node and against lengths on
 * another, and the check has to be made against what this node is wired to.
 */
export function compileFormula(
  formula: Formula,
  bindings: ReadonlyMap<string, Dimension>,
  where?: string,
): CompiledFormula {
  assertEvaluable(formula, where);
  const scope = checkRecord(formula, Object.fromEntries(bindings), where ?? formula.id);
  return {
    formula,
    scope,
    evaluate: compilePerOutput(formula, where, (name) => expressionOf(formula, name), compileExpression),
    appliesWhen: compilePerOutput(formula, where, (name) => appliesWhenOf(formula, name), compilePredicate),
  };
}

/**
 * One compiled thing per output that declares one — outputs a table answers
 * for contribute nothing, and neither do outputs with no condition on them.
 */
function compilePerOutput<T>(
  formula: Formula,
  where: string | undefined,
  source: (output: string) => string | undefined,
  compile: (text: string, where: string) => T,
): ReadonlyMap<string, T> {
  const compiled = new Map<string, T>();
  for (const output of formula.outputs) {
    const text = source(output.name);
    if (text !== undefined) compiled.set(output.name, compile(text, where ?? formula.id));
  }
  return compiled;
}

/**
 * Compile a closure node's derived formula. Its declared output (`closure.ts`:
 * an inert `$result` placeholder) has nothing real to check the expression
 * against — the dimension it actually produces was already proven live in
 * `graph.ts`'s own resolution pass, against this node's real wiring, so
 * `checkRecord`'s declared-vs-produced comparison is skipped rather than
 * made to fail on a template that was never meant to be resolved.
 */
export function compileClosureFormula(formula: Formula, where?: string): CompiledFormula {
  return {
    formula,
    scope: { dimensions: {}, spectra: new Set() },
    evaluate: compilePerOutput(formula, where, (name) => expressionOf(formula, name), compileExpression),
    appliesWhen: new Map(),
  };
}

/**
 * Check a record against itself, with no graph in sight — the dimensional check
 * every migrated formula must pass. Generic variables are bound to
 * distinct base dimensions, which proves the case for all of them.
 */
export function checkFormulaDimensions(formula: Formula): void {
  const names = [...genericVariablesOf(formula)].sort();
  if (names.length > BASE_DIMENSIONS.length) {
    throw new KernelError(
      `'${formula.id}' uses ${names.length} dimension variables, and there are only ` +
        `${BASE_DIMENSIONS.length} independent base dimensions to test them against`,
    );
  }
  const bindings: Record<string, Dimension> = {};
  for (const [i, name] of names.entries()) {
    bindings[name] = basisDimension(BASE_DIMENSIONS[i] as BaseDimension);
  }
  checkRecord(formula, bindings, formula.id);
}

/** One base dimension to the first power — `force`, `length`, and so on. */
function basisDimension(base: BaseDimension): Dimension {
  const exponents: Partial<Record<BaseDimension, number>> = {};
  exponents[base] = 1;
  return makeDimension(exponents);
}

function genericVariablesOf(formula: Formula): ReadonlySet<string> {
  const variables = new Set<string>();
  for (const port of [...formula.outputs, ...formula.inputs] as readonly Port[]) {
    if (port.kind === 'categorical' || port.kind === 'bundle' || !isGenericDimension(port.unit)) continue;
    for (const variable of Object.keys(port.unit.variables)) variables.add(variable);
  }
  return variables;
}

/**
 * The whole static check: every name resolves to a port, the arithmetic is
 * dimensionally sound, and what it produces is what the record declares.
 */
function checkRecord(formula: Formula, bindings: Bindings, where: string): DimensionScope {
  const dimensions: Record<string, Dimension> = {};
  const spectra = new Set<string>();
  for (const port of formula.inputs) {
    const dimension = portDimensionUnder(port, bindings, where);
    if (dimension === undefined) {
      if (formula.lookup !== undefined) continue;
      throw new KernelError(
        `'${port.name}' is categorical, and using one in an expression needs a table`,
        where,
      );
    }
    dimensions[port.name] = dimension;
    if (port.kind === 'spectrum') spectra.add(port.name);
  }
  const scope: DimensionScope = { dimensions, spectra };

  // A table-backed output needs no expression to vouch for it: its column is
  // read in the unit it declares. Only what an expression computes has to be
  // proven to match what the record claims.
  //
  // Outputs are walked in declared order, and each one's declared dimension
  // joins the scope before the next is checked — which is what lets a later
  // expression name an earlier output (`DoF` as `D_f - D_n`) and still be
  // proven statically. Declared, not produced: the two were just shown equal,
  // and using the declaration keeps a chain of outputs from compounding a
  // rounding difference through `dimensionsClose`.
  for (const output of formula.outputs) {
    const declared = portDimensionUnder(output, bindings, where);
    const expression = expressionOf(formula, output.name);
    if (expression !== undefined && formula.lookup?.columns[output.name] === undefined) {
      const produced = expressionDimension(parseExpression(expression), scope, where);
      if (declared !== undefined && !dimensionsClose(produced, declared)) {
        throw new KernelError(
          `'${formula.id}' declares ${formula.outputs.length === 1 ? 'its output' : `'${output.name}'`} as ` +
            `${describeDimension(declared)} but its expression produces ${describeDimension(produced)}`,
          where,
        );
      }
    }
    // An output shadowing an input would silently change what every later
    // expression means, so the record is refused rather than resolved one
    // way or the other.
    if (declared !== undefined) {
      if (Object.hasOwn(dimensions, output.name) && formula.inputs.some((port) => port.name === output.name)) {
        throw new KernelError(`'${output.name}' is both an input and an output of '${formula.id}'`, where);
      }
      dimensions[output.name] = declared;
    }
  }

  for (const output of formula.outputs) {
    const condition = appliesWhenOf(formula, output.name);
    if (condition !== undefined) checkPredicateDimensions(parsePredicate(condition), scope, where);
  }
  return scope;
}

/** A port's dimension under the bindings, or `undefined` when it is categorical. */
function portDimensionUnder(port: Port, bindings: Bindings, where: string): Dimension | undefined {
  if (port.kind === 'categorical' || port.kind === 'bundle') return undefined;
  if (!isGenericDimension(port.unit)) return port.unit.dimension;
  try {
    return resolveGeneric(port.unit, bindings);
  } catch {
    throw new KernelError(
      `'${port.name}' declares ${port.unit.symbol}, and nothing wired to this node binds it`,
      where,
    );
  }
}
