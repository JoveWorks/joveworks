/**
 * Tests for the base node library.
 *
 * The dimension *checker* is the kernel's, so what is checked here is that each
 * record's declared output dimension is what its expression produces once the
 * inputs are bound — done by resolving the signature against invented bindings,
 * not by evaluating anything. No R&M formula appears, here or anywhere in this
 * package.
 */

import { describe, expect, it } from 'vitest';
import {
  AREA,
  DIMENSIONLESS,
  FORCE,
  LENGTH,
  STRESS,
  TIME,
  VELOCITY,
  dimensionsEqual,
  isGenericDimension,
  parseUnit,
  resolveGeneric,
  type Dimension,
} from '@mds/units';
import {
  SCHEMA_VERSION,
  formulaHash,
  isEvaluable,
  loadCatalogue,
  parseCatalogue,
  serializeCatalogue,
  type Formula,
  type Port,
} from '@mds/schema';

import { BASE_CATALOGUE, OPERATIONS, baseCatalogueJson } from './index.js';

const byId = (id: string): Formula => {
  const found = OPERATIONS.find((formula) => formula.id === id);
  if (found === undefined) throw new Error(`no base node '${id}'`);
  return found;
};

describe('the catalogue as a file', () => {
  it('parses', () => {
    const catalogue = loadCatalogue(baseCatalogueJson());
    expect(catalogue.id).toBe('base');
    expect(catalogue.restricted).toBe(false);
    expect(catalogue.schemaVersion).toBe(SCHEMA_VERSION);
    expect(catalogue.formulas).toHaveLength(OPERATIONS.length);
  });

  it('round-trips — authored, serialized, parsed and serialized again', () => {
    const once = serializeCatalogue(BASE_CATALOGUE);
    expect(serializeCatalogue(parseCatalogue(once))).toEqual(once);
  });

  it('gives every record the same hash after a round trip', () => {
    const reloaded = loadCatalogue(baseCatalogueJson());
    for (const [i, formula] of BASE_CATALOGUE.formulas.entries()) {
      expect(formulaHash(reloaded.formulas[i] as Formula)).toBe(formulaHash(formula));
    }
  });
});

describe('what the library carries', () => {
  it('cites nothing — arithmetic is not textbook content', () => {
    for (const formula of OPERATIONS) {
      expect(formula.citation).toBeUndefined();
    }
  });

  it('claims nothing is verified until a golden value says so', () => {
    for (const formula of OPERATIONS) {
      expect(formula.status).toBe('unverified');
      expect(isEvaluable(formula)).toBe(true);
    }
  });

  it('covers the function whitelist and the reductions', () => {
    const ids = new Set(OPERATIONS.map((formula) => formula.id));
    for (const id of [
      'add',
      'subtract',
      'multiply',
      'divide',
      'power',
      'squareRoot',
      'cubeRoot',
      'absolute',
      'minimum',
      'maximum',
      'floor',
      'ceiling',
      'round',
      'sine',
      'cosine',
      'tangent',
      'arcSine',
      'arcCosine',
      'arcTangent',
      'hyperbolicSine',
      'hyperbolicCosine',
      'hyperbolicTangent',
      'naturalLogarithm',
      'exponential',
      'pi',
      'sum',
      'product',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('has a spectrum input on each reduction and nowhere else', () => {
    const reductions = new Set(['sum', 'product', 'minimum', 'maximum']);
    for (const formula of OPERATIONS) {
      const spectrum = formula.inputs.some((port) => port.kind === 'spectrum');
      expect(spectrum, formula.id).toBe(reductions.has(formula.id));
    }
  });

  it('names every port used by its expression, and uses every port it names', () => {
    for (const formula of OPERATIONS) {
      for (const port of formula.inputs) {
        expect(formula.expression, formula.id).toContain(port.name);
      }
      const identifiers = new Set(formula.expression.match(/[A-Za-z_][A-Za-z0-9_]*/gu) ?? []);
      const inputs = new Set(formula.inputs.map((port) => port.name));
      for (const name of identifiers) {
        if (FUNCTIONS.has(name)) continue;
        expect(inputs, `${formula.id}: '${name}'`).toContain(name);
      }
    }
  });
});

/** The function whitelist, plus the constants an expression may name. */
const FUNCTIONS = new Set([
  'abs',
  'sqrt',
  'cbrt',
  'min',
  'max',
  'floor',
  'ceil',
  'round',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'log',
  'exp',
  'sum',
  'prod',
  'least',
  'greatest',
  'pi',
]);

/**
 * The dimension a port would carry, given bindings for its variables. A concrete
 * port ignores them, which is exactly the point: `sin`'s argument is an angle
 * whatever is wired near it.
 */
function resolved(port: Port, bindings: Readonly<Record<string, Dimension>>): Dimension {
  if (port.kind === 'categorical') return DIMENSIONLESS;
  return isGenericDimension(port.unit) ? resolveGeneric(port.unit, bindings) : port.unit.dimension;
}

describe('dimensions are consistent with the expression, by inspection', () => {
  /**
   * Each case binds the generic inputs to invented dimensions and states what
   * the output must then be. Nothing here is evaluated — this is the arithmetic
   * of the exponents, which is the part a wrong record would get wrong.
   */
  const cases: ReadonlyArray<
    readonly [string, Readonly<Record<string, Dimension>>, Dimension]
  > = [
    ['add', { A: FORCE }, FORCE],
    ['subtract', { A: LENGTH }, LENGTH],
    ['negate', { A: STRESS }, STRESS],
    ['absolute', { A: FORCE }, FORCE],
    ['minimum', { A: TIME }, TIME],
    ['maximum', { A: TIME }, TIME],
    ['multiply', { A: LENGTH, B: LENGTH }, AREA],
    ['multiply', { A: FORCE, B: LENGTH }, parseUnit('Nm').dimension],
    ['divide', { A: FORCE, B: AREA }, STRESS],
    ['divide', { A: LENGTH, B: TIME }, VELOCITY],
    ['square', { A: LENGTH }, AREA],
    ['squareRoot', { A: AREA }, LENGTH],
    ['floor', { A: LENGTH }, LENGTH],
    ['ceiling', { A: LENGTH }, LENGTH],
    ['round', { A: LENGTH }, LENGTH],
    ['sum', { A: FORCE }, FORCE],
    // Concrete ports: the bindings are irrelevant and must stay so.
    ['power', {}, DIMENSIONLESS],
    ['sine', {}, DIMENSIONLESS],
    ['arcSine', {}, parseUnit('rad').dimension],
    ['naturalLogarithm', {}, DIMENSIONLESS],
    ['exponential', {}, DIMENSIONLESS],
    ['pi', {}, DIMENSIONLESS],
    ['product', {}, DIMENSIONLESS],
  ];

  for (const [id, bindings, expected] of cases) {
    it(`${id} with ${JSON.stringify(Object.keys(bindings))}`, () => {
      const formula = byId(id);
      expect(resolved(formula.output, bindings)).toEqual(expected);
    });
  }

  it('gives the same-dimension operations inputs that agree with their output', () => {
    for (const id of ['add', 'subtract', 'minimum', 'maximum', 'absolute', 'negate']) {
      const formula = byId(id);
      const output = resolved(formula.output, { A: STRESS });
      for (const port of formula.inputs) {
        expect(dimensionsEqual(resolved(port, { A: STRESS }), output), `${id}.${port.name}`).toBe(
          true,
        );
      }
    }
  });

  it('takes trig from an angle to a pure number and back', () => {
    for (const id of ['sine', 'cosine', 'tangent']) {
      const formula = byId(id);
      expect(resolved(formula.inputs[0] as Port, {})).toEqual(parseUnit('rad').dimension);
      expect(resolved(formula.output, {})).toEqual(DIMENSIONLESS);
    }
    for (const id of ['arcSine', 'arcCosine', 'arcTangent']) {
      const formula = byId(id);
      expect(resolved(formula.inputs[0] as Port, {})).toEqual(DIMENSIONLESS);
      expect(resolved(formula.output, {})).toEqual(parseUnit('rad').dimension);
    }
  });

  it('keeps every generic input a bare variable, so binding is an assignment', () => {
    for (const formula of OPERATIONS) {
      for (const port of formula.inputs) {
        if (port.kind === 'categorical' || !isGenericDimension(port.unit)) continue;
        expect(port.unit.symbol, `${formula.id}.${port.name}`).toMatch(/^\$[A-Za-z][A-Za-z0-9]*$/u);
      }
    }
  });
});
