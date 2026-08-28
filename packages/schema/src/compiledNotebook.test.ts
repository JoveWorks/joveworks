import { describe, expect, it } from 'vitest';

import { decodeCompiledNumber, encodeCompiledNumber, parseCompiledNotebook } from './compiledNotebook.js';

describe('compiled notebook contract', () => {
  it('covers presentation kinds, marks, display settings, unavailable results, and non-finite values', () => {
    const kinds = ['print', 'check', 'plot', 'table', 'feasibility', 'sensitivity', 'stress', 'bestDesign', 'pareto', 'distribution', 'reliability'];
    const notebook = parseCompiledNotebook({
      schemaVersion: 2,
      title: 'Invented report',
      display: { numberStyle: 'dot-thousands', numberNotation: 'fixed', contourPalette: 'cividis', titleMath: false },
      axes: { a: { continuous: true, logarithmic: true }, grade: { continuous: false, logarithmic: false }, bogus: 'not an axis' },
      checkLabels: { check1: 'Bending', ignored: 7 },
      sections: [{
        id: 'results', title: 'Results', prose: 'Made-up values only.',
        sliders: [{ id: 'a', label: 'a', value: 2, min: '-Infinity', max: '+Infinity', unit: 'mm', figures: 2 }],
        outputs: [
          ...kinds.map((kind) => ({ id: kind, kind, label: kind, available: true, result: { kind, unit: 'mm', value: kind === 'print' ? 'NaN' : 1 } })),
          { id: 'digits', kind: 'table', label: 'Sizes', available: true, result: { kind: 'table' }, columnFigures: { d: 2, bad: 'x' } },
          { id: 'unfinished', kind: 'print', label: 'Unfinished', available: false, unavailableReason: 'not connected' },
        ],
      }],
      marks: [{ a: 'NaN', material: 'steel' }],
      axisReadouts: [{ id: 'a', readout: { axis: { id: 'a' }, coordinates: { kind: 'numeric', data: [1, 'NaN'] } } }],
    });
    expect(notebook.sections[0]?.outputs.map((output) => output.kind)).toEqual([...kinds, 'table', 'print']);
    expect(notebook.sections[0]?.outputs.at(-1)?.available).toBe(false);
    expect(notebook.display).toEqual({ numberStyle: 'dot-thousands', numberNotation: 'fixed', contourPalette: 'cividis', titleMath: false });
    // A malformed entry is dropped rather than failing the whole report: a
    // reader gets the results that do parse, and a figure without its axis
    // nature falls back to the conservative reading.
    expect(notebook.axes).toEqual({ a: { continuous: true, logarithmic: true }, grade: { continuous: false, logarithmic: false } });
    expect(notebook.checkLabels).toEqual({ check1: 'Bending' });
    expect(notebook.sections[0]?.outputs.at(-2)?.columnFigures).toEqual({ d: 2 });
    expect(Number.isNaN(decodeCompiledNumber(notebook.marks[0]?.a as 'NaN'))).toBe(true);
    expect(encodeCompiledNumber(-Infinity)).toBe('-Infinity');
    expect(JSON.stringify(notebook)).toContain('mm');
  });

  it('refuses a report written to an older contract rather than half-reading it', () => {
    expect(() => parseCompiledNotebook({ schemaVersion: 1, title: 'Old', sections: [], marks: [], axisReadouts: [] }))
      .toThrow(/unsupported compiled notebook version/u);
  });

  it('defaults display settings a report does not carry', () => {
    const notebook = parseCompiledNotebook({ schemaVersion: 2, title: 'Bare', sections: [], marks: [], axisReadouts: [] });
    expect(notebook.display).toEqual({ numberStyle: 'plain', numberNotation: 'si', contourPalette: 'viridis', titleMath: true });
    expect(notebook.axes).toEqual({});
  });
});
