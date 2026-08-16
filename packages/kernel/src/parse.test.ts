import { describe, expect, it } from 'vitest';

import { KernelError } from './errors.js';
import { parseExpression, parsePredicate } from './parse.js';

describe('value expressions', () => {
  it('reads a number, a name and a call', () => {
    expect(parseExpression('1.5e3')).toEqual({ kind: 'number', value: 1500 });
    expect(parseExpression('F_t')).toEqual({ kind: 'name', name: 'F_t' });
    expect(parseExpression('sqrt(a)')).toEqual({
      kind: 'call',
      callee: 'sqrt',
      args: [{ kind: 'name', name: 'a' }],
    });
  });

  it('binds * tighter than +', () => {
    expect(parseExpression('a + b * c')).toEqual({
      kind: 'binary',
      operator: '+',
      left: { kind: 'name', name: 'a' },
      right: {
        kind: 'binary',
        operator: '*',
        left: { kind: 'name', name: 'b' },
        right: { kind: 'name', name: 'c' },
      },
    });
  });

  it('associates - to the left, so a - b - c is (a - b) - c', () => {
    const expr = parseExpression('a - b - c');
    expect(expr).toMatchObject({ operator: '-', left: { operator: '-' }, right: { name: 'c' } });
  });

  it('associates ** to the right, and accepts ^ for it', () => {
    const stars = parseExpression('a ** b ** c');
    expect(stars).toMatchObject({ operator: '**', right: { operator: '**' } });
    expect(parseExpression('a ^ b')).toEqual(parseExpression('a ** b'));
  });

  it('binds ** tighter than unary minus, so -a**2 is -(a**2)', () => {
    expect(parseExpression('-a ** 2')).toMatchObject({
      kind: 'unary',
      operand: { operator: '**' },
    });
  });

  it('takes a signed exponent without parentheses', () => {
    expect(parseExpression('a ** -1')).toMatchObject({
      operator: '**',
      right: { kind: 'unary', operand: { value: 1 } },
    });
  });

  it('takes several arguments, and none', () => {
    expect(parseExpression('max(a, b, c)')).toMatchObject({ callee: 'max' });
    expect(parseExpression('f()')).toMatchObject({ callee: 'f', args: [] });
  });

  it('refuses what it cannot read, rather than reading some of it', () => {
    for (const source of ['a +', '(a', 'a b', '2 pi r', 'a @ b', 'a,b', '']) {
      expect(() => parseExpression(source), source).toThrow(KernelError);
    }
  });

  it("names '=' as the mistake it is", () => {
    expect(() => parseExpression('a = b')).toThrow(/write '=='/u);
  });

  it('keeps the predicate keywords out of value expressions', () => {
    expect(() => parseExpression('a and b')).toThrow(KernelError);
    expect(() => parseExpression('not')).toThrow(/reserved/u);
  });
});

describe('predicates', () => {
  it('reads a comparison', () => {
    expect(parsePredicate('S >= 1.5')).toEqual({
      kind: 'compare',
      comparison: '>=',
      left: { kind: 'name', name: 'S' },
      right: { kind: 'number', value: 1.5 },
    });
  });

  it('binds and tighter than or', () => {
    expect(parsePredicate('a < 1 or b < 2 and c < 3')).toMatchObject({
      kind: 'or',
      right: { kind: 'and' },
    });
  });

  it('reads a parenthesised predicate', () => {
    expect(parsePredicate('(a < 1 or b < 2) and c < 3')).toMatchObject({
      kind: 'and',
      left: { kind: 'or' },
    });
  });

  it('still reads a parenthesised expression on the left of a comparison', () => {
    // The one ambiguity in the grammar: '(' opens either. Backtracking is what
    // decides, and this is the case that proves it decides correctly.
    expect(parsePredicate('(a + b) < c')).toMatchObject({
      kind: 'compare',
      left: { operator: '+' },
    });
  });

  it('reads not, and applies it to the nearest predicate', () => {
    expect(parsePredicate('not a < b')).toMatchObject({ kind: 'not', operand: { kind: 'compare' } });
  });

  it('refuses a predicate that is only a value — a check is a comparison', () => {
    expect(() => parsePredicate('a + b')).toThrow(/comparison/u);
  });
});
