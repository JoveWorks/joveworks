/** Routing nodes use invented values only; no restricted formula content. */

import { describe, expect, it } from 'vitest';

import { evaluateDocument } from './evaluate.js';
import { resolveGraph } from './graph.js';
import {
  documentOf,
  input,
  outputNode,
  packNode,
  scalar,
  unpackNode,
  waypointNode,
  wire,
} from './invented.fixtures.js';

describe('waypoint / pack / unpack', () => {
  it('routes independently dimensioned waypoint channels without merging them', () => {
    const document = documentOf(
      [
        input('length', scalar(20, 'mm')),
        input('force', scalar(30, 'N')),
        waypointNode('via'),
        outputNode('lengthOut', { kind: 'print' }),
        outputNode('forceOut', { kind: 'print' }),
      ],
      [
        wire('length.value', 'via.in0'),
        wire('force.value', 'via.in1'),
        wire('via.out0', 'lengthOut.value'),
        wire('via.out1', 'forceOut.value'),
      ],
    );
    const result = evaluateDocument(document, []);
    expect(result.values.get('via.out0')).toMatchObject({ kind: 'numeric', data: [20] });
    expect(result.values.get('via.out1')).toMatchObject({ kind: 'numeric', data: [30] });
    expect(result.resolution.sources.get('via.out0')?.dimension).not.toEqual(
      result.resolution.sources.get('via.out1')?.dimension,
    );
  });

  it('allows an empty waypoint to remain available for wiring', () => {
    expect(() => resolveGraph(documentOf([waypointNode('via')], []), [])).not.toThrow();
  });

  it('packs different dimensions and restores each value through unpack', () => {
    const document = documentOf(
      [
        input('length', scalar(20, 'mm')),
        input('force', scalar(30, 'N')),
        packNode('bundle'),
        unpackNode('split'),
        outputNode('lengthOut', { kind: 'print' }),
        outputNode('forceOut', { kind: 'print' }),
      ],
      [
        wire('length.value', 'bundle.in0'),
        wire('force.value', 'bundle.in1'),
        wire('bundle.bundle', 'split.bundle'),
        wire('split.out0', 'lengthOut.value'),
        wire('split.out1', 'forceOut.value'),
      ],
    );
    const result = evaluateDocument(document, []);
    expect(result.values.get('split.out0')).toMatchObject({ kind: 'numeric', data: [20] });
    expect(result.values.get('split.out1')).toMatchObject({ kind: 'numeric', data: [30] });
  });
});
