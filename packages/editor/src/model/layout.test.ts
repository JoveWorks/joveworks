/**
 * `autoArrange`. Fixtures are invented (`a`, `b`, a frame), same as
 * document.test.ts, and carry no formula content.
 */

import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, type Frame, type GraphDocument, type InputNode } from '@mds/schema';
import { parseUnit } from '@mds/units';

import { autoArrange } from './layout';

const input = (id: string, x: number, y: number, frameId?: string): InputNode => ({
  kind: 'input',
  id,
  position: { x, y },
  frameId,
  value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
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

describe('autoArrange', () => {
  it('spreads overlapping loose nodes apart', () => {
    const document: GraphDocument = { ...base, nodes: [input('a', 0, 0), input('b', 5, 5)] };
    const arranged = autoArrange(document);
    const boxes = bounds(arranged.nodes, 260, 180);
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
      260,
      180,
    )[0];
    expect(overlaps(frameBox, looseBox)).toBe(false);
  });

  it('is stable when run twice', () => {
    const document: GraphDocument = {
      ...base,
      nodes: [input('a', 5, 5), input('b', 5, 5), input('c', 900, 10)],
    };
    const once = autoArrange(document);
    const twice = autoArrange(once);
    expect(twice.nodes.map((n) => n.position)).toEqual(once.nodes.map((n) => n.position));
  });
});
