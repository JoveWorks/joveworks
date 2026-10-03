/**
 * Compiling a graph to a Jupyter notebook a student can keep working in.
 *
 * The NodeBook's PDF is the thing handed in; this is the thing taken home. It
 * writes the graph out as Python in the working style of the course's
 * MechDesign notebooks — build an equation symbolically, show it with
 * `HM.EqPrint`, then put the numbers in — so a student who wants a step the
 * editor does not offer can add it in a cell instead of starting over.
 *
 * Three decisions shape everything below:
 *
 * - **Values stay canonical.** A catalogue expression is written for
 *   mm-N-s-rad-K numbers, bare constants included, so the notebook computes
 *   in exactly those and converts at the boundary the way the kernel does. A
 *   unit is a conversion factor that remembers its symbol (`90*mm_` in,
 *   `F_t/N_` out) — the predecessor's trailing-underscore spelling, without
 *   its symbolic units, which a bare constant in an expression would break.
 * - **The kernel stays the authority.** This is a printer over the same AST
 *   `toLatex.ts` prints, not a second evaluator. Anything it cannot say
 *   faithfully in a few lines of Python — a lookup table, a selection, a
 *   Monte Carlo run — is *carried over* as the values the kernel already
 *   computed, and marked as such, rather than re-implemented approximately.
 * - **Expressions leave with the file.** A PDF export carries citations and
 *   numbers only (OVERVIEW.md, "Exporting"); a notebook that recomputes
 *   cannot. So the result names every restricted catalogue it drew from, the
 *   notebook carries the restriction on its first page, and the caller is
 *   expected to say so before saving it.
 */

import {
  CONSTANTS,
  FUNCTIONS,
  KernelError,
  REDUCTIONS,
  canonicalUnit,
  endpointKey,
  parseExpression,
  type Evaluation,
  type Expr,
  type Resolution,
} from '@joveworks/kernel';
import {
  THRESHOLD_PORT,
  VALUE_PORT,
  VERDICT_PORT,
  START_PORT,
  STOP_PORT,
  COUNT_PORT,
  localize,
  plotMeasures,
  plotThresholdPort,
  renardValues,
  type Catalogue,
  type Edge,
  type Formula,
  type GraphDocument,
  type GraphNode,
  type InputNode,
  type OutputNode,
  type Port,
  type Quantity,
  type RangeNode,
} from '@joveworks/schema';
import { DIMENSIONLESS, isDimensionless, isGenericDimension, type Unit } from '@joveworks/units';

import { notebookSectionId, readingOrder } from './notebook';

/** What `compileJupyter` reads of an `Analysis` — narrowed so a test needs no React. */
export interface JupyterSource {
  readonly resolution?: Resolution | undefined;
  readonly evaluation?: Evaluation | undefined;
  readonly formulas: ReadonlyMap<string, Formula>;
  readonly sources: ReadonlyMap<string, Catalogue>;
}

export interface JupyterOptions {
  readonly locale?: 'en' | 'nl';
  /** Written into the first cell — `2026-10-03`. Left out, the notebook does not date itself. */
  readonly generatedOn?: string;
}

export interface JupyterCell {
  readonly cell_type: 'markdown' | 'code';
  readonly id: string;
  readonly metadata: Record<string, never>;
  readonly source: readonly string[];
  readonly outputs?: readonly never[];
  readonly execution_count?: null;
}

export interface JupyterNotebook {
  readonly nbformat: 4;
  readonly nbformat_minor: 5;
  readonly metadata: {
    readonly kernelspec: { readonly display_name: string; readonly language: string; readonly name: string };
    readonly language_info: { readonly name: string };
  };
  readonly cells: readonly JupyterCell[];
}

export interface JupyterExport {
  readonly notebook: JupyterNotebook;
  /** Names of the restricted catalogues whose expressions the notebook now contains. */
  readonly restricted: readonly string[];
  /** What each node carried over as values, rather than translated, is called. */
  readonly carried: readonly string[];
}

/** More cells than this and a carried-over grid is left as a placeholder instead of a literal. */
const CARRY_LIMIT = 2000;

const PLAIN_NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** Names the generated Python may not rebind: the language's own, and the first cell's. */
const RESERVED = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'match', 'case', 'type', 'abs', 'min', 'max', 'sum', 'round', 'len', 'range', 'zip', 'enumerate',
  'float', 'int', 'str', 'list', 'dict', 'print', 'display', 'operator', 'np', 'sp', 'plt', 'HM',
  'SimpleNamespace', 'Unit', 'NO_UNIT', 'N_AXES', 'GRID', 'COMPARISONS', 'sweep', 'along', 'symbols',
  'evaluate', 'show', 'check', 'table', 'sym', 'fig', 'ax',
]);

/** The first code cell's helpers. Unit definitions and the axis count are spliced in around it. */
const HELPERS = `
GRID = [%GRID%]          # how many points each swept input has
N_AXES = len(GRID)


def sweep(values, axis):
    """A swept input. Each sweep varies along its own array axis, so combining two gives a grid."""
    values = np.asarray(values)
    if values.dtype.kind not in 'US':
        values = values.astype(float)
    GRID[axis] = values.size
    return values.reshape((-1,) + (1,) * (N_AXES - 1 - axis))


def along(value, *axes):
    """\`value\` as an array over just these sweep axes, in this order - what a plot wants."""
    value = np.asarray(value)
    value = value.reshape((1,) * (N_AXES - value.ndim) + value.shape)
    rest = [k for k in range(N_AXES) if k not in axes]
    if any(value.shape[k] != 1 for k in rest):
        raise ValueError('this value also varies along a sweep that is not being plotted')
    full = np.broadcast_to(value, [GRID[k] if k in axes else 1 for k in range(N_AXES)])
    return np.transpose(full, list(axes) + rest).reshape([GRID[k] for k in axes])


def symbols(**described):
    """The symbols of one equation, each with its description - HM.MyHelp(equation) lists them."""
    return SimpleNamespace(**{name: HM.MySymbol(name, text) for name, text in described.items()})


def evaluate(equation, sym, /, **values):
    """Put numbers (or whole sweeps) into a symbolic equation."""
    names = list(values)
    numbers = np.broadcast_arrays(*[np.asarray(values[name], dtype=float) for name in names])
    function = sp.lambdify([getattr(sym, name) for name in names], equation, 'numpy')
    with np.errstate(all='ignore'):
        return np.asarray(function(*numbers), dtype=float)[()]


def show(name, value, unit=NO_UNIT, figures=4):
    """Print a result in the unit it should be read in."""
    value = np.asarray(value)
    if value.dtype.kind in 'US':
        print(f'{name} = {value[()]}' if value.ndim == 0 else f'{name} = {value.size} values')
        return
    value = value / unit
    if value.size == 1:
        print(f'{name} = {float(value.reshape(-1)[0]):.{figures}g} {unit.symbol}'.rstrip())
    else:
        low, high = np.nanmin(value), np.nanmax(value)
        print(f'{name} = {low:.{figures}g} ... {high:.{figures}g} {unit.symbol}'.rstrip() + f'  ({value.size} values)')


def check(name, value, comparison, threshold, unit=NO_UNIT, figures=4):
    """An assertion: does the value keep to its bound - everywhere, if it is swept?"""
    value = np.asarray(value, dtype=float)
    passed = COMPARISONS[comparison](value, threshold)
    bound = f'{comparison} {float(np.max(threshold / unit)):.{figures}g} {unit.symbol}'.rstrip()
    if passed.size == 1:
        mark = 'pass' if passed.all() else 'FAIL'
        print(f'[{mark}] {name} = {float(value.reshape(-1)[0] / unit):.{figures}g} {bound}')
    else:
        mark = 'pass' if passed.all() else 'FAIL' if not passed.any() else 'part'
        print(f'[{mark}] {name} {bound}: holds at {int(passed.sum())} of {passed.size} points')
    return passed


def table(columns, figures=4):
    """A swept study as rows: one row per point of the grid."""
    names = list(columns)
    cells = np.broadcast_arrays(*[np.asarray(columns[name]) for name in names])
    rows = [[v if isinstance(v, str) else f'{v:.{figures}f}' for v in row]
            for row in zip(*[c.reshape(-1).tolist() for c in cells])]
    widths = [max(len(n), *(len(r[i]) for r in rows)) for i, n in enumerate(names)]
    print('  '.join(n.rjust(w) for n, w in zip(names, widths)))
    for row in rows:
        print('  '.join(c.rjust(w) for c, w in zip(row, widths)))
`.trim();

const IMPORTS = `
import operator
from types import SimpleNamespace

import numpy as np
import sympy as sp
import matplotlib.pyplot as plt

try:
    import MechDesign.Helpers as HM        # the course library: MySymbol, EqPrint, MyHelp
except ImportError:                        # not installed - stand-ins that do the same job
    from IPython.display import display

    class HM:
        @staticmethod
        def MySymbol(name, description=''):
            return sp.Symbol(name, real=True)

        @staticmethod
        def EqPrint(variable, expression):
            equation = sp.Eq(sp.Symbol(variable), expression, evaluate=False)
            display(equation)
            return equation

        @staticmethod
        def MyHelp(expression):
            display(expression)


class Unit(float):
    """A conversion factor into the units everything is computed in, that remembers how it is written."""

    def __new__(cls, factor, symbol=''):
        unit = super().__new__(cls, factor)
        unit.symbol = symbol
        return unit


NO_UNIT = Unit(1.0)
COMPARISONS = {'<': operator.lt, '<=': operator.le, '>': operator.gt, '>=': operator.ge,
               '==': operator.eq, '!=': operator.ne}
`.trim();

/** A construct the printer has no faithful Python for — the node is carried over instead. */
class Untranslatable extends Error {}

function pyString(text: string): string {
  return JSON.stringify(text);
}

function pyNumber(value: number): string {
  if (Number.isNaN(value)) return 'np.nan';
  if (!Number.isFinite(value)) return value > 0 ? 'np.inf' : '-np.inf';
  return Object.is(value, -0) ? '0' : String(value);
}

/** Drop the float noise a canonical → display round trip leaves behind (`2186.9999999999995`). */
function tidy(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(14)) : value;
}

function identifier(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const cleaned = text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_]+/gu, '_')
    // A trailing underscore is how a unit is spelled here; a value never has one.
    .replace(/^_+|_+$/gu, '')
    .slice(0, 32)
    .replace(/_+$/gu, '');
  if (cleaned.length === 0) return undefined;
  return /^\p{N}/u.test(cleaned) ? `v_${cleaned}` : cleaned;
}

const UNIT_SPELLING: readonly (readonly [RegExp, string])[] = [
  [/²/gu, '2'],
  [/³/gu, '3'],
  [/°/gu, 'deg'],
  [/%/gu, 'percent'],
  [/[µμ]/gu, 'u'],
  [/\//gu, '_per_'],
  [/-/gu, 'inv'],
  [/[\^()]/gu, ''],
];

/** Every Python name the notebook defines, handed out once. */
class Names {
  private readonly taken = new Set<string>(RESERVED);

  claim(preferred: string | undefined, fallback: string): string {
    const base = identifier(preferred) ?? fallback;
    let name = base;
    for (let n = 2; this.taken.has(name); n += 1) name = `${base}_${n}`;
    this.taken.add(name);
    return name;
  }
}

/** The units the notebook mentions, each defined once in the first cell. */
class Units {
  private readonly names = new Map<string, string>();
  private readonly lines: string[] = [];

  /** The Python name of a unit, or `undefined` for the plain dimensionless one. */
  ref(unit: Unit): string | undefined {
    if (unit.symbol === '' && unit.factor === 1) return undefined;
    const key = `${unit.symbol}\u0000${unit.factor}`;
    const known = this.names.get(key);
    if (known !== undefined) return known;
    const spelled = UNIT_SPELLING.reduce((text, [from, to]) => text.replace(from, to), unit.symbol);
    const base = identifier(spelled) ?? 'factor';
    let name = `${base}_`;
    for (let n = 2; [...this.names.values()].includes(name); n += 1) name = `${base}${n}_`;
    this.names.set(key, name);
    this.lines.push(`${name} = Unit(${pyNumber(unit.factor)}, ${pyString(unit.symbol)})`);
    return name;
  }

  times(code: string, unit: Unit): string {
    const name = this.ref(unit);
    return name === undefined ? code : `${code}*${name}`;
  }

  over(code: string, unit: Unit): string {
    const name = this.ref(unit);
    return name === undefined ? code : `${code}/${name}`;
  }

  definitions(): readonly string[] {
    return [...this.lines].sort();
  }
}

// --- expressions --------------------------------------------------------------

type Dialect = 'sympy' | 'numpy';

const CALLS: Readonly<Record<Dialect, Readonly<Record<string, string>>>> = {
  sympy: {
    abs: 'sp.Abs', sqrt: 'sp.sqrt', cbrt: 'sp.cbrt', floor: 'sp.floor', ceil: 'sp.ceiling',
    sin: 'sp.sin', cos: 'sp.cos', tan: 'sp.tan', asin: 'sp.asin', acos: 'sp.acos', atan: 'sp.atan',
    sinh: 'sp.sinh', cosh: 'sp.cosh', tanh: 'sp.tanh', log: 'sp.log', exp: 'sp.exp',
  },
  numpy: {
    abs: 'np.abs', sqrt: 'np.sqrt', cbrt: 'np.cbrt', floor: 'np.floor', ceil: 'np.ceil',
    sin: 'np.sin', cos: 'np.cos', tan: 'np.tan', asin: 'np.arcsin', acos: 'np.arccos', atan: 'np.arctan',
    sinh: 'np.sinh', cosh: 'np.cosh', tanh: 'np.tanh', log: 'np.log', exp: 'np.exp',
  },
};

interface PrintContext {
  readonly dialect: Dialect;
  /** A plain name's Python: a symbol in one dialect, a value in the other. */
  readonly name: (name: string) => string;
  /** How many wires a variadic port holds, and the Python for its k-th. */
  readonly wires: (name: string) => number | undefined;
  readonly wire: (name: string, index: number) => string;
  readonly unit: (code: string, unit: Unit) => string;
  /** Set while printing one term of a reduction. */
  readonly index?: number;
}

// Python's own binding strengths, so the tree read back is the tree printed.
const ADD = 1;
const MUL = 2;
const NEG = 3;
const POW = 4;
const ATOM = 5;

function extremum(dialect: Dialect, least: boolean, terms: readonly string[]): string {
  if (terms.length === 1) return terms[0] as string;
  if (dialect === 'sympy') return `${least ? 'sp.Min' : 'sp.Max'}(${terms.join(', ')})`;
  const fn = least ? 'np.minimum' : 'np.maximum';
  return terms.slice(1).reduce((nested, term) => `${fn}(${nested}, ${term})`, terms[0] as string);
}

function variadicNames(expr: Expr, context: PrintContext, into: Set<string> = new Set()): Set<string> {
  switch (expr.kind) {
    case 'number':
      break;
    case 'name':
      if (context.wires(expr.name) !== undefined) into.add(expr.name);
      break;
    case 'unary':
      variadicNames(expr.operand, context, into);
      break;
    case 'binary':
      variadicNames(expr.left, context, into);
      variadicNames(expr.right, context, into);
      break;
    case 'call':
      for (const arg of expr.args) variadicNames(arg, context, into);
      break;
  }
  return into;
}

/** A reduction over a variadic port, written out term by term — the wire count is known here. */
function printReduction(callee: string, args: readonly Expr[], context: PrintContext): string {
  const [argument] = args;
  if (argument === undefined || args.length !== 1) throw new Untranslatable(callee);
  const counts = new Set([...variadicNames(argument, context)].map((name) => context.wires(name)));
  const [count] = counts;
  if (counts.size !== 1 || count === undefined || count === 0) throw new Untranslatable(callee);
  const terms = Array.from({ length: count }, (_, index) => print(argument, { ...context, index }, ADD + 1));
  switch (callee) {
    case 'sum':
      return `(${terms.join(' + ')})`;
    case 'prod':
      return `(${terms.join('*')})`;
    case 'mean':
      return `((${terms.join(' + ')})/${count})`;
    case 'count':
      return String(count);
    case 'least':
      return extremum(context.dialect, true, terms);
    case 'greatest':
      return extremum(context.dialect, false, terms);
    default:
      // `median`, `sdev`, `at`: no short elementwise form in both dialects.
      throw new Untranslatable(callee);
  }
}

function print(expr: Expr, context: PrintContext, minimum = ADD): string {
  const wrap = (code: string, strength: number): string => (strength < minimum ? `(${code})` : code);
  switch (expr.kind) {
    case 'number': {
      if (expr.quantity !== undefined) {
        return wrap(context.unit(pyNumber(expr.quantity.written), expr.quantity.unit), MUL);
      }
      return expr.value < 0 ? wrap(pyNumber(expr.value), NEG) : pyNumber(expr.value);
    }
    case 'name': {
      if (CONSTANTS[expr.name] !== undefined) return context.dialect === 'sympy' ? `sp.${expr.name}` : `np.${expr.name}`;
      if (context.wires(expr.name) === undefined) return context.name(expr.name);
      if (context.index === undefined) throw new Untranslatable(expr.name);
      return context.wire(expr.name, context.index);
    }
    case 'unary':
      return wrap(`-${print(expr.operand, context, NEG)}`, NEG);
    case 'binary': {
      const { operator, left, right } = expr;
      if (operator === '**') return wrap(`${print(left, context, ATOM)}**${print(right, context, NEG)}`, POW);
      // An integer ratio stays exact in an equation that is going to be typeset.
      if (
        operator === '/' && context.dialect === 'sympy' &&
        left.kind === 'number' && right.kind === 'number' &&
        left.quantity === undefined && right.quantity === undefined &&
        Number.isInteger(left.value) && Number.isInteger(right.value) && right.value !== 0
      ) {
        return `sp.Rational(${left.value}, ${right.value})`;
      }
      const strength = operator === '+' || operator === '-' ? ADD : MUL;
      const spaced = strength === ADD ? ` ${operator} ` : operator;
      return wrap(`${print(left, context, strength)}${spaced}${print(right, context, strength + 1)}`, strength);
    }
    case 'call': {
      if (REDUCTIONS.has(expr.callee)) return printReduction(expr.callee, expr.args, context);
      if (!FUNCTIONS.has(expr.callee)) throw new Untranslatable(expr.callee);
      const args = expr.args.map((arg) => print(arg, context));
      if (expr.callee === 'min' || expr.callee === 'max') return extremum(context.dialect, expr.callee === 'min', args);
      // `Math.round` rounds a half up; Python's and NumPy's round it to even.
      if (expr.callee === 'round') return `${CALLS[context.dialect]['floor']}(${args[0]} + 0.5)`;
      const callee = CALLS[context.dialect][expr.callee];
      if (callee === undefined) throw new Untranslatable(expr.callee);
      return `${callee}(${args.join(', ')})`;
    }
  }
}

// --- the compiler -------------------------------------------------------------

interface Cell {
  readonly kind: 'markdown' | 'code';
  readonly lines: string[];
  /** Givens and plain arithmetic run on in one cell, the way a course notebook states them together. */
  readonly light?: boolean;
}

function keyword(name: string, value: string): string {
  return `${name}=${value}`;
}

/** `f(a=1, b=2)`, or the `**{...}` spelling when a name is not one Python accepts bare. */
function keywords(pairs: readonly (readonly [string, string])[]): string {
  if (pairs.every(([name]) => PLAIN_NAME.test(name) && !RESERVED.has(name))) {
    return pairs.map(([name, value]) => keyword(name, value)).join(', ');
  }
  return `**{${pairs.map(([name, value]) => `${pyString(name)}: ${value}`).join(', ')}}`;
}

function attribute(object: string, name: string): string {
  return PLAIN_NAME.test(name) && !RESERVED.has(name) ? `${object}.${name}` : `getattr(${object}, ${pyString(name)})`;
}

function comment(text: string): string[] {
  return text.split(/\r?\n/u).map((line) => `# ${line}`.trimEnd());
}

const NODE_NAMES: Readonly<Record<GraphNode['kind'], string>> = {
  input: 'input',
  range: 'range',
  file: 'file',
  table: 'table',
  formula: 'formula',
  output: 'output',
  compare: 'comparison',
  select: 'selection',
  statistic: 'statistic',
  closure: 'equation',
  waypoint: 'waypoint',
  pack: 'pack',
  unpack: 'unpack',
  monteCarloGenerator: 'Monte Carlo generator',
  monteCarloReceiver: 'Monte Carlo receiver',
};

export function compileJupyter(
  document: GraphDocument,
  analysis: JupyterSource,
  options: JupyterOptions = {},
): JupyterExport {
  const { resolution, evaluation } = analysis;
  if (resolution === undefined) {
    throw new Error('this graph does not resolve yet — fix what the canvas marks, then export');
  }
  const locale = options.locale ?? document.notebookLocale ?? 'en';
  const names = new Names();
  const units = new Units();
  const cells: Cell[] = [];
  const variables = new Map<string, string>();
  const equations = new Map<string, string>();
  const categorical = new Set<string>();
  const restricted = new Set<string>();
  const carried: string[] = [];
  const nodes = new Map(document.nodes.map((node) => [node.id, node] as const));

  // One array axis per swept input, in the kernel's own axis order.
  const sweeps = [...new Map([...resolution.axes.values()].map((axis) => [axis.id, axis] as const)).values()]
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  const axisIds = sweeps.map((axis) => axis.id);
  const axisPosition = (id: string): number | undefined => {
    const at = axisIds.indexOf(id);
    return at === -1 ? undefined : at;
  };

  const incoming = (node: string, port: string): readonly Edge[] =>
    resolution.incoming.get(endpointKey(node, port)) ?? [];
  const outgoing = (node: string): readonly Edge[] => document.edges.filter((edge) => edge.from.node === node);
  const variableAt = (edge: Edge | undefined): string | undefined =>
    edge === undefined ? undefined : variables.get(endpointKey(edge.from.node, edge.from.port));
  const displayUnit = (key: string): Unit => {
    const type = resolution.sources.get(key);
    return type?.unit ?? canonicalUnit(type?.dimension ?? DIMENSIONLESS);
  };
  const titleOf = (node: GraphNode): string => node.label ?? analysis.formulas.get(node.id)?.citation ?? node.id;

  const code = (lines: readonly string[], light = false): void => {
    const last = cells[cells.length - 1];
    if (light && last?.light === true) last.lines.push(...lines);
    else cells.push({ kind: 'code', lines: [...lines], ...(light ? { light } : {}) });
  };
  const markdown = (lines: readonly string[]): void => {
    cells.push({ kind: 'markdown', lines: [...lines] });
  };

  // --- values the kernel already holds -------------------------------------

  /** A computed value as a Python literal in `unit`, shaped over its own sweep axes. */
  const literal = (key: string): string | undefined => {
    const value = evaluation?.values.get(key);
    if (value === undefined || value.kind === 'bundle') return undefined;
    const shape = axisIds.map(() => 1);
    for (const axis of value.axes) {
      const at = axisPosition(axis.id);
      if (at === undefined) return undefined;
      shape[at] = axis.length;
    }
    while (shape.length > 1 && shape[0] === 1) shape.shift();
    const unit = value.kind === 'numeric' ? displayUnit(key) : undefined;
    const cell = (entry: number | string): string =>
      typeof entry === 'string' ? pyString(entry) : pyNumber(tidy(entry / (unit?.factor ?? 1)));
    const scale = (text: string): string => (unit === undefined ? text : units.times(text, unit));
    if (value.axes.length === 0) return scale(cell(value.data[0] ?? Number.NaN));
    if (value.data.length > CARRY_LIMIT) {
      return `np.full((${shape.join(', ')},), np.nan)  # ${value.data.length} values — too many to carry over`;
    }
    return scale(`np.array([${value.data.map(cell).join(', ')}]).reshape(${shape.join(', ')})`);
  };

  /** Give every wired output of a node the value JoveWorks computed for it. */
  const carry = (node: GraphNode, why: string): void => {
    const ports = [...new Set(outgoing(node.id).map((edge) => edge.from.port))];
    if (ports.length === 0) return;
    const lines = comment(`${titleOf(node)} — ${why}; carried over from JoveWorks as a value.`);
    for (const port of ports) {
      const key = endpointKey(node.id, port);
      const value = evaluation?.values.get(key);
      if (value?.kind === 'bundle') continue;
      const name = names.claim(ports.length === 1 ? node.label ?? port : port, 'value');
      variables.set(key, name);
      if (value?.kind === 'categorical') categorical.add(name);
      lines.push(`${name} = ${literal(key) ?? 'np.nan  # JoveWorks had no value here'}`);
    }
    carried.push(titleOf(node));
    code(lines);
  };

  // --- inputs ---------------------------------------------------------------

  const sweepOf = (node: GraphNode, values: string): string | undefined => {
    const axis = resolution.axes.get(node.id);
    const at = axis === undefined ? undefined : axisPosition(axis.id);
    return at === undefined ? undefined : `sweep(${values}, ${at})`;
  };

  /**
   * What to call a value that has no symbol of its own — an input, a base
   * node's `product`. A label that already is a name wins; failing that, the
   * catalogue port it is wired into says what it *is* (`d_dk`, `K_A`), which
   * reads better in a formula call than a sentence squeezed into a name.
   */
  const nameOf = (node: GraphNode, fallback: string): string => {
    if (node.label !== undefined && PLAIN_NAME.test(node.label)) return names.claim(node.label, fallback);
    const consumer = outgoing(node.id)
      .map((edge) => analysis.formulas.get(edge.to.node)?.inputs.find((port) => port.name === edge.to.port))
      .find((port) => port !== undefined && !(port.kind === 'numeric' && isGenericDimension(port.unit)));
    return names.claim(consumer?.name ?? node.label, fallback);
  };

  const label = (node: GraphNode, name: string): string =>
    node.label !== undefined && node.label !== name ? `  # ${node.label.replace(/\s+/gu, ' ')}` : '';

  const emitInput = (node: InputNode): void => {
    const spec = node.value;
    if (spec.kind === 'tableColumn') {
      carry(node, 'a catalogue table column');
      return;
    }
    const name = nameOf(node, 'x');
    variables.set(endpointKey(node.id, VALUE_PORT), name);
    const list = (values: readonly number[]): string => `[${values.map(pyNumber).join(', ')}]`;
    let value: string | undefined;
    let note = label(node, name);
    switch (spec.kind) {
      case 'scalar':
        value = units.times(pyNumber(spec.value), spec.unit);
        break;
      case 'slider':
        value = units.times(pyNumber(spec.value), spec.unit);
        note = `  # ${node.label !== undefined && node.label !== name ? `${node.label}, ` : ''}slider ${spec.min} … ${spec.max}`;
        break;
      case 'categorical':
        categorical.add(name);
        value = pyString(spec.value);
        break;
      case 'categoricalList':
        categorical.add(name);
        value = sweepOf(node, `[${spec.values.map(pyString).join(', ')}]`);
        break;
      case 'linear':
        value = sweepOf(node, `np.linspace(${pyNumber(spec.start)}, ${pyNumber(spec.stop)}, ${spec.points})`);
        break;
      case 'logarithmic':
        value = sweepOf(node, `np.geomspace(${pyNumber(spec.start)}, ${pyNumber(spec.stop)}, ${spec.points})`);
        break;
      case 'list':
        value = sweepOf(node, list(spec.values));
        break;
      case 'renard':
        value = sweepOf(node, list(renardValues(spec.series, spec.start, spec.stop)));
        note = `  # ${spec.series} preferred numbers, ${spec.start} … ${spec.stop}`;
        break;
    }
    if (value !== undefined && 'unit' in spec && spec.kind !== 'scalar' && spec.kind !== 'slider') {
      value = units.times(value, spec.unit);
    }
    code([`${name} = ${value ?? 'np.nan'}${note}`], true);
  };

  const emitRange = (node: RangeNode): void => {
    // A wired bound re-reads a bare default in the wire's unit and fixes the
    // point count at resolve time — the kernel's rules, not worth a second copy.
    if ([START_PORT, STOP_PORT, COUNT_PORT].some((port) => incoming(node.id, port).length > 0)) {
      carry(node, 'a range with wired bounds');
      return;
    }
    const name = nameOf(node, 'x');
    variables.set(endpointKey(node.id, VALUE_PORT), name);
    const spacing = node.spacing === 'logarithmic' ? 'np.geomspace' : 'np.linspace';
    const values = sweepOf(node, `${spacing}(${pyNumber(node.start)}, ${pyNumber(node.stop)}, ${node.count})`);
    code([`${name} = ${values === undefined ? 'np.nan' : units.times(values, node.unit)}${label(node, name)}`], true);
  };

  // --- formulas -------------------------------------------------------------

  /** What an input port reads: its wire, else the kernel's own order of fallbacks. */
  const fallback = (node: GraphNode, port: Port): string => {
    const authored = 'inputValues' in node ? node.inputValues?.[port.name] : undefined;
    if (authored?.kind === 'scalar' || authored?.kind === 'slider') {
      return units.times(pyNumber(authored.value), authored.unit);
    }
    if (port.kind === 'numeric' && !isGenericDimension(port.unit)) {
      return port.default === undefined ? 'np.nan' : units.times(pyNumber(port.default), port.unit);
    }
    // An unwired generic port is a hole: one of whatever it turns out to be.
    return port.kind === 'numeric' ? '1' : 'np.nan';
  };

  const describe = (port: Port): string => {
    const text = port.description === undefined ? '' : localize(port.description, locale);
    const unit = port.kind === 'numeric' && !isGenericDimension(port.unit) ? `[${port.unit.symbol}] ` : '';
    return `${unit}${text}`.trim();
  };

  const emitFormula = (node: GraphNode, formula: Formula | undefined): void => {
    const untranslated =
      formula === undefined ? 'its formula is not loaded'
      : formula.status === 'quarantined' ? 'a quarantined formula'
      : formula.lookup !== undefined ? 'a catalogue table lookup'
      : formula.piecewise !== undefined || formula.deflection !== undefined ? 'a beam diagram'
      : formula.expressions === undefined ? 'a formula without an expression'
      : [...formula.inputs, ...formula.outputs].some((port) => port.kind !== 'numeric') ? 'a formula over named values'
      : undefined;
    if (formula === undefined || untranslated !== undefined) {
      carry(node, untranslated ?? 'not translated');
      return;
    }

    const wires = new Map<string, readonly string[]>();
    const values = new Map<string, string>();
    for (const port of formula.inputs) {
      const edges = incoming(node.id, port.name);
      if (port.kind === 'numeric' && port.variadic === true) {
        wires.set(port.name, edges.map((edge) => variableAt(edge) ?? 'np.nan'));
      } else {
        values.set(port.name, variableAt(edges[0]) ?? fallback(node, port));
      }
    }

    const catalogue = analysis.sources.get(node.id);
    const feedsEquation = outgoing(node.id).some((edge) => {
      const target = nodes.get(edge.to.node);
      return target?.kind === 'output' && target.output.kind === 'equation';
    });
    const symbolic = formula.citation !== undefined || formula.outputs.length > 1 || feedsEquation;
    const description = localize(formula.description, locale);
    const heading = [formula.citation, description].filter((part) => part !== undefined && part.length > 0).join(' — ');
    // A base node's description documents the operation, which the Python already says.
    const lines = symbolic && heading.length > 0 ? comment(heading) : [];
    const operand = (text: string): string => (/^[\p{L}\p{N}_.]+$/u.test(text) ? text : `(${text})`);
    if (formula.status === 'unverified' && formula.citation !== undefined) {
      lines.push('# No golden value exercises this formula yet.');
    }

    // Printed before any name is claimed, so a formula that turns out to have
    // no Python form leaves nothing behind for `carry` to step around.
    let printed: readonly string[];
    try {
      const context: PrintContext = symbolic
        ? {
            dialect: 'sympy',
            name: (name) => attribute('sym', name),
            wires: (name) => wires.get(name)?.length,
            wire: (name, index) => attribute('sym', `${name}_${index}`),
            // A typed literal is already a number by the time an equation is typeset.
            unit: (text, unit) => (unit.factor === 1 ? text : `${text}*${pyNumber(unit.factor)}`),
          }
        : {
            dialect: 'numpy',
            name: (input) => operand(values.get(input) ?? 'np.nan'),
            wires: (input) => wires.get(input)?.length,
            wire: (input, index) => operand(wires.get(input)?.[index] ?? 'np.nan'),
            unit: (text, unit) => units.times(text, unit),
          };
      printed = formula.outputs.map((port) => print(parseExpression(formula.expressions?.[port.name] ?? ''), context));
    } catch (error) {
      if (!(error instanceof Untranslatable) && !(error instanceof KernelError)) throw error;
      carry(node, 'an expression with no short Python form');
      return;
    }

    // A catalogue output is named by its own symbol; a generic one has none worth keeping.
    const outputNames = formula.outputs.map((port) =>
      formula.outputs.length === 1 && (port.kind !== 'numeric' || isGenericDimension(port.unit))
        ? nameOf(node, port.name)
        : names.claim(port.name, 'y'),
    );
    const body: string[] = [];
    if (symbolic) {
      const described: (readonly [string, string])[] = [];
      const known: (readonly [string, string])[] = [];
      for (const port of formula.inputs) {
        const list = wires.get(port.name);
        if (list === undefined) {
          described.push([port.name, pyString(describe(port))]);
          known.push([port.name, values.get(port.name) as string]);
        } else {
          list.forEach((value, k) => {
            described.push([`${port.name}_${k}`, pyString(describe(port))]);
            known.push([`${port.name}_${k}`, value]);
          });
        }
      }
      const evaluations: string[] = [];
      formula.outputs.forEach((port, i) => {
        const name = outputNames[i] as string;
        const equation = names.claim(`${name}_eq`, 'eq');
        const shown = `HM.EqPrint(${pyString(port.name)}, ${equation})`;
        equations.set(endpointKey(node.id, port.name), shown);
        body.push(`${equation} = ${printed[i] as string}`, shown);
        const guard = formula.appliesWhen?.[port.name];
        if (guard !== undefined) evaluations.push(`# applies when ${guard}`);
        evaluations.push(`${name} = evaluate(${equation}, sym, ${keywords(known)})`);
        // A later output may name an earlier one, so it joins the symbols and the knowns.
        described.push([port.name, pyString(describe(port))]);
        known.push([port.name, name]);
      });
      body.unshift(`sym = symbols(${keywords(described)})`);
      body.push(...evaluations);
    } else {
      const name = outputNames[0] as string;
      body.push(`${name} = ${printed[0] as string}${label(node, name)}`);
    }
    formula.outputs.forEach((port, i) => {
      variables.set(endpointKey(node.id, port.name), outputNames[i] as string);
    });
    if (catalogue?.restricted === true) restricted.add(localize(catalogue.name, locale));
    code([...lines, ...body], !symbolic);
  };

  // --- comparisons and outputs ---------------------------------------------

  /** A threshold in Python: its wire, else the typed bound read the way the kernel reads it. */
  const thresholdOf = (
    node: string,
    port: string,
    typed: Quantity | undefined,
    valueKey: string | undefined,
  ): { readonly code: string; readonly unit: Unit } | undefined => {
    const shown = valueKey === undefined ? canonicalUnit(DIMENSIONLESS) : displayUnit(valueKey);
    const wired = variableAt(incoming(node, port)[0]);
    if (wired !== undefined) return { code: wired, unit: shown };
    if (typed === undefined) return undefined;
    // A bare number means "of the unit on screen", not of a canonical one nobody sees.
    const unit = isDimensionless(typed.unit.dimension) && !isDimensionless(shown.dimension) ? shown : typed.unit;
    return { code: units.times(pyNumber(typed.value), unit), unit };
  };

  const sourceOf = (node: string, port: string): { readonly name: string; readonly key: string } | undefined => {
    const [edge] = incoming(node, port);
    const name = variableAt(edge);
    return edge === undefined || name === undefined
      ? undefined
      : { name, key: endpointKey(edge.from.node, edge.from.port) };
  };

  const unitArgument = (unit: Unit): string => {
    const name = units.ref(unit);
    return name === undefined ? '' : `, ${name}`;
  };

  const axisOf = (id: string): {
    readonly variable: string | undefined;
    readonly name: string;
    readonly unit: Unit;
    readonly log: boolean;
  } => {
    const node = nodes.get(id);
    const key = endpointKey(id, VALUE_PORT);
    const variable = node?.kind === 'input' || node?.kind === 'range' ? variables.get(key) : undefined;
    const name = (node !== undefined && 'axisLabel' in node ? node.axisLabel : undefined) ?? node?.label ?? variable ?? id;
    const log =
      (node?.kind === 'input' && node.value.kind === 'logarithmic') ||
      (node?.kind === 'range' && node.spacing === 'logarithmic');
    return { variable, name, unit: displayUnit(key), log };
  };
  // An authored axis label usually carries its unit already (ROADMAP: "can print its unit twice").
  const withUnit = (name: string, unit: Unit): string =>
    unit.symbol === '' || name.includes('(') ? name : `${name} (${unit.symbol})`;

  const emitPlot = (node: OutputNode & { readonly output: { readonly kind: 'plot' } }): void => {
    const lines: string[] = [];
    const drawn: string[] = [];
    let frame: { readonly x: string; readonly second?: string } | undefined;
    for (const measure of plotMeasures(node.output)) {
      const source = sourceOf(node.id, measure.id);
      if (source === undefined) continue;
      const value = evaluation?.values.get(source.key);
      if (value === undefined || value.kind !== 'numeric') continue;
      const unit = measure.unit ?? displayUnit(source.key);
      const title = measure.label ?? source.name;
      const text = withUnit(title, unit);
      const ids = value.axes.map((axis) => axis.id);
      const view = measure.view;
      const x = view?.x !== undefined && ids.includes(view.x) ? view.x : ids[0];
      const second = [view?.y, view?.series, ...ids].find((id) => id !== undefined && id !== x && ids.includes(id));
      if (x === undefined || ids.length > 2) {
        lines.push(`# ${title}: ${x === undefined ? 'a single value, nothing to plot against' : 'swept along more than two inputs — slice it with along() to plot it'}`);
        continue;
      }
      if (frame !== undefined && (frame.x !== x || frame.second !== second)) {
        lines.push(`# ${title}: swept along other inputs than the curves above — give it a figure of its own`);
        continue;
      }
      frame = { x, ...(second === undefined ? {} : { second }) };
      const xAt = axisPosition(x) as number;
      const xAxis = axisOf(x);
      const xs = xAxis.variable === undefined ? `np.arange(GRID[${xAt}])` : units.over(`along(${xAxis.variable}, ${xAt})`, xAxis.unit);
      const ys = units.over(source.name, unit);
      const style = view?.type === 'dot' ? ", 'o'" : '';
      if (drawn.length === 0) {
        lines.push('fig, ax = plt.subplots()');
        if ((view?.scales?.[x] ?? (xAxis.log ? 'log' : 'linear')) === 'log') lines.push("ax.set_xscale('log')");
        lines.push(`ax.set_xlabel(${pyString(withUnit(xAxis.name, xAxis.unit))})`);
      }
      if (second === undefined) {
        lines.push(`ax.plot(${xs}, along(${ys}, ${xAt})${style}, label=${pyString(text)})`);
      } else {
        const at = axisPosition(second) as number;
        const other = axisOf(second);
        const coordinates = other.variable === undefined ? `np.arange(GRID[${at}])` : units.over(`along(${other.variable}, ${at})`, other.unit);
        if (view?.type === 'contour' || view?.type === 'heatmap') {
          const draw = view.type === 'contour' ? 'contourf' : 'pcolormesh';
          lines.push(`shading = ax.${draw}(${xs}, ${coordinates}, along(${ys}, ${xAt}, ${at}).T)`);
          lines.push(`fig.colorbar(shading, label=${pyString(text)})`);
          lines.push(`ax.set_ylabel(${pyString(withUnit(other.name, other.unit))})`);
        } else {
          lines.push(`for j, c in enumerate(${coordinates}):`);
          lines.push(`    ax.plot(${xs}, along(${ys}, ${xAt}, ${at})[:, j]${style}, label=f'${`${other.name} = {c} ${other.unit.symbol}`.replace(/['\\]/gu, '').trim()}')`);
        }
      }
      const threshold = thresholdOf(node.id, plotThresholdPort(measure.id), measure.threshold, source.key);
      if (threshold !== undefined && second === undefined) {
        lines.push(`ax.axhline(float(np.max(${units.over(threshold.code, unit)})), color='grey', linestyle='--')`);
      }
      if (view?.valueScale === 'log') lines.push("ax.set_yscale('log')");
      drawn.push(text);
    }
    if (drawn.length === 0) {
      code([...comment(`${titleOf(node)} — nothing here to plot yet.`), ...lines]);
      return;
    }
    if (frame?.second === undefined && drawn.length === 1) lines.push(`ax.set_ylabel(${pyString(drawn[0] as string)})`);
    else if (!lines.some((line) => line.startsWith('shading'))) lines.push('ax.legend()');
    if (node.label !== undefined) lines.push(`ax.set_title(${pyString(node.label)})`);
    lines.push('plt.show()');
    code(lines);
  };

  const emitOutput = (node: OutputNode): void => {
    if (node.caption !== undefined && node.caption.trim().length > 0) markdown([node.caption]);
    const { output } = node;
    switch (output.kind) {
      case 'print': {
        const source = sourceOf(node.id, VALUE_PORT);
        if (source === undefined) break;
        const unit = categorical.has(source.name) ? undefined : output.unit ?? displayUnit(source.key);
        const figures = output.figures === undefined ? '' : `, figures=${output.figures}`;
        code([`show(${pyString(node.label ?? source.name)}, ${source.name}${unit === undefined ? '' : unitArgument(unit)}${figures})`]);
        return;
      }
      case 'check': {
        const source = sourceOf(node.id, VALUE_PORT);
        const threshold = thresholdOf(node.id, THRESHOLD_PORT, output.threshold, source?.key);
        if (source === undefined || threshold === undefined) break;
        code([
          `check(${pyString(node.label ?? source.name)}, ${source.name}, ${pyString(output.comparison)}, ${threshold.code}${unitArgument(threshold.unit)})`,
        ]);
        return;
      }
      case 'table': {
        const columns = output.columns.flatMap((port) => {
          const source = sourceOf(node.id, port);
          if (source === undefined) return [];
          if (categorical.has(source.name)) return [`${pyString(source.name)}: ${source.name}`];
          const unit = node.displayUnits?.[port] ?? displayUnit(source.key);
          const heading = unit.symbol === '' ? source.name : `${source.name} (${unit.symbol})`;
          return [`${pyString(heading)}: ${units.over(source.name, unit)}`];
        });
        if (columns.length === 0) break;
        code(['table({', ...columns.map((column) => `    ${column},`), '})']);
        return;
      }
      case 'plot':
        emitPlot(node as OutputNode & { readonly output: { readonly kind: 'plot' } });
        return;
      case 'equation': {
        const [edge] = incoming(node.id, VALUE_PORT);
        const shown = edge === undefined ? undefined : equations.get(endpointKey(edge.from.node, edge.from.port));
        if (shown === undefined) break;
        code([shown]);
        return;
      }
      default:
        code(comment(`${titleOf(node)} — a ${output.kind} figure is drawn by JoveWorks itself and is not translated; see the NodeBook.`));
        return;
    }
    code(comment(`${titleOf(node)} — nothing is wired to this ${output.kind} output yet.`));
  };

  const emit = (node: GraphNode): void => {
    switch (node.kind) {
      case 'input':
        emitInput(node);
        return;
      case 'range':
        emitRange(node);
        return;
      case 'formula':
      case 'closure':
        emitFormula(node, analysis.formulas.get(node.id) ?? resolution.formulas.get(node.id));
        return;
      case 'compare': {
        const source = sourceOf(node.id, VALUE_PORT);
        const threshold = thresholdOf(node.id, THRESHOLD_PORT, node.threshold, source?.key);
        if (source === undefined || threshold === undefined) {
          carry(node, 'a comparison with nothing wired to it');
          return;
        }
        const name = names.claim(node.label, 'verdict');
        variables.set(endpointKey(node.id, VERDICT_PORT), name);
        categorical.add(name);
        code([`${name} = np.where(${source.name} ${node.comparison} ${threshold.code}, 'pass', 'fail')`]);
        return;
      }
      case 'waypoint':
        // A routing stop: each `inN` is its `outN`, so the wire simply continues.
        for (const edge of document.edges.filter((candidate) => candidate.to.node === node.id)) {
          const name = variableAt(edge);
          if (name === undefined) continue;
          variables.set(endpointKey(node.id, edge.to.port.replace(/^in/u, 'out')), name);
          if (categorical.has(name)) categorical.add(name);
        }
        return;
      case 'output':
        emitOutput(node);
        return;
      case 'pack':
      case 'monteCarloReceiver':
        return;
      default:
        carry(node, `a ${NODE_NAMES[node.kind]} node`);
    }
  };

  // --- reading order --------------------------------------------------------
  //
  // Sections in NodeBook order, nodes in reading order within one, and a node's
  // inputs written just before its first use — so each section states what it
  // needs, and nothing is used before the cell that defines it.

  const done = new Set<string>();
  const visit = (node: GraphNode): void => {
    if (done.has(node.id)) return;
    done.add(node.id);
    for (const edge of document.edges) {
      if (edge.to.node !== node.id) continue;
      const source = nodes.get(edge.from.node);
      if (source !== undefined) visit(source);
    }
    emit(node);
  };

  const sections = document.frames.filter((frame) => frame.kind !== 'group');
  for (const frame of [...sections, undefined]) {
    const members = document.nodes
      .filter((node) => notebookSectionId(document, node) === frame?.id)
      .slice()
      .sort(readingOrder);
    if (frame !== undefined) {
      markdown([`## ${frame.title}`, ...(frame.note === undefined || frame.note.trim().length === 0 ? [] : ['', frame.note])]);
    }
    for (const node of members) visit(node);
  }

  // --- the first two cells, written last because they summarise the rest ----

  const intro = [
    `# ${document.title}`,
    ...(document.author === undefined ? [] : ['', document.author]),
    '',
    `Compiled from the JoveWorks NodeBook *${document.title}*${options.generatedOn === undefined ? '' : ` on ${options.generatedOn}`}. ` +
      'It recomputes the graph in Python so you can take it further: change a value, add a step, draw your own figure, and run the cells again.',
    '',
    'It follows the working style of the MechDesign course notebooks — an equation is built symbolically, shown with `HM.EqPrint`, ' +
      'and then given its numbers — and runs in that environment. Without MechDesign installed it falls back to plain SymPy.',
    '',
    'Every value is a plain number in millimetres, newtons, seconds, radians and kelvin (so mass is in tonnes). ' +
      'Multiply by a unit to enter a value and divide by one to read it: `d = 90*mm_`, `F_t/N_`.',
  ];
  if (restricted.size > 0) {
    intro.push(
      '',
      `> **Restricted content.** This notebook contains expressions from ${[...restricted].map((name) => `*${name}*`).join(', ')}. ` +
        'They are for your own study only and may never be distributed or shared — the same condition the catalogue itself comes under. ' +
        'Hand in the NodeBook PDF, not this file.',
    );
  }
  if (carried.length > 0) {
    intro.push(
      '',
      `**Carried over as values:** ${carried.join(', ')}. JoveWorks computed these and they are written here as numbers, ` +
        'not recomputed — changing an input above one of them does not update it.',
    );
  }

  const setup = [
    ...(restricted.size > 0 ? ['# Restricted content: the expressions below may never be distributed or shared.', ''] : []),
    ...IMPORTS.split('\n'),
    '',
    ...units.definitions(),
    '',
    ...HELPERS.replace('%GRID%', sweeps.map((axis) => axis.length).join(', ')).split('\n'),
  ];

  const all: Cell[] = [{ kind: 'markdown', lines: intro }, { kind: 'code', lines: setup }, ...cells];
  return {
    notebook: {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
        language_info: { name: 'python' },
      },
      cells: all.map((cell, index) => ({
        cell_type: cell.kind,
        id: `cell-${index}`,
        metadata: {},
        source: cell.lines.map((line, i) => (i === cell.lines.length - 1 ? line : `${line}\n`)),
        ...(cell.kind === 'code' ? { outputs: [], execution_count: null } : {}),
      })),
    },
    restricted: [...restricted],
    carried,
  };
}

/** The `.ipynb` file's text. */
export function jupyterText(notebook: JupyterNotebook): string {
  return `${JSON.stringify(notebook, null, 1)}\n`;
}
