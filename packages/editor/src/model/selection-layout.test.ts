import { describe, expect, it } from 'vitest';

import { DOCUMENT_SCHEMA_VERSION, type ClosureNode, type GraphDocument, type InputNode } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { alignSelection, arrangeSelection, spaceSelectionEvenly } from './selection-layout';

const node = (id: string, x: number, y: number, frameId?: string): InputNode => ({
  kind: 'input',
  id,
  position: { x, y },
  frameId,
  value: { kind: 'scalar', value: 1, unit: parseUnit('') },
});

const closure = (id: string, x: number, y: number, frameId?: string): ClosureNode => ({
  kind: 'closure',
  id,
  position: { x, y },
  frameId,
  expression: 'a + 1',
});

const base: GraphDocument = {
  schemaVersion: DOCUMENT_SCHEMA_VERSION,
  id: 'selection-test',
  title: 'Selection test',
  nodes: [],
  edges: [],
  frames: [],
};

describe('alignSelection', () => {
  it('aligns only selected nodes and uses measured sizes for right edges', () => {
    const document = { ...base, nodes: [node('a', 10, 20), node('b', 100, 80), node('c', 300, 40)] };
    const result = alignSelection(
      document,
      new Set(['a', 'b']),
      'right',
      new Map([['a', { width: 50, height: 20 }], ['b', { width: 100, height: 20 }]]),
    );
    expect(result.nodes.map((entry) => entry.position)).toEqual([
      { x: 150, y: 20 },
      { x: 100, y: 80 },
      { x: 300, y: 40 },
    ]);
  });

  it('does not align nodes across section boundaries', () => {
    const document = { ...base, nodes: [node('a', 10, 20, 'f'), node('b', 100, 80)] };
    expect(alignSelection(document, new Set(['a', 'b']), 'left')).toBe(document);
  });
});

describe('spaceSelectionEvenly', () => {
  it('creates equal horizontal gaps using measured node widths', () => {
    const document = {
      ...base,
      nodes: [node('a', 10, 20), node('b', 190, 80), node('c', 300, 40), node('other', 500, 50)],
    };
    const result = spaceSelectionEvenly(
      document,
      new Set(['a', 'b', 'c']),
      'horizontal',
      new Map([
        ['a', { width: 50, height: 20 }],
        ['b', { width: 100, height: 20 }],
        ['c', { width: 50, height: 20 }],
      ]),
    );
    expect(result.nodes.map((entry) => entry.position)).toEqual([
      { x: 10, y: 20 },
      { x: 130, y: 80 },
      { x: 300, y: 40 },
      { x: 500, y: 50 },
    ]);
  });

  it('creates equal vertical gaps without crossing section boundaries', () => {
    const document = {
      ...base,
      nodes: [node('a', 10, 10, 'f'), node('b', 80, 120, 'f'), node('c', 30, 230, 'f'), node('loose', 200, 80)],
    };
    const result = spaceSelectionEvenly(
      document,
      new Set(['a', 'b', 'c', 'loose']),
      'vertical',
      new Map([
        ['a', { width: 50, height: 20 }],
        ['b', { width: 50, height: 40 }],
        ['c', { width: 50, height: 20 }],
      ]),
    );
    expect(result.nodes.map((entry) => entry.position)).toEqual([
      { x: 10, y: 10 },
      { x: 80, y: 110 },
      { x: 30, y: 230 },
      { x: 200, y: 80 },
    ]);
  });

  it('leaves a two-node selection unchanged', () => {
    const document = { ...base, nodes: [node('a', 10, 20), node('b', 100, 80)] };
    expect(spaceSelectionEvenly(document, new Set(['a', 'b']), 'horizontal')).toBe(document);
  });
});

describe('arrangeSelection', () => {
  it('uses selected topology while leaving unselected nodes in place', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [node('a', 400, 300), closure('b', 405, 305), node('c', 900, 900)],
      edges: [{ id: 'e', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' } }],
    };
    const result = arrangeSelection(document, new Set(['a', 'b']));
    expect(result.nodes[0].position.x).toBeLessThan(result.nodes[1].position.x);
    expect(result.nodes[2].position).toEqual({ x: 900, y: 900 });
    expect(Math.min(result.nodes[0].position.x, result.nodes[1].position.x)).toBe(400);
    expect(Math.min(result.nodes[0].position.y, result.nodes[1].position.y)).toBe(300);
  });

  it('preserves section membership and origin, growing the frame if needed', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [node('a', 120, 130, 'f'), closure('b', 125, 135, 'f')],
      edges: [{ id: 'e', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' } }],
      frames: [{ id: 'f', title: 'Section', position: { x: 100, y: 100 }, size: { width: 300, height: 240 } }],
    };
    const result = arrangeSelection(document, new Set(['a', 'b']));
    expect(result.nodes.every((entry) => entry.frameId === 'f')).toBe(true);
    expect(result.frames[0].position).toEqual({ x: 100, y: 100 });
    expect(result.frames[0].size.width).toBeGreaterThan(300);
  });

  it('keeps the existing top-to-bottom reading order for disconnected nodes', () => {
    const document = {
      ...base,
      nodes: [closure('later', 400, 500), closure('earlier', 400, 200)],
    };
    const result = arrangeSelection(document, new Set(['later', 'earlier']));
    const later = result.nodes.find((entry) => entry.id === 'later')!;
    const earlier = result.nodes.find((entry) => entry.id === 'earlier')!;
    expect(earlier.position.y).toBeLessThan(later.position.y);
  });
});
