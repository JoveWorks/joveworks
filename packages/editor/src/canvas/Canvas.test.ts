import { describe, expect, it } from 'vitest';

import { emptyDocument, type GraphDocument } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { addNode } from '../model/document';
import { isLayoutGesture, nodeContextMenuKind, previewLayoutChanges, sectionActionLabel } from './Canvas';

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
