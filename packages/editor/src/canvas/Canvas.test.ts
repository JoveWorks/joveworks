import { describe, expect, it } from 'vitest';

import { emptyDocument, type GraphDocument } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { addNode } from '../model/document';
import { nodeContextMenuKind, sectionActionLabel } from './Canvas';

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
