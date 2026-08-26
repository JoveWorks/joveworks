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
import type { JsonObject, JsonValue } from './json.js';

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
      output: { kind: 'table', columns: ['d', 'S'], figures: { d: 1, S: 3 } },
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
      inputValues: { q: { kind: 'scalar', value: 4, unit: 'mm' } },
    },
    {
      kind: 'file',
      id: 'frames',
      label: 'the bracket shots',
      position: { x: 260, y: 560 },
      reader: 'exif',
      axisLabel: 'frame',
      sources: [
        { name: 'one.cr3', size: 24_100_000, modified: 1_700_000_000_000 },
        { name: 'two.cr3', size: 24_400_000 },
      ],
      fields: [
        { name: 'f', unit: 'mm', values: [50, 85] },
        { name: 'N', unit: '', values: [2.8, 4] },
        { name: 'camera', values: ['Canon EOS R6m3', 'Canon EOS R6m3'] },
        { name: 's', unit: 'm', values: [null, null] },
      ],
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
  marks: [{ at: { d: 40 } }],
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

  it('keeps a closure node’s typed-in port values, as a formula node’s are kept', () => {
    const document = parseDocument(study);
    const closure = document.nodes.find((node) => node.id === 'eq');
    expect(closure?.kind === 'closure' && closure.inputValues?.q).toEqual({
      kind: 'scalar',
      value: 4,
      unit: expect.objectContaining({ symbol: 'mm' }),
    });
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

  it('round-trips triangular, lognormal and discrete Monte Carlo generators', () => {
    const nodes = [
      { kind: 'monteCarloGenerator', id: 'tri', position: { x: 0, y: 0 }, distribution: 'triangular', min: 1, mode: 2, max: 4, count: 10, unit: 'mm' },
      { kind: 'monteCarloGenerator', id: 'log', position: { x: 0, y: 0 }, distribution: 'lognormal', mean: 10, stddev: 2, count: 10, unit: 'N' },
      { kind: 'monteCarloGenerator', id: 'disc', position: { x: 0, y: 0 }, distribution: 'discrete', count: 10, unit: 'mm' },
    ];
    const document = { ...study, nodes, edges: [] };
    expect(serializeDocument(parseDocument(document))).toEqual(document);
  });

  it('round-trips a linear range node', () => {
    const withRange = {
      ...study,
      nodes: [
        {
          kind: 'range',
          id: 'sweep',
          position: { x: 0, y: 0 },
          spacing: 'linear',
          start: 10,
          stop: 20,
          count: 5,
          unit: 'mm',
          axisLabel: 'bore diameter',
        },
      ],
      edges: [],
    };
    const document = parseDocument(withRange);
    expect(serializeDocument(document)).toEqual(withRange);
  });

  it('rejects a logarithmic range node whose literal endpoints are not both above zero', () => {
    const withRange = {
      ...study,
      nodes: [
        { kind: 'range', id: 'sweep', position: { x: 0, y: 0 }, spacing: 'logarithmic', start: 0, stop: 20, count: 5, unit: 'mm' },
      ],
      edges: [],
    };
    expect(() => parseDocument(withRange)).toThrow(/above zero/);
  });

  it('round-trips every statistic and rejects an unknown one', () => {
    const nodes = [
      ...['mean', 'median', 'stddev', 'min', 'max', 'count'].map((statistic, index) => ({ kind: 'statistic', id: `s${index}`, position: { x: 0, y: 0 }, statistic, running: true })),
      { kind: 'statistic', id: 'percentile', position: { x: 0, y: 0 }, statistic: 'percentile', percentile: 95 },
      { kind: 'statistic', id: 'probability', position: { x: 0, y: 0 }, statistic: 'probability', match: 'fail' },
    ];
    const document = { ...study, nodes, edges: [] };
    expect(serializeDocument(parseDocument(document))).toEqual(document);
    expect(() => parseDocument({ ...study, nodes: [{ kind: 'statistic', id: 'bad', position: { x: 0, y: 0 }, statistic: 'variance' }], edges: [] })).toThrow(/statistic/u);
  });

  it('round-trips Distribution and Reliability outputs', () => {
    const nodes = [
      { kind: 'output', id: 'distribution', position: { x: 0, y: 0 }, output: { kind: 'distribution', view: 'cdf', bins: 12, percentiles: [5, 50, 95], over: 'trial', facet: 'd', fit: true } },
      { kind: 'output', id: 'reliability', position: { x: 0, y: 0 }, output: { kind: 'reliability', checks: ['check'], confidence: 0.9 } },
    ];
    const document = { ...study, nodes, edges: [] };
    expect(serializeDocument(parseDocument(document))).toEqual(document);
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

  it('round-trips a Best Design output, in both directions and with no checks at all', () => {
    // `checks: []` is legal here for a different reason than on a
    // Feasibility node: an unconstrained min or max is a real thing to ask
    // for, not just an unfinished node.
    const withBestDesign = {
      ...study,
      nodes: [
        ...(study['nodes'] as JsonObject[]),
        {
          kind: 'output',
          id: 'o-best',
          position: { x: 0, y: 0 },
          output: { kind: 'bestDesign', checks: ['o-check'], direction: 'minimize' },
        },
        {
          kind: 'output',
          id: 'o-best-2',
          position: { x: 0, y: 120 },
          output: { kind: 'bestDesign', checks: [], direction: 'maximize' },
        },
      ],
    };
    const document = parseDocument(withBestDesign);
    expect(serializeDocument(document)).toEqual(withBestDesign);
  });

  it('refuses a Best Design output with a direction it does not have', () => {
    const broken = {
      ...study,
      nodes: [
        {
          kind: 'output',
          id: 'o-best',
          position: { x: 0, y: 0 },
          output: { kind: 'bestDesign', checks: [], direction: 'cheapest' },
        },
      ],
      edges: [],
    };
    expect(() => parseDocument(broken)).toThrow(/direction/u);
  });

  it('round-trips every select mode, carrying threshold and direction on `crossing` alone', () => {
    // The union is on `mode`, so a `firstPassing` node must not round-trip
    // fields it has no meaning for — that is what keeps switching mode from
    // quietly preserving a bound nobody can see any more.
    const withSelects = {
      ...study,
      nodes: [
        {
          kind: 'select',
          id: 'cross',
          label: 'crosses at',
          position: { x: 0, y: 0 },
          mode: 'crossing',
          threshold: { value: 1.5, unit: '' },
          direction: 'falling',
        },
        { kind: 'select', id: 'first', position: { x: 0, y: 120 }, mode: 'firstPassing' },
        { kind: 'select', id: 'least', position: { x: 0, y: 240 }, mode: 'argMin' },
        { kind: 'select', id: 'most', position: { x: 0, y: 360 }, mode: 'argMax' },
      ],
      edges: [],
    };
    const document = parseDocument(withSelects);
    expect(serializeDocument(document)).toEqual(withSelects);
  });

  it('refuses a select node with a mode it does not have', () => {
    const broken = {
      ...study,
      nodes: [{ kind: 'select', id: 'nope', position: { x: 0, y: 0 }, mode: 'nearest' }],
      edges: [],
    };
    expect(() => parseDocument(broken)).toThrow(/mode/u);
  });

  it('refuses a crossing select node with no threshold to cross', () => {
    const broken = {
      ...study,
      nodes: [{ kind: 'select', id: 'cross', position: { x: 0, y: 0 }, mode: 'crossing', direction: 'any' }],
      edges: [],
    };
    expect(() => parseDocument(broken)).toThrow(/threshold/u);
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
    // 'frames' is in there too: a file node reading more than one file is a
    // sweep over the files, the same way a list of sizes is a sweep.
    expect(axes(parseDocument(study)).map((node) => node.id)).toEqual(['d', 'fit', 'frames']);
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
    expect(axes(parseDocument(withGenerator)).map((node) => node.id)).toEqual([
      'd',
      'fit',
      'frames',
      'draw',
    ]);
  });

  it('counts every range node as an axis, regardless of whether its bounds are wired', () => {
    const withRange = {
      ...study,
      nodes: [
        ...(study['nodes'] as JsonObject[]),
        { kind: 'range', id: 'sweep', position: { x: 0, y: 360 }, spacing: 'linear', start: 0, stop: 1, count: 5, unit: '' },
      ],
    };
    expect(axes(parseDocument(withRange)).map((node) => node.id)).toEqual([
      'd',
      'fit',
      'frames',
      'sweep',
    ]);
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
  it('round-trips an optional exposed-slider marker without changing older inputs', () => {
    const exposed = {
      ...study,
      nodes: (study['nodes'] as JsonObject[]).map((node) =>
        node['id'] === 'load'
          ? {
              ...node,
              value: { kind: 'slider', value: 12, min: 5, max: 20, unit: 'kN' },
              exposeInNotebook: true,
            }
          : node,
      ),
    };
    expect(serializeDocument(parseDocument(exposed))).toEqual(exposed);
    expect(serializeDocument(parseDocument(study))).toEqual(study);
  });

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

  it('round-trips a nested canvas-only group while older sections stay unchanged', () => {
    const nested = {
      ...study,
      frames: [
        ...(study['frames'] as JsonObject[]),
        {
          id: 'assumptions',
          kind: 'group',
          frameId: 'sizing',
          title: 'Preliminary values',
          position: { x: 0, y: 0 },
          size: { width: 300, height: 120 },
        },
      ],
    };
    expect(serializeDocument(parseDocument(nested))).toEqual(nested);
    expect(serializeDocument(parseDocument(study))).toEqual(study);
  });

  it('rejects missing parents, nested sections, and nesting cycles', () => {
    const group = {
      id: 'group', kind: 'group', title: 'Group',
      position: { x: 0, y: 0 }, size: { width: 100, height: 100 },
    };
    expect(() => parseDocument({ ...study, frames: [{ ...group, frameId: 'gone' }] })).toThrow(/no frame 'gone'/);
    expect(() => parseDocument({
      ...study,
      frames: [...(study['frames'] as JsonObject[]), { ...group, id: 'nested-section', kind: 'section', frameId: 'sizing' }],
    })).toThrow(/only group frames can be nested/);
    expect(() => parseDocument({
      ...study,
      frames: [{ ...group, id: 'one', frameId: 'two' }, { ...group, id: 'two', frameId: 'one' }],
    })).toThrow(/nesting contains a cycle/);
  });
});

describe('file nodes', () => {
  const fileNode = (study['nodes'] as JsonObject[])[11] as JsonObject;
  const withFile = (node: JsonObject): JsonObject => ({ ...study, nodes: [node], edges: [] });

  it('accepts a node with no file picked yet, the way a fresh closure has no expression', () => {
    const fresh = {
      kind: 'file',
      id: 'photo',
      position: { x: 0, y: 0 },
      reader: 'exif',
      sources: [],
      fields: [],
    };
    expect(serializeDocument(parseDocument(withFile(fresh)))).toEqual(withFile(fresh));
  });

  it('refuses fields with no file behind them', () => {
    const broken = {
      ...fileNode,
      sources: [],
      fields: [{ name: 'f', unit: 'mm', values: [] }],
    };
    expect(() => parseDocument(withFile(broken))).toThrow(
      /fields: has fields but no file to have read them from/,
    );
  });

  it('refuses a field that does not answer once per file', () => {
    const broken = { ...fileNode, fields: [{ name: 'f', unit: 'mm', values: [50] }] };
    expect(() => parseDocument(withFile(broken))).toThrow(/has 1 entries; 2 file\(s\) require 2/);
  });

  it('refuses a value that disagrees with its own field’s unit', () => {
    const numeric = { ...fileNode, fields: [{ name: 'f', unit: 'mm', values: ['50', '85'] }] };
    expect(() => parseDocument(withFile(numeric))).toThrow(/expected a finite number/);
    const categorical = { ...fileNode, fields: [{ name: 'camera', values: [1, 2] }] };
    expect(() => parseDocument(withFile(categorical))).toThrow(/expected a string/);
  });

  it('refuses two fields fighting over one port name', () => {
    const broken = {
      ...fileNode,
      fields: [
        { name: 'f', unit: 'mm', values: [50, 85] },
        { name: 'f', unit: 'mm', values: [24, 24] },
      ],
    };
    expect(() => parseDocument(withFile(broken))).toThrow(/fields: names 'f' twice/);
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
    expect(() => parseDocument(broken)).toThrow(/nodes\[12\]\.id: 'd' appears twice/);
  });

  it('refuses a document written by a schema version it does not read', () => {
    expect(() => parseDocument({ ...study, schemaVersion: 99 })).toThrow(
      /this build reads version 1 only/,
    );
  });
});

describe('Pareto outputs and document-wide marks', () => {
  const base = (output: JsonValue): JsonObject => ({
    schemaVersion: 1,
    id: 'g',
    title: 'T',
    nodes: [{ kind: 'output', id: 'front', position: { x: 0, y: 0 }, output }],
    edges: [],
    frames: [],
  });

  it('round-trips both directions and an empty checks list', () => {
    for (const xDirection of ['minimize', 'maximize']) {
      for (const yDirection of ['minimize', 'maximize']) {
        const study = base({ kind: 'pareto', checks: ['a', 'b'], xDirection, yDirection });
        expect(serializeDocument(parseDocument(study))).toEqual(study);
      }
    }
    const empty = base({ kind: 'pareto', checks: [], xDirection: 'minimize', yDirection: 'minimize' });
    expect(serializeDocument(parseDocument(empty))).toEqual(empty);
  });

  it('refuses a direction it does not know', () => {
    expect(() =>
      parseDocument(base({ kind: 'pareto', checks: [], xDirection: 'smallest', yDirection: 'minimize' })),
    ).toThrow(/xDirection/u);
  });

  it('round-trips marks with numeric and categorical coordinates', () => {
    const study = {
      ...base({ kind: 'print' }),
      marks: [{ at: { d: 40 } }, { at: { d: 50, material: 'steel' } }],
    };
    expect(serializeDocument(parseDocument(study))).toEqual(study);
  });

  it('refuses a mark that names no axis, since it would identify every point', () => {
    expect(() => parseDocument({ ...base({ kind: 'print' }), marks: [{ at: {} }] })).toThrow(/names no axis/u);
  });

  it('still loads a document written before marks moved off the table', () => {
    // The row-index marks these carried were the unreliable thing being
    // replaced, so they are dropped rather than migrated — but the document
    // itself must keep opening, which is what makes the change additive.
    const legacy = base({ kind: 'table', columns: ['d'], marks: [0, 5] });
    const parsed = parseDocument(legacy);
    const node = parsed.nodes[0];
    expect(node?.kind === 'output' && node.output.kind === 'table' && 'marks' in node.output).toBe(false);
    expect(parsed.marks).toBeUndefined();
  });
});
