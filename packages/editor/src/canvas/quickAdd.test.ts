import { describe, expect, it } from 'vitest';

import { emptyDocument, VALUE_PORT, type Formula } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { NEW_COLUMN } from '../model/document';
import {
  quickAddChoicePort,
  quickAddNodeSpec,
  type QuickAddCandidate,
  type QuickAddDragType,
} from './quickAdd';

const document = emptyDocument('study', 'Study');
const position = { x: 40, y: 80 };

const formula: Formula = {
  id: 'invented/default node',
  version: 1,
  inputs: [
    { kind: 'numeric', name: 'length', unit: parseUnit('mm') },
    { kind: 'numeric', name: 'force', unit: parseUnit('N') },
  ],
  outputs: [
    { kind: 'numeric', name: 'first', unit: parseUnit('mm') },
    { kind: 'numeric', name: 'second', unit: parseUnit('mm') },
  ],
  expressions: { first: 'length', second: 'length' },
  description: 'Invented test formula',
  status: 'unverified',
};

describe('quickAddNodeSpec', () => {
  it('keeps formula construction, id naming, and directional ports together', () => {
    const spec = quickAddNodeSpec(document, { kind: 'formula', formula });

    expect(spec.idPrefix).toBe('invented_default_node');
    expect(spec.ports.source).toEqual(['length', 'force']);
    expect(spec.ports.target).toEqual(['first', 'second']);
    expect(spec.make('formula-1', position)).toMatchObject({
      kind: 'formula',
      id: 'formula-1',
      position,
      formula: { id: formula.id, version: formula.version },
    });
  });

  it('describes every fixed-shape quick-add kind without separate direction ladders', () => {
    const cases: readonly {
      readonly choice: Exclude<QuickAddCandidate, { readonly kind: 'formula' }>;
      readonly prefix: string;
      readonly source: readonly string[];
      readonly target: readonly string[];
      readonly nodeKind: string;
    }[] = [
      { choice: { kind: 'input' }, prefix: 'input', source: [], target: [VALUE_PORT], nodeKind: 'input' },
      { choice: { kind: 'output', outputKind: 'print' }, prefix: 'result', source: [VALUE_PORT], target: [], nodeKind: 'output' },
      { choice: { kind: 'output', outputKind: 'table' }, prefix: 'table', source: [NEW_COLUMN], target: [], nodeKind: 'output' },
      { choice: { kind: 'compare' }, prefix: 'compare', source: [VALUE_PORT], target: ['verdict'], nodeKind: 'compare' },
      { choice: { kind: 'closure' }, prefix: 'equation', source: ['value'], target: ['result'], nodeKind: 'closure' },
      { choice: { kind: 'waypoint' }, prefix: 'waypoint', source: ['in0'], target: ['out0'], nodeKind: 'waypoint' },
      { choice: { kind: 'pack' }, prefix: 'pack', source: ['in0'], target: ['bundle'], nodeKind: 'pack' },
      { choice: { kind: 'unpack' }, prefix: 'unpack', source: ['bundle'], target: ['out0'], nodeKind: 'unpack' },
      { choice: { kind: 'monteCarloGenerator' }, prefix: 'draw', source: [], target: [VALUE_PORT], nodeKind: 'monteCarloGenerator' },
      { choice: { kind: 'monteCarloReceiver' }, prefix: 'watch', source: ['sample'], target: [], nodeKind: 'monteCarloReceiver' },
    ];

    for (const entry of cases) {
      const spec = quickAddNodeSpec(document, entry.choice);
      expect(spec.idPrefix, entry.choice.kind).toBe(entry.prefix);
      expect(spec.ports.source, `${entry.choice.kind} from source`).toEqual(entry.source);
      expect(spec.ports.target, `${entry.choice.kind} from target`).toEqual(entry.target);
      expect(spec.make(`${entry.prefix}-1`, position, 'Fresh node')).toMatchObject({
        kind: entry.nodeKind,
        id: `${entry.prefix}-1`,
        label: 'Fresh node',
        position,
      });
    }

    expect(quickAddNodeSpec(document, { kind: 'input' }).make('input-1', position)).toMatchObject({
      value: { kind: 'scalar', value: 1, unit: parseUnit('') },
    });
    expect(quickAddNodeSpec(document, { kind: 'compare' }).make('compare-1', position)).toMatchObject({
      comparison: '>=',
      threshold: { value: 1, unit: parseUnit('') },
    });
    expect(quickAddNodeSpec(document, { kind: 'closure' }).make('equation-1', position)).toMatchObject({
      expression: 'value',
    });
    expect(quickAddNodeSpec(document, { kind: 'monteCarloGenerator' }).make('draw-1', position)).toMatchObject({
      distribution: 'uniform', min: 0, max: 1, count: 25, unit: parseUnit(''),
    });
    expect(quickAddNodeSpec(document, { kind: 'monteCarloReceiver' }).make('watch-1', position)).toMatchObject({
      sampleLimit: 10_000,
    });
    expect(quickAddNodeSpec(document, { kind: 'output', outputKind: 'check' }).make('check-1', position))
      .toMatchObject({ output: { kind: 'check', comparison: '>=', threshold: { value: 1, unit: parseUnit('') } } });
  });
});

describe('quickAddChoicePort', () => {
  it('uses the formula port compatibility selected instead of assuming the first port', () => {
    for (const dragType of ['source', 'target'] satisfies readonly QuickAddDragType[]) {
      expect(quickAddChoicePort(document, { kind: 'formula', formula, port: 'second' }, dragType)).toBe('second');
    }
  });

  it('uses the same registry port as compatibility for a fixed-shape node', () => {
    expect(quickAddChoicePort(document, { kind: 'pack' }, 'source')).toBe('in0');
    expect(quickAddChoicePort(document, { kind: 'pack' }, 'target')).toBe('bundle');
    expect(quickAddChoicePort(document, { kind: 'output', outputKind: 'table' }, 'source')).toBe(NEW_COLUMN);
    expect(quickAddChoicePort(document, { kind: 'output', outputKind: 'table' }, 'target')).toBeUndefined();
  });
});
