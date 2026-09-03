import { describe, expect, it } from 'vitest';

import type { GraphDocument } from '@joveworks/schema';

import { packChannelLabels, unpackChannelLabels, waypointChannelLabels } from './bundleLabels';

describe('bundle channel labels', () => {
  it('keeps source port names through a pack and unpack', () => {
    const document = {
      nodes: [
        { kind: 'formula', id: 'width' },
        { kind: 'formula', id: 'force' },
        { kind: 'pack', id: 'pack' },
        { kind: 'unpack', id: 'unpack' },
      ],
      edges: [
        { id: 'width.w->pack.in0', from: { node: 'width', port: 'w' }, to: { node: 'pack', port: 'in0' } },
        { id: 'force.F->pack.in2', from: { node: 'force', port: 'F' }, to: { node: 'pack', port: 'in2' } },
        { id: 'pack.bundle->unpack.bundle', from: { node: 'pack', port: 'bundle' }, to: { node: 'unpack', port: 'bundle' } },
      ],
    } as unknown as GraphDocument;

    expect(packChannelLabels(document, 'pack')).toEqual(['w', 'F']);
    expect(unpackChannelLabels(document, 'unpack')).toEqual(['w', 'F']);
  });

  it("names a waypoint's own channels after whatever feeds them, not inN/outN", () => {
    const document = {
      nodes: [
        { kind: 'formula', id: 'width' },
        { kind: 'waypoint', id: 'wp' },
      ],
      edges: [
        { id: 'width.w->wp.in0', from: { node: 'width', port: 'w' }, to: { node: 'wp', port: 'in0' } },
      ],
    } as unknown as GraphDocument;

    expect(waypointChannelLabels(document, 'wp')).toEqual(['w']);
  });

  it('falls back to inN when a channel has nothing wired into it yet', () => {
    const document = {
      nodes: [{ kind: 'waypoint', id: 'wp' }],
      edges: [{ id: 'x->wp.out0', from: { node: 'wp', port: 'out0' }, to: { node: 'sink', port: 'a' } }],
    } as unknown as GraphDocument;

    expect(waypointChannelLabels(document, 'wp')).toEqual(['in0']);
  });

  it('traces through a chain of waypoints to the original source', () => {
    const document = {
      nodes: [
        { kind: 'formula', id: 'width' },
        { kind: 'waypoint', id: 'wp1' },
        { kind: 'waypoint', id: 'wp2' },
      ],
      edges: [
        { id: 'width.w->wp1.in0', from: { node: 'width', port: 'w' }, to: { node: 'wp1', port: 'in0' } },
        { id: 'wp1.out0->wp2.in0', from: { node: 'wp1', port: 'out0' }, to: { node: 'wp2', port: 'in0' } },
      ],
    } as unknown as GraphDocument;

    expect(waypointChannelLabels(document, 'wp2')).toEqual(['w']);
  });
});
