/**
 * The document edits, which are the only thing the canvas can do to a graph.
 *
 * The fixtures are invented — `a`, `b`, a frame — and deliberately carry no
 * formula at all: these functions never look at one, and a catalogue record here
 * would be a citation for someone to copy (CLAUDE.md).
 */

import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, type GraphDocument, type InputNode } from '@mds/schema';
import { parseUnit } from '@mds/units';

import { addNode, connect, frameAround, reframe, removeNodes, uniqueId, updateNode } from './document';

const input = (id: string, x: number, y: number): InputNode => ({
  kind: 'input',
  id,
  position: { x, y },
  value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
});

const base: GraphDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'test',
  title: 'Test',
  nodes: [input('a', 0, 0), input('b', 400, 0)],
  edges: [],
  frames: [],
};

describe('document edits', () => {
  it('gives a new node an id nothing else has taken', () => {
    expect(uniqueId(base, 'a')).toBe('a2');
    expect(uniqueId(base, 'c')).toBe('c');
  });

  it('replaces the edge already arriving at a port, because an input takes one', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    const rewired = connect(
      addNode(wired, input('c', 0, 200)),
      { node: 'c', port: 'value' },
      { node: 'b', port: 'x' },
    );
    expect(rewired.edges).toHaveLength(1);
    expect(rewired.edges[0]?.from.node).toBe('c');
  });

  it('drops the edges of a node it removes', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    expect(removeNodes(wired, new Set(['a'])).edges).toEqual([]);
  });

  it('drops the frame membership of nodes whose frame is removed', () => {
    const framed = reframe({
      ...base,
      frames: [frameAround('section', 'Section', base.nodes)],
    });
    expect(framed.nodes.every((node) => node.frameId === 'section')).toBe(true);

    const bare = removeNodes(framed, new Set(['section']));
    expect(bare.nodes.every((node) => node.frameId === undefined)).toBe(true);
  });

  it('decides section membership by where a node sits, so moving one re-sections it', () => {
    const framed = reframe({
      ...base,
      frames: [
        {
          id: 'section',
          title: 'Section',
          position: { x: -50, y: -50 },
          size: { width: 200, height: 200 },
        },
      ],
    });
    expect(framed.nodes.find((node) => node.id === 'a')?.frameId).toBe('section');
    expect(framed.nodes.find((node) => node.id === 'b')?.frameId).toBeUndefined();

    const moved = reframe(
      updateNode<InputNode>(framed, 'b', (node) => ({ ...node, position: { x: 10, y: 10 } })),
    );
    expect(moved.nodes.find((node) => node.id === 'b')?.frameId).toBe('section');
  });
});
