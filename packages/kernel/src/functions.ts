/**
 * S35's function whitelist: what an expression may call, what it computes, and
 * what it does to a dimension.
 *
 * A whitelist rather than a namespace import is the point. `Math` carries
 * things a formula has no business calling, and the dimension rule is not
 * derivable from the function — `sqrt` halves a dimension, `floor` preserves
 * one, `log` refuses one. Each entry states its own rule, because that is the
 * part a wrong answer hides in.
 *
 * Three rules from S35, and one from S54:
 *
 * - trig, log and exp **require a dimensionless argument** — except that `sin`,
 *   `cos` and `tan` also accept an angle, which is S54 read the other way round:
 *   angle is a tracked dimension here, and R&M tags belt's wrap angles `[]`, so
 *   both spellings arrive and both are correct;
 * - `min`/`max` require **identical** dimensions across their arguments;
 * - rounding **preserves** dimension.
 *
 * `sum` and `prod` are apart from the rest: they consume a whole series at once
 * (S36) rather than a value, so they are listed separately and their argument
 * must be a spectrum port by name.
 */

import {
  ANGLE,
  DIMENSIONLESS,
  describeDimension,
  isDimensionless,
  dimensionsEqual,
  powerDimension,
  type Dimension,
} from '@mds/units';

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

/** trig: an angle, or a pure number where R&M wrote one (S54). Result is pure. */
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
    `${name}() takes a pure number, not ${describeDimension(argument)} (S35)`,
    where,
  );
}

function sameAcross(args: readonly Dimension[], where: string | undefined, name: string): Dimension {
  const first = args[0] as Dimension;
  for (const other of args.slice(1)) {
    assertSameDimension(first, other, `${name}() compares values of one dimension (S35)`, where);
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
 * The reductions of S36. Separate from `FUNCTIONS` because their argument is a
 * whole series rather than a value: a sweep *produces* a series and these
 * *consume* one, so they can only be applied to a spectrum port, by name.
 */
export interface ReductionSpec {
  readonly name: string;
  readonly apply: (values: readonly number[]) => number;
  readonly dimension: (argument: Dimension, where: string | undefined) => Dimension;
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
  // arguments in one expression). A reduction's argument is one spectrum
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
];

export const REDUCTIONS: ReadonlyMap<string, ReductionSpec> = new Map(
  REDUCTION_SPECS.map((spec) => [spec.name, spec] as const),
);

export function isFunctionName(name: string): boolean {
  return FUNCTIONS.has(name) || REDUCTIONS.has(name);
}
