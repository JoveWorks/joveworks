import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA_VERSION, parseDocument, type GraphDocument } from '@joveworks/schema';
import type { Warning } from '@joveworks/kernel';

import { acceptFormulaUpdate, formulaChangeText } from './formulaUpdate';

const pinned = (version: number, hash: string) => ({ id: 'invented.area', version, hash });

const study = (): GraphDocument =>
  parseDocument({
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: 'study',
    title: 'Invented study',
    nodes: [
      { kind: 'formula', id: 'area', position: { x: 0, y: 0 }, formula: pinned(1, 'old') },
      { kind: 'formula', id: 'other', position: { x: 0, y: 100 }, formula: { id: 'invented.other', version: 1, hash: 'keep' } },
      { kind: 'table', id: 'sizes', position: { x: 0, y: 200 }, table: pinned(1, 'old'), rows: [], columns: [] },
    ],
    edges: [],
    frames: [],
  });

describe('accepting a changed formula', () => {
  it('re-pins the node it was offered on, and nothing else', () => {
    const updated = acceptFormulaUpdate(study(), 'area', pinned(3, 'new'));
    const formulaOf = (id: string) => {
      const node = updated.nodes.find((candidate) => candidate.id === id);
      return node?.kind === 'formula' ? node.formula : node?.kind === 'table' ? node.table : undefined;
    };
    expect(formulaOf('area')).toEqual(pinned(3, 'new'));
    expect(formulaOf('other')).toEqual({ id: 'invented.other', version: 1, hash: 'keep' });
    expect(formulaOf('sizes')).toEqual(pinned(1, 'old'));
  });

  it('re-pins a table node\'s table the same way', () => {
    const updated = acceptFormulaUpdate(study(), 'sizes', pinned(3, 'new'));
    const node = updated.nodes.find((candidate) => candidate.id === 'sizes');
    expect(node?.kind === 'table' ? node.table : undefined).toEqual(pinned(3, 'new'));
  });

  it('refuses to re-pin a node to a different formula', () => {
    const before = study();
    expect(acceptFormulaUpdate(before, 'other', pinned(3, 'new'))).toEqual(before);
  });

  it('reads the notes in the reader\'s language, after the warning itself', () => {
    const warning: Warning = {
      kind: 'formulaChanged',
      nodeId: 'area',
      message: "'invented.area' has changed.",
      formulaUpdate: {
        to: pinned(3, 'new'),
        changes: [{ version: 3, note: { en: 'Invented: widened.', nl: 'Verzonnen: verbreed.' } }],
      },
    };
    expect(formulaChangeText(warning, 'en')).toBe("'invented.area' has changed. Version 3: Invented: widened.");
    expect(formulaChangeText(warning, 'nl')).toBe("'invented.area' has changed. Versie 3: Verzonnen: verbreed.");
  });
});
