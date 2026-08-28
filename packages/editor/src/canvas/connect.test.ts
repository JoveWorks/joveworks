import { describe, expect, it } from 'vitest';

import {
  emptyDocument,
  formulaRef,
  VALUE_PORT,
  type Catalogue,
  type Edge,
  type Formula,
  type GraphDocument,
  type InputNode,
  type OutputNode,
} from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { connect, edgeId, NEW_COLUMN, NEW_PLOT_MEASURE } from '../model/document';
import { connectResolvingTableColumn } from './connect';

const input = (id: string, label = id): InputNode => ({
  kind: 'input',
  id,
  label,
  value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
  position: { x: 0, y: 0 },
});

const table = (columns: readonly string[] = []): OutputNode => ({
  kind: 'output',
  id: 'table',
  output: { kind: 'table', columns: [...columns] },
  position: { x: 300, y: 0 },
});

function documentWith(...nodes: GraphDocument['nodes']): GraphDocument {
  return { ...emptyDocument('connect-test', 'Connect test'), nodes };
}

function edge(fromNode: string, fromPort: string, toNode: string, toPort: string): Edge {
  const from = { node: fromNode, port: fromPort };
  const to = { node: toNode, port: toPort };
  return { id: edgeId(from, to), from, to };
}

describe('connectResolvingTableColumn', () => {
  it('turns a Plot ghost port into a stable named measure before validation', () => {
    const plot: OutputNode = {
      kind: 'output', id: 'plot', position: { x: 300, y: 0 }, output: { kind: 'plot', measures: [] },
    };
    const result = connectResolvingTableColumn(
      documentWith(input('source', 'Measured width'), plot),
      [],
      edge('source', VALUE_PORT, 'plot', NEW_PLOT_MEASURE),
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.find((node) => node.id === 'plot')).toMatchObject({
      output: { kind: 'plot', measures: [{ id: 'value', label: 'Measured width' }] },
    });
    expect(result.document.edges).toEqual([edge('source', VALUE_PORT, 'plot', VALUE_PORT)]);
  });

  it('names a ghost column after the source label and validates the resolved port', () => {
    const result = connectResolvingTableColumn(
      documentWith(input('source', 'Measured width'), table()),
      [],
      edge('source', VALUE_PORT, 'table', NEW_COLUMN),
      false,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.find((node) => node.id === 'table')).toMatchObject({
      output: { kind: 'table', columns: ['Measured width'] },
    });
    expect(result.document.edges).toEqual([
      edge('source', VALUE_PORT, 'table', 'Measured width'),
    ]);
  });

  it('relabels an existing column after its replacement source', () => {
    const current = connect(
      documentWith(input('old', 'Old width'), input('fresh', 'Fresh width'), table(['Old width'])),
      { node: 'old', port: VALUE_PORT },
      { node: 'table', port: 'Old width' },
    );
    const result = connectResolvingTableColumn(
      current,
      [],
      edge('fresh', VALUE_PORT, 'table', 'Old width'),
      false,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.find((node) => node.id === 'table')).toMatchObject({
      output: { kind: 'table', columns: ['Fresh width'] },
    });
    expect(result.document.edges).toEqual([
      edge('fresh', VALUE_PORT, 'table', 'Fresh width'),
    ]);
  });

  it('reports a refusal against the fallback-named port and leaves persistence to the caller', () => {
    const original = documentWith(table());
    const result = connectResolvingTableColumn(
      original,
      [],
      edge('missing-source', 'fallback port', 'table', NEW_COLUMN),
      false,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.edge.to).toEqual({ node: 'table', port: 'fallback port' });
    expect(result.refusal.reason).toMatch(/missing-source/u);
    // Direct/existing-node wiring returns the pre-attempt document on refusal.
    const afterExistingNodeAttempt = original;
    expect(afterExistingNodeAttempt.nodes.find((node) => node.id === 'table')).toMatchObject({
      output: { kind: 'table', columns: [] },
    });
    // Quick-add returns the attempted document so its newly placed table (and
    // the column named for that attempted wire) remains available to edit.
    const afterQuickAddAttempt = result.document;
    expect(afterQuickAddAttempt.nodes.find((node) => node.id === 'table')).toMatchObject({
      output: { kind: 'table', columns: ['fallback port'] },
    });
  });

  it('re-resolves a successful ghost column against the document current at commit', () => {
    const checked = connectResolvingTableColumn(
      documentWith(input('source', 'Initial load'), table()),
      [],
      edge('source', VALUE_PORT, 'table', NEW_COLUMN),
      false,
    );
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;

    const current = documentWith(input('source', 'Current load'), table(['Current load']));
    const applied = checked.apply(current);
    expect(applied.nodes.find((node) => node.id === 'table')).toMatchObject({
      output: { kind: 'table', columns: ['Current load', 'Current load2'] },
    });
    expect(applied.edges).toEqual([
      edge('source', VALUE_PORT, 'table', 'Current load2'),
    ]);
  });

  it('preserves variadic-port joining for an ordinary target', () => {
    const total: Formula = {
      id: 'invented.total',
      version: 1,
      inputs: [{ kind: 'numeric', name: 'loads', unit: parseUnit('N'), variadic: true }],
      outputs: [{ kind: 'numeric', name: 'total', unit: parseUnit('N') }],
      expressions: { total: 'sum(loads)' },
      description: 'Invented total for connection tests',
      status: 'unverified',
    };
    const catalogue: Catalogue = {
      schemaVersion: 1,
      id: 'invented-connect-test',
      name: 'Invented connection test',
      restricted: false,
      formulas: [total],
    };
    const load = (id: string, value: number): InputNode => ({
      kind: 'input',
      id,
      value: { kind: 'scalar', value, unit: parseUnit('N') },
      position: { x: 0, y: 0 },
    });
    let current = documentWith(
      load('first', 1),
      load('second', 2),
      { kind: 'formula', id: 'total', formula: formulaRef(total), position: { x: 300, y: 0 } },
    );
    current = connect(current, { node: 'first', port: VALUE_PORT }, { node: 'total', port: 'loads' }, true);

    const result = connectResolvingTableColumn(
      current,
      [catalogue],
      edge('second', VALUE_PORT, 'total', 'loads'),
      true,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.edges.map((entry) => entry.from.node)).toEqual(['first', 'second']);
  });
});
