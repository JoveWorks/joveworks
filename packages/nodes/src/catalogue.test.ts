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
} from '@joveworks/units';
import {
  CATALOGUE_SCHEMA_VERSION,
  formulaHash,
  isEvaluable,
  loadCatalogue,
  parseCatalogue,
  serializeCatalogue,
  type Formula,
  type Port,
  soleExpression,
} from '@joveworks/schema';

import {
  ARRAY_CATALOGUE,
  ARRAY_OPERATIONS,
  BASE_CATALOGUE,
  OPERATIONS,
  arrayCatalogueJson,
  baseCatalogueJson,
  iso286Limits,
} from './index.js';

/** Every hand-authored base node, across both catalogues — everything `iso286.ts`'s lookups are not. */
const HAND_AUTHORED: readonly Formula[] = [...OPERATIONS, ...ARRAY_OPERATIONS];

describe('ISO 286 tolerance lookups', () => {
  it('returns lower and upper deviations for common hole and shaft classes', () => {
    expect(iso286Limits('hole', 100, 'H', '7')).toEqual([0, 35]);
    expect(iso286Limits('shaft', 100, 'h', '6')).toEqual([-22, 0]);
    expect(iso286Limits('hole', 100, 'M', '6')).toEqual([-35, -13]);
    expect(iso286Limits('shaft', 100, 'p', '6')).toEqual([37, 59]);
  });

  it('keeps grade-specific positions strict', () => {
    expect(iso286Limits('hole', 100, 'J', '5')).toBeUndefined();
    expect(iso286Limits('shaft', 100, 'k', '9')).toBeUndefined();
  });

  it('quarantines the non-monotonic IT16 source cell instead of guessing a correction', () => {
    expect(iso286Limits('hole', 2400, 'H', '16')).toBeUndefined();
  });
});

const byId = (id: string): Formula => {
  const found = HAND_AUTHORED.find((formula) => formula.id === id);
  if (found === undefined) throw new Error(`no base node '${id}'`);
  return found;
};

describe.each([
  { name: 'base', catalogue: BASE_CATALOGUE, json: baseCatalogueJson, id: 'base' },
  { name: 'array', catalogue: ARRAY_CATALOGUE, json: arrayCatalogueJson, id: 'array' },
])('the $name catalogue as a file', ({ catalogue, json, id }) => {
  it('parses', () => {
    const loaded = loadCatalogue(json());
    expect(loaded.id).toBe(id);
    expect(loaded.restricted).toBe(false);
    expect(loaded.schemaVersion).toBe(CATALOGUE_SCHEMA_VERSION);
    expect(loaded.formulas).toHaveLength(catalogue.formulas.length);
  });

  it('round-trips — authored, serialized, parsed and serialized again', () => {
    const once = serializeCatalogue(catalogue);
    expect(serializeCatalogue(parseCatalogue(once))).toEqual(once);
  });

  it('gives every record the same hash after a round trip', () => {
    const reloaded = loadCatalogue(json());
    for (const [i, formula] of catalogue.formulas.entries()) {
      expect(formulaHash(reloaded.formulas[i] as Formula)).toBe(formulaHash(formula));
    }
  });
});

describe('what the library carries', () => {
  it('cites nothing — arithmetic is not textbook content', () => {
    for (const formula of HAND_AUTHORED) {
      expect(formula.citation).toBeUndefined();
    }
  });

  it('claims nothing is verified until a golden value says so', () => {
    for (const formula of HAND_AUTHORED) {
      expect(formula.status).toBe('unverified');
      expect(isEvaluable(formula)).toBe(true);
    }
  });

  it('covers the function whitelist and the reductions', () => {
    const ids = new Set(HAND_AUTHORED.map((formula) => formula.id));
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
      'count',
      'mean',
      'median',
      'standardDeviation',
      'valueAt',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('has a spectrum input on each reduction and nowhere else', () => {
    const reductions = new Set([
      'sum',
      'product',
      'minimum',
      'maximum',
      'count',
      'mean',
      'median',
      'standardDeviation',
      'valueAt',
    ]);
    for (const formula of HAND_AUTHORED) {
      const spectrum = formula.inputs.some((port) => port.kind === 'spectrum');
      expect(spectrum, formula.id).toBe(reductions.has(formula.id));
    }
  });

  it('names every port used by its expression, and uses every port it names', () => {
    for (const formula of HAND_AUTHORED) {
      if (formula.lookup !== undefined) continue;
      // Every base node states one relation, so one expression — but read it
      // through the per-output map either way, since that is where a record
      // answering with several would keep them.
      const expression = soleExpression(formula) as string;
      for (const port of formula.inputs) {
        expect(expression, formula.id).toContain(port.name);
      }
      const identifiers = new Set(expression.match(/[A-Za-z_][A-Za-z0-9_]*/gu) ?? []);
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
  'count',
  'mean',
  'median',
  'sdev',
  'at',
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
    ['mean', { A: FORCE }, FORCE],
    ['median', { A: LENGTH }, LENGTH],
    ['standardDeviation', { A: STRESS }, STRESS],
    ['valueAt', { A: TIME }, TIME],
    // Concrete ports: the bindings are irrelevant and must stay so.
    ['power', {}, DIMENSIONLESS],
    ['sine', {}, DIMENSIONLESS],
    ['arcSine', {}, parseUnit('rad').dimension],
    ['naturalLogarithm', {}, DIMENSIONLESS],
    ['exponential', {}, DIMENSIONLESS],
    ['pi', {}, DIMENSIONLESS],
    ['product', {}, DIMENSIONLESS],
    ['count', { A: FORCE }, DIMENSIONLESS],
  ];

  for (const [id, bindings, expected] of cases) {
    it(`${id} with ${JSON.stringify(Object.keys(bindings))}`, () => {
      const formula = byId(id);
      expect(resolved(formula.outputs[0]!, bindings)).toEqual(expected);
    });
  }

  it('gives the same-dimension operations inputs that agree with their output', () => {
    for (const id of ['add', 'subtract', 'minimum', 'maximum', 'absolute', 'negate']) {
      const formula = byId(id);
      const output = resolved(formula.outputs[0]!, { A: STRESS });
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
      expect(resolved(formula.outputs[0]!, {})).toEqual(DIMENSIONLESS);
    }
    for (const id of ['arcSine', 'arcCosine', 'arcTangent']) {
      const formula = byId(id);
      expect(resolved(formula.inputs[0] as Port, {})).toEqual(DIMENSIONLESS);
      expect(resolved(formula.outputs[0]!, {})).toEqual(parseUnit('rad').dimension);
    }
  });

  it('keeps every generic input a bare variable, so binding is an assignment', () => {
    for (const formula of HAND_AUTHORED) {
      for (const port of formula.inputs) {
        if (port.kind === 'categorical' || !isGenericDimension(port.unit)) continue;
        expect(port.unit.symbol, `${formula.id}.${port.name}`).toMatch(/^\$[A-Za-z][A-Za-z0-9]*$/u);
      }
    }
  });
});
