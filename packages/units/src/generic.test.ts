import { describe, expect, it } from 'vitest';

import { AREA, FORCE, LENGTH, STRESS, dimension } from './dimension.js';
import {
  bareVariable,
  genericVariables,
  isGenericDimension,
  isGenericSignature,
  parseGenericDimension,
  resolveGeneric,
} from './generic.js';
import { parseUnit } from './parse.js';

describe('recognising a signature', () => {
  it('is the sigil, and no unit symbol carries one', () => {
    expect(isGenericSignature('$A')).toBe(true);
    expect(isGenericSignature('N/mm²')).toBe(false);
    expect(isGenericDimension(parseGenericDimension('$A'))).toBe(true);
    expect(isGenericDimension(parseUnit('N'))).toBe(false);
  });
});

describe('parsing', () => {
  it('reads a bare variable', () => {
    const generic = parseGenericDimension('$A');
    expect(generic.symbol).toBe('$A');
    expect(generic.variables).toEqual({ A: 1 });
  });

  it('reads a variable name with an underscore, as a closure port name can carry', () => {
    expect(parseGenericDimension('$F_a').variables).toEqual({ F_a: 1 });
  });

  it('reads products and quotients, with / binding to one term', () => {
    expect(parseGenericDimension('$A*$B').variables).toEqual({ A: 1, B: 1 });
    expect(parseGenericDimension('$A/$B').variables).toEqual({ A: 1, B: -1 });
    expect(parseGenericDimension('$A/$B/$C').variables).toEqual({ A: 1, B: -1, C: -1 });
    expect(parseGenericDimension('$A·$B').variables).toEqual({ A: 1, B: 1 });
  });

  it('reads exponents, including a fraction written as a fraction', () => {
    expect(parseGenericDimension('$A**2').variables).toEqual({ A: 2 });
    expect(parseGenericDimension('$A^-1').variables).toEqual({ A: -1 });
    expect(parseGenericDimension('$A**(1/2)').variables).toEqual({ A: 0.5 });
    expect(parseGenericDimension('$A**(1/3)').variables['A']).toBeCloseTo(1 / 3, 15);
  });

  it('refuses to mix in a concrete unit', () => {
    expect(() => parseGenericDimension('$A*mm')).toThrow(/cannot mix in a concrete unit/);
  });

  it('refuses a signature that cancels to nothing', () => {
    expect(() => parseGenericDimension('$A/$A')).toThrow(/cancels to nothing/);
  });

  it('reports the malformed cases', () => {
    expect(() => parseGenericDimension('$')).toThrow(/without a name/);
    expect(() => parseGenericDimension('/$A')).toThrow(/cannot start with/);
    expect(() => parseGenericDimension('$A/')).toThrow(/trailing/);
    expect(() => parseGenericDimension('$A**(1/x)')).toThrow(/is not a fraction/);
    expect(() => parseGenericDimension('N')).toThrow(/no '\$' variable/);
  });
});

describe('bareVariable', () => {
  it('accepts one variable to the first power and nothing else', () => {
    expect(bareVariable(parseGenericDimension('$A'))).toBe('A');
    expect(bareVariable(parseGenericDimension('$A*$B'))).toBeUndefined();
    expect(bareVariable(parseGenericDimension('$A**2'))).toBeUndefined();
  });

  it('lists variables in a stable order', () => {
    expect(genericVariables(parseGenericDimension('$B*$A'))).toEqual(['A', 'B']);
  });
});

describe('resolving', () => {
  it('substitutes bound dimensions', () => {
    expect(resolveGeneric(parseGenericDimension('$A'), { A: FORCE })).toEqual(FORCE);
    expect(resolveGeneric(parseGenericDimension('$A*$B'), { A: LENGTH, B: LENGTH })).toEqual(AREA);
    expect(resolveGeneric(parseGenericDimension('$A/$B'), { A: FORCE, B: AREA })).toEqual(STRESS);
    expect(resolveGeneric(parseGenericDimension('$A**2'), { A: LENGTH })).toEqual(AREA);
  });

  it('takes the root of an area back to a length', () => {
    expect(resolveGeneric(parseGenericDimension('$A**(1/2)'), { A: AREA })).toEqual(LENGTH);
  });

  it('leaves a fractional exponent where the algebra puts one', () => {
    // cbrt of a force is force^(1/3): a real dimension, and not one any unit
    // names. The kernel has to compare these with a tolerance rather than `===`.
    const root = resolveGeneric(parseGenericDimension('$A**(1/3)'), { A: FORCE });
    expect(root.force).toBeCloseTo(1 / 3, 15);
    expect(resolveGeneric(parseGenericDimension('$A**(1/3)'), { A: dimension({ length: 3 }) })).toEqual(
      LENGTH,
    );
  });

  it('raises on an unbound variable rather than defaulting to dimensionless', () => {
    expect(() => resolveGeneric(parseGenericDimension('$A*$B'), { A: FORCE })).toThrow(
      /'\$B' is not bound/,
    );
  });
});
