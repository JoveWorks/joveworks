/**
 * Deriving a `Formula` from a closure node's own expression.
 *
 * A closure node carries no declared ports — that is the whole point of it
 * (ROADMAP.md: "a student writes an equation in a field, and the ports
 * populate themselves from whatever symbols the expression uses"). This file
 * is the derivation: every free name becomes a generic input port, each with
 * its **own** independent dimension variable — deliberately not unified
 * across ports the way a hand-authored base node like `add` unifies both of
 * its inputs onto one `$A`.
 *
 * That is not a shortcut; it is the only sound option here. A hand-authored
 * base node is reused across a whole graph, so its output needs a single
 * *reusable* generic template (`$A*$B`), and a template like that can only
 * express "these two ports share a dimension" by literally sharing a
 * variable. A closure node has exactly one instance — its expression is
 * fixed the moment it is typed — so there is nothing to keep reusable, and
 * `graph.ts` proves the output's dimension **live**, from whatever is
 * actually wired, via `expressionDimension`. That already enforces every
 * rule this needs (same dimension across `+`/`-`, an angle into `sin`, a
 * dimensionless argument to `log`) without this file having to predict it —
 * and, unlike a hand-written template, it gets `a*b + c*d` right: two
 * independent products that merely need to match, not four ports forced onto
 * one shared dimension.
 */

import type { Formula, Port } from '@mds/schema';
import { CLOSURE_RESULT_PORT } from '@mds/schema';
import { parseGenericDimension } from '@mds/units';

import type { Expr } from './ast.js';
import { expressionNames } from './ast.js';
import { KernelError } from './errors.js';
import { CONSTANTS, REDUCTIONS } from './functions.js';
import { parseExpression } from './parse.js';

/** Every free name that is ever the sole argument of a reduction — `sum(xs)`, not `xs` alone. */
function reductionArguments(expr: Expr, into: Set<string>): void {
  switch (expr.kind) {
    case 'number':
    case 'name':
      return;
    case 'unary':
      reductionArguments(expr.operand, into);
      return;
    case 'binary':
      reductionArguments(expr.left, into);
      reductionArguments(expr.right, into);
      return;
    case 'call': {
      const [only] = expr.args;
      if (REDUCTIONS.has(expr.callee) && expr.args.length === 1 && only?.kind === 'name') {
        into.add(only.name);
      }
      for (const arg of expr.args) reductionArguments(arg, into);
    }
  }
}

/**
 * Derive a `Formula` from a closure node's expression: one generic port per
 * free name it mentions, sorted alphabetically, plus the fixed `result`
 * output. Throws a `KernelError` on a parse failure or on a name that
 * collides with the output's own.
 */
export function closureFormula(expression: string): Formula {
  if (expression.trim().length === 0) {
    throw new KernelError('type an equation, e.g. a + b');
  }
  const expr = parseExpression(expression);
  const spectra = new Set<string>();
  reductionArguments(expr, spectra);

  const names = [...expressionNames(expr)]
    .filter((name) => CONSTANTS[name] === undefined)
    .sort();

  if (names.includes(CLOSURE_RESULT_PORT)) {
    throw new KernelError(
      `'${CLOSURE_RESULT_PORT}' is this node's own output name — rename that symbol in the expression`,
    );
  }

  const inputs: Port[] = names.map((name) =>
    spectra.has(name)
      ? { kind: 'spectrum', name, unit: parseGenericDimension(`$${name}`) }
      : { kind: 'numeric', name, unit: parseGenericDimension(`$${name}`) },
  );

  return {
    id: 'closure',
    version: 1,
    // Inert placeholder — never resolved or checked. graph.ts proves the
    // output's real dimension live, and formula.ts's compileClosureFormula
    // skips the self-check that would otherwise compare this to it.
    output: { kind: 'numeric', name: CLOSURE_RESULT_PORT, unit: parseGenericDimension('$result') },
    inputs,
    expression,
    description: '',
    status: 'unverified',
  };
}
