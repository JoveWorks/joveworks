import { describe, expect, it } from 'vitest';

import { emptyDocument, type GraphDocument } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { documentEvents } from './documentEvents';

const unit = parseUnit('');

function base(): GraphDocument {
  return emptyDocument('study', 'Study');
}

describe('documentEvents', () => {
  it('records a new plot without exposing its graph data', () => {
    const after = {
      ...base(),
      nodes: [{ kind: 'output' as const, id: 'plot', output: { kind: 'plot' as const, contour: true }, position: { x: 0, y: 0 } }],
    };
    expect(documentEvents(base(), after)).toEqual([
      { name: 'node_added', props: { kind: 'output' } },
      { name: 'plot_created', props: { mode: 'contour' } },
    ]);
  });

  it('records an input becoming a sweep and a new connection', () => {
    const before = {
      ...base(),
      nodes: [{ kind: 'input' as const, id: 'd', value: { kind: 'scalar' as const, value: 10, unit }, position: { x: 0, y: 0 } }],
    };
    const after = {
      ...before,
      nodes: [{ ...before.nodes[0], value: { kind: 'linear' as const, start: 10, stop: 20, points: 3, unit } }],
      edges: [{ id: 'd.value->x.value', from: { node: 'd', port: 'value' }, to: { node: 'x', port: 'value' } }],
    };
    expect(documentEvents(before, after)).toEqual([
      { name: 'sweep_configured', props: { kind: 'linear' } },
      { name: 'nodes_connected' },
    ]);
  });

  it('records a new notebook section as a frame, without its title or note', () => {
    const after = {
      ...base(),
      frames: [{ id: 'section', title: 'Private calculation notes', position: { x: 0, y: 0 }, size: { width: 200, height: 100 } }],
    };
    expect(documentEvents(base(), after)).toEqual([{ name: 'node_added', props: { kind: 'frame' } }]);
  });
});
