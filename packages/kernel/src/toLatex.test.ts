import { describe, expect, it } from 'vitest';

import { parseExpression } from './parse.js';
import { toLatex } from './toLatex.js';

function latex(source: string): string {
  return toLatex(parseExpression(source));
}

describe('toLatex', () => {
  it('joins multiplication with \\cdot', () => {
    expect(latex('a*b + c')).toBe('a \\cdot b + c');
  });

  it('lets \\frac delimit its operands — no extra parens around a +/- inside it', () => {
    expect(latex('(a + b) / c')).toBe('\\frac{a + b}{c}');
  });

  it('groups a +/- on the right of another +/-, never on the left', () => {
    expect(latex('x - (y - z)')).toBe('x - \\left(y - z\\right)');
    expect(latex('x - y - z')).toBe('x - y - z');
  });

  it('renders ** as a bare exponent, grouping only a binary/unary base', () => {
    expect(latex('x ** 2')).toBe('x^{2}');
    expect(latex('(x + 1) ** 2')).toBe('\\left(x + 1\\right)^{2}');
  });

  it('maps whitelisted calls to their LaTeX macros', () => {
    expect(latex('sqrt(x ** 2 + y ** 2)')).toBe('\\sqrt{x^{2} + y^{2}}');
    expect(latex('abs(x - y)')).toBe('\\left|x - y\\right|');
    expect(latex('min(a, b, c)')).toBe('\\min\\left(a, b, c\\right)');
  });

  it('falls back to \\operatorname for an unmapped call', () => {
    expect(latex('round(x)')).toBe('\\operatorname{round}\\left(x\\right)');
  });

  it('renders a subscript and a Greek stem', () => {
    expect(latex('F_a')).toBe('F_{a}');
    expect(latex('sigma_1')).toBe('\\sigma_{1}');
  });

  it('strips primes into prime marks', () => {
    expect(latex('eprime')).toBe("e'");
    expect(latex('eprimeprime')).toBe("e''");
  });

  it('renders a plain and a scientific-notation literal', () => {
    expect(latex('2.5*x')).toBe('2.5 \\cdot x');
    expect(latex('0.0000001*x')).toBe('1 \\times 10^{-7} \\cdot x');
  });
});
