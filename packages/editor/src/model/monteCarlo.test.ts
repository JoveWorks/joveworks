/**
 * `model/monteCarlo.ts` — playback support for the Monte Carlo receiver
 * (`ROADMAP.md` #27). Fixtures are invented, no R&M content.
 */

import { describe, expect, it } from 'vitest';

import {
  SCHEMA_VERSION,
  type ClosureNode,
  type Edge,
  type GraphDocument,
  type MonteCarloGeneratorNode,
  type MonteCarloReceiverNode,
} from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import {
  batchSizeAt,
  DEFAULT_MONTE_CARLO_COUNT,
  isReceiverWired,
  monteCarloSampleCount,
  setMonteCarloSampleCount,
  upstreamGenerators,
  withGeneratorCounts,
} from './monteCarlo';

const generator = (id: string, count: number): MonteCarloGeneratorNode => ({
  kind: 'monteCarloGenerator',
  id,
  distribution: 'uniform',
  min: 0,
  max: 1,
  count,
  unit: parseUnit(''),
  position: { x: 0, y: 0 },
});

const receiver = (id: string): MonteCarloReceiverNode => ({
  kind: 'monteCarloReceiver',
  id,
  sampleLimit: 10_000,
  position: { x: 0, y: 0 },
});

const closure = (id: string, expression: string): ClosureNode => ({
  kind: 'closure',
  id,
  expression,
  position: { x: 0, y: 0 },
});

const edge = (fromNode: string, fromPort: string, toNode: string, toPort: string): Edge => ({
  id: `${fromNode}.${fromPort}->${toNode}.${toPort}`,
  from: { node: fromNode, port: fromPort },
  to: { node: toNode, port: toPort },
});

const doc = (nodes: GraphDocument['nodes'], edges: readonly Edge[]): GraphDocument => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'doc',
  title: 'test',
  nodes,
  edges,
  frames: [],
});

describe('upstreamGenerators', () => {
  it('finds a generator wired directly to the receiver', () => {
    const document = doc(
      [generator('g', 100), receiver('r')],
      [edge('g', 'value', 'r', 'sample')],
    );
    expect(upstreamGenerators(document, 'r')).toEqual(['g']);
  });

  it('finds a generator through an intervening formula/closure node', () => {
    const document = doc(
      [generator('g', 100), closure('c', 'a * 2'), receiver('r')],
      [edge('g', 'value', 'c', 'a'), edge('c', 'out', 'r', 'sample')],
    );
    expect(upstreamGenerators(document, 'r')).toEqual(['g']);
  });

  it('finds every distinct generator feeding a receiver through separate paths', () => {
    const document = doc(
      [generator('g1', 100), generator('g2', 50), closure('c', 'a + b'), receiver('r')],
      [
        edge('g1', 'value', 'c', 'a'),
        edge('g2', 'value', 'c', 'b'),
        edge('c', 'out', 'r', 'sample'),
      ],
    );
    expect(new Set(upstreamGenerators(document, 'r'))).toEqual(new Set(['g1', 'g2']));
  });

  it('finds nothing when the receiver is unwired', () => {
    const document = doc([generator('g', 100), receiver('r')], []);
    expect(upstreamGenerators(document, 'r')).toEqual([]);
  });
});

describe('withGeneratorCounts', () => {
  it('overrides only the named generators, leaving everything else untouched', () => {
    const document = doc([generator('g1', 100), generator('g2', 50)], []);
    const scratch = withGeneratorCounts(document, ['g1'], 40);
    expect((scratch.nodes[0] as MonteCarloGeneratorNode).count).toBe(40);
    expect((scratch.nodes[1] as MonteCarloGeneratorNode).count).toBe(50);
  });

  it('never drops below one sample', () => {
    const document = doc([generator('g', 100)], []);
    const scratch = withGeneratorCounts(document, ['g'], 0);
    expect((scratch.nodes[0] as MonteCarloGeneratorNode).count).toBe(1);
  });

  it('keeps the document id unchanged, so the seeded stream stays identical', () => {
    const document = doc([generator('g', 100)], []);
    const scratch = withGeneratorCounts(document, ['g'], 40);
    expect(scratch.id).toBe(document.id);
  });

  it('is a no-op with no generator ids', () => {
    const document = doc([generator('g', 100)], []);
    expect(withGeneratorCounts(document, [], 40)).toBe(document);
  });
});

describe('batchSizeAt', () => {
  it('is always the full batch without a ramp', () => {
    expect(batchSizeAt(0, false)).toBe(25);
    expect(batchSizeAt(0, undefined)).toBe(25);
    expect(batchSizeAt(50, false)).toBe(25);
  });

  it('eases in gradually with a ramp, reaching the full batch by tick 7', () => {
    expect(batchSizeAt(0, true)).toBeLessThan(25);
    expect(batchSizeAt(0, true)).toBeGreaterThanOrEqual(1);
    expect(batchSizeAt(7, true)).toBe(25);
    expect(batchSizeAt(20, true)).toBe(25);
  });
});

describe('monteCarloSampleCount (ROADMAP.md #31)', () => {
  it('reads the count off the first generator in document order', () => {
    const document = doc([generator('g1', 100), generator('g2', 50)], []);
    expect(monteCarloSampleCount(document)).toBe(100);
  });

  it('falls back to the default with no generator yet', () => {
    expect(monteCarloSampleCount(doc([], []))).toBe(DEFAULT_MONTE_CARLO_COUNT);
  });
});

describe('setMonteCarloSampleCount (ROADMAP.md #31)', () => {
  it('sets every generator to the same count, leaving other nodes alone', () => {
    const document = doc([generator('g1', 100), generator('g2', 50), receiver('r')], []);
    const next = setMonteCarloSampleCount(document, 40);
    expect((next.nodes[0] as MonteCarloGeneratorNode).count).toBe(40);
    expect((next.nodes[1] as MonteCarloGeneratorNode).count).toBe(40);
    expect(next.nodes[2]).toEqual(document.nodes[2]);
  });
});

describe('isReceiverWired', () => {
  it('is true once the sample port has an edge', () => {
    const document = doc(
      [generator('g', 100), receiver('r')],
      [edge('g', 'value', 'r', 'sample')],
    );
    expect(isReceiverWired(document, receiver('r'))).toBe(true);
  });

  it('is false with nothing wired', () => {
    const document = doc([receiver('r')], []);
    expect(isReceiverWired(document, receiver('r'))).toBe(false);
  });
});
