/**
 * The shapes a parsed expression and a parsed predicate take.
 *
 * Two trees, kept apart on purpose: a value expression is arithmetic and
 * evaluates to a number, a predicate is a comparison and evaluates to a boolean.
 * A predicate *contains* expressions and never the other way round, which is
 * exactly what "no conditionals inside an expression" means as a type.
 *
 * Both are plain data. Nothing here knows how to evaluate itself — that is
 * `compile.ts`, which turns a tree into closures once so a 40 000-point sweep
 * does not walk it per point.
 */

import type { Comparison } from '@joveworks/schema';

export interface NumberExpr {
  readonly kind: 'number';
  readonly value: number;
}

/** A port name, or one of the constants the language defines (`pi`). */
export interface NameExpr {
  readonly kind: 'name';
  readonly name: string;
}

export interface UnaryExpr {
  readonly kind: 'unary';
  readonly operator: '-';
  readonly operand: Expr;
}

export const BINARY_OPERATORS = ['+', '-', '*', '/', '**'] as const;
export type BinaryOperator = (typeof BINARY_OPERATORS)[number];

export interface BinaryExpr {
  readonly kind: 'binary';
  readonly operator: BinaryOperator;
  readonly left: Expr;
  readonly right: Expr;
}

/** A call to a whitelisted function. The whitelist lives in `functions.ts`. */
export interface CallExpr {
  readonly kind: 'call';
  readonly callee: string;
  readonly args: readonly Expr[];
}

export type Expr = NumberExpr | NameExpr | UnaryExpr | BinaryExpr | CallExpr;

export interface ComparePredicate {
  readonly kind: 'compare';
  readonly comparison: Comparison;
  readonly left: Expr;
  readonly right: Expr;
}

export interface LogicalPredicate {
  readonly kind: 'and' | 'or';
  readonly left: Predicate;
  readonly right: Predicate;
}

export interface NotPredicate {
  readonly kind: 'not';
  readonly operand: Predicate;
}

export type Predicate = ComparePredicate | LogicalPredicate | NotPredicate;

/** Every name an expression mentions — ports and constants alike, undeduplicated. */
export function expressionNames(expr: Expr, into: Set<string> = new Set()): Set<string> {
  switch (expr.kind) {
    case 'number':
      break;
    case 'name':
      into.add(expr.name);
      break;
    case 'unary':
      expressionNames(expr.operand, into);
      break;
    case 'binary':
      expressionNames(expr.left, into);
      expressionNames(expr.right, into);
      break;
    case 'call':
      for (const arg of expr.args) expressionNames(arg, into);
      break;
  }
  return into;
}

export function predicateNames(predicate: Predicate, into: Set<string> = new Set()): Set<string> {
  switch (predicate.kind) {
    case 'compare':
      expressionNames(predicate.left, into);
      expressionNames(predicate.right, into);
      break;
    case 'and':
    case 'or':
      predicateNames(predicate.left, into);
      predicateNames(predicate.right, into);
      break;
    case 'not':
      predicateNames(predicate.operand, into);
      break;
  }
  return into;
}
