/**
 * `Expr` → LaTeX, for the equation output node (ROADMAP.md: "An Equation
 * output node ... renders that node's `Formula.expression` as typeset math").
 *
 * A pure printer over the AST `parse.ts` already produces — no new parsing,
 * no evaluation, not a CAS. It does not simplify or reorder; it renders the
 * tree exactly as written, adding only the parentheses/`\left(\right)` a
 * reader needs to recover that same tree unambiguously.
 *
 * Name rendering (subscript, Greek stems, primes) mirrors
 * `packages/editor/src/Symbol.tsx`'s `symbolParts`, duplicated rather than
 * shared: the kernel cannot depend on the editor package, and the two want
 * different output shapes (a unicode glyph for an on-canvas label vs. a LaTeX
 * macro for KaTeX) — not enough shared surface to be worth extracting.
 */

import type { BinaryExpr, Expr } from './ast.js';

const LOWER_GREEK = new Set([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'omicron',
  'pi',
  'rho',
  'sigma',
  'tau',
  'upsilon',
  'phi',
  'chi',
  'psi',
  'omega',
]);

/**
 * Only the uppercase Greek letters that actually have a distinct LaTeX
 * macro — `\Alpha`, `\Beta`, `\Epsilon`, etc. do not exist because they are
 * visually identical to Latin letters, so those stems fall back to plain
 * text instead of a broken macro.
 */
const UPPER_GREEK = new Set([
  'Gamma',
  'Delta',
  'Theta',
  'Lambda',
  'Xi',
  'Pi',
  'Sigma',
  'Upsilon',
  'Phi',
  'Psi',
  'Omega',
]);

function stripPrimes(part: string): { readonly stem: string; readonly primes: number } {
  let stem = part;
  let primes = 0;
  while (stem.endsWith('prime')) {
    stem = stem.slice(0, -'prime'.length);
    primes += 1;
  }
  return { stem, primes };
}

function renderPart(part: string): string {
  const { stem, primes } = stripPrimes(part);
  const rendered = LOWER_GREEK.has(stem) || UPPER_GREEK.has(stem) ? `\\${stem}` : stem;
  return rendered + "'".repeat(primes);
}

/** `F_a` → `F_{a}`; `sigma_1` → `\sigma_{1}`; `eprime` → `e'`. */
function renderName(name: string): string {
  const cut = name.indexOf('_');
  if (cut === -1) return renderPart(name);
  return `${renderPart(name.slice(0, cut))}_{${renderPart(name.slice(cut + 1))}}`;
}

const SCIENTIFIC = /^(-?\d+(?:\.\d+)?)e([+-]?\d+)$/;

function renderNumber(value: number): string {
  const source = String(value);
  const match = SCIENTIFIC.exec(source);
  if (match === null) return source;
  return `${match[1]} \\times 10^{${Number(match[2])}}`;
}

const CALL_MACROS: Readonly<Record<string, string>> = {
  sin: '\\sin',
  cos: '\\cos',
  tan: '\\tan',
  asin: '\\arcsin',
  acos: '\\arccos',
  atan: '\\arctan',
  sinh: '\\sinh',
  cosh: '\\cosh',
  tanh: '\\tanh',
  log: '\\ln',
  exp: '\\exp',
};

function renderCall(callee: string, args: readonly Expr[]): string {
  if (callee === 'sqrt' && args.length === 1) return `\\sqrt{${toLatex(args[0] as Expr)}}`;
  if (callee === 'cbrt' && args.length === 1) return `\\sqrt[3]{${toLatex(args[0] as Expr)}}`;
  if (callee === 'abs' && args.length === 1) return `\\left|${toLatex(args[0] as Expr)}\\right|`;
  if (callee === 'floor' && args.length === 1) {
    return `\\left\\lfloor ${toLatex(args[0] as Expr)} \\right\\rfloor`;
  }
  if (callee === 'ceil' && args.length === 1) {
    return `\\left\\lceil ${toLatex(args[0] as Expr)} \\right\\rceil`;
  }

  const rendered = args.map(toLatex).join(', ');
  if (callee === 'min' || callee === 'max') return `\\${callee}\\left(${rendered}\\right)`;

  const macro = CALL_MACROS[callee];
  if (macro !== undefined) return `${macro}\\left(${rendered}\\right)`;

  return `\\operatorname{${callee}}\\left(${rendered}\\right)`;
}

/** `\left(...\right)` around a rendered operand, unconditionally. */
function grouped(expr: Expr): string {
  return `\\left(${toLatex(expr)}\\right)`;
}

function isAdditive(expr: Expr): expr is BinaryExpr {
  return expr.kind === 'binary' && (expr.operator === '+' || expr.operator === '-');
}

function renderBinary(expr: BinaryExpr): string {
  const { operator, left, right } = expr;

  switch (operator) {
    case '+':
    case '-': {
      const rightRendered = isAdditive(right) ? grouped(right) : toLatex(right);
      return `${toLatex(left)} ${operator} ${rightRendered}`;
    }
    case '*': {
      const leftRendered = isAdditive(left) ? grouped(left) : toLatex(left);
      const rightRendered = isAdditive(right) ? grouped(right) : toLatex(right);
      return `${leftRendered} \\cdot ${rightRendered}`;
    }
    case '/':
      // \frac{}{}'s bracing already delimits both operands completely — no
      // operand of a division ever needs \left(\right) of its own.
      return `\\frac{${toLatex(left)}}{${toLatex(right)}}`;
    case '**': {
      const needsGroup = left.kind === 'binary' || left.kind === 'unary';
      const baseRendered = needsGroup ? grouped(left) : toLatex(left);
      return `${baseRendered}^{${toLatex(right)}}`;
    }
  }
}

export function toLatex(expr: Expr): string {
  switch (expr.kind) {
    case 'number':
      return renderNumber(expr.value);
    case 'name':
      return renderName(expr.name);
    case 'unary': {
      const operand = expr.operand;
      const rendered = isAdditive(operand) ? grouped(operand) : toLatex(operand);
      return `-${rendered}`;
    }
    case 'binary':
      return renderBinary(expr);
    case 'call':
      return renderCall(expr.callee, expr.args);
  }
}
