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
 *
 * A reduction's argument is the other one. `sum(xs)` totals every value wired
 * into `xs`, and `sum(n * q)` totals the *pairs* — wire 1 of `n` against wire 1
 * of `q`, and so on — which is what a weighted mean over an operating cycle
 * is, and what the four-stage load cycles in the R&M catalogue are written as.
 * So the argument is an ordinary expression evaluated once per wired value,
 * `index` selecting which; a name holding a single value broadcasts into every
 * position, so `P_ref` and an exponent stay scalars beside the series. Every
 * series it reads must be the same length, since the pairing is by wire order
 * — the same rule a `piecewise` node's breakpoints and values already pair by.
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
 * value in this cell of the sweep — or, for a variadic port, to the whole
 * collected series at once.
 */
export type Env = Readonly<Record<string, number | readonly number[]>>;

/**
 * A compiled expression. `index` is set only while evaluating a reduction's
 * argument, and selects which wired value each series contributes there.
 */
export type CompiledExpression = (env: Env, index?: number) => number;
export type CompiledPredicate = (env: Env) => boolean;

/**
 * The one number `name` stands for here: what it holds, or — inside a
 * reduction's argument — the value at `index` of the series it holds. A
 * series read with no index in hand is `xs + 1` outside any reduction, which
 * is the mistake `'xs' is a series, not a value` names.
 */
function readNumber(env: Env, name: string, index: number | undefined): number {
  const value = env[name];
  if (value === undefined) throw new KernelError(`'${name}' has no value`);
  if (typeof value === 'number') return value;
  if (index === undefined) throw new KernelError(`'${name}' is a series, not a value`);
  return value[index] as number;
}

/**
 * A reduction's argument — the expression evaluated once per wired value —
 * and whatever plain expressions follow it (`at`'s index, for reductions that
 * declare an `extraArity`).
 */
function reductionCallParts(
  expr: Expr,
  callee: string,
  extraArity: number,
  where: string | undefined,
): { readonly argument: Expr; readonly extra: readonly Expr[] } {
  const args = expr.kind === 'call' ? expr.args : [];
  const [first, ...rest] = args;
  if (expr.kind !== 'call' || args.length !== 1 + extraArity || first === undefined) {
    const example = extraArity === 0 ? `${callee}(xs)` : `${callee}(xs, i)`;
    throw new KernelError(
      `${callee}() takes one argument${extraArity > 0 ? ' plus an index' : ''}, as in '${example}'`,
      where,
    );
  }
  return { argument: first, extra: rest };
}

/**
 * The names a reduction's argument reads one wired value at a time —
 * `sum(n * q)`'s `n` and `q`, `at(xs, i)`'s `xs` but not its index. A nested
 * reduction is skipped: it consumes its own port whole and answers with a
 * single number, so its names are not paired with these.
 *
 * Which of them turn out to be series is a fact about the wiring rather than
 * about the expression, so this is every name; `seriesLength` and the
 * dimension pass are what sort them out.
 */
function elementwiseNames(expr: Expr, into: Set<string> = new Set()): Set<string> {
  switch (expr.kind) {
    case 'number':
      break;
    case 'name':
      if (CONSTANTS[expr.name] === undefined) into.add(expr.name);
      break;
    case 'unary':
      elementwiseNames(expr.operand, into);
      break;
    case 'binary':
      elementwiseNames(expr.left, into);
      elementwiseNames(expr.right, into);
      break;
    case 'call':
      if (REDUCTIONS.has(expr.callee)) break;
      for (const arg of expr.args) elementwiseNames(arg, into);
      break;
  }
  return into;
}

/** Said the same way whether the static check or the actual wiring catches it. */
function noSeriesMessage(callee: string, names: readonly string[]): string {
  return names.length === 1
    ? `${callee}() takes a variadic port, and '${names[0] as string}' is not one`
    : `${callee}() takes a variadic port, and its argument mentions none`;
}

/**
 * How many values the reduction runs over: the wire count its argument's
 * series agree on. They have to agree, because the pairing is positional —
 * `sum(n * q)` with three speeds and two time shares names no fourth thing
 * that could say what to do about it.
 */
function seriesLength(
  env: Env,
  names: readonly string[],
  callee: string,
  where: string | undefined,
): number {
  let length: number | undefined;
  let from: string | undefined;
  for (const name of names) {
    const value = env[name];
    if (value === undefined || typeof value === 'number') continue;
    if (length === undefined) {
      length = value.length;
      from = name;
    } else if (value.length !== length) {
      throw new KernelError(
        `${callee}() pairs '${from as string}' and '${name}' wire by wire, and ${length} ` +
          `values are wired to one against ${value.length} to the other`,
        where,
      );
    }
  }
  if (length === undefined) throw new KernelError(noSeriesMessage(callee, names), where);
  return length;
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
      return (env, index) => readNumber(env, name, index);
    }

    case 'unary': {
      const operand = compileNode(expr.operand, where);
      return (env, index) => -operand(env, index);
    }

    case 'binary': {
      const left = compileNode(expr.left, where);
      const right = compileNode(expr.right, where);
      switch (expr.operator) {
        case '+':
          return (env, index) => left(env, index) + right(env, index);
        case '-':
          return (env, index) => left(env, index) - right(env, index);
        case '*':
          return (env, index) => left(env, index) * right(env, index);
        case '/':
          return (env, index) => left(env, index) / right(env, index);
        case '**':
          return (env, index) => Math.pow(left(env, index), right(env, index));
      }
      break;
    }

    case 'call': {
      const { callee } = expr;
      const reduction = REDUCTIONS.get(callee);
      if (reduction !== undefined) {
        const { argument, extra } = reductionCallParts(expr, callee, reduction.extraArity ?? 0, where);
        // Whatever position this call itself sits at, it answers with one
        // number — so the index it hands its argument is its own, counting
        // the wires, and never the one it was called with.
        const element = compileNode(argument, where);
        const names = [...elementwiseNames(argument)];
        const compiledExtra = extra.map((arg) => compileNode(arg, where));
        return (env) => {
          const length = seriesLength(env, names, callee, where);
          const values = new Array<number>(length);
          for (let index = 0; index < length; index += 1) values[index] = element(env, index);
          return reduction.apply(values, compiledExtra.map((arg) => arg(env)));
        };
      }

      const spec = FUNCTIONS.get(callee);
      if (spec === undefined) {
        throw new KernelError(
          `'${callee}' is not one of the functions an expression may call`,
          where,
        );
      }
      checkArity(callee, expr.args.length, where);
      const args = expr.args.map((arg) => compileNode(arg, where));
      return (env, index) => spec.apply(args.map((arg) => arg(env, index)));
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
  /** Which of those are variadic ports, and so may only be reduced. */
  readonly variadic?: ReadonlySet<string>;
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

/**
 * `elementwise` is set while walking a reduction's argument, where a variadic
 * port stands for one of its wired values and so carries that value's own
 * dimension. Everywhere else naming one bare is the error below.
 */
function dimensionOf(
  expr: Expr,
  scope: DimensionScope,
  where: string | undefined,
  elementwise = false,
): Dimension {
  switch (expr.kind) {
    case 'number':
      return DIMENSIONLESS;

    case 'name': {
      if (CONSTANTS[expr.name] !== undefined) return DIMENSIONLESS;
      const dimension = scope.dimensions[expr.name];
      if (dimension === undefined) {
        throw new KernelError(`'${expr.name}' is not a port of this formula`, where);
      }
      if (!elementwise && scope.variadic?.has(expr.name) === true) {
        throw new KernelError(
          `'${expr.name}' is a variadic port and can only be reduced, as in 'sum(${expr.name})'`,
          where,
        );
      }
      return dimension;
    }

    case 'unary':
      return dimensionOf(expr.operand, scope, where, elementwise);

    case 'binary': {
      const left = dimensionOf(expr.left, scope, where, elementwise);

      if (expr.operator === '**') {
        // The base is dimensionless: any exponent is fine, including a wired one.
        if (isDimensionless(left)) {
          dimensionOf(expr.right, scope, where, elementwise);
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

      const right = dimensionOf(expr.right, scope, where, elementwise);
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
        const { argument, extra } = reductionCallParts(expr, expr.callee, reduction.extraArity ?? 0, where);
        // What one wired value contributes — proven before the variadic check
        // below, so a name that is no port at all says so rather than being
        // reported as the wrong kind of port.
        const dimension = dimensionOf(argument, scope, where, true);
        const names = [...elementwiseNames(argument)];
        if (scope.variadic !== undefined && !names.some((name) => scope.variadic?.has(name) === true)) {
          throw new KernelError(noSeriesMessage(expr.callee, names), where);
        }
        // `at`'s index is one number for the whole call, not one per wired
        // value — which is how it is evaluated, so it is checked that way too.
        const extraDimensions = extra.map((arg) => dimensionOf(arg, scope, where, false));
        return reduction.dimension(dimension, where, extraDimensions);
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
        expr.args.map((arg) => dimensionOf(arg, scope, where, elementwise)),
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
