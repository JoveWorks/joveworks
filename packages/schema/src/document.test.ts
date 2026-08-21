import { describe, expect, it } from 'vitest';

import {
  axes,
  emptyDocument,
  nodesInFrame,
  parseDocument,
  serializeDocument,
} from './document.js';
import { loadDocument, saveDocument } from './io.js';
import { SCHEMA_VERSION } from './version.js';
import type { JsonObject } from './json.js';

/**
 * One document exercising every optional field, so the round-trip test below is
 * a real answer to "does every field survive a save and a reload" rather than a
 * test of the fields that happened to be written.
 *
 * The formula it references is invented (`demo.product`, `y = a*b + c`), and the
 * document does not carry its expression at all — that is deliberate.
 */
const study: JsonObject = {
  schemaVersion: SCHEMA_VERSION,
  id: 'study-1',
  title: 'Sizing study',
  nodes: [
    {
      kind: 'input',
      id: 'd',
      label: 'diameter',
      position: { x: 0, y: 0 },
      frameId: 'sizing',
      value: { kind: 'linear', start: 20, stop: 60, points: 21, unit: 'mm' },
      axisLabel: 'shaft diameter',
    },
    {
      kind: 'input',
      id: 'fit',
      position: { x: 0, y: 120 },
      value: { kind: 'categoricalList', values: ['H7', 'K7'] },
    },
    {
      kind: 'input',
      id: 'load',
      position: { x: 0, y: 240 },
      value: { kind: 'scalar', value: 1200, unit: 'Nm' },
    },
    {
      kind: 'formula',
      id: 'n1',
      label: 'safety factor',
      position: { x: 260, y: 0 },
      frameId: 'sizing',
      formula: { id: 'demo.product', version: 1, hash: '0123456789abcdef' },
      inputValues: {
        b: { kind: 'scalar', value: 2, unit: '' },
        grade: { kind: 'categorical', value: 'H7' },
      },
      displayUnits: { y: 'N/mm²' },
    },
    {
      kind: 'output',
      id: 'o-value',
      position: { x: 520, y: 0 },
      frameId: 'sizing',
      caption: 'the working value',
      output: { kind: 'print', unit: 'N/mm²', figures: 4 },
    },
    {
      kind: 'output',
      id: 'o-check',
      position: { x: 520, y: 120 },
      output: { kind: 'check', comparison: '>=', threshold: { value: 1.5, unit: '' } },
    },
    {
      kind: 'output',
      id: 'o-plot',
      position: { x: 520, y: 240 },
      output: {
        kind: 'plot',
        x: 'd',
        series: 'fit',
        contour: false,
        threshold: { value: 1.5, unit: '' },
        unit: 'N/mm²',
      },
    },
    {
      kind: 'output',
      id: 'o-table',
      position: { x: 520, y: 360 },
      output: { kind: 'table', columns: ['d', 'S'], figures: { d: 1, S: 3 }, marks: [0, 5] },
    },
    {
      kind: 'output',
      id: 'o-equation',
      position: { x: 520, y: 480 },
      output: { kind: 'equation' },
    },
    {
      kind: 'compare',
      id: 'c1',
      label: 'S adequate?',
      position: { x: 260, y: 240 },
      comparison: '>=',
      threshold: { value: 1.5, unit: '' },
    },
    {
      kind: 'closure',
      id: 'eq',
      label: 'a student equation',
      position: { x: 260, y: 480 },
      expression: 'p + q',
    },
  ],
  edges: [
    { id: 'e1', from: { node: 'd', port: 'value' }, to: { node: 'n1', port: 'a' } },
    { id: 'e2', from: { node: 'load', port: 'value' }, to: { node: 'n1', port: 'c' } },
    { id: 'e3', from: { node: 'n1', port: 'y' }, to: { node: 'o-value', port: 'value' } },
    { id: 'e-eq', from: { node: 'n1', port: 'y' }, to: { node: 'o-equation', port: 'value' } },
  ],
  frames: [
    {
      id: 'sizing',
      title: 'Establish the diameter',
      note: 'We sweep the standard series and read off where the check passes.',
      position: { x: -40, y: -40 },
      size: { width: 700, height: 200 },
    },
  ],
};

describe('round-tripping (the verification docs/PLAN.md asks for)', () => {
  it('survives save, reload and save again with every field intact', () => {
    const document = parseDocument(study);
    expect(serializeDocument(document)).toEqual(study);

    const reloaded = loadDocument(saveDocument(document));
    expect(reloaded).toEqual(document);
    expect(serializeDocument(reloaded)).toEqual(study);
  });

  it('never carries a catalogue formula’s expression into the graph file', () => {
    expect(saveDocument(parseDocument(study))).not.toMatch(/a\*b/);
  });

  it('preserves a graph-local port display unit', () => {
    const document = parseDocument(study);
    const formula = document.nodes.find((node) => node.id === 'n1');
    expect(formula?.displayUnits?.y?.symbol).toBe('N/mm²');
  });

  it('does carry a closure node’s own expression — it is the student’s content, not R&M’s', () => {
    expect(saveDocument(parseDocument(study))).toMatch(/p \+ q/);
  });

  it('accepts an empty expression — a freshly dropped closure node, not yet written', () => {
    const fresh = parseDocument({
      ...study,
      nodes: [{ kind: 'closure', id: 'eq', position: { x: 0, y: 0 }, expression: '' }],
      edges: [],
    });
    expect(serializeDocument(fresh)).toEqual({
      ...study,
      nodes: [{ kind: 'closure', id: 'eq', position: { x: 0, y: 0 }, expression: '' }],
      edges: [],
    });
  });

  it('round-trips waypoint, pack and unpack nodes, which declare no ports of their own', () => {
    const routed = {
      ...study,
      nodes: [
        { kind: 'waypoint', id: 'via', position: { x: 0, y: 0 } },
        { kind: 'pack', id: 'bundle', position: { x: 200, y: 0 } },
        { kind: 'unpack', id: 'split', position: { x: 400, y: 0 } },
      ],
      edges: [],
    };
    const document = parseDocument(routed);
    expect(serializeDocument(document)).toEqual(routed);
  });

  it('round-trips a uniform Monte Carlo generator', () => {
    const withGenerator = {
      ...study,
      nodes: [
        {
          kind: 'monteCarloGenerator',
          id: 'draw',
          position: { x: 0, y: 0 },
          distribution: 'uniform',
          min: 10,
          max: 20,
          count: 25,
          unit: 'mm',
          axisLabel: 'trial diameter',
        },
      ],
      edges: [],
    };
    const document = parseDocument(withGenerator);
    expect(serializeDocument(document)).toEqual(withGenerator);
  });

  it('round-trips a normal Monte Carlo generator', () => {
    const withGenerator = {
      ...study,
      nodes: [
        {
          kind: 'monteCarloGenerator',
          id: 'draw',
          position: { x: 0, y: 0 },
          distribution: 'normal',
          mean: 15,
          stddev: 2,
          count: 25,
          unit: 'mm',
        },
      ],
      edges: [],
    };
    const document = parseDocument(withGenerator);
    expect(serializeDocument(document)).toEqual(withGenerator);
  });

  it('round-trips a Feasibility output, including an empty `checks` list — a freshly-dropped node has none yet', () => {
    const withFeasibility = {
      ...study,
      nodes: [
        ...(study['nodes'] as JsonObject[]),
        { kind: 'output', id: 'o-feas', position: { x: 0, y: 0 }, output: { kind: 'feasibility', checks: [] } },
        {
          kind: 'output',
          id: 'o-feas-2',
          position: { x: 0, y: 120 },
          output: { kind: 'feasibility', checks: ['o-check'], x: 'd' },
        },
      ],
    };
    const document = parseDocument(withFeasibility);
    expect(serializeDocument(document)).toEqual(withFeasibility);
  });

  it('round-trips a Sensitivity output, which declares no fields of its own', () => {
    const withSensitivity = {
      ...study,
      nodes: [{ kind: 'output', id: 'o-sens', position: { x: 0, y: 0 }, output: { kind: 'sensitivity' } }],
      edges: [],
    };
    const document = parseDocument(withSensitivity);
    expect(serializeDocument(document)).toEqual(withSensitivity);
  });

  it("refuses a Feasibility output whose axis names a node that introduces no axis — same as a plot's", () => {
    const broken = {
      ...study,
      nodes: [
        ...(study['nodes'] as JsonObject[]),
        {
          kind: 'output',
          id: 'o-feas',
          position: { x: 0, y: 0 },
          output: { kind: 'feasibility', checks: [], x: 'load' },
        },
      ],
    };
    expect(() => parseDocument(broken)).toThrow(/not a range input node/u);
  });

  it('rejects a uniform generator whose low end is not below its high end', () => {
    const broken = {
      ...study,
      nodes: [
        {
          kind: 'monteCarloGenerator',
          id: 'draw',
          position: { x: 0, y: 0 },
          distribution: 'uniform',
          min: 20,
          max: 10,
          count: 25,
          unit: 'mm',
        },
      ],
      edges: [],
    };
    expect(() => parseDocument(broken)).toThrow(/low end below its high end/);
  });

  it('rejects a normal generator with a non-positive standard deviation', () => {
    const broken = {
      ...study,
      nodes: [
        {
          kind: 'monteCarloGenerator',
          id: 'draw',
          position: { x: 0, y: 0 },
          distribution: 'normal',
          mean: 15,
          stddev: 0,
          count: 25,
          unit: 'mm',
        },
      ],
      edges: [],
    };
    expect(() => parseDocument(broken)).toThrow(/stddev.*above zero/);
  });

  it('round-trips a Monte Carlo receiver with its full settings', () => {
    const withReceiver = {
      ...study,
      nodes: [
        {
          kind: 'monteCarloReceiver',
          id: 'watch',
          position: { x: 0, y: 0 },
          sampleLimit: 5000,
          rampUp: true,
          showMeanBand: true,
          showHistogram: false,
        },
      ],
      edges: [],
    };
    const document = parseDocument(withReceiver);
    expect(serializeDocument(document)).toEqual(withReceiver);
  });

  it('defaults a Monte Carlo receiver’s optional fields to absent', () => {
    const minimal = {
      ...study,
      nodes: [
        { kind: 'monteCarloReceiver', id: 'watch', position: { x: 0, y: 0 }, sampleLimit: 10_000 },
      ],
      edges: [],
    };
    const document = parseDocument(minimal);
    expect(serializeDocument(document)).toEqual(minimal);
  });

  it('stamps an empty document with the version this build writes', () => {
    const document = emptyDocument('study-2', 'Untitled');
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loadDocument(saveDocument(document))).toEqual(document);
  });

  it('reports bad JSON as a schema error, not a syntax error escaping the parse', () => {
    expect(() => loadDocument('{ nope')).toThrow(/is not valid JSON/);
  });
});

describe('labelled axes', () => {
  it('counts one axis per range input node, and no others', () => {
    expect(axes(parseDocument(study)).map((node) => node.id)).toEqual(['d', 'fit']);
  });

  it('counts a Monte Carlo generator as an axis too', () => {
    const withGenerator = {
      ...study,
      nodes: [
        ...(study['nodes'] as JsonObject[]),
        {
          kind: 'monteCarloGenerator',
          id: 'draw',
          position: { x: 0, y: 360 },
          distribution: 'uniform',
          min: 0,
          max: 1,
          count: 25,
          unit: '',
        },
      ],
    };
    expect(axes(parseDocument(withGenerator)).map((node) => node.id)).toEqual(['d', 'fit', 'draw']);
  });

  it('rejects a plot pointing at a node that introduces no axis', () => {
    const broken = {
      ...study,
      nodes: (study['nodes'] as JsonObject[]).map((node) =>
        node['id'] === 'o-plot' ? { ...node, output: { kind: 'plot', x: 'load' } } : node,
      ),
    };
    expect(() => parseDocument(broken)).toThrow(/'load' is not a range input node/);
  });

  it('rejects a plot facet pointing at a node that introduces no axis', () => {
    const broken = {
      ...study,
      nodes: (study['nodes'] as JsonObject[]).map((node) =>
        node['id'] === 'o-plot'
          ? { ...node, output: { kind: 'plot', x: 'd', facet: 'load' } }
          : node,
      ),
    };
    expect(() => parseDocument(broken)).toThrow(/'load' is not a range input node/);
  });

  it('accepts a plot with x left unset — the kernel fills it in', () => {
    const auto = {
      ...study,
      nodes: (study['nodes'] as JsonObject[]).map((node) =>
        node['id'] === 'o-plot' ? { ...node, output: { kind: 'plot', series: 'fit' } } : node,
      ),
    };
    const document = parseDocument(auto);
    expect(document.nodes.find((node) => node.id === 'o-plot')).toMatchObject({
      output: { kind: 'plot', series: 'fit' },
    });
  });

  it('round-trips a plot with a facet axis', () => {
    const withFacet = {
      ...study,
      nodes: (study['nodes'] as JsonObject[]).map((node) =>
        node['id'] === 'o-plot'
          ? { ...node, output: { ...(node as { output: JsonObject }).output, facet: 'fit' } }
          : node,
      ),
    };
    const document = parseDocument(withFacet);
    expect(serializeDocument(document)).toEqual(withFacet);
  });
});

describe('group frames as notebook sections', () => {
  it('collects the nodes of a section', () => {
    const document = parseDocument(study);
    expect(nodesInFrame(document, 'sizing').map((node) => node.id)).toEqual(['d', 'n1', 'o-value']);
    expect(document.frames[0]?.note).toMatch(/standard series/);
  });

  it('rejects a node in a frame that does not exist', () => {
    const broken = {
      ...study,
      nodes: (study['nodes'] as JsonObject[]).map((node) =>
        node['id'] === 'load' ? { ...node, frameId: 'gone' } : node,
      ),
    };
    expect(() => parseDocument(broken)).toThrow(/frameId: no frame 'gone' exists/);
  });
});

describe('structural integrity', () => {
  it('rejects a dangling edge', () => {
    const broken = {
      ...study,
      edges: [
        ...(study['edges'] as JsonObject[]),
        { id: 'e4', from: { node: 'ghost', port: 'value' }, to: { node: 'n1', port: 'b' } },
      ],
    };
    expect(() => parseDocument(broken)).toThrow(/edges\[4\]\.from\.node: no node 'ghost' exists/);
  });

  it('rejects a duplicated node id', () => {
    const nodes = study['nodes'] as JsonObject[];
    const broken = { ...study, nodes: [...nodes, nodes[0] as JsonObject] };
    expect(() => parseDocument(broken)).toThrow(/nodes\[11\]\.id: 'd' appears twice/);
  });

  it('refuses a document written by a schema version it does not read', () => {
    expect(() => parseDocument({ ...study, schemaVersion: 99 })).toThrow(
      /this build reads version 1 only/,
    );
  });
});
