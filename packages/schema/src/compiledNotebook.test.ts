import { describe, expect, it } from 'vitest';

import { decodeCompiledNumber, encodeCompiledNumber, parseCompiledNotebook } from './compiledNotebook.js';

describe('compiled notebook contract', () => {
  it('covers presentation kinds, marks, units, unavailable results, and non-finite values', () => {
    const kinds = ['print', 'check', 'plot', 'table', 'feasibility', 'sensitivity', 'stress', 'bestDesign', 'pareto', 'distribution', 'reliability'];
    const notebook = parseCompiledNotebook({
      schemaVersion: 1,
      title: 'Invented report',
      sections: [{
        id: 'results', title: 'Results', prose: 'Made-up values only.',
        sliders: [{ id: 'a', label: 'a', value: 2, min: '-Infinity', max: '+Infinity', unit: 'mm', figures: 2 }],
        outputs: [
          ...kinds.map((kind) => ({ id: kind, kind, label: kind, available: true, result: { kind, unit: 'mm', value: kind === 'print' ? 'NaN' : 1 } })),
          { id: 'unfinished', kind: 'print', label: 'Unfinished', available: false, unavailableReason: 'not connected' },
        ],
      }],
      marks: [{ a: 'NaN', material: 'steel' }],
      axisReadouts: [{ id: 'a', unit: 'mm', coordinates: [0, '+Infinity'] }],
    });
    expect(notebook.sections[0]?.outputs.map((output) => output.kind)).toEqual([...kinds, 'print']);
    expect(notebook.sections[0]?.outputs.at(-1)?.available).toBe(false);
    expect(Number.isNaN(decodeCompiledNumber(notebook.marks[0]?.a as 'NaN'))).toBe(true);
    expect(encodeCompiledNumber(-Infinity)).toBe('-Infinity');
    expect(JSON.stringify(notebook)).toContain('mm');
  });
});
