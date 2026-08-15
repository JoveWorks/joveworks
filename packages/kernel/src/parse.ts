/**
 * Strings to trees (S34/S39).
 *
 * The one rule that shapes this file is what it must **never** do: no `eval`, no
 * `new Function`. A catalogue is a file a student loads from the LMS and passes
 * to a classmate, so a path from an expression string to executed JavaScript
 * would make every shared catalogue arbitrary code execution in a browser. The
 * parser is a few hundred lines and that is the price of not having that hole.
 *
 * Value grammar, in precedence order (loosest first):
 *
 *     expression := term (('+' | '-') term)*
 *     term       := unary (('*' | '/') unary)*
 *     unary      := ('-' | '+') unary | power
 *     power      := primary (('**' | '^') unary)?      -- right associative
 *     primary    := number | name | name '(' args ')' | '(' expression ')'
 *
 * Predicate grammar, layered on top and never inside it (S35's "no conditionals
 * in an expression" is this separation):
 *
 *     predicate   := conjunction ('or' conjunction)*
 *     conjunction := negation ('and' negation)*
 *     negation    := 'not' negation | '(' predicate ')' | comparison
 *     comparison  := expression op expression
 *
 * `**` and `^` both mean exponentiation, matching the unit grammar next door.
 * There is no implicit multiplication: `2 pi r` is a typo, not a product.
 */

import { COMPARISONS, type Comparison } from '@mds/schema';

import type { Expr, Predicate } from './ast.js';
import { KernelError } from './errors.js';

/** Reserved in predicates. A port may not be named one of these. */
export const KEYWORDS = ['and', 'or', 'not'] as const;

type TokenKind = 'number' | 'name' | 'punct' | 'end';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly value: number;
  readonly at: number;
}

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u;
const NAME = /^[\p{L}_][\p{L}\p{N}_]*/u;
const TWO_CHAR = ['**', '<=', '>=', '==', '!='];
const ONE_CHAR = ['+', '-', '*', '/', '^', '(', ')', ',', '<', '>'];

function tokenize(source: string): readonly Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const c = source[i] as string;
    if (/\s/u.test(c)) {
      i += 1;
      continue;
    }

    const rest = source.slice(i);

    const number = NUMBER.exec(rest);
    if (number !== null && (c === '.' ? /^\.\d/u.test(rest) : /\d/u.test(c))) {
      tokens.push({ kind: 'number', text: number[0], value: Number(number[0]), at: i });
      i += number[0].length;
      continue;
    }

    const name = NAME.exec(rest);
    if (name !== null) {
      tokens.push({ kind: 'name', text: name[0], value: 0, at: i });
      i += name[0].length;
      continue;
    }

    const two = TWO_CHAR.find((op) => rest.startsWith(op));
    if (two !== undefined) {
      tokens.push({ kind: 'punct', text: two, value: 0, at: i });
      i += two.length;
      continue;
    }

    if (ONE_CHAR.includes(c)) {
      tokens.push({ kind: 'punct', text: c, value: 0, at: i });
      i += 1;
      continue;
    }

    // '=' alone is the mistake worth naming: it is assignment in every language
    // a student has met, and it is not what a predicate wants.
    if (c === '=') {
      throw new KernelError(`'=' is not an operator — write '==' to compare`, source);
    }
    throw new KernelError(`unexpected character '${c}' at position ${i}`, source);
  }

  tokens.push({ kind: 'end', text: '<end>', value: 0, at: source.length });
  return tokens;
}

const COMPARISON_OPERATORS = new Set<string>(COMPARISONS);

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: readonly Token[],
    readonly source: string,
  ) {}

  private get current(): Token {
    return this.tokens[this.index] as Token;
  }

  private get position(): number {
    return this.index;
  }

  private restore(position: number): void {
    this.index = position;
  }

  private at(text: string): boolean {
    return this.current.kind === 'punct' && this.current.text === text;
  }

  private atKeyword(word: string): boolean {
    return this.current.kind === 'name' && this.current.text === word;
  }

  private take(): Token {
    const token = this.current;
    if (token.kind !== 'end') this.index += 1;
    return token;
  }

  private expect(text: string): void {
    if (!this.at(text)) {
      throw new KernelError(
        `expected '${text}' but found '${this.current.text}' at position ${this.current.at}`,
        this.source,
      );
    }
    this.take();
  }

  end(): void {
    if (this.current.kind !== 'end') {
      throw new KernelError(
        `unexpected '${this.current.text}' at position ${this.current.at}`,
        this.source,
      );
    }
  }

  // --- value expressions ---------------------------------------------------

  expression(): Expr {
    let left = this.term();
    while (this.at('+') || this.at('-')) {
      const operator = this.take().text as '+' | '-';
      left = { kind: 'binary', operator, left, right: this.term() };
    }
    return left;
  }

  private term(): Expr {
    let left = this.unary();
    while (this.at('*') || this.at('/')) {
      const operator = this.take().text as '*' | '/';
      left = { kind: 'binary', operator, left, right: this.unary() };
    }
    return left;
  }

  private unary(): Expr {
    if (this.at('-')) {
      this.take();
      return { kind: 'unary', operator: '-', operand: this.unary() };
    }
    if (this.at('+')) {
      this.take();
      return this.unary();
    }
    return this.power();
  }

  private power(): Expr {
    const base = this.primary();
    if (this.at('**') || this.at('^')) {
      this.take();
      // The exponent goes through `unary`, which gives right associativity and
      // lets `2**-1` parse without parentheses.
      return { kind: 'binary', operator: '**', left: base, right: this.unary() };
    }
    return base;
  }

  private primary(): Expr {
    const token = this.current;

    if (token.kind === 'number') {
      this.take();
      return { kind: 'number', value: token.value };
    }

    if (token.kind === 'name') {
      this.take();
      if ((KEYWORDS as readonly string[]).includes(token.text)) {
        throw new KernelError(
          `'${token.text}' is reserved for predicates and cannot be a value`,
          this.source,
        );
      }
      if (this.at('(')) {
        this.take();
        const args: Expr[] = [];
        if (!this.at(')')) {
          args.push(this.expression());
          while (this.at(',')) {
            this.take();
            args.push(this.expression());
          }
        }
        this.expect(')');
        return { kind: 'call', callee: token.text, args };
      }
      return { kind: 'name', name: token.text };
    }

    if (this.at('(')) {
      this.take();
      const inner = this.expression();
      this.expect(')');
      return inner;
    }

    throw new KernelError(
      `expected a value but found '${token.text}' at position ${token.at}`,
      this.source,
    );
  }

  // --- predicates ----------------------------------------------------------

  predicate(): Predicate {
    let left = this.conjunction();
    while (this.atKeyword('or')) {
      this.take();
      left = { kind: 'or', left, right: this.conjunction() };
    }
    return left;
  }

  private conjunction(): Predicate {
    let left = this.negation();
    while (this.atKeyword('and')) {
      this.take();
      left = { kind: 'and', left, right: this.negation() };
    }
    return left;
  }

  private negation(): Predicate {
    if (this.atKeyword('not')) {
      this.take();
      return { kind: 'not', operand: this.negation() };
    }

    // `(` is ambiguous: `(a < b) and c` opens a predicate, `(a + b) < c` opens
    // an expression. Try the predicate reading and fall back — with a grammar
    // this small, one backtrack is cheaper than a lookahead scanner.
    if (this.at('(')) {
      const mark = this.position;
      try {
        this.take();
        const inner = this.predicate();
        this.expect(')');
        if (!COMPARISON_OPERATORS.has(this.current.text)) return inner;
      } catch (error) {
        if (!(error instanceof KernelError)) throw error;
      }
      this.restore(mark);
    }

    return this.comparison();
  }

  private comparison(): Predicate {
    const left = this.expression();
    const token = this.current;
    if (token.kind !== 'punct' || !COMPARISON_OPERATORS.has(token.text)) {
      throw new KernelError(
        `expected a comparison like '>=' but found '${token.text}' at position ${token.at} — ` +
          'a predicate is a comparison, not a value (S39)',
        this.source,
      );
    }
    this.take();
    return { kind: 'compare', comparison: token.text as Comparison, left, right: this.expression() };
  }
}

/** Parse a value expression. Trailing text is an error, never ignored. */
export function parseExpression(source: string): Expr {
  const parser = new Parser(tokenize(source), source);
  const expr = parser.expression();
  parser.end();
  return expr;
}

/** Parse a boolean predicate — a check's comparison, or an `appliesWhen` (S39). */
export function parsePredicate(source: string): Predicate {
  const parser = new Parser(tokenize(source), source);
  const predicate = parser.predicate();
  parser.end();
  return predicate;
}
