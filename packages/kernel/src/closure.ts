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

import type { Formula, Port } from '@joveworks/schema';
import { CLOSURE_RESULT_PORT } from '@joveworks/schema';
import { parseGenericDimension } from '@joveworks/units';

import type { Expr } from './ast.js';
import { expressionNames } from './ast.js';
import { KernelError } from './errors.js';
import { CONSTANTS, REDUCTIONS } from './functions.js';
import { parseExpression } from './parse.js';

/**
 * Which of a typed expression's names collect wires rather than hold one value.
 *
 * A reduction reads its argument one wired value at a time, so every name in
 * it is a series: `sum(n * q)` totals pairs, and `n` and `q` both collect
 * wires. Every name, except one the expression *also* uses outside a
 * reduction — that use needs a single value, so it settles the question. In
 * `P_ref * sum(P / P_ref)`, `P_ref` is one number and only `P` is a series.
 *
 * A closure node declares no ports — that is the whole point of it — so this
 * is a reading of what was typed rather than a fact it states, and the one
 * ambiguous case it can get wrong is a scalar used nowhere but inside a
 * reduction (`sum(xs * k)`). Every port it decides on is drawn on the node,
 * with a slot per wire, so a wrong reading is visible rather than silent.
 */
function variadicNames(expr: Expr): Set<string> {
  const reduced = new Set<string>();
  const alone = new Set<string>();

  const walk = (node: Expr, reducing: boolean): void => {
    switch (node.kind) {
      case 'number':
        return;
      case 'name':
        (reducing ? reduced : alone).add(node.name);
        return;
      case 'unary':
        walk(node.operand, reducing);
        return;
      case 'binary':
        walk(node.left, reducing);
        walk(node.right, reducing);
        return;
      case 'call': {
        const spec = REDUCTIONS.get(node.callee);
        const [argument, ...extra] = node.args;
        if (spec !== undefined && node.args.length === 1 + (spec.extraArity ?? 0) && argument !== undefined) {
          walk(argument, true);
          // `at(xs, i)`'s index is a position among the values, not one of them.
          for (const rest of extra) walk(rest, reducing);
          return;
        }
        for (const arg of node.args) walk(arg, reducing);
      }
    }
  };

  walk(expr, false);
  for (const name of alone) reduced.delete(name);
  return reduced;
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
  const variadic = variadicNames(expr);

  const names = [...expressionNames(expr)]
    .filter((name) => CONSTANTS[name] === undefined)
    .sort();

  if (names.includes(CLOSURE_RESULT_PORT)) {
    throw new KernelError(
      `'${CLOSURE_RESULT_PORT}' is this node's own output name — rename that symbol in the expression`,
    );
  }

  const inputs: Port[] = names.map((name) => ({
    kind: 'numeric',
    name,
    unit: parseGenericDimension(`$${name}`),
    ...(variadic.has(name) ? { variadic: true } : {}),
  }));

  return {
    id: 'closure',
    version: 1,
    // Inert placeholder — never resolved or checked. graph.ts proves the
    // output's real dimension live, and formula.ts's compileClosureFormula
    // skips the self-check that would otherwise compare this to it.
    outputs: [{ kind: 'numeric', name: CLOSURE_RESULT_PORT, unit: parseGenericDimension('$result') }],
    inputs,
    expressions: { [CLOSURE_RESULT_PORT]: expression },
    description: { en: '' },
    status: 'unverified',
  };
}
