/**
 * A formula record, made ready to evaluate: the S19 gate, the dimension check,
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
} from '@mds/units';
import { isEvaluable, type Formula, type Port } from '@mds/schema';

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

/** S19's gate, stated once so every path through the kernel uses the same one. */
export function assertEvaluable(formula: Formula, where?: string): void {
  if (isEvaluable(formula)) return;
  throw new KernelError(
    `'${formula.id}' is quarantined and cannot be evaluated: ` +
      `${formula.quarantineReason ?? 'no reason recorded'} (S19)`,
    where,
  );
}

export interface CompiledFormula {
  readonly formula: Formula;
  readonly evaluate: CompiledExpression;
  /** The condition R&M states in prose, when the record carries one. */
  readonly appliesWhen?: CompiledPredicate;
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
    evaluate: compileExpression(formula.expression, where ?? formula.id),
    ...(formula.appliesWhen === undefined
      ? {}
      : { appliesWhen: compilePredicate(formula.appliesWhen, where ?? formula.id) }),
  };
}

/**
 * Check a record against itself, with no graph in sight — the dimensional check
 * PLAN.md asks of every migrated formula. Generic variables are bound to
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
  for (const port of [formula.output, ...formula.inputs] as readonly Port[]) {
    if (port.kind === 'categorical' || !isGenericDimension(port.unit)) continue;
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
      throw new KernelError(
        `'${port.name}' is categorical, and using one in an expression needs a table (S37)`,
        where,
      );
    }
    dimensions[port.name] = dimension;
    if (port.kind === 'spectrum') spectra.add(port.name);
  }
  const scope: DimensionScope = { dimensions, spectra };

  const produced = expressionDimension(parseExpression(formula.expression), scope, where);
  const declared = portDimensionUnder(formula.output, bindings, where);
  if (declared !== undefined && !dimensionsClose(produced, declared)) {
    throw new KernelError(
      `'${formula.id}' declares its output as ${describeDimension(declared)} but its ` +
        `expression produces ${describeDimension(produced)}`,
      where,
    );
  }

  if (formula.appliesWhen !== undefined) {
    checkPredicateDimensions(parsePredicate(formula.appliesWhen), scope, where);
  }
  return scope;
}

/** A port's dimension under the bindings, or `undefined` when it is categorical. */
function portDimensionUnder(port: Port, bindings: Bindings, where: string): Dimension | undefined {
  if (port.kind === 'categorical') return undefined;
  if (!isGenericDimension(port.unit)) return port.unit.dimension;
  try {
    return resolveGeneric(port.unit, bindings);
  } catch {
    throw new KernelError(
      `'${port.name}' declares ${port.unit.symbol}, and nothing wired to this node binds it (S59)`,
      where,
    );
  }
}
