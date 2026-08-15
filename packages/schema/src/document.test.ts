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
 * document does not carry its expression at all — that is S23 working.
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
      output: { kind: 'table', columns: ['d', 'S'] },
    },
    {
      kind: 'compare',
      id: 'c1',
      label: 'S adequate?',
      position: { x: 260, y: 240 },
      comparison: '>=',
      threshold: { value: 1.5, unit: '' },
    },
  ],
  edges: [
    { id: 'e1', from: { node: 'd', port: 'value' }, to: { node: 'n1', port: 'a' } },
    { id: 'e2', from: { node: 'load', port: 'value' }, to: { node: 'n1', port: 'c' } },
    { id: 'e3', from: { node: 'n1', port: 'y' }, to: { node: 'o-value', port: 'value' } },
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

describe('round-tripping (the verification PLAN.md asks for)', () => {
  it('survives save, reload and save again with every field intact', () => {
    const document = parseDocument(study);
    expect(serializeDocument(document)).toEqual(study);

    const reloaded = loadDocument(saveDocument(document));
    expect(reloaded).toEqual(document);
    expect(serializeDocument(reloaded)).toEqual(study);
  });

  it('never carries an expression into the graph file (S23)', () => {
    expect(saveDocument(parseDocument(study))).not.toMatch(/a\*b/);
  });

  it('stamps an empty document with the version this build writes (S25)', () => {
    const document = emptyDocument('study-2', 'Untitled');
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loadDocument(saveDocument(document))).toEqual(document);
  });

  it('reports bad JSON as a schema error, not a syntax error escaping the parse', () => {
    expect(() => loadDocument('{ nope')).toThrow(/is not valid JSON/);
  });
});

describe('labelled axes (S43)', () => {
  it('counts one axis per range input node, and no others', () => {
    expect(axes(parseDocument(study)).map((node) => node.id)).toEqual(['d', 'fit']);
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

  it('accepts a plot with x left unset — the kernel fills it in (S43)', () => {
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

describe('group frames as notebook sections (S28/S30)', () => {
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
    expect(() => parseDocument(broken)).toThrow(/edges\[3\]\.from\.node: no node 'ghost' exists/);
  });

  it('rejects a duplicated node id', () => {
    const nodes = study['nodes'] as JsonObject[];
    const broken = { ...study, nodes: [...nodes, nodes[0] as JsonObject] };
    expect(() => parseDocument(broken)).toThrow(/nodes\[9\]\.id: 'd' appears twice/);
  });

  it('refuses a document written by a schema version it does not read (S25)', () => {
    expect(() => parseDocument({ ...study, schemaVersion: 99 })).toThrow(
      /this build reads version 1 only/,
    );
  });
});
