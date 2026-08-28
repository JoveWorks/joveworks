import { describe, expect, it } from 'vitest';

import { emptyDocument, type GraphDocument } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { addNode } from '../model/document';
import { nodeContextMenuKind, previewLayoutChanges, sectionActionLabel } from './Canvas';

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
