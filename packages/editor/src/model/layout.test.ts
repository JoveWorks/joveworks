/**
 * `autoArrange`. Fixtures are invented (`a`, `b`, a frame), same as
 * document.test.ts, and carry no formula content.
 */

import { describe, expect, it } from 'vitest';

import {
  SCHEMA_VERSION,
  type ClosureNode,
  type CompareNode,
  type Edge,
  type Frame,
  type GraphDocument,
  type InputNode,
  type OutputNode,
} from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { BOTTOM_ROW_GAP_Y, GAP, NODE_HEIGHT, NODE_WIDTH } from './layout-constants';
import { autoArrange } from './layout';
import type { NodeSizes } from './node-sizes';

const input = (id: string, x: number, y: number, frameId?: string): InputNode => ({
  kind: 'input',
  id,
  position: { x, y },
  frameId,
  value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
});

const closure = (id: string, x: number, y: number, frameId?: string): ClosureNode => ({
  kind: 'closure',
  id,
  position: { x, y },
  frameId,
  expression: 'a + 1',
});

const output = (id: string, x: number, y: number, frameId?: string): OutputNode => ({
  kind: 'output',
  id,
  position: { x, y },
  frameId,
  output: { kind: 'print' },
});

const compare = (id: string, x: number, y: number, frameId?: string): CompareNode => ({
  kind: 'compare',
  id,
  position: { x, y },
  frameId,
  comparison: '<',
  threshold: { value: 1, unit: parseUnit('mm') },
});

const edge = (id: string, fromNode: string, toNode: string): Edge => ({
  id,
  from: { node: fromNode, port: 'out' },
  to: { node: toNode, port: 'in' },
});

const base: GraphDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'test',
  title: 'Test',
  nodes: [],
  edges: [],
  frames: [],
};

function bounds(items: readonly { position: { x: number; y: number } }[], width: number, height: number) {
  return items.map((item) => ({
    left: item.position.x,
    top: item.position.y,
    right: item.position.x + width,
    bottom: item.position.y + height,
  }));
}

function overlaps(a: ReturnType<typeof bounds>[number], b: ReturnType<typeof bounds>[number]): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function nodeX(document: GraphDocument, id: string): number {
  return document.nodes.find((node) => node.id === id)!.position.x;
}

function nodeY(document: GraphDocument, id: string): number {
  return document.nodes.find((node) => node.id === id)!.position.y;
}

describe('autoArrange', () => {
  it('uses measured block sizes when stacking a column', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [input('inA', 0, 0), input('inB', 20, 20), closure('a', 0, 0), closure('b', 0, 10)],
      edges: [edge('e1', 'inA', 'a'), edge('e2', 'inB', 'b')],
    };
    const sizes: NodeSizes = new Map([
      ['a', { width: NODE_WIDTH, height: 120 }],
      ['b', { width: NODE_WIDTH, height: 260 }],
    ]);

    const arranged = autoArrange(document, sizes);
    expect(nodeX(arranged, 'a')).toBe(nodeX(arranged, 'b'));
    expect(nodeY(arranged, 'b') - nodeY(arranged, 'a')).toBe(120 + GAP);
  });

  it('places the bottom output row below the tallest measured block', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [input('in', 0, 0), closure('mid', 0, 0), output('out', 0, 0)],
      edges: [edge('e1', 'in', 'mid'), edge('e2', 'mid', 'out')],
    };
    const sizes: NodeSizes = new Map([['mid', { width: NODE_WIDTH, height: 280 }]]);

    const arranged = autoArrange(document, sizes);
    expect(nodeY(arranged, 'out')).toBe(nodeY(arranged, 'mid') + 280 + BOTTOM_ROW_GAP_Y);
  });

  it('spreads overlapping loose nodes apart', () => {
    const document: GraphDocument = { ...base, nodes: [input('a', 0, 0), input('b', 5, 5)] };
    const arranged = autoArrange(document);
    const boxes = bounds(arranged.nodes, NODE_WIDTH, NODE_HEIGHT);
    expect(overlaps(boxes[0], boxes[1])).toBe(false);
  });

  it('moves a frame and its members together, preserving relative position', () => {
    const frame: Frame = { id: 'f', title: 'Section', position: { x: 0, y: 0 }, size: { width: 400, height: 300 } };
    const document: GraphDocument = {
      ...base,
      nodes: [input('a', 20, 20, 'f'), input('b', 200, 20, 'f'), input('c', 1000, 1000)],
      frames: [frame],
    };
    const arranged = autoArrange(document);
    const arrangedFrame = arranged.frames[0];
    const memberA = arranged.nodes.find((n) => n.id === 'a')!;
    const memberB = arranged.nodes.find((n) => n.id === 'b')!;

    // relative offsets inside the frame are unchanged
    expect(memberA.position.x - arrangedFrame.position.x).toBe(20);
    expect(memberA.position.y - arrangedFrame.position.y).toBe(20);
    expect(memberB.position.x - arrangedFrame.position.x).toBe(200);
    expect(memberB.position.y - arrangedFrame.position.y).toBe(20);

    // frame membership is untouched
    expect(memberA.frameId).toBe('f');
    expect(memberB.frameId).toBe('f');
    expect(arranged.nodes.find((n) => n.id === 'c')!.frameId).toBeUndefined();
  });

  it('treats nested groups as part of their top-level frame block', () => {
    const section: Frame = { id: 'section', title: 'Section', position: { x: 100, y: 100 }, size: { width: 500, height: 350 } };
    const group: Frame = {
      id: 'group', kind: 'group', frameId: 'section', title: 'Inputs',
      position: { x: 140, y: 150 }, size: { width: 280, height: 180 },
    };
    const document: GraphDocument = {
      ...base,
      nodes: [input('nested', 170, 180, 'group'), input('loose', 100, 100)],
      frames: [section, group],
    };
    const arranged = autoArrange(document);
    const arrangedSection = arranged.frames.find((frame) => frame.id === 'section')!;
    const arrangedGroup = arranged.frames.find((frame) => frame.id === 'group')!;
    const nested = arranged.nodes.find((node) => node.id === 'nested')!;

    expect(arrangedGroup.position.x - arrangedSection.position.x).toBe(40);
    expect(arrangedGroup.position.y - arrangedSection.position.y).toBe(50);
    expect(nested.position.x - arrangedGroup.position.x).toBe(30);
    expect(nested.position.y - arrangedGroup.position.y).toBe(30);
  });

  it('leaves frames and loose nodes disjoint', () => {
    const frame: Frame = { id: 'f', title: 'Section', position: { x: 0, y: 0 }, size: { width: 300, height: 200 } };
    const document: GraphDocument = {
      ...base,
      nodes: [input('a', 10, 10, 'f'), input('loose', 50, 50)],
      frames: [frame],
    };
    const arranged = autoArrange(document);
    const frameBox = bounds(arranged.frames, arranged.frames[0].size.width, arranged.frames[0].size.height)[0];
    const looseBox = bounds(
      arranged.nodes.filter((n) => n.frameId === undefined),
      NODE_WIDTH,
      NODE_HEIGHT,
    )[0];
    expect(overlaps(frameBox, looseBox)).toBe(false);
  });

  it('is stable when run twice (isolated nodes)', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [input('a', 5, 5), input('b', 5, 5), input('c', 900, 10)],
    };
    const once = autoArrange(document);
    const twice = autoArrange(once);
    expect(twice.nodes.map((n) => n.position)).toEqual(once.nodes.map((n) => n.position));
  });

  it('lays out a straight chain in increasing columns', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [input('in', 0, 0), closure('mid', 0, 0), closure('sink', 0, 0)],
      edges: [edge('e1', 'in', 'mid'), edge('e2', 'mid', 'sink')],
    };
    const arranged = autoArrange(document);
    expect(nodeX(arranged, 'in')).toBeLessThan(nodeX(arranged, 'mid'));
    expect(nodeX(arranged, 'mid')).toBeLessThan(nodeX(arranged, 'sink'));
  });

  it('pins a framed output node to the rightmost column', () => {
    const frame: Frame = { id: 'f', title: 'Section', position: { x: 0, y: 0 }, size: { width: 300, height: 200 } };
    const document: GraphDocument = {
      ...base,
      nodes: [input('in', 0, 0), closure('mid', 0, 0), output('out', 0, 0, 'f')],
      edges: [edge('e1', 'in', 'mid'), edge('e2', 'mid', 'out')],
      frames: [frame],
    };
    const arranged = autoArrange(document);
    expect(nodeX(arranged, 'in')).toBeLessThan(nodeX(arranged, 'mid'));
    expect(nodeX(arranged, 'mid')).toBeLessThan(arranged.frames[0].position.x);
  });

  it('places a diamond\'s two branches in the same column, disjoint vertically', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [input('in', 0, 0), closure('a', 0, 0), closure('b', 0, 0), output('out', 0, 0)],
      edges: [
        edge('e1', 'in', 'a'),
        edge('e2', 'in', 'b'),
        edge('e3', 'a', 'out'),
        edge('e4', 'b', 'out'),
      ],
    };
    const arranged = autoArrange(document);
    expect(nodeX(arranged, 'a')).toBe(nodeX(arranged, 'b'));
    const boxes = bounds(
      arranged.nodes.filter((n) => n.id === 'a' || n.id === 'b'),
      NODE_WIDTH,
      NODE_HEIGHT,
    );
    expect(overlaps(boxes[0], boxes[1])).toBe(false);
  });

  it("places a frame's column between what it depends on and what depends on it", () => {
    const frame: Frame = { id: 'f', title: 'Section', position: { x: 0, y: 0 }, size: { width: 400, height: 300 } };
    const document: GraphDocument = {
      ...base,
      nodes: [
        input('upstream', 0, 0),
        closure('a1', 0, 0, 'f'),
        closure('a2', 0, 0, 'f'),
        closure('downstream', 0, 0),
      ],
      edges: [edge('e1', 'upstream', 'a1'), edge('e2', 'a2', 'downstream')],
      frames: [frame],
    };
    const arranged = autoArrange(document);
    const frameX = arranged.frames[0].position.x;
    expect(nodeX(arranged, 'upstream')).toBeLessThan(frameX);
    expect(frameX).toBeLessThan(nodeX(arranged, 'downstream'));
  });

  it('lets a frame share a column with a loose node at the same rank', () => {
    const frame: Frame = { id: 'f', title: 'Section', position: { x: 0, y: 0 }, size: { width: 400, height: 300 } };
    const document: GraphDocument = {
      ...base,
      nodes: [
        input('inA', 0, 0),
        closure('member', 0, 0, 'f'),
        input('inB', 0, 0),
        closure('loose', 0, 0),
      ],
      edges: [edge('e1', 'inA', 'member'), edge('e2', 'inB', 'loose')],
      frames: [frame],
    };
    const arranged = autoArrange(document);
    expect(arranged.frames[0].position.x).toBe(nodeX(arranged, 'loose'));
  });

  it('places a loose output node in a row underneath the main layout', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [input('in', 0, 0), closure('mid', 0, 0), input('inY', 0, 0), output('out', 0, 0)],
      edges: [edge('e1', 'in', 'mid'), edge('e2', 'inY', 'out')],
    };
    const arranged = autoArrange(document);
    const mainBottom = Math.max(
      nodeY(arranged, 'in') + NODE_HEIGHT,
      nodeY(arranged, 'mid') + NODE_HEIGHT,
      nodeY(arranged, 'inY') + NODE_HEIGHT,
    );
    expect(nodeY(arranged, 'out')).toBeGreaterThanOrEqual(mainBottom);
  });

  it('does not pin a compare node to the rightmost column like an output', () => {
    const frame: Frame = { id: 'f', title: 'Section', position: { x: 0, y: 0 }, size: { width: 300, height: 200 } };
    const document: GraphDocument = {
      ...base,
      nodes: [
        input('in', 0, 0),
        compare('cmp', 0, 0),
        output('out', 0, 0, 'f'),
        // a longer, unrelated chain, so the output's pin actually has to move
        // it further right than its own natural longest-path rank would
        input('in2', 0, 0),
        closure('x1', 0, 0),
        closure('x2', 0, 0),
      ],
      edges: [
        edge('e1', 'in', 'cmp'),
        edge('e2', 'cmp', 'out'),
        edge('e3', 'in2', 'x1'),
        edge('e4', 'x1', 'x2'),
      ],
      frames: [frame],
    };
    const arranged = autoArrange(document);
    expect(nodeX(arranged, 'cmp')).toBeLessThan(arranged.frames[0].position.x);
    expect(arranged.frames[0].position.x).toBe(nodeX(arranged, 'x2'));
  });

  it('falls back to a grid pack on a cyclic document instead of throwing', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [closure('a', 0, 0), closure('b', 10, 10)],
      edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
    };
    expect(() => autoArrange(document)).not.toThrow();
    const arranged = autoArrange(document);
    const boxes = bounds(arranged.nodes, NODE_WIDTH, NODE_HEIGHT);
    expect(overlaps(boxes[0], boxes[1])).toBe(false);
  });

  it('is stable when run twice on a real topology', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [input('in', 3, 7), closure('mid', 90, 4), output('out', 5, 200)],
      edges: [edge('e1', 'in', 'mid'), edge('e2', 'mid', 'out')],
    };
    const once = autoArrange(document);
    const twice = autoArrange(once);
    expect(twice.nodes.map((n) => n.position)).toEqual(once.nodes.map((n) => n.position));
  });
});
