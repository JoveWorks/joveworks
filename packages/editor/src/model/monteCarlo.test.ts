/**
 * `model/monteCarlo.ts` — playback support for the Monte Carlo receiver
 * (`ROADMAP.md` #27). Fixtures are invented, no R&M content.
 */

import { describe, expect, it } from 'vitest';

import { evaluateDocument } from '@joveworks/kernel';
import {
  DEFAULT_MONTE_CARLO_SAMPLE_LIMIT,
  DOCUMENT_SCHEMA_VERSION,
  formulaRef,
  type ClosureNode,
  type Edge,
  type FormulaNode,
  type GraphDocument,
  type InputNode,
  type MonteCarloGeneratorNode,
  type MonteCarloReceiverNode,
} from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { lookup } from './analysis';
import { baseCatalogue } from './catalogues';
import {
  allGeneratorIds,
  batchSizeAt,
  DEFAULT_MONTE_CARLO_COUNT,
  generatorDependentNodeIds,
  isReceiverWired,
  monteCarloSampleCount,
  monteCarloSampleLimit,
  setMonteCarloSampleCount,
  setMonteCarloSampleLimit,
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

const receiver = (id: string, sampleLimit = 10_000): MonteCarloReceiverNode => ({
  kind: 'monteCarloReceiver',
  id,
  sampleLimit,
  position: { x: 0, y: 0 },
});

const closure = (id: string, expression: string): ClosureNode => ({
  kind: 'closure',
  id,
  expression,
  position: { x: 0, y: 0 },
});

const input = (id: string): InputNode => ({
  kind: 'input',
  id,
  value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
  position: { x: 0, y: 0 },
});

const edge = (fromNode: string, fromPort: string, toNode: string, toPort: string): Edge => ({
  id: `${fromNode}.${fromPort}->${toNode}.${toPort}`,
  from: { node: fromNode, port: fromPort },
  to: { node: toNode, port: toPort },
});

const doc = (nodes: GraphDocument['nodes'], edges: readonly Edge[]): GraphDocument => ({
  schemaVersion: DOCUMENT_SCHEMA_VERSION,
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

describe('allGeneratorIds', () => {
  it('finds every generator in the document regardless of wiring', () => {
    const document = doc(
      [generator('g1', 100), generator('g2', 50), receiver('r')],
      [],
    );
    expect(new Set(allGeneratorIds(document))).toEqual(new Set(['g1', 'g2']));
  });

  it('finds nothing with no generator', () => {
    expect(allGeneratorIds(doc([receiver('r')], []))).toEqual([]);
  });
});

describe('generatorDependentNodeIds', () => {
  it('includes every generator, whether wired to anything or not', () => {
    const document = doc([generator('g1', 100), generator('g2', 50)], []);
    expect(generatorDependentNodeIds(document)).toEqual(new Set(['g1', 'g2']));
  });

  it('includes everything downstream of a generator, however many nodes deep', () => {
    const document = doc(
      [generator('g', 100), closure('c1', 'a * 2'), closure('c2', 'a * 3'), receiver('r')],
      [edge('g', 'value', 'c1', 'a'), edge('c1', 'out', 'c2', 'a'), edge('c2', 'out', 'r', 'sample')],
    );
    expect(generatorDependentNodeIds(document)).toEqual(new Set(['g', 'c1', 'c2', 'r']));
  });

  it('excludes a node that never receives an edge from a generator, direct or indirect', () => {
    const document = doc(
      [generator('g', 100), input('nominal'), closure('c', 'a + b'), receiver('r')],
      [edge('g', 'value', 'c', 'a'), edge('nominal', 'value', 'c', 'b'), edge('c', 'out', 'r', 'sample')],
    );
    const dependent = generatorDependentNodeIds(document);
    expect(dependent).toEqual(new Set(['g', 'c', 'r']));
    expect(dependent.has('nominal')).toBe(false);
  });

  it('does not follow a shared downstream node’s edges back upstream into an unrelated branch', () => {
    // `nominal` feeds `c` alongside `g`, but nothing feeds back from `c` to
    // `nominal` — a forward walk from `g` must not somehow pull `nominal` in.
    const document = doc(
      [generator('g', 100), input('nominal'), closure('c', 'a + b')],
      [edge('g', 'value', 'c', 'a'), edge('nominal', 'value', 'c', 'b')],
    );
    expect(generatorDependentNodeIds(document).has('nominal')).toBe(false);
  });
});

describe('a playback scratch document (regression: two receivers in one MC graph)', () => {
  it('does not break a receiver watching only some of the generators another node combines', () => {
    const catalogues = [baseCatalogue()];
    const subtract = lookup(catalogues, 'subtract');
    if (subtract === undefined) throw new Error('base catalogue is missing `subtract`');

    const clearance: FormulaNode = {
      kind: 'formula',
      id: 'clearance',
      formula: formulaRef(subtract),
      position: { x: 0, y: 0 },
    };
    const document = doc(
      [generator('hole', 1000), generator('shaft', 1000), clearance, receiver('watchClearance'), receiver('watchHole')],
      [
        edge('hole', 'value', 'clearance', 'a'),
        edge('shaft', 'value', 'clearance', 'b'),
        edge('clearance', 'difference', 'watchClearance', 'sample'),
        edge('hole', 'value', 'watchHole', 'sample'),
      ],
    );

    // The bug: a receiver watching only `hole` bumps only its own upstream
    // generator. `shaft` is left at its stale document count, and
    // `clearance` — present in the same document regardless of which
    // receiver asked for this scratch — throws on the mismatch, so the
    // watchHole receiver could not be evaluated at all.
    const stale = withGeneratorCounts(document, upstreamGenerators(document, 'watchHole'), 25);
    expect(() => evaluateDocument(stale, catalogues)).toThrow(/appears with lengths/u);

    // The fix: advance every generator in the document together, since they
    // all share one trial axis regardless of which one a given receiver
    // happens to read (`model/monteCarlo.ts`'s `allGeneratorIds`).
    const fixed = withGeneratorCounts(document, allGeneratorIds(document), 25);
    expect(() => evaluateDocument(fixed, catalogues)).not.toThrow();
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

describe('monteCarloSampleLimit (ROADMAP.md #31)', () => {
  it('reads the limit off the first receiver in document order', () => {
    const document = doc([receiver('r1', 200), receiver('r2', 500)], []);
    expect(monteCarloSampleLimit(document)).toBe(200);
  });

  it('falls back to the default with no receiver yet', () => {
    expect(monteCarloSampleLimit(doc([], []))).toBe(DEFAULT_MONTE_CARLO_SAMPLE_LIMIT);
  });
});

describe('setMonteCarloSampleLimit (ROADMAP.md #31)', () => {
  it('sets every receiver to the same limit, leaving other nodes alone', () => {
    const document = doc([generator('g', 100), receiver('r1', 200), receiver('r2', 500)], []);
    const next = setMonteCarloSampleLimit(document, 40);
    expect(next.nodes[0]).toEqual(document.nodes[0]);
    expect((next.nodes[1] as MonteCarloReceiverNode).sampleLimit).toBe(40);
    expect((next.nodes[2] as MonteCarloReceiverNode).sampleLimit).toBe(40);
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
