import { describe, expect, it } from 'vitest';
import { FORCE, LENGTH } from '@joveworks/units';
import type { Formula, JsonObject } from '@joveworks/schema';

import { KernelError } from './errors.js';
import { assertEvaluable, checkFormulaDimensions, compileFormula } from './formula.js';
import { CATALOGUE, catalogueOf } from './invented.fixtures.js';

const byId = (id: string): Formula => {
  const found = CATALOGUE.formulas.find((formula) => formula.id === id);
  if (found === undefined) throw new Error(`no fixture formula '${id}'`);
  return found;
};

const only = (json: JsonObject): Formula => catalogueOf([json]).formulas[0] as Formula;

describe('the quarantine gate', () => {
  it('refuses to evaluate a quarantined formula, and says why', () => {
    const broken = byId('broken');
    expect(() => assertEvaluable(broken)).toThrow(/quarantined/u);
    expect(() => assertEvaluable(broken)).toThrow(/quarantine gate/u);
    expect(() => compileFormula(broken, new Map())).toThrow(KernelError);
  });

  it('lets everything else through', () => {
    expect(() => assertEvaluable(byId('area'))).not.toThrow();
  });

  it('still checks a quarantined formula dimensionally — that is how it gets out', () => {
    expect(() => checkFormulaDimensions(byId('broken'))).not.toThrow();
  });
});

describe('a record checked against its own expression', () => {
  it('passes every invented fixture', () => {
    for (const formula of CATALOGUE.formulas) {
      expect(() => checkFormulaDimensions(formula), formula.id).not.toThrow();
    }
  });

  it('catches an output unit the expression does not produce', () => {
    const wrong = only({
      id: 'wrong',
      version: 1,
      output: { kind: 'numeric', name: 'x', unit: 'N' },
      inputs: [
        { kind: 'numeric', name: 'a', unit: 'mm' },
        { kind: 'numeric', name: 'b', unit: 'mm' },
      ],
      expression: 'a * b',
      description: 'Invented, and wrong on purpose.',
      status: 'unverified',
    });
    expect(() => checkFormulaDimensions(wrong)).toThrow(/declares its output as force/u);
  });

  it('lets a pure-number expression declare an angle output, as a connection may', () => {
    const sector = only({
      id: 'sector',
      version: 1,
      output: { kind: 'numeric', name: 'theta', unit: 'deg' },
      inputs: [{ kind: 'numeric', name: 'k', unit: '' }],
      expression: '2 * pi / k',
      description: 'Invented: the angle of one of k equal sectors.',
      status: 'unverified',
    });
    expect(() => checkFormulaDimensions(sector)).not.toThrow();
  });

  it('still refuses a length declared as an angle', () => {
    const wrong = only({
      id: 'wrong-angle',
      version: 1,
      output: { kind: 'numeric', name: 'theta', unit: 'rad' },
      inputs: [{ kind: 'numeric', name: 'a', unit: 'mm' }],
      expression: '2 * a',
      description: 'Invented, and wrong on purpose.',
      status: 'unverified',
    });
    expect(() => checkFormulaDimensions(wrong)).toThrow(/declares its output as angle/u);
  });

  it('gives a typed literal its own dimension, so a stated reference cancels a port', () => {
    const ratio = (expression: string): Formula =>
      only({
        id: 'ratio',
        version: 1,
        output: { kind: 'numeric', name: 'f', unit: '' },
        inputs: [{ kind: 'numeric', name: 't', unit: 'h' }],
        expression,
        description: 'Invented: a factor against a reference duration.',
        status: 'unverified',
      });
    expect(() => checkFormulaDimensions(ratio('(500[h] / t) ** (1 / 2)'))).not.toThrow();
    // Canonical time is seconds: a 2000 h port arrives as 7.2e6 s, and the
    // literal was converted the same way, so the ratio is the plain 1/4.
    const evaluate = compileFormula(ratio('(500[h] / t) ** (1 / 2)'), new Map()).evaluate.get('f');
    expect(evaluate?.({ t: 2000 * 3600 })).toBeCloseTo(0.5, 12);
    expect(() => checkFormulaDimensions(ratio('(500 / t) ** (1 / 2)'))).toThrow(/declares its output/u);
  });

  it('does not let a typed literal adopt a dimension the way a bare one does', () => {
    const sum = (expression: string): Formula =>
      only({
        id: 'typed-sum',
        version: 1,
        output: { kind: 'numeric', name: 'y', unit: 'mm' },
        inputs: [{ kind: 'numeric', name: 'a', unit: 'mm' }],
        expression,
        description: 'Invented.',
        status: 'unverified',
      });
    expect(() => checkFormulaDimensions(sum('a + 5[%]'))).toThrow(/cannot add/u);
    expect(() => checkFormulaDimensions(sum('a + 5'))).not.toThrow();
    expect(() => checkFormulaDimensions(sum('a + 5[mm]'))).not.toThrow();
  });

  it('refuses a typed literal as an exponent', () => {
    const power = only({
      id: 'power',
      version: 1,
      output: { kind: 'numeric', name: 'y', unit: 'mm²' },
      inputs: [{ kind: 'numeric', name: 'a', unit: 'mm' }],
      expression: 'a ** 2[mm]',
      description: 'Invented, and wrong on purpose.',
      status: 'unverified',
    });
    expect(() => checkFormulaDimensions(power)).toThrow(/exponent must be a pure number/u);
  });

  /**
   * A table declares each column's unit, so there is nothing for an expression
   * to vouch for — and a record whose only input is a dropdown has no numeric
   * port to build a stand-in expression out of in the first place.
   */
  it('asks nothing of a table-backed record with no expression at all', () => {
    const table = only({
      id: 'table',
      version: 1,
      output: [
        { kind: 'numeric', name: 'w', unit: 'mm' },
        { kind: 'numeric', name: 'p', unit: 'µm' },
      ],
      inputs: [{ kind: 'categorical', name: 'pick', domain: ['a', 'b'], default: 'a' }],
      lookup: {
        axes: [{ input: 'pick', kind: 'categorical', values: ['a', 'b'] }],
        values: { w: [1, 2], p: [3, 4] },
      },
      description: 'Invented property table.',
      status: 'unverified',
    });
    expect(() => checkFormulaDimensions(table)).not.toThrow();
  });

  it('catches arithmetic that cannot be done at all', () => {
    const wrong = only({
      id: 'mixed',
      version: 1,
      output: { kind: 'numeric', name: 'x', unit: 'mm' },
      inputs: [
        { kind: 'numeric', name: 'a', unit: 'mm' },
        { kind: 'numeric', name: 'b', unit: 'N' },
      ],
      expression: 'a + b',
      description: 'Invented, and wrong on purpose.',
      status: 'unverified',
    });
    expect(() => checkFormulaDimensions(wrong)).toThrow(/different dimensions/u);
  });

  it('catches a name that is not a port', () => {
    const wrong = only({
      id: 'stray',
      version: 1,
      output: { kind: 'numeric', name: 'x', unit: 'mm' },
      inputs: [{ kind: 'numeric', name: 'a', unit: 'mm' }],
      expression: 'a * k',
      description: 'Invented, and wrong on purpose.',
      status: 'unverified',
    });
    expect(() => checkFormulaDimensions(wrong)).toThrow(/not a port/u);
  });

  it('checks a generic record once, on a basis, rather than per binding', () => {
    expect(() => checkFormulaDimensions(byId('multiplyTwo'))).not.toThrow();

    const wrong = only({
      id: 'wrongGeneric',
      version: 1,
      output: { kind: 'numeric', name: 'x', unit: '$A' },
      inputs: [
        { kind: 'numeric', name: 'a', unit: '$A' },
        { kind: 'numeric', name: 'b', unit: '$B' },
      ],
      // Declares that it gives back an $A, but a product is $A·$B.
      expression: 'a * b',
      description: 'Invented, and wrong on purpose.',
      status: 'unverified',
    });
    expect(() => checkFormulaDimensions(wrong)).toThrow(/declares its output/u);
  });

  it('checks an appliesWhen predicate too', () => {
    const wrong = only({
      id: 'badCondition',
      version: 1,
      output: { kind: 'numeric', name: 'y', unit: 'mm' },
      inputs: [
        { kind: 'numeric', name: 'd', unit: 'mm' },
        { kind: 'numeric', name: 'F', unit: 'N' },
      ],
      expression: 'd * 2',
      appliesWhen: 'd < F',
      description: 'Invented, and wrong on purpose.',
      status: 'unverified',
    });
    expect(() => checkFormulaDimensions(wrong)).toThrow(/different dimensions/u);
  });
});

describe('compiling against a node’s bindings', () => {
  it('resolves a generic port to what this node is wired to', () => {
    const compiled = compileFormula(byId('addTwo'), new Map([['A', FORCE]]));
    expect(compiled.scope.dimensions['a']).toEqual(FORCE);
    expect(compiled.evaluate.get('sum')?.({ a: 2, b: 3 })).toBe(5);

    const lengths = compileFormula(byId('addTwo'), new Map([['A', LENGTH]]));
    expect(lengths.scope.dimensions['a']).toEqual(LENGTH);
  });

  it('refuses to compile a generic formula whose variable nothing binds', () => {
    expect(() => compileFormula(byId('addTwo'), new Map())).toThrow(/binds it/u);
  });
});
