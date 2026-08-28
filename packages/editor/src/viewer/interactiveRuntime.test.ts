import { afterEach, describe, expect, it, vi } from 'vitest';

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
});
