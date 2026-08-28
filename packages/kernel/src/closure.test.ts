import { describe, expect, it } from 'vitest';

import { KernelError } from './errors.js';
import { closureFormula } from './closure.js';

describe('closureFormula', () => {
  it('derives one generic port per free name, alphabetically', () => {
    const formula = closureFormula('b + a');
    expect(formula.inputs.map((port) => port.name)).toEqual(['a', 'b']);
    expect(formula.inputs.every((port) => port.kind === 'numeric')).toBe(true);
    expect((formula.outputs[0]!).name).toBe('result');
  });

  it('excludes named constants such as pi', () => {
    const formula = closureFormula('pi * r ** 2');
    expect(formula.inputs.map((port) => port.name)).toEqual(['r']);
  });

  it('marks a bare reduction argument as a variadic port', () => {
    const formula = closureFormula('sum(xs) / n');
    const xs = formula.inputs.find((port) => port.name === 'xs');
    const n = formula.inputs.find((port) => port.name === 'n');
    expect(xs?.kind === 'numeric' && xs.variadic).toBe(true);
    expect(n?.kind === 'numeric' && n.variadic).toBeUndefined();
  });

  it('marks only the variadic argument of a two-argument reduction, not its index', () => {
    const formula = closureFormula('at(xs, i)');
    const xs = formula.inputs.find((port) => port.name === 'xs');
    const i = formula.inputs.find((port) => port.name === 'i');
    expect(xs?.kind === 'numeric' && xs.variadic).toBe(true);
    expect(i?.kind === 'numeric' && i.variadic).toBeUndefined();
  });

  it('rejects a symbol named after the output port', () => {
    expect(() => closureFormula('result + 1')).toThrow(KernelError);
  });

  it('rejects a syntax error', () => {
    expect(() => closureFormula('a + * b')).toThrow(KernelError);
  });

  it('gives a fresh, unwritten node a plain "type an equation" message', () => {
    expect(() => closureFormula('')).toThrow(/type an equation/u);
    expect(() => closureFormula('   ')).toThrow(/type an equation/u);
  });

  it('gives every port its own independent generic variable', () => {
    const formula = closureFormula('a + b');
    const a = formula.inputs.find((port) => port.name === 'a');
    const b = formula.inputs.find((port) => port.name === 'b');
    expect(a?.kind === 'numeric' && a.unit).toMatchObject({ symbol: '$a' });
    expect(b?.kind === 'numeric' && b.unit).toMatchObject({ symbol: '$b' });
  });
});
