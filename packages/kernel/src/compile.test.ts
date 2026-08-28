import { describe, expect, it } from 'vitest';
import {
  ANGLE,
  AREA,
  DIMENSIONLESS,
  FORCE,
  LENGTH,
  STRESS,
  TIME,
  VELOCITY,
  dimension,
  type Dimension,
} from '@joveworks/units';

import {
  checkPredicateDimensions,
  comparator,
  compileExpression,
  compilePredicate,
  constantValue,
  expressionDimension,
  type DimensionScope,
} from './compile.js';
import { KernelError } from './errors.js';
import { parseExpression, parsePredicate } from './parse.js';

const scope = (
  dimensions: Readonly<Record<string, Dimension>>,
  variadic: readonly string[] = [],
): DimensionScope => ({ dimensions, variadic: new Set(variadic) });

const dimensionOf = (source: string, of: DimensionScope): Dimension =>
  expressionDimension(parseExpression(source), of);

describe('compiled closures', () => {
  it('computes arithmetic in the order it parsed', () => {
    expect(compileExpression('a*b + c')({ a: 2, b: 3, c: 4 })).toBe(10);
    expect(compileExpression('(a + b) / 2')({ a: 3, b: 5 })).toBe(4);
    expect(compileExpression('2 ** 3 ** 2')({})).toBe(512);
    expect(compileExpression('-a ** 2')({ a: 3 })).toBe(-9);
  });

  it('knows pi without a port', () => {
    expect(compileExpression('2 * pi')({})).toBeCloseTo(Math.PI * 2, 12);
  });

  it('calls the whitelist and nothing else', () => {
    expect(compileExpression('sqrt(a)')({ a: 16 })).toBe(4);
    expect(compileExpression('cbrt(a)')({ a: 27 })).toBe(3);
    expect(compileExpression('min(a, b)')({ a: 2, b: 5 })).toBe(2);
    expect(compileExpression('round(a)')({ a: 2.5 })).toBe(3);
    expect(() => compileExpression('eval(a)')).toThrow(/not one of the functions/u);
    expect(() => compileExpression('constructor(a)')).toThrow(KernelError);
  });

  it('checks arity at compile time', () => {
    expect(() => compileExpression('sqrt(a, b)')).toThrow(/takes 1 argument/u);
  });

  it('reduces every value wired into a port, and only by name', () => {
    expect(compileExpression('sum(xs)')({ xs: [1, 2, 3] })).toBe(6);
    expect(compileExpression('prod(xs)')({ xs: [2, 3, 4] })).toBe(24);
    expect(() => compileExpression('sum(xs * 2)')).toThrow(/one variadic port by name/u);
  });

  it('reduces a variadic port to the descriptive statistics', () => {
    expect(compileExpression('count(xs)')({ xs: [1, 2, 3, 4] })).toBe(4);
    expect(compileExpression('mean(xs)')({ xs: [1, 2, 3, 4] })).toBe(2.5);
    expect(compileExpression('median(xs)')({ xs: [1, 3, 2] })).toBe(2);
    expect(compileExpression('median(xs)')({ xs: [1, 2, 3, 4] })).toBe(2.5);
    expect(compileExpression('sdev(xs)')({ xs: [2, 4, 4, 4, 5, 5, 7, 9] })).toBeCloseTo(2.13809, 4);
  });

  it('picks a value out of a variadic port by a 0-based index, computed like any other argument', () => {
    expect(compileExpression('at(xs, 1)')({ xs: [10, 20, 30] })).toBe(20);
    expect(compileExpression('at(xs, i)')({ xs: [10, 20, 30], i: 2 })).toBe(30);
    expect(compileExpression('at(xs, i + 1)')({ xs: [10, 20, 30], i: 0 })).toBe(20);
    expect(() => compileExpression('at(xs)')).toThrow(/one variadic port by name/u);
  });

  it('refuses a value where a series belongs, and the reverse', () => {
    expect(() => compileExpression('sum(xs)')({ xs: 3 })).toThrow(/not a series/u);
    expect(() => compileExpression('a + 1')({ a: [1, 2] })).toThrow(/is a series/u);
  });

  it('never reaches for eval or new Function', async () => {
    // Stated as a test: the whole point of a hand-written
    // parser is that a catalogue file cannot become executable code.
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./compile.ts', import.meta.url), 'utf8'),
    );
    expect(source).not.toMatch(/\beval\s*\(/u);
    expect(source).not.toMatch(/new Function/u);
  });
});

describe('predicates', () => {
  it('compares, combines and negates', () => {
    expect(compilePredicate('S >= 1.5')({ S: 1.8 })).toBe(true);
    expect(compilePredicate('S >= 1.5')({ S: 1.2 })).toBe(false);
    expect(compilePredicate('a < 1 and b < 2')({ a: 0, b: 3 })).toBe(false);
    expect(compilePredicate('a < 1 or b < 2')({ a: 0, b: 3 })).toBe(true);
    expect(compilePredicate('not a < 1')({ a: 0 })).toBe(false);
  });

  it('exposes the same comparison a check node stores', () => {
    expect(comparator('>=')(2, 1)).toBe(true);
    expect(comparator('!=')(2, 2)).toBe(false);
  });
});

describe('dimensions of an expression', () => {
  const ports = scope({ F: FORCE, A: AREA, d: LENGTH, t: TIME, n: DIMENSIONLESS, theta: ANGLE });

  it('multiplies, divides and preserves', () => {
    expect(dimensionOf('F / A', ports)).toEqual(STRESS);
    expect(dimensionOf('d / t', ports)).toEqual(VELOCITY);
    expect(dimensionOf('-F', ports)).toEqual(FORCE);
    expect(dimensionOf('F + F', ports)).toEqual(FORCE);
  });

  it('refuses to add unlike things', () => {
    expect(() => dimensionOf('F + d', ports)).toThrow(/different dimensions/u);
    expect(() => dimensionOf('min(F, d)', ports)).toThrow(/one dimension/u);
    // A dimensionless *port* is a declared unit and must match, even though a
    // dimensionless *literal* need not — that is the whole distinction.
    expect(() => dimensionOf('d + n', ports)).toThrow(/different dimensions/u);
  });

  it('lets a literal take the dimension it faces, in canonical units', () => {
    expect(dimensionOf('d + 50', ports)).toEqual(LENGTH);
    expect(dimensionOf('50 - d', ports)).toEqual(LENGTH);
    expect(dimensionOf('d + 2*25', ports)).toEqual(LENGTH);
    expect(() =>
      checkPredicateDimensions(parsePredicate('d < 50'), ports),
    ).not.toThrow();
  });

  it('raises to a constant power, and refuses a wired one', () => {
    expect(dimensionOf('d ** 2', ports)).toEqual(AREA);
    expect(dimensionOf('d ** (1/3)', ports)).toEqual(dimension({ length: 1 / 3 }));
    expect(() => dimensionOf('d ** n', ports)).toThrow(/not constant/u);
    // A dimensionless base takes any exponent, wired or not.
    expect(dimensionOf('n ** n', ports)).toEqual(DIMENSIONLESS);
  });

  it('takes a root and gives back a third of a dimension', () => {
    expect(dimensionOf('cbrt(F)', ports)).toEqual(dimension({ force: 1 / 3 }));
    expect(dimensionOf('sqrt(A)', ports)).toEqual(LENGTH);
  });

  it('takes trig from an angle or a pure number, and back', () => {
    expect(dimensionOf('sin(theta)', ports)).toEqual(DIMENSIONLESS);
    expect(dimensionOf('sin(n)', ports)).toEqual(DIMENSIONLESS);
    expect(() => dimensionOf('sin(d)', ports)).toThrow(/angle or a pure number/u);
    expect(dimensionOf('asin(n)', ports)).toEqual(ANGLE);
    expect(() => dimensionOf('asin(theta)', ports)).toThrow(/pure number/u);
  });

  it('requires a pure argument for log and exp', () => {
    expect(dimensionOf('log(n)', ports)).toEqual(DIMENSIONLESS);
    expect(() => dimensionOf('log(F)', ports)).toThrow(/pure number/u);
    expect(() => dimensionOf('exp(d)', ports)).toThrow(/pure number/u);
  });

  it('keeps the dimension through rounding', () => {
    expect(dimensionOf('floor(d)', ports)).toEqual(LENGTH);
    expect(dimensionOf('abs(F)', ports)).toEqual(FORCE);
  });

  it('sums a variadic port without losing its dimension, and refuses to multiply a non-variadic one', () => {
    const variadic = scope({ xs: FORCE, ns: DIMENSIONLESS }, ['xs', 'ns']);
    expect(dimensionOf('sum(xs)', variadic)).toEqual(FORCE);
    expect(dimensionOf('prod(ns)', variadic)).toEqual(DIMENSIONLESS);
    expect(() => dimensionOf('prod(xs)', variadic)).toThrow(/pure series/u);
    expect(() => dimensionOf('xs + xs', variadic)).toThrow(/only be reduced/u);
    expect(() => dimensionOf('sum(F)', ports)).toThrow(/takes a variadic port/u);
  });

  it('keeps a variadic-port reduction dimension-preserving for the descriptive statistics, and count always dimensionless', () => {
    const variadic = scope({ xs: FORCE }, ['xs']);
    expect(dimensionOf('mean(xs)', variadic)).toEqual(FORCE);
    expect(dimensionOf('median(xs)', variadic)).toEqual(FORCE);
    expect(dimensionOf('sdev(xs)', variadic)).toEqual(FORCE);
    expect(dimensionOf('count(xs)', variadic)).toEqual(DIMENSIONLESS);
  });

  it('takes a plain index alongside a reduced variadic port, and refuses a dimensioned one', () => {
    const variadic = scope({ xs: FORCE, n: DIMENSIONLESS, d: LENGTH }, ['xs']);
    expect(dimensionOf('at(xs, n)', variadic)).toEqual(FORCE);
    expect(() => dimensionOf('at(xs, d)', variadic)).toThrow(/plain index/u);
  });

  it('rejects a name that is not a port', () => {
    expect(() => dimensionOf('F / B', ports)).toThrow(/not a port/u);
  });

  it('checks both sides of every comparison in a predicate', () => {
    expect(() =>
      checkPredicateDimensions(parsePredicate('F < d'), ports),
    ).toThrow(/different dimensions/u);
    expect(() =>
      checkPredicateDimensions(parsePredicate('F < F and d < d'), ports),
    ).not.toThrow();
  });
});

describe('constant folding', () => {
  it('folds what has no port in it', () => {
    expect(constantValue(parseExpression('1/3'))).toBeCloseTo(1 / 3, 15);
    expect(constantValue(parseExpression('2 * pi'))).toBeCloseTo(Math.PI * 2, 12);
    expect(constantValue(parseExpression('d * 2'))).toBeUndefined();
    expect(constantValue(parseExpression('sqrt(4)'))).toBeUndefined();
  });
});
