import { describe, expect, it } from 'vitest';

import type { GraphDocument } from '@joveworks/schema';

import { packChannelLabels, unpackChannelLabels } from './bundleLabels';

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
});
