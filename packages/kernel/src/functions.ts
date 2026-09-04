/**
 * The function whitelist: what an expression may call, what it computes, and
 * what it does to a dimension.
 *
 * A whitelist rather than a namespace import is the point. `Math` carries
 * things a formula has no business calling, and the dimension rule is not
 * derivable from the function — `sqrt` halves a dimension, `floor` preserves
 * one, `log` refuses one. Each entry states its own rule, because that is the
 * part a wrong answer hides in.
 *
 * Three rules govern this whitelist:
 *
 * - trig, log and exp **require a dimensionless argument** — except that `sin`,
 *   `cos` and `tan` also accept an angle, read the other way round:
 *   angle is a tracked dimension here, and R&M tags belt's wrap angles `[]`, so
 *   both spellings arrive and both are correct;
 * - `min`/`max` require **identical** dimensions across their arguments;
 * - rounding **preserves** dimension.
 *
 * `sum`, `prod` and the rest of `REDUCTIONS` are apart from the whitelist above:
 * they consume every value wired into a port at once rather than a single
 * value, so they are listed separately. Their argument is an expression over
 * at least one variadic port, evaluated once per wired value and paired by
 * wire order — `sum(xs)`, and equally `sum(n * q)` — so what a spec here
 * receives is already one number per wired value, whatever arithmetic
 * produced it (`compile.ts`). `at` is the one with a second argument, a plain
 * index alongside those values, which is what `ReductionSpec.extraArity`
 * exists to declare.
 */

import {
  ANGLE,
  DIMENSIONLESS,
  describeDimension,
  isDimensionless,
  dimensionsEqual,
  powerDimension,
  type Dimension,
} from '@joveworks/units';

import { assertSameDimension, dimensionsClose } from './dimensions.js';
import { KernelError } from './errors.js';

/** Named constants an expression may use without declaring a port. */
export const CONSTANTS: Readonly<Record<string, number>> = { pi: Math.PI };

export interface FunctionSpec {
  readonly name: string;
  /** Fixed arity, or `'variadic'` for at least one argument. */
  readonly arity: number | 'variadic';
  readonly apply: (args: readonly number[]) => number;
  readonly dimension: (args: readonly Dimension[], where: string | undefined) => Dimension;
}

const preserves = (args: readonly Dimension[]): Dimension => args[0] as Dimension;

/** trig: an angle, or a pure number where R&M wrote one. Result is pure. */
function angleArgument(args: readonly Dimension[], where: string | undefined, name: string): Dimension {
  const argument = args[0] as Dimension;
  if (dimensionsClose(argument, ANGLE) || isDimensionless(argument)) return DIMENSIONLESS;
  throw new KernelError(
    `${name}() takes an angle or a pure number, not ${describeDimension(argument)}`,
    where,
  );
}

function pureArgument(args: readonly Dimension[], where: string | undefined, name: string): Dimension {
  const argument = args[0] as Dimension;
  if (isDimensionless(argument)) return DIMENSIONLESS;
  throw new KernelError(
    `${name}() takes a pure number, not ${describeDimension(argument)}`,
    where,
  );
}

function sameAcross(args: readonly Dimension[], where: string | undefined, name: string): Dimension {
  const first = args[0] as Dimension;
  for (const other of args.slice(1)) {
    assertSameDimension(first, other, `${name}() compares values of one dimension`, where);
  }
  return first;
}

const trig = (name: string, apply: (x: number) => number): FunctionSpec => ({
  name,
  arity: 1,
  apply: (args) => apply(args[0] as number),
  dimension: (args, where) => angleArgument(args, where, name),
});

const inverseTrig = (name: string, apply: (x: number) => number): FunctionSpec => ({
  name,
  arity: 1,
  apply: (args) => apply(args[0] as number),
  dimension: (args, where) => {
    pureArgument(args, where, name);
    return ANGLE;
  },
});

const pure = (name: string, apply: (x: number) => number): FunctionSpec => ({
  name,
  arity: 1,
  apply: (args) => apply(args[0] as number),
  dimension: (args, where) => pureArgument(args, where, name),
});

const rounding = (name: string, apply: (x: number) => number): FunctionSpec => ({
  name,
  arity: 1,
  apply: (args) => apply(args[0] as number),
  dimension: preserves,
});

const SPECS: readonly FunctionSpec[] = [
  {
    name: 'abs',
    arity: 1,
    apply: (args) => Math.abs(args[0] as number),
    dimension: preserves,
  },
  {
    name: 'sqrt',
    arity: 1,
    apply: (args) => Math.sqrt(args[0] as number),
    dimension: (args) => powerDimension(args[0] as Dimension, 1 / 2),
  },
  {
    name: 'cbrt',
    arity: 1,
    apply: (args) => Math.cbrt(args[0] as number),
    dimension: (args) => powerDimension(args[0] as Dimension, 1 / 3),
  },
  {
    name: 'min',
    arity: 'variadic',
    apply: (args) => Math.min(...args),
    dimension: (args, where) => sameAcross(args, where, 'min'),
  },
  {
    name: 'max',
    arity: 'variadic',
    apply: (args) => Math.max(...args),
    dimension: (args, where) => sameAcross(args, where, 'max'),
  },
  rounding('floor', Math.floor),
  rounding('ceil', Math.ceil),
  rounding('round', Math.round),
  trig('sin', Math.sin),
  trig('cos', Math.cos),
  trig('tan', Math.tan),
  inverseTrig('asin', Math.asin),
  inverseTrig('acos', Math.acos),
  inverseTrig('atan', Math.atan),
  pure('sinh', Math.sinh),
  pure('cosh', Math.cosh),
  pure('tanh', Math.tanh),
  pure('log', Math.log),
  pure('exp', Math.exp),
];

export const FUNCTIONS: ReadonlyMap<string, FunctionSpec> = new Map(
  SPECS.map((spec) => [spec.name, spec] as const),
);

/**
 * The variadic-port reductions. Separate from `FUNCTIONS` because their
 * argument is every value wired into a port rather than a single value: a
 * sweep *produces* a series and these *consume* a whole set of wires, so they
 * can only be applied to a variadic port, by name.
 */
export interface ReductionSpec {
  readonly name: string;
  /** How many plain scalar arguments follow the variadic-port argument. Defaults to 0. */
  readonly extraArity?: number;
  readonly apply: (values: readonly number[], extra: readonly number[]) => number;
  readonly dimension: (argument: Dimension, where: string | undefined, extra: readonly Dimension[]) => Dimension;
}

const REDUCTION_SPECS: readonly ReductionSpec[] = [
  {
    name: 'sum',
    apply: (values) => values.reduce((total, value) => total + value, 0),
    dimension: (argument) => argument,
  },
  {
    name: 'prod',
    apply: (values) => values.reduce((total, value) => total * value, 1),
    // The dimension of a product of n terms depends on n, which is a value and
    // not a type — so `prod` is dimensionless in and dimensionless out.
    dimension: (argument, where) => {
      if (!dimensionsEqual(argument, DIMENSIONLESS)) {
        throw new KernelError(
          `prod() takes a pure series, not ${describeDimension(argument)} — the dimension ` +
            'of a product depends on how many terms there are, which is a value not a type',
          where,
        );
      }
      return DIMENSIONLESS;
    },
  },
  // Named `least`/`greatest`, not `min`/`max` — those already name the plain,
  // fixed-arity whitelist functions above (`min(a, b, c)`, distinct named
  // arguments in one expression). A reduction's argument is one variadic
  // port, a wholly different shape of call, and needs a name of its own.
  {
    name: 'least',
    apply: (values) => values.reduce((least, value) => Math.min(least, value)),
    dimension: (argument) => argument,
  },
  {
    name: 'greatest',
    apply: (values) => values.reduce((greatest, value) => Math.max(greatest, value)),
    dimension: (argument) => argument,
  },
  {
    name: 'count',
    apply: (values) => values.length,
    // How many values there are carries no dimension of its own, whatever the
    // series holds — unlike `sum`, which inherits it.
    dimension: () => DIMENSIONLESS,
  },
  {
    name: 'mean',
    apply: (values) => values.reduce((total, value) => total + value, 0) / values.length,
    dimension: (argument) => argument,
  },
  {
    name: 'median',
    apply: (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      const middle = sorted.length / 2;
      return sorted.length % 2 === 0
        ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
        : (sorted[Math.floor(middle)] as number);
    },
    dimension: (argument) => argument,
  },
  {
    // Sample standard deviation (n − 1): the series is a sample of
    // measurements, not the whole population, which is the usual case a
    // tolerance is built from.
    name: 'sdev',
    apply: (values) => {
      const n = values.length;
      const mean = values.reduce((total, value) => total + value, 0) / n;
      const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / (n - 1);
      return Math.sqrt(variance);
    },
    dimension: (argument) => argument,
  },
  {
    // The one reduction with a second argument: a plain index alongside the
    // series it selects from. 0-based, so "the third value" reads as `at(xs, 2)`.
    name: 'at',
    extraArity: 1,
    apply: (values, extra) => values[Math.round(extra[0] as number)] as number,
    dimension: (argument, where, extra) => {
      const index = extra[0] as Dimension;
      if (!dimensionsEqual(index, DIMENSIONLESS)) {
        throw new KernelError(`at() takes a plain index, not ${describeDimension(index)}`, where);
      }
      return argument;
    },
  },
];

export const REDUCTIONS: ReadonlyMap<string, ReductionSpec> = new Map(
  REDUCTION_SPECS.map((spec) => [spec.name, spec] as const),
);

export function isFunctionName(name: string): boolean {
  return FUNCTIONS.has(name) || REDUCTIONS.has(name);
}
