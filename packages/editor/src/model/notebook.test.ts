import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, type GraphDocument, type GraphNode } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { exposedSlidersFor, withSliderValue } from './notebook';

const slider = (id: string, x: number, exposed = true): GraphNode => ({
  kind: 'input',
  id,
  label: id,
  position: { x, y: 0 },
  value: { kind: 'slider', value: 5, min: 0, max: 10, unit: parseUnit('mm') },
  ...(exposed ? { exposeInNotebook: true } : {}),
});

const output = (id: string, kind: 'print' | 'equation' = 'print'): GraphNode => ({
  kind: 'output',
  id,
  position: { x: 500, y: 0 },
  output: { kind },
});

const graph = (nodes: readonly GraphNode[], edges: GraphDocument['edges']): GraphDocument => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'controls',
  title: 'Controls',
  nodes,
  edges,
  frames: [],
});

describe('exposed NodeBook sliders', () => {
  it('walks transitive edges, deduplicates paths, ignores hidden sliders, and uses reading order', () => {
    const nodes: GraphNode[] = [
      slider('right', 200),
      slider('left', 0),
      slider('hidden', 100, false),
      { kind: 'waypoint', id: 'middle', position: { x: 300, y: 0 } },
      output('result'),
    ];
    const edges = [
      { id: 'left-middle', from: { node: 'left', port: 'value' }, to: { node: 'middle', port: 'value' } },
      { id: 'middle-result', from: { node: 'middle', port: 'value' }, to: { node: 'result', port: 'value' } },
      { id: 'left-result', from: { node: 'left', port: 'value' }, to: { node: 'result', port: 'other' } },
      { id: 'right-result', from: { node: 'right', port: 'value' }, to: { node: 'result', port: 'third' } },
      { id: 'hidden-result', from: { node: 'hidden', port: 'value' }, to: { node: 'result', port: 'fourth' } },
    ];

    expect(exposedSlidersFor(graph(nodes, edges), 'result').map((node) => node.id)).toEqual(['left', 'right']);
  });

  it.each(['feasibility', 'bestDesign', 'reliability'] as const)(
    'follows Check references for a %s result',
    (kind) => {
      const check: GraphNode = {
        kind: 'output', id: 'check', position: { x: 300, y: 0 },
        output: { kind: 'check', comparison: '>=', threshold: { value: 0, unit: parseUnit('mm') } },
      };
      const composite: GraphNode = {
        kind: 'output', id: 'composite', position: { x: 500, y: 0 },
        output: kind === 'bestDesign'
          ? { kind, checks: ['check'], direction: 'minimize' }
          : kind === 'reliability'
            ? { kind, checks: ['check'] }
            : { kind, checks: ['check'] },
      };
      const document = graph(
        [slider('assumption', 0), check, composite],
        [{ id: 'to-check', from: { node: 'assumption', port: 'value' }, to: { node: 'check', port: 'value' } }],
      );
      expect(exposedSlidersFor(document, 'composite').map((node) => node.id)).toEqual(['assumption']);
    },
  );

  it('does not offer controls beneath an Equation output whose visible expression cannot change', () => {
    const document = graph(
      [slider('assumption', 0), output('equation', 'equation')],
      [{ id: 'edge', from: { node: 'assumption', port: 'value' }, to: { node: 'equation', port: 'value' } }],
    );
    expect(exposedSlidersFor(document, 'equation')).toEqual([]);
  });

  it('updates the one slider value shared by every rendered clone', () => {
    const document = graph(
      [slider('assumption', 0), output('result')],
      [{ id: 'edge', from: { node: 'assumption', port: 'value' }, to: { node: 'result', port: 'value' } }],
    );
    const changed = withSliderValue(document, 'assumption', 7.5);
    expect(exposedSlidersFor(changed, 'result')[0]?.value.value).toBe(7.5);
  });
});
