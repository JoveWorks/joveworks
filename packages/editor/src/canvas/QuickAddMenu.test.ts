import { describe, expect, it } from 'vitest';

import { emptyDocument, VALUE_PORT, type Catalogue, type Formula } from '@mds/schema';
import { parseUnit } from '@mds/units';

import { baseCatalogue } from '../model/catalogues';
import { addNode } from '../model/document';
import { compatibleQuickAddPort } from './Canvas';

describe('compatibleQuickAddPort', () => {
  const catalogues = [baseCatalogue()];

  it('offers every fresh routing or equation node that can receive a numeric wire', () => {
    const document = addNode(emptyDocument('study', 'Study'), {
      kind: 'input',
      id: 'source',
      value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
      position: { x: 0, y: 0 },
    });
    const target = { x: 0, y: 0, from: { nodeId: 'source', port: VALUE_PORT, type: 'source' as const } };

    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'closure' })).toBe('value');
    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'waypoint' })).toBe('in0');
    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'pack' })).toBe('in0');
    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'unpack' })).toBeUndefined();
  });

  it('offers a pack, and hides numeric-only kinds, for a fresh bundle input', () => {
    const document = addNode(emptyDocument('study', 'Study'), {
      kind: 'unpack', id: 'sink', position: { x: 0, y: 0 },
    });
    const target = { x: 0, y: 0, from: { nodeId: 'sink', port: 'bundle', type: 'target' as const } };

    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'pack' })).toBe('bundle');
    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'waypoint' })).toBeUndefined();
    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'compare' })).toBeUndefined();
  });

  it('uses a compatible formula input instead of assuming the first one', () => {
    const formula: Formula = {
      id: 'choose-compatible-input', version: 1,
      inputs: [
        { kind: 'categorical', name: 'mode', domain: ['a', 'b'] },
        { kind: 'numeric', name: 'length', unit: parseUnit('mm') },
      ],
      output: { kind: 'numeric', name: 'result', unit: parseUnit('mm') },
      expression: 'length', description: 'Invented test formula', status: 'unverified',
    };
    const testCatalogue: Catalogue = {
      schemaVersion: 1, id: 'quick-add-test', name: 'Quick Add test', restricted: false, formulas: [formula],
    };

    const document = addNode(emptyDocument('study', 'Study'), {
      kind: 'input', id: 'source',
      value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
      position: { x: 0, y: 0 },
    });
    const target = { x: 0, y: 0, from: { nodeId: 'source', port: VALUE_PORT, type: 'source' as const } };

    expect(compatibleQuickAddPort(document, [testCatalogue], target, { kind: 'formula', formula }))
      .toBe('length');
  });
});
