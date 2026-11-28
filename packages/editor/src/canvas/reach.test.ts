import { describe, expect, it } from 'vitest';

import type { Edge } from '@joveworks/schema';

import { hoverReach, reachThrough } from './reach';

const wire = (from: string, fromPort: string, to: string, toPort: string): Edge => ({
  id: `${from}.${fromPort}->${to}.${toPort}`,
  from: { node: from, port: fromPort },
  to: { node: to, port: toPort },
});

// a ─y→ f(x) ─y→ g(x) ─y→ out
//         └────y→ h(x)
// b ─y→ g(z)                     (a second input into g)
// c ─y→ k(x)                     (unrelated)
const edges: readonly Edge[] = [
  wire('a', 'value', 'f', 'x'),
  wire('f', 'y', 'g', 'x'),
  wire('g', 'y', 'out', 'value'),
  wire('f', 'y', 'h', 'x'),
  wire('b', 'value', 'g', 'z'),
  wire('c', 'value', 'k', 'x'),
];

describe('reachThrough', () => {
  it('follows every hop downstream, not just the first wire', () => {
    const reach = reachThrough(edges, [edges[0] as Edge], 'downstream');
    expect([...reach.nodes].sort()).toEqual(['f', 'g', 'h', 'out']);
    expect(reach.edges.has('b.value->g.z')).toBe(false);
    expect(reach.edges.has('g.y->out.value')).toBe(true);
  });

  it('follows every hop upstream', () => {
    const reach = reachThrough(edges, [edges[2] as Edge], 'upstream');
    expect([...reach.nodes].sort()).toEqual(['a', 'b', 'f', 'g']);
  });
});

describe('hoverReach', () => {
  it('reaches downstream from an output port', () => {
    const reach = hoverReach(edges, { nodeId: 'a', port: 'value' }, undefined);
    expect([...reach.nodes].sort()).toEqual(['f', 'g', 'h', 'out']);
  });

  it('reaches upstream from an input port, through that port only', () => {
    const reach = hoverReach(edges, { nodeId: 'g', port: 'x' }, undefined);
    expect([...reach.nodes].sort()).toEqual(['a', 'f']);
  });

  it('reaches downstream from a hovered wire', () => {
    const reach = hoverReach(edges, undefined, 'f.y->h.x');
    expect([...reach.nodes]).toEqual(['h']);
  });

  it('reaches nothing from an unconnected port', () => {
    expect(hoverReach(edges, { nodeId: 'k', port: 'y' }, undefined).nodes.size).toBe(0);
  });
});
