import { describe, expect, it } from 'vitest';
import type { OutputResult } from '@joveworks/kernel';
import type { GraphDocument, OutputNode } from '@joveworks/schema';

import { DEFAULT_DISPLAY } from '../present/display';
import type { Analysis } from './analysis';
import { compileNotebook, compiledNotebookIsComplete } from './compiledNotebook';

describe('browser NodeBook compiler', () => {
  it('produces presentation JSON without source expressions, catalogues, edges, or positions', () => {
    const kinds = ['print', 'check', 'plot', 'table', 'feasibility', 'sensitivity', 'stress', 'bestDesign', 'pareto', 'distribution', 'reliability'] as const;
    const nodes = [
      ...kinds.map((kind, index) => ({ id: kind, kind: 'output', position: { x: index, y: 0 }, frameId: 'report', label: kind, output: { kind, checks: [] } } as unknown as OutputNode)),
      { id: 'equation', kind: 'output', position: { x: 0, y: 1 }, frameId: 'report', output: { kind: 'equation' } } as OutputNode,
      { id: 'missing', kind: 'output', position: { x: 20, y: 0 }, frameId: 'report', output: { kind: 'print' } } as OutputNode,
    ];
    const document = {
      schemaVersion: 1, id: 'invented', title: 'Invented y = a*b + c', nodes,
      edges: [{ id: 'secret-edge', from: { node: 'a', port: 'x' }, to: { node: 'b', port: 'y' } }],
      frames: [{ id: 'report', title: 'Report', note: 'No restricted content.', position: { x: 99, y: 88 }, size: { width: 10, height: 10 } }],
    } as GraphDocument;
    const results = kinds.map((kind) => ({
      nodeId: kind, kind, expression: 'SECRET_EXPRESSION', catalogue: 'SECRET_CATALOGUE',
      checks: kind === 'feasibility' ? ['bending'] : [],
      series: { axes: [], data: [kind === 'print' ? Number.NaN : 4] }, unit: { symbol: 'mm' },
    })) as unknown as OutputResult[];
    const analysis = { evaluation: { outputs: results, axisReadouts: new Map() } } as unknown as Analysis;
    const display = { ...DEFAULT_DISPLAY, axes: { d: { continuous: true, logarithmic: false } }, checkLabels: { bending: 'Bending', unused: 'Never referenced' } };
    const compiled = compileNotebook(document, analysis, display);
    const json = JSON.stringify(compiled);
    expect(compiled.sections[0]?.outputs.map((output) => output.kind)).toEqual([...kinds, 'print']);
    expect(compiled.sections[0]?.outputs.at(-1)?.available).toBe(false);
    expect(compiledNotebookIsComplete(compiled)).toBe(false);
    expect(json).toContain('NaN');
    // The display facts the shared figures need travel with the report, and
    // nothing else does: only the Check a published result actually names.
    expect(compiled.axes).toEqual({ d: { continuous: true, logarithmic: false } });
    expect(compiled.checkLabels).toEqual({ bending: 'Bending' });
    expect(json).not.toContain('Never referenced');
    expect(compiled.display.contourPalette).toBe(DEFAULT_DISPLAY.contourPalette);
    for (const secret of ['SECRET_EXPRESSION', 'SECRET_CATALOGUE', 'secret-edge', '"edges"', '"position"', '"equation"']) expect(json).not.toContain(secret);
  });
});
