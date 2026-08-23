/**
 * The base node library's operations: arithmetic and the function whitelist.
 *
 * Every one of these is an ordinary `Formula` record. That is the point —
 * the palette has one kind of entry, a graph references a base node exactly as
 * it references a belt formula (id, version, hash), and the kernel gets one
 * evaluation path rather than two.
 *
 * **Nothing here is textbook content.** These are the operations of arithmetic;
 * they carry no citation, and the catalogue is `restricted: false`. Reductions
 * over a whole series — `sum`, `mean`, `median`, and the rest — live in
 * `arrayNodes.ts` instead, as their own catalogue: see that file's docstring
 * for why they are not folded in here.
 *
 * Three rules govern the dimensions:
 *
 * - trig, log and exp **require a dimensionless argument** — so their ports are
 *   concrete, not generic;
 * - `min`/`max` require **identical** dimensions across every value compared —
 *   one variable, joined by any number of wires into one spectrum port,
 *   not two fixed ones;
 * - rounding **preserves** dimension — `floor` is `$A → $A`, not `$A → ''`.
 *
 * Everything else follows from the algebra: `multiply` is `$A*$B`, `divide` is
 * `$A/$B`, `sqrt` is `$A**(1/2)`.
 */

import type { Formula } from '@joveworks/schema';
import { parseGenericDimension } from '@joveworks/units';
import { buildFormulas, generic, genericSpectrum, plain, text, type Draft } from './draft.js';
import { ISO286_FORMULAS } from './iso286.js';

const DRAFTS: readonly Draft[] = [
  // --- arithmetic, dimension-preserving ------------------------------------
  {
    id: 'add',
    description: 'Sum of two values of the same dimension.',
    expression: 'a + b',
    output: generic('sum', 'A', 'a + b'),
    inputs: [generic('a', 'A', 'First addend'), generic('b', 'A', 'Second addend')],
  },
  {
    id: 'subtract',
    description: 'Difference of two values of the same dimension.',
    expression: 'a - b',
    output: generic('difference', 'A', 'a − b'),
    inputs: [generic('a', 'A', 'Minuend'), generic('b', 'A', 'Subtrahend')],
  },
  {
    id: 'negate',
    description: 'Sign reversal.',
    expression: '-a',
    output: generic('negated', 'A', '−a'),
    inputs: [generic('a', 'A', 'Value to negate')],
  },
  {
    id: 'double',
    description: 'Twice the value.',
    expression: 'a * 2',
    output: generic('doubled', 'A', '2a'),
    inputs: [generic('a', 'A', 'Value to double')],
  },
  {
    id: 'half',
    description: 'Half the value.',
    expression: 'a / 2',
    output: generic('halved', 'A', 'a / 2'),
    inputs: [generic('a', 'A', 'Value to halve')],
  },
  {
    id: 'absolute',
    description: 'Magnitude, discarding sign.',
    expression: 'abs(a)',
    output: generic('magnitude', 'A', '|a|'),
    inputs: [generic('a', 'A', 'Value')],
  },
  {
    id: 'minimum',
    description: 'The smallest of any number of values, all the same dimension.',
    expression: 'least(a)',
    output: generic('smallest', 'A', 'least(a)'),
    inputs: [genericSpectrum('a', 'A', 'Values to compare — wire as many as needed')],
  },
  {
    id: 'maximum',
    description: 'The largest of any number of values, all the same dimension.',
    expression: 'greatest(a)',
    output: generic('largest', 'A', 'greatest(a)'),
    inputs: [genericSpectrum('a', 'A', 'Values to compare — wire as many as needed')],
  },

  // --- arithmetic, dimension-combining -------------------------------------
  {
    id: 'multiply',
    description: 'Product. The output dimension is the product of the input dimensions.',
    expression: 'a * b',
    output: {
      kind: 'numeric',
      name: 'product',
      unit: parseGenericDimension('$A*$B'),
      description: text('a · b'),
    },
    inputs: [generic('a', 'A', 'First factor'), generic('b', 'B', 'Second factor')],
  },
  {
    id: 'divide',
    description: 'Quotient. The output dimension is the quotient of the input dimensions.',
    expression: 'a / b',
    output: {
      kind: 'numeric',
      name: 'quotient',
      unit: parseGenericDimension('$A/$B'),
      description: text('a / b'),
    },
    inputs: [generic('a', 'A', 'Numerator'), generic('b', 'B', 'Denominator')],
  },
  {
    id: 'square',
    description: 'Second power. Squaring a length gives an area, so the dimension squares too.',
    expression: 'a ** 2',
    output: {
      kind: 'numeric',
      name: 'squared',
      unit: parseGenericDimension('$A**2'),
      description: text('a²'),
    },
    inputs: [generic('a', 'A', 'Value')],
  },
  {
    id: 'squareRoot',
    description: 'Square root. The dimension is halved — the root of an area is a length.',
    expression: 'sqrt(a)',
    output: {
      kind: 'numeric',
      name: 'root',
      unit: parseGenericDimension('$A**(1/2)'),
      description: text('√a'),
    },
    inputs: [generic('a', 'A', 'Radicand')],
  },
  {
    id: 'cubeRoot',
    description: 'Cube root. The dimension is divided by three — the root of a volume is a length.',
    expression: 'cbrt(a)',
    output: {
      kind: 'numeric',
      name: 'root',
      unit: parseGenericDimension('$A**(1/3)'),
      description: text('∛a'),
    },
    inputs: [generic('a', 'A', 'Radicand')],
  },
  {
    id: 'power',
    description:
      'General exponentiation. Both operands are dimensionless: a runtime exponent gives a ' +
      'dimension that is not known until the value is, which is not a type. Use square, ' +
      'squareRoot or cubeRoot for dimensioned values.',
    expression: 'a ** b',
    output: plain('result', '', 'aᵇ'),
    inputs: [plain('a', '', 'Base'), plain('b', '', 'Exponent')],
  },

  // --- rounding: dimension-preserving --------------------------------
  {
    id: 'floor',
    description: 'Round down to a whole number, keeping the dimension.',
    expression: 'floor(a)',
    output: generic('rounded', 'A', '⌊a⌋'),
    inputs: [generic('a', 'A', 'Value')],
  },
  {
    id: 'ceiling',
    description: 'Round up to a whole number, keeping the dimension.',
    expression: 'ceil(a)',
    output: generic('rounded', 'A', '⌈a⌉'),
    inputs: [generic('a', 'A', 'Value')],
  },
  {
    id: 'round',
    description: 'Round to the nearest whole number, keeping the dimension.',
    expression: 'round(a)',
    output: generic('rounded', 'A', 'Nearest whole value'),
    inputs: [generic('a', 'A', 'Value')],
  },

  // --- trigonometry: angle in, pure number out -----------------------
  {
    id: 'sine',
    description: 'Sine of an angle.',
    expression: 'sin(theta)',
    output: plain('result', '', 'sin θ'),
    inputs: [plain('theta', 'rad', 'Angle')],
  },
  {
    id: 'cosine',
    description: 'Cosine of an angle.',
    expression: 'cos(theta)',
    output: plain('result', '', 'cos θ'),
    inputs: [plain('theta', 'rad', 'Angle')],
  },
  {
    id: 'tangent',
    description: 'Tangent of an angle.',
    expression: 'tan(theta)',
    output: plain('result', '', 'tan θ'),
    inputs: [plain('theta', 'rad', 'Angle')],
  },
  {
    id: 'arcSine',
    description: 'The angle whose sine is the given ratio.',
    expression: 'asin(x)',
    output: plain('angle', 'rad', 'arcsin x'),
    inputs: [plain('x', '', 'Ratio, between −1 and 1')],
  },
  {
    id: 'arcCosine',
    description: 'The angle whose cosine is the given ratio.',
    expression: 'acos(x)',
    output: plain('angle', 'rad', 'arccos x'),
    inputs: [plain('x', '', 'Ratio, between −1 and 1')],
  },
  {
    id: 'arcTangent',
    description: 'The angle whose tangent is the given ratio.',
    expression: 'atan(x)',
    output: plain('angle', 'rad', 'arctan x'),
    inputs: [plain('x', '', 'Ratio')],
  },

  // --- hyperbolics, logarithm, exponential: dimensionless throughout -------
  {
    id: 'hyperbolicSine',
    description: 'Hyperbolic sine of a pure number.',
    expression: 'sinh(x)',
    output: plain('result', '', 'sinh x'),
    inputs: [plain('x', '', 'Value')],
  },
  {
    id: 'hyperbolicCosine',
    description: 'Hyperbolic cosine of a pure number.',
    expression: 'cosh(x)',
    output: plain('result', '', 'cosh x'),
    inputs: [plain('x', '', 'Value')],
  },
  {
    id: 'hyperbolicTangent',
    description: 'Hyperbolic tangent of a pure number.',
    expression: 'tanh(x)',
    output: plain('result', '', 'tanh x'),
    inputs: [plain('x', '', 'Value')],
  },
  {
    id: 'naturalLogarithm',
    description: 'Natural logarithm. The argument must be dimensionless.',
    expression: 'log(x)',
    output: plain('result', '', 'ln x'),
    inputs: [plain('x', '', 'Value, greater than zero')],
  },
  {
    id: 'exponential',
    description: 'e raised to a power. The argument must be dimensionless.',
    expression: 'exp(x)',
    output: plain('result', '', 'eˣ'),
    inputs: [plain('x', '', 'Exponent')],
  },

  // --- constants -----------------------------------------------------------
  {
    id: 'pi',
    description: 'The circle constant, as a node so it can be wired rather than retyped.',
    expression: 'pi',
    output: plain('value', '', 'π'),
    inputs: [],
  },
];

const DUTCH_LABELS: Readonly<Record<string, string>> = {
  add: 'Optellen', subtract: 'Aftrekken', negate: 'Teken omkeren', double: 'Verdubbelen', half: 'Helft',
  absolute: 'Absolute waarde',
  minimum: 'Minimum', maximum: 'Maximum', multiply: 'Vermenigvuldigen', divide: 'Delen',
  square: 'Kwadraat', squareRoot: 'Vierkantswortel', cubeRoot: 'Derde machtswortel', power: 'Macht',
  floor: 'Naar beneden afronden', ceiling: 'Naar boven afronden', round: 'Afronden',
  sine: 'Sinus', cosine: 'Cosinus', tangent: 'Tangens', arcSine: 'Boogsinus', arcCosine: 'Boogcosinus',
  arcTangent: 'Boogtangens', hyperbolicSine: 'Hyperbolische sinus', hyperbolicCosine: 'Hyperbolische cosinus',
  hyperbolicTangent: 'Hyperbolische tangens', logarithm: 'Natuurlijke logaritme', exponential: 'Exponentieel',
  pi: 'Pi',
};

export const OPERATIONS: readonly Formula[] = [...buildFormulas(DRAFTS, DUTCH_LABELS), ...ISO286_FORMULAS];
