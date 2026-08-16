/**
 * Parsing of unit strings and of the predecessor corpus's `'[unit] description'`
 * symbol tags.
 *
 * Grammar, deliberately small:
 *
 *     expression := term (separator term)*
 *     separator  := '/' | '*' | '·' | '.' | whitespace
 *     term       := (symbol | '1') exponent?
 *     exponent   := superscript+ | ('**' | '^')? sign? digits
 *
 * `/` binds to the single term that follows it, so `N/mm/s` is `N/(mm·s)` and
 * never `(N/mm)·s`. `s-1`, `mm²`, `mm**2` and `mm^2` are all accepted, because
 * all of those spellings occur in the tags this has to read.
 *
 * There is no fallback: an unrecognised symbol raises. An undeclared
 * unit is a hard error, and a unit that silently parses to the wrong thing is the
 * same failure wearing a better disguise.
 */

import type { Dimension } from './dimension.js';
import { DIMENSIONLESS, multiplyDimensions, divideDimensions, powerDimension } from './dimension.js';
import { UnitError, lookupAtomicUnit, type Unit } from './unit.js';

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '-',
  '⁺': '+',
};

const SEPARATORS = new Set(['*', '·', '.', ' ', '\t']);

function isSymbolChar(c: string): boolean {
  return /[A-Za-zµμ°%]/u.test(c);
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

class Scanner {
  private index = 0;

  constructor(private readonly text: string) {}

  get done(): boolean {
    return this.index >= this.text.length;
  }

  peek(offset = 0): string | undefined {
    return this.text[this.index + offset];
  }

  next(): string | undefined {
    return this.text[this.index++];
  }

  takeWhile(predicate: (c: string) => boolean): string {
    const start = this.index;
    while (!this.done) {
      const c = this.text[this.index];
      if (c === undefined || !predicate(c)) break;
      this.index += 1;
    }
    return this.text.slice(start, this.index);
  }

  get position(): number {
    return this.index;
  }
}

function parseExponent(scanner: Scanner, original: string): number {
  const superscripts = scanner.takeWhile((c) => c in SUPERSCRIPT_DIGITS);
  if (superscripts.length > 0) {
    const digits = [...superscripts].map((c) => SUPERSCRIPT_DIGITS[c]).join('');
    const value = Number(digits);
    if (!Number.isInteger(value)) {
      throw new UnitError(`unit '${original}': '${superscripts}' is not an integer exponent`);
    }
    return value;
  }

  // A single '*' is multiplication and belongs to the caller; only '**' and '^'
  // introduce an exponent here.
  if (scanner.peek() === '*' && scanner.peek(1) === '*') {
    scanner.next();
    scanner.next();
  } else if (scanner.peek() === '^') {
    scanner.next();
  } else if (scanner.peek() === '*') {
    return 1;
  }

  const sign = scanner.peek() === '-' || scanner.peek() === '+' ? (scanner.next() as string) : '';
  const digits = scanner.takeWhile(isDigit);
  if (digits.length === 0) {
    if (sign.length > 0) {
      throw new UnitError(`unit '${original}': '${sign}' without an exponent`);
    }
    return 1;
  }
  return Number(sign + digits);
}

interface Factorised {
  dimension: Dimension;
  factor: number;
}

/**
 * Parse a unit expression into dimension and conversion factor. Accepts the
 * empty string as dimensionless — `[]` in the corpus means "declared, and it is
 * a pure number", which is not the same as an undeclared unit.
 */
export function parseUnitExpression(text: string): Factorised {
  const original = text;
  const scanner = new Scanner(text.trim());

  let dimension: Dimension = DIMENSIONLESS;
  let factor = 1;
  let invert = false;
  let terms = 0;

  while (!scanner.done) {
    const c = scanner.peek() as string;

    if (SEPARATORS.has(c)) {
      scanner.next();
      continue;
    }
    if (c === '/') {
      scanner.next();
      if (terms === 0) {
        throw new UnitError(`unit '${original}': cannot start with '/'`);
      }
      invert = true;
      continue;
    }

    let termDimension: Dimension;
    let termFactor: number;

    if (isDigit(c)) {
      const literal = scanner.takeWhile(isDigit);
      if (literal !== '1') {
        throw new UnitError(
          `unit '${original}': '${literal}' is not a unit — only '1' may appear, as in '1/min'`,
        );
      }
      termDimension = DIMENSIONLESS;
      termFactor = 1;
    } else if (isSymbolChar(c)) {
      const symbol = scanner.takeWhile(isSymbolChar);
      const atomic = lookupAtomicUnit(symbol);
      if (atomic === undefined) {
        throw new UnitError(`unit '${original}': unknown unit symbol '${symbol}'`);
      }
      termDimension = atomic.dimension;
      termFactor = atomic.factor;
    } else {
      throw new UnitError(
        `unit '${original}': unexpected character '${c}' at position ${scanner.position}`,
      );
    }

    const exponent = parseExponent(scanner, original);
    termDimension = powerDimension(termDimension, exponent);
    termFactor = Math.pow(termFactor, exponent);

    if (invert) {
      dimension = divideDimensions(dimension, termDimension);
      factor /= termFactor;
      invert = false;
    } else {
      dimension = multiplyDimensions(dimension, termDimension);
      factor *= termFactor;
    }
    terms += 1;
  }

  if (invert) {
    throw new UnitError(`unit '${original}': trailing '/'`);
  }

  return { dimension, factor };
}

/** Parse a unit string — `N/mm²`, `kg/dm³`, `rpm`, `''` — into a `Unit`. */
export function parseUnit(text: string): Unit {
  const { dimension, factor } = parseUnitExpression(text);
  return { symbol: text.trim(), dimension, factor };
}

export interface UnitTag {
  readonly unit: Unit;
  readonly description: string;
}

/**
 * Read a predecessor symbol-dict entry: `'[N] normal force needed'`.
 *
 * A missing `[...]` is an undeclared unit and therefore a hard error —
 * never a dimensionless default. A tag that parses to nothing recognisable is
 * also an error here; quarantining the formula that owns it is the
 * caller's decision, not this parser's.
 */
export function parseUnitTag(text: string): UnitTag {
  const match = /^\s*\[([^\]]*)\]\s*(.*)$/s.exec(text);
  if (match === null) {
    throw new UnitError(
      `undeclared unit in tag ${JSON.stringify(text)} — expected a leading '[unit]'`,
    );
  }
  const [, tag = '', description = ''] = match;
  return { unit: parseUnit(tag), description: description.trim() };
}
