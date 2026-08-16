/**
 * `waypoint`, `pack` and `unpack` — the three routing node kinds. Every
 * fixture here is invented (CLAUDE.md's distribution restriction): plain
 * lengths and forces, never a Roloff & Matek quantity.
 */

import { describe, expect, it } from 'vitest';

import { KernelError } from './errors.js';
import { evaluateDocument, valueAt } from './evaluate.js';
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
import type { NumericSeries } from './series.js';

const numeric = (value: ReturnType<typeof valueAt>): NumericSeries => {
  if (value === undefined || value.kind !== 'numeric') throw new Error('not a numeric series');
  return value;
};

describe('waypoint', () => {
  it('passes a value through unchanged, across an invented dimension', () => {
    const document = documentOf(
      [input('w', scalar(20, 'mm')), waypointNode('via'), outputNode('readout', { kind: 'print' })],
      [wire('w.value', 'via.in'), wire('via.out', 'readout.value')],
    );
    const evaluation = evaluateDocument(document, []);
    expect(numeric(valueAt(evaluation, 'via', 'out')).data).toEqual([20]);
  });

  it('copies the first wired input, not an aggregation of every wire', () => {
    const document = documentOf(
      [
        input('a', scalar(20, 'mm')),
        input('b', scalar(99, 'mm')),
        waypointNode('via'),
        outputNode('readout', { kind: 'print' }),
      ],
      [wire('a.value', 'via.in'), wire('b.value', 'via.in'), wire('via.out', 'readout.value')],
    );
    const evaluation = evaluateDocument(document, []);
    expect(numeric(valueAt(evaluation, 'via', 'out')).data).toEqual([20]);
  });

  it('refuses two wires of different dimensions', () => {
    const document = documentOf(
      [input('a', scalar(20, 'mm')), input('f', scalar(5, 'N')), waypointNode('via')],
      [wire('a.value', 'via.in'), wire('f.value', 'via.in')],
    );
    expect(() => resolveGraph(document, [])).toThrow(KernelError);
  });
});

describe('pack / unpack', () => {
  it('round-trips several independently-dimensioned channels', () => {
    const document = documentOf(
      [
        input('length', scalar(20, 'mm')),
        input('force', scalar(5, 'N')),
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
    const evaluation = evaluateDocument(document, []);
    expect(numeric(valueAt(evaluation, 'split', 'out0')).data).toEqual([20]);
    expect(numeric(valueAt(evaluation, 'split', 'out1')).data).toEqual([5]);
  });

  it('fans a single pack out to two unpacks at once', () => {
    const document = documentOf(
      [
        input('length', scalar(20, 'mm')),
        input('force', scalar(5, 'N')),
        packNode('bundle'),
        unpackNode('splitA'),
        unpackNode('splitB'),
        outputNode('a0', { kind: 'print' }),
        outputNode('b1', { kind: 'print' }),
      ],
      [
        wire('length.value', 'bundle.in0'),
        wire('force.value', 'bundle.in1'),
        wire('bundle.bundle', 'splitA.bundle'),
        wire('bundle.bundle', 'splitB.bundle'),
        wire('splitA.out0', 'a0.value'),
        wire('splitB.out1', 'b1.value'),
      ],
    );
    const evaluation = evaluateDocument(document, []);
    expect(numeric(valueAt(evaluation, 'splitA', 'out0')).data).toEqual([20]);
    expect(numeric(valueAt(evaluation, 'splitB', 'out1')).data).toEqual([5]);
  });

  it('keeps a gap when a middle channel is never wired, never renumbering the rest', () => {
    // in0 and in2 wired, in1 skipped — pack.bundle should carry exactly two
    // channels, in index order, without in2 sliding down to fill the gap.
    const document = documentOf(
      [
        input('a', scalar(1, 'mm')),
        input('c', scalar(3, 'mm')),
        packNode('bundle', {}),
        unpackNode('split'),
        outputNode('out0', { kind: 'print' }),
        outputNode('out1', { kind: 'print' }),
      ],
      [
        wire('a.value', 'bundle.in0'),
        wire('c.value', 'bundle.in2'),
        wire('bundle.bundle', 'split.bundle'),
        wire('split.out0', 'out0.value'),
        wire('split.out1', 'out1.value'),
      ],
    );
    const evaluation = evaluateDocument(document, []);
    expect(numeric(valueAt(evaluation, 'split', 'out0')).data).toEqual([1]);
    expect(numeric(valueAt(evaluation, 'split', 'out1')).data).toEqual([3]);
  });

  it('produces no outputs from an unwired unpack', () => {
    const document = documentOf([unpackNode('split')], []);
    const evaluation = evaluateDocument(document, []);
    expect(valueAt(evaluation, 'split', 'out0')).toBeUndefined();
  });
});
