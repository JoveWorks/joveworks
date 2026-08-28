import { afterEach, describe, expect, it, vi } from 'vitest';

import { formulaRef } from '@joveworks/schema';

import { lookup } from '../model/analysis';
import { baseCatalogue } from '../model/catalogues';
import { activateNotebook, CourseAccessRequired } from './interactiveRuntime';

const document = {
  schemaVersion: 1, id: 'invented', title: 'Invented slider',
  nodes: [
    { id: 'a', kind: 'input', position: { x: 0, y: 0 }, frameId: 'report', label: 'a', exposeInNotebook: true, value: { kind: 'slider', value: 2, min: 1, max: 5, unit: 'mm', figures: 1 } },
    { id: 'answer', kind: 'output', position: { x: 200, y: 0 }, frameId: 'report', label: 'Answer', output: { kind: 'print' } },
  ],
  edges: [{ id: 'a-answer', from: { node: 'a', port: 'value' }, to: { node: 'answer', port: 'value' } }],
  frames: [{ id: 'report', title: 'Results', position: { x: 0, y: 0 }, size: { width: 400, height: 200 } }],
};

afterEach(() => vi.unstubAllGlobals());

describe('lazy interactive runtime', () => {
  it('reuses source state for changes and Reset', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ document, catalogues: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const active = await activateNotebook('share', 'shared', 'https://hub.test');
    expect(active.notebook.sections[0]?.sliders[0]?.value).toBe(2);
    const changed = active.change('a', 4);
    expect(changed.notebook.sections[0]?.sliders[0]?.value).toBe(4);
    expect(changed.reset().notebook.sections[0]?.sliders[0]?.value).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a token challenge so the viewer prompts only after 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(activateNotebook('publication', 'private', 'https://hub.test')).rejects.toBeInstanceOf(CourseAccessRequired);
  });

  /**
   * The Hub pins the catalogues a document imported, and nothing else: the
   * base, array and mechanics libraries ship inside the app. Re-evaluating
   * against the pins alone left every base-library node unresolved, so a
   * published report's plots and tables went blank the moment its controls
   * were activated.
   */
  it('re-evaluates base-library nodes the Hub does not pin', async () => {
    const sum = { id: 'sum', kind: 'formula', position: { x: 100, y: 0 }, formula: formulaRef(lookup([baseCatalogue()], 'base.math.add') as never) };
    const withFormula = {
      ...document,
      nodes: [...document.nodes.slice(0, 1), { ...document.nodes[0], id: 'b', label: 'b' }, sum, document.nodes[1]],
      edges: [
        { id: 'a-sum', from: { node: 'a', port: 'value' }, to: { node: 'sum', port: 'a' } },
        { id: 'b-sum', from: { node: 'b', port: 'value' }, to: { node: 'sum', port: 'b' } },
        { id: 'sum-answer', from: { node: 'sum', port: 'sum' }, to: { node: 'answer', port: 'value' } },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ document: withFormula, catalogues: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const active = await activateNotebook('share', 'shared', 'https://hub.test');
    expect(active.notebook.sections[0]?.outputs[0]?.available).toBe(true);
  });
});