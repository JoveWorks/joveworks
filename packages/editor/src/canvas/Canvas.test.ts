import { describe, expect, it } from 'vitest';

import { emptyDocument, VALUE_PORT, type GraphDocument, type GraphNode } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { analyse } from '../model/analysis';
import { addNode, connect, edgeId } from '../model/document';
import {
  isLayoutGesture,
  nodeContextMenuKind,
  plotAxisMismatch,
  previewLayoutChanges,
  sectionActionLabel,
} from './Canvas';

function documentWithNodes(): GraphDocument {
  let document = emptyDocument('study', 'Study');
  for (const id of ['first', 'second', 'third']) {
    document = addNode(document, {
      kind: 'input',
      id,
      value: { kind: 'scalar', value: 1, unit: parseUnit('') },
      position: { x: 0, y: 0 },
    });
  }
  return document;
}

describe('canvas section context', () => {
  const document = documentWithNodes();

  it('names the empty-canvas action after what the current selection will do', () => {
    expect(sectionActionLabel(document, new Set())).toBe('Add new section');
    expect(sectionActionLabel(document, new Set(['first']))).toBe('Group into new section');
    expect(sectionActionLabel(document, new Set(['first', 'second']))).toBe('Group into new section');
  });

  it('ignores non-node selection ids when naming the section action', () => {
    expect(sectionActionLabel(document, new Set(['first.value->second.value']))).toBe('Add new section');
  });

  it('opens the selection menu for any node right-click while several nodes are selected', () => {
    expect(nodeContextMenuKind(document, new Set(['first', 'second']))).toBe('selection');
  });

  it('keeps the node menu for a single-node selection', () => {
    expect(nodeContextMenuKind(document, new Set(['first']))).toBe('node');
  });

});

describe('transient canvas geometry', () => {
  it('moves a node in the preview without changing the source document', () => {
    const document = documentWithNodes();
    const preview = previewLayoutChanges(
      document,
      [{ id: 'first', type: 'position', position: { x: 120, y: 80 } }],
      new Set(),
      false,
    );

    expect(document.nodes.find((node) => node.id === 'first')?.position).toEqual({ x: 0, y: 0 });
    expect(preview.nodes.find((node) => node.id === 'first')?.position).toEqual({ x: 120, y: 80 });
  });

  it('carries a frame member in the preview and snaps frame resize geometry', () => {
    const document: GraphDocument = {
      ...documentWithNodes(),
      frames: [{
        id: 'section',
        kind: 'section',
        title: 'Section',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 160 },
      }],
      nodes: documentWithNodes().nodes.map((node) =>
        node.id === 'first' ? { ...node, frameId: 'section' } : node,
      ),
    };
    const preview = previewLayoutChanges(
      document,
      [{ id: 'section', type: 'position', position: { x: 23, y: 41 } }],
      new Set(),
      true,
    );

    expect(preview.frames[0]?.position).toEqual({ x: 23, y: 41 });
    expect(preview.nodes.find((node) => node.id === 'first')?.position).toEqual({ x: 23, y: 41 });

    const resized = previewLayoutChanges(
      document,
      [{ id: 'section', type: 'dimensions', dimensions: { width: 207, height: 166 } }],
      new Set(),
      true,
    );
    expect(resized.frames[0]?.size).toEqual({ width: 220, height: 165 });
  });
});

describe('layout gesture detection', () => {
  const framed: GraphDocument = {
    ...documentWithNodes(),
    frames: [{
      id: 'section',
      kind: 'section',
      title: 'Section',
      position: { x: 0, y: 0 },
      size: { width: 200, height: 160 },
    }],
  };

  it('ignores the measurement burst React Flow fires for a freshly loaded document', () => {
    const measurements = framed.nodes.map((node) => ({
      id: node.id,
      type: 'dimensions' as const,
      dimensions: { width: 300, height: 240 },
    }));
    expect(isLayoutGesture(framed, measurements, new Set())).toBe(false);
  });

  it('treats a drag and an open-frame resize as gestures', () => {
    expect(
      isLayoutGesture(framed, [{ id: 'first', type: 'position', position: { x: 8, y: 8 } }], new Set()),
    ).toBe(true);
    expect(
      isLayoutGesture(
        framed,
        [{ id: 'section', type: 'dimensions', dimensions: { width: 240, height: 200 }, resizing: true }],
        new Set(),
      ),
    ).toBe(true);
  });

  // The bug this guards: a section frame re-measures on its own whenever its
  // contents reflow, and that opened a preview no drag-stop would ever close
  // — `renderedDocument` then drew the stale projection over every later
  // edit, so nodes added from the palette went into the document and never
  // appeared. A blank document has no frames, which is why it only ever
  // showed up on the examples.
  it('does not treat a frame re-measuring its own contents as a resize', () => {
    expect(
      isLayoutGesture(
        framed,
        [{ id: 'section', type: 'dimensions', dimensions: { width: 240, height: 200 } }],
        new Set(),
      ),
    ).toBe(false);
  });

  it('does not open a preview a collapsed frame would leave untouched', () => {
    const changes = [{
      id: 'section',
      type: 'dimensions' as const,
      dimensions: { width: 240, height: 200 },
    }];
    expect(isLayoutGesture(framed, changes, new Set(['section']))).toBe(false);
    expect(previewLayoutChanges(framed, changes, new Set(['section']), false)).toBe(framed);
  });
});

// A Plot node's own measure ports are named after each measure's stable id
// (`plotAxisMismatch`'s `measurePorts`), not a fixed 'value' — 'm1'/'m2'
// here stand for whatever `addPlotMeasure` would actually have named them.
function sweptInput(id: string): GraphNode {
  return {
    kind: 'input',
    id,
    position: { x: 0, y: 0 },
    value: { kind: 'linear', start: 1, stop: 10, points: 3, unit: parseUnit('mm') },
  } as GraphNode;
}

function documentWithPlot(): GraphDocument {
  let document = emptyDocument('study', 'Study');
  document = addNode(document, sweptInput('x'));
  document = addNode(document, sweptInput('y'));
  document = addNode(document, {
    kind: 'output',
    id: 'plot',
    position: { x: 0, y: 0 },
    output: { kind: 'plot', measures: [{ id: 'm1' }, { id: 'm2' }] },
  } as GraphNode);
  return document;
}

describe("a Plot node refuses a measure that sweeps a different axis than the ones it already has", () => {
  it('lets a second measure in when it sweeps the same axis as the first', () => {
    let document = documentWithPlot();
    document = connect(document, { node: 'x', port: VALUE_PORT }, { node: 'plot', port: 'm1' });
    const analysis = analyse(document, []);
    const candidate = {
      id: edgeId({ node: 'x', port: VALUE_PORT }, { node: 'plot', port: 'm2' }),
      from: { node: 'x', port: VALUE_PORT },
      to: { node: 'plot', port: 'm2' },
    };
    expect(plotAxisMismatch(document, analysis, candidate)).toBeUndefined();
  });

  it('refuses a second measure that sweeps a different axis, in words that name the axis mismatch rather than a unit one', () => {
    let document = documentWithPlot();
    document = connect(document, { node: 'x', port: VALUE_PORT }, { node: 'plot', port: 'm1' });
    const analysis = analyse(document, []);
    const candidate = {
      id: edgeId({ node: 'y', port: VALUE_PORT }, { node: 'plot', port: 'm2' }),
      from: { node: 'y', port: VALUE_PORT },
      to: { node: 'plot', port: 'm2' },
    };
    const reason = plotAxisMismatch(document, analysis, candidate);
    expect(reason).toMatch(/different axis/u);
    // `refuseConnection` (Canvas.tsx) rewrites a reason into unit-mismatch
    // wording whenever it matches this heuristic — this reason must not,
    // or a student reading "the units are incompatible" would go looking
    // for a unit problem that was never the actual issue.
    expect(reason?.startsWith('cannot connect ')).toBe(false);
    expect(reason).not.toMatch(/different dimensions|the same kind of quantity/u);
  });

  it('never touches an existing wire — refusing is the only behaviour, not dropping what is already there', () => {
    let document = documentWithPlot();
    document = connect(document, { node: 'x', port: VALUE_PORT }, { node: 'plot', port: 'm1' });
    const before = document.edges;
    const analysis = analyse(document, []);
    const candidate = {
      id: edgeId({ node: 'y', port: VALUE_PORT }, { node: 'plot', port: 'm2' }),
      from: { node: 'y', port: VALUE_PORT },
      to: { node: 'plot', port: 'm2' },
    };
    plotAxisMismatch(document, analysis, candidate);
    expect(document.edges).toBe(before);
    expect(document.edges).toHaveLength(1);
  });

  it('ignores a wire whose target is not a plot output', () => {
    const document = documentWithPlot();
    const analysis = analyse(document, []);
    const candidate = {
      id: edgeId({ node: 'x', port: VALUE_PORT }, { node: 'y', port: VALUE_PORT }),
      from: { node: 'x', port: VALUE_PORT },
      to: { node: 'y', port: VALUE_PORT },
    };
    expect(plotAxisMismatch(document, analysis, candidate)).toBeUndefined();
  });

  it('does not refuse the very first measure a Plot node gets', () => {
    const document = documentWithPlot();
    const analysis = analyse(document, []);
    const candidate = {
      id: edgeId({ node: 'x', port: VALUE_PORT }, { node: 'plot', port: 'm1' }),
      from: { node: 'x', port: VALUE_PORT },
      to: { node: 'plot', port: 'm1' },
    };
    expect(plotAxisMismatch(document, analysis, candidate)).toBeUndefined();
  });
});
