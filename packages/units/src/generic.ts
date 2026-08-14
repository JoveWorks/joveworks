/**
 * Generic dimensions: a port that says *"whatever is wired here"* rather than a
 * concrete unit.
 *
 * Every R&M formula names its units, so nothing in the catalogue needs this. The
 * base node library (S42) does, and unavoidably: `add` is `(A, A) → A` for any
 * `A`, and `multiply` is `(A, B) → A·B`. A port that declares `N` cannot say
 * that, and there is no finite set of concrete `add` nodes that covers a
 * dimension algebra with five free exponents.
 *
 * So a signature is a **monomial in dimension variables** — `$A`, `$A*$B`,
 * `$A/$B`, `$A**2`, `$A**(1/2)` — written in the same field as a unit and
 * distinguished by the `$` sigil, which no unit symbol contains. It carries no
 * conversion factor, because a generic port has no display unit to convert from;
 * the unit is whatever the wired source displays in.
 *
 * A signature is *resolved*, not checked: the wiring binds each variable to a
 * real dimension and `resolveGeneric` substitutes. What makes that tractable is
 * the rule enforced one layer up in `schema`, that an **input** port's signature
 * must be a bare variable. Binding `$A` against `N` is an assignment; binding
 * `$A*$B` against `N` would be an equation with infinitely many solutions.
 */

import {
  DIMENSIONLESS,
  multiplyDimensions,
  powerDimension,
  type Dimension,
} from './dimension.js';
import { UnitError } from './unit.js';

/**
 * A monomial in dimension variables. `symbol` is the authored text, kept so a
 * record round-trips and hashes to what its author wrote (S23).
 */
export interface GenericDimension {
  readonly symbol: string;
  /** Exponent per variable name. `$A*$B` is `{ A: 1, B: 1 }`. */
  readonly variables: Readonly<Record<string, number>>;
}

/** The sigil is the whole discriminator: no unit symbol may contain `$`. */
export function isGenericSignature(text: string): boolean {
  return text.includes('$');
}

/** Distinguish the two things a port's unit field may hold. */
export function isGenericDimension(value: {
  readonly symbol: string;
}): value is GenericDimension {
  return 'variables' in value;
}

const SEPARATORS = new Set(['*', '·', '.', ' ', '\t']);

function isNameChar(c: string): boolean {
  return /[A-Za-z0-9]/u.test(c);
}

interface Term {
  readonly name: string;
  readonly exponent: number;
}

/**
 * Read the exponent after a variable. `**2`, `^-1` and `**(1/2)` are all
 * accepted; the parenthesised fraction exists because `cbrt` needs a third and
 * `0.3333` written out is a different number from the one the algebra means.
 */
function readExponent(text: string, start: number, original: string): [number, number] {
  let i = start;
  if (text.startsWith('**', i)) i += 2;
  else if (text[i] === '^') i += 1;
  else return [1, start];

  if (text[i] === '(') {
    const close = text.indexOf(')', i);
    if (close === -1) throw new UnitError(`dimension '${original}': unclosed '(' in exponent`);
    const body = text.slice(i + 1, close);
    const match = /^\s*(-?\d+)\s*\/\s*(\d+)\s*$/u.exec(body);
    if (match === null) {
      throw new UnitError(
        `dimension '${original}': '(${body})' is not a fraction like '(1/3)'`,
      );
    }
    const [, numerator = '', denominator = ''] = match;
    if (Number(denominator) === 0) {
      throw new UnitError(`dimension '${original}': exponent divides by zero`);
    }
    return [Number(numerator) / Number(denominator), close + 1];
  }

  const match = /^[-+]?\d+(\.\d+)?/u.exec(text.slice(i));
  if (match === null) throw new UnitError(`dimension '${original}': '**' without an exponent`);
  return [Number(match[0]), i + match[0].length];
}

function readTerm(text: string, start: number, original: string): [Term, number] {
  if (text[start] !== '$') {
    throw new UnitError(
      `dimension '${original}': expected a '$' variable at position ${start} — ` +
        'a generic signature cannot mix in a concrete unit',
    );
  }
  let i = start + 1;
  while (i < text.length && isNameChar(text[i] as string)) i += 1;
  const name = text.slice(start + 1, i);
  if (name.length === 0) throw new UnitError(`dimension '${original}': '$' without a name`);
  const [exponent, next] = readExponent(text, i, original);
  return [{ name, exponent }, next];
}

/**
 * Parse a generic signature. The grammar mirrors the unit grammar of `parse.ts`
 * deliberately — same separators, same `/`-binds-to-one-term rule — so that a
 * port's unit field reads the same way whichever kind it holds.
 */
export function parseGenericDimension(text: string): GenericDimension {
  const original = text;
  const trimmed = text.trim();
  if (!isGenericSignature(trimmed)) {
    throw new UnitError(`dimension '${original}': not a generic signature — no '$' variable`);
  }

  const variables: Record<string, number> = {};
  let i = 0;
  let invert = false;
  let terms = 0;

  while (i < trimmed.length) {
    const c = trimmed[i] as string;
    if (SEPARATORS.has(c)) {
      i += 1;
      continue;
    }
    if (c === '/') {
      if (terms === 0) throw new UnitError(`dimension '${original}': cannot start with '/'`);
      invert = true;
      i += 1;
      continue;
    }

    const [term, next] = readTerm(trimmed, i, original);
    i = next;
    variables[term.name] = (variables[term.name] ?? 0) + (invert ? -term.exponent : term.exponent);
    invert = false;
    terms += 1;
  }

  if (invert) throw new UnitError(`dimension '${original}': trailing '/'`);
  if (terms === 0) throw new UnitError(`dimension '${original}': is empty`);

  for (const [name, exponent] of Object.entries(variables)) {
    if (exponent === 0) delete variables[name];
  }
  if (Object.keys(variables).length === 0) {
    throw new UnitError(
      `dimension '${original}': cancels to nothing — write '' for dimensionless instead`,
    );
  }

  return { symbol: trimmed, variables };
}

/** The variables a signature mentions, sorted, so messages and tests are stable. */
export function genericVariables(generic: GenericDimension): readonly string[] {
  return Object.keys(generic.variables).sort();
}

/**
 * The single variable of a bare signature — `$A` gives `'A'`, `$A*$B` and
 * `$A**2` give `undefined`.
 *
 * This is what makes resolution an assignment rather than an equation, and it is
 * why `schema` requires it of every generic *input* port.
 */
export function bareVariable(generic: GenericDimension): string | undefined {
  const names = genericVariables(generic);
  const [only] = names;
  if (names.length !== 1 || only === undefined) return undefined;
  return generic.variables[only] === 1 ? only : undefined;
}

/** Substitute bound dimensions into a signature. An unbound variable raises. */
export function resolveGeneric(
  generic: GenericDimension,
  bindings: Readonly<Record<string, Dimension>>,
): Dimension {
  let result = DIMENSIONLESS;
  for (const name of genericVariables(generic)) {
    const bound = bindings[name];
    if (bound === undefined) {
      throw new UnitError(`dimension '${generic.symbol}': '$${name}' is not bound`);
    }
    result = multiplyDimensions(result, powerDimension(bound, generic.variables[name] as number));
  }
  return result;
}
