import { describe, expect, it } from 'vitest';

import { emptyDocument, MONTE_CARLO_SAMPLE_PORT, VALUE_PORT, type Catalogue, type Formula } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

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

  it('offers a Monte Carlo receiver for a dragged numeric output, and hides the generator (regression: ROADMAP.md #27, they were missing entirely)', () => {
    const document = addNode(emptyDocument('study', 'Study'), {
      kind: 'input',
      id: 'source',
      value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
      position: { x: 0, y: 0 },
    });
    const target = { x: 0, y: 0, from: { nodeId: 'source', port: VALUE_PORT, type: 'source' as const } };

    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'monteCarloReceiver' }))
      .toBe(MONTE_CARLO_SAMPLE_PORT);
    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'monteCarloGenerator' })).toBeUndefined();
  });

  it('offers a Monte Carlo generator for a dragged numeric input, and hides the receiver', () => {
    const document = addNode(emptyDocument('study', 'Study'), {
      kind: 'output', id: 'sink', output: { kind: 'print' }, position: { x: 0, y: 0 },
    });
    const target = { x: 0, y: 0, from: { nodeId: 'sink', port: VALUE_PORT, type: 'target' as const } };

    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'monteCarloGenerator' })).toBe(VALUE_PORT);
    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'monteCarloReceiver' })).toBeUndefined();
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

  it('offers a sensitivity output for a dragged numeric output — it has a VALUE_PORT like print/check/plot', () => {
    const document = addNode(emptyDocument('study', 'Study'), {
      kind: 'input',
      id: 'source',
      value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
      position: { x: 0, y: 0 },
    });
    const target = { x: 0, y: 0, from: { nodeId: 'source', port: VALUE_PORT, type: 'source' as const } };

    expect(compatibleQuickAddPort(document, catalogues, target, { kind: 'output', outputKind: 'sensitivity' }))
      .toBe(VALUE_PORT);
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
