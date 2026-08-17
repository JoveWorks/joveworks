/**
 * Trees to closures, and trees to dimensions.
 *
 * Two passes over the same AST, and they answer different questions:
 *
 * - `compileExpression` builds a closure per node **once**, so evaluating a
 *   40 000-point sweep is 40 000 calls into an already-built structure rather
 *   than 40 000 walks of a tree.
 * - `expressionDimension` derives what the expression *is*, which is how a
 *   formula's declared output unit gets checked against the arithmetic that
 *   produces it.
 *
 * The exponent rule is the interesting one. `a ** b` has a dimension only when
 * the exponent is a constant: `d**2` is an area, but `d**n` with `n` wired in is
 * a dimension that is not known until the value is, and a dimension that depends
 * on a value is not a type. So the exponent is constant-folded, and if it does
 * not fold, the base must be dimensionless.
 */

import {
  DIMENSIONLESS,
  describeDimension,
  divideDimensions,
  isDimensionless,
  multiplyDimensions,
  powerDimension,
  type Dimension,
} from '@joveworks/units';

import type { Comparison } from '@joveworks/schema';

import type { Expr, Predicate } from './ast.js';
import { assertSameDimension } from './dimensions.js';
import { KernelError } from './errors.js';
import { CONSTANTS, FUNCTIONS, REDUCTIONS } from './functions.js';
import { parseExpression, parsePredicate } from './parse.js';

/**
 * What a compiled closure reads. A port name resolves either to a number — the
 * value in this cell of the sweep — or, for a spectrum port, to the whole series
 * at once.
 */
export type Env = Readonly<Record<string, number | readonly number[]>>;

export type CompiledExpression = (env: Env) => number;
export type CompiledPredicate = (env: Env) => boolean;

function readNumber(env: Env, name: string): number {
  const value = env[name];
  if (typeof value !== 'number') {
    throw new KernelError(
      value === undefined ? `'${name}' has no value` : `'${name}' is a series, not a value`,
    );
  }
  return value;
}

function readSeries(env: Env, name: string): readonly number[] {
  const value = env[name];
  if (!Array.isArray(value)) {
    throw new KernelError(
      value === undefined ? `'${name}' has no value` : `'${name}' is a value, not a series`,
    );
  }
  return value as readonly number[];
}

/**
 * The bare name a reduction must be applied to.
 *
 * `sum(xs)` is a whole port consumed at once, so `sum(xs * 2)` is not a smaller
 * version of the same idea — it is an elementwise operation this language has no
 * way to express. Saying so at compile time beats a confusing runtime failure.
 */
function reductionArgument(expr: Expr, callee: string, where: string | undefined): string {
  const [only] = expr.kind === 'call' ? expr.args : [];
  if (expr.kind !== 'call' || expr.args.length !== 1 || only === undefined || only.kind !== 'name') {
    throw new KernelError(
      `${callee}() takes one spectrum port by name, as in '${callee}(xs)'`,
      where,
    );
  }
  return only.name;
}

function checkArity(callee: string, count: number, where: string | undefined): void {
  const spec = FUNCTIONS.get(callee);
  if (spec === undefined) return;
  if (spec.arity === 'variadic') {
    if (count >= 1) return;
    throw new KernelError(`${callee}() takes at least one argument`, where);
  }
  if (count !== spec.arity) {
    throw new KernelError(`${callee}() takes ${spec.arity} argument(s), not ${count}`, where);
  }
}

function compileNode(expr: Expr, where: string | undefined): CompiledExpression {
  switch (expr.kind) {
    case 'number': {
      const { value } = expr;
      return () => value;
    }

    case 'name': {
      const constant = CONSTANTS[expr.name];
      if (constant !== undefined) return () => constant;
      const { name } = expr;
      return (env) => readNumber(env, name);
    }

    case 'unary': {
      const operand = compileNode(expr.operand, where);
      return (env) => -operand(env);
    }

    case 'binary': {
      const left = compileNode(expr.left, where);
      const right = compileNode(expr.right, where);
      switch (expr.operator) {
        case '+':
          return (env) => left(env) + right(env);
        case '-':
          return (env) => left(env) - right(env);
        case '*':
          return (env) => left(env) * right(env);
        case '/':
          return (env) => left(env) / right(env);
        case '**':
          return (env) => Math.pow(left(env), right(env));
      }
      break;
    }

    case 'call': {
      const reduction = REDUCTIONS.get(expr.callee);
      if (reduction !== undefined) {
        const name = reductionArgument(expr, expr.callee, where);
        return (env) => reduction.apply(readSeries(env, name));
      }

      const spec = FUNCTIONS.get(expr.callee);
      if (spec === undefined) {
        throw new KernelError(
          `'${expr.callee}' is not one of the functions an expression may call`,
          where,
        );
      }
      checkArity(expr.callee, expr.args.length, where);
      const args = expr.args.map((arg) => compileNode(arg, where));
      return (env) => spec.apply(args.map((arg) => arg(env)));
    }
  }
  // Unreachable: every AST kind is handled above.
  throw new KernelError('unsupported expression', where);
}

/** Parse and compile a value expression. */
export function compileExpression(source: string, where?: string): CompiledExpression {
  return compileNode(parseExpression(source), where);
}

const COMPARE: Readonly<Record<string, (a: number, b: number) => boolean>> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};

/**
 * The comparison itself, shared by three things that are one and the same: a
 * predicate's `<`, a check node's stored comparison, and a plot's
 * threshold overlay.
 */
export function comparator(comparison: Comparison): (a: number, b: number) => boolean {
  return COMPARE[comparison] as (a: number, b: number) => boolean;
}

function compilePredicateNode(predicate: Predicate, where: string | undefined): CompiledPredicate {
  switch (predicate.kind) {
    case 'compare': {
      const left = compileNode(predicate.left, where);
      const right = compileNode(predicate.right, where);
      const compare = COMPARE[predicate.comparison] as (a: number, b: number) => boolean;
      return (env) => compare(left(env), right(env));
    }
    case 'and': {
      const left = compilePredicateNode(predicate.left, where);
      const right = compilePredicateNode(predicate.right, where);
      return (env) => left(env) && right(env);
    }
    case 'or': {
      const left = compilePredicateNode(predicate.left, where);
      const right = compilePredicateNode(predicate.right, where);
      return (env) => left(env) || right(env);
    }
    case 'not': {
      const operand = compilePredicateNode(predicate.operand, where);
      return (env) => !operand(env);
    }
  }
}

/** Parse and compile a predicate — a check, a threshold or an `appliesWhen`. */
export function compilePredicate(source: string, where?: string): CompiledPredicate {
  return compilePredicateNode(parsePredicate(source), where);
}

// --- dimensions -------------------------------------------------------------

/** What the dimension pass knows about the names an expression may mention. */
export interface DimensionScope {
  /** Port name → dimension. A generic port must already be resolved. */
  readonly dimensions: Readonly<Record<string, Dimension>>;
  /** Which of those are spectrum ports, and so may only be reduced. */
  readonly spectra?: ReadonlySet<string>;
}

/**
 * Fold an expression that mentions no port. This is what decides whether `**`
 * has a dimension rule to apply — nothing else needs it.
 */
export function constantValue(expr: Expr): number | undefined {
  switch (expr.kind) {
    case 'number':
      return expr.value;
    case 'name':
      return CONSTANTS[expr.name];
    case 'unary': {
      const operand = constantValue(expr.operand);
      return operand === undefined ? undefined : -operand;
    }
    case 'binary': {
      const left = constantValue(expr.left);
      const right = constantValue(expr.right);
      if (left === undefined || right === undefined) return undefined;
      switch (expr.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '**':
          return Math.pow(left, right);
      }
      return undefined;
    }
    case 'call':
      return undefined;
  }
}

/**
 * A literal facing a dimensioned value takes that dimension, **in canonical
 * units** — `d < 50` in a length context is 50 mm.
 *
 * This is narrow on purpose. A *port* declares a unit and must match, because
 * two declared units that disagree is exactly the mistake the checker exists to
 * catch. A *literal* has no unit to declare: everything inside an expression is
 * canonical by the time the kernel sees it, so
 * the only reading a bare number can have is the canonical one.
 *
 * R&M forces the case rather than convenience suggesting it: `E2_4A/B` select on
 * a nominal-size band, and a band is a number with a dimension. Refusing it
 * would make those conditions untranscribable for the one class of condition
 * that is not a comparison between two ports.
 *
 * Returns the adopted dimension, or `undefined` when neither side is a literal.
 */
function literalAgainstDimension(
  left: Expr,
  leftDimension: Dimension,
  right: Expr,
  rightDimension: Dimension,
): Dimension | undefined {
  if (isDimensionless(rightDimension) && constantValue(right) !== undefined) return leftDimension;
  if (isDimensionless(leftDimension) && constantValue(left) !== undefined) return rightDimension;
  return undefined;
}

function dimensionOf(expr: Expr, scope: DimensionScope, where: string | undefined): Dimension {
  switch (expr.kind) {
    case 'number':
      return DIMENSIONLESS;

    case 'name': {
      if (CONSTANTS[expr.name] !== undefined) return DIMENSIONLESS;
      const dimension = scope.dimensions[expr.name];
      if (dimension === undefined) {
        throw new KernelError(`'${expr.name}' is not a port of this formula`, where);
      }
      if (scope.spectra?.has(expr.name) === true) {
        throw new KernelError(
          `'${expr.name}' is a spectrum and can only be reduced, as in 'sum(${expr.name})'`,
          where,
        );
      }
      return dimension;
    }

    case 'unary':
      return dimensionOf(expr.operand, scope, where);

    case 'binary': {
      const left = dimensionOf(expr.left, scope, where);

      if (expr.operator === '**') {
        // The base is dimensionless: any exponent is fine, including a wired one.
        if (isDimensionless(left)) {
          dimensionOf(expr.right, scope, where);
          return DIMENSIONLESS;
        }
        const exponent = constantValue(expr.right);
        if (exponent === undefined) {
          throw new KernelError(
            `a ${describeDimension(left)} raised to a power that is not constant has no ` +
              'dimension — the exponent would have to be known before the value is',
            where,
          );
        }
        return powerDimension(left, exponent);
      }

      const right = dimensionOf(expr.right, scope, where);
      switch (expr.operator) {
        case '+':
        case '-': {
          const adopted = literalAgainstDimension(expr.left, left, expr.right, right);
          if (adopted !== undefined) return adopted;
          assertSameDimension(left, right, `cannot ${expr.operator === '+' ? 'add' : 'subtract'}`, where);
          return left;
        }
        case '*':
          return multiplyDimensions(left, right);
        case '/':
          return divideDimensions(left, right);
      }
      break;
    }

    case 'call': {
      const reduction = REDUCTIONS.get(expr.callee);
      if (reduction !== undefined) {
        const name = reductionArgument(expr, expr.callee, where);
        const dimension = scope.dimensions[name];
        if (dimension === undefined) {
          throw new KernelError(`'${name}' is not a port of this formula`, where);
        }
        if (scope.spectra !== undefined && !scope.spectra.has(name)) {
          throw new KernelError(
            `${expr.callee}() takes a spectrum port, and '${name}' is not one`,
            where,
          );
        }
        return reduction.dimension(dimension, where);
      }

      const spec = FUNCTIONS.get(expr.callee);
      if (spec === undefined) {
        throw new KernelError(
          `'${expr.callee}' is not one of the functions an expression may call`,
          where,
        );
      }
      checkArity(expr.callee, expr.args.length, where);
      return spec.dimension(
        expr.args.map((arg) => dimensionOf(arg, scope, where)),
        where,
      );
    }
  }
  throw new KernelError('unsupported expression', where);
}

/** The dimension an expression produces, given the dimensions of its ports. */
export function expressionDimension(
  expr: Expr,
  scope: DimensionScope,
  where?: string,
): Dimension {
  return dimensionOf(expr, scope, where);
}

/** Both sides of every comparison in a predicate must agree dimensionally. */
export function checkPredicateDimensions(
  predicate: Predicate,
  scope: DimensionScope,
  where?: string,
): void {
  switch (predicate.kind) {
    case 'compare': {
      const left = dimensionOf(predicate.left, scope, where);
      const right = dimensionOf(predicate.right, scope, where);
      // A band condition — `d < 50` — is a literal against a dimension, and R&M
      // states several conditions that way.
      if (literalAgainstDimension(predicate.left, left, predicate.right, right) !== undefined) {
        return;
      }
      assertSameDimension(left, right, `cannot compare with '${predicate.comparison}'`, where);
      return;
    }
    case 'and':
    case 'or':
      checkPredicateDimensions(predicate.left, scope, where);
      checkPredicateDimensions(predicate.right, scope, where);
      return;
    case 'not':
      checkPredicateDimensions(predicate.operand, scope, where);
  }
}
