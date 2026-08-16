/**
 * The document edits, which are the only thing the canvas can do to a graph.
 *
 * The fixtures are invented — `a`, `b`, a frame — and deliberately carry no
 * formula at all: these functions never look at one, and a catalogue record here
 * would be a citation for someone to copy (CLAUDE.md).
 */

import { describe, expect, it } from 'vitest';

import {
  SCHEMA_VERSION,
  type ClosureNode,
  type FormulaNode,
  type GraphDocument,
  type InputNode,
  type OutputNode,
} from '@mds/schema';
import { parseUnit } from '@mds/units';

import {
  addNamedColumn,
  addNode,
  changeOutputKind,
  connect,
  duplicateNode,
  frameAround,
  nodeLabel,
  pruneEdgesTo,
  reframe,
  relabelColumn,
  removeColumn,
  removeEdges,
  removeNodes,
  renameColumn,
  renameNode,
  reorderColumn,
  setClosureExpression,
  syncColumnLabels,
  uniqueId,
  updateNode,
} from './document';

const input = (id: string, x: number, y: number): InputNode => ({
  kind: 'input',
  id,
  position: { x, y },
  value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
});

const printOutput = (id: string, x: number, y: number): OutputNode => ({
  kind: 'output',
  id,
  position: { x, y },
  output: { kind: 'print' },
});

const table = (id: string, columns: readonly string[], x: number, y: number): OutputNode => ({
  kind: 'output',
  id,
  position: { x, y },
  output: { kind: 'table', columns: [...columns] },
});

const closure = (id: string, expression: string, x: number, y: number): ClosureNode => ({
  kind: 'closure',
  id,
  position: { x, y },
  expression,
});

const base: GraphDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'test',
  title: 'Test',
  nodes: [input('a', 0, 0), input('b', 400, 0)],
  edges: [],
  frames: [],
};

describe('document edits', () => {
  it('gives a new node an id nothing else has taken', () => {
    expect(uniqueId(base, 'a')).toBe('a2');
    expect(uniqueId(base, 'c')).toBe('c');
  });

  it('replaces the edge already arriving at a port, because an input takes one', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    const rewired = connect(
      addNode(wired, input('c', 0, 200)),
      { node: 'c', port: 'value' },
      { node: 'b', port: 'x' },
    );
    expect(rewired.edges).toHaveLength(1);
    expect(rewired.edges[0]?.from.node).toBe('c');
  });

  it('joins a spectrum port instead of replacing it, when told to (S71)', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' }, true);
    const joined = connect(
      addNode(wired, input('c', 0, 200)),
      { node: 'c', port: 'value' },
      { node: 'b', port: 'x' },
      true,
    );
    expect(joined.edges).toHaveLength(2);
    expect(joined.edges.map((edge) => edge.from.node).sort()).toEqual(['a', 'c']);
  });

  it('drops a duplicated range\'s axisLabel, so it does not read as the same axis twice', () => {
    const range: InputNode = {
      ...input('w', 0, 0),
      value: { kind: 'linear', start: 10, stop: 60, points: 21, unit: parseUnit('mm') },
      label: 'Pad width w',
      axisLabel: 'pad width w (mm)',
    };
    const duplicated = duplicateNode({ ...base, nodes: [range] }, 'w');
    const copy = duplicated.nodes.find((node) => node.id !== 'w') as InputNode;
    expect(copy.axisLabel).toBeUndefined();
    expect(copy.label).toBe('Pad width w');
  });

  it('drops the edges of a node it removes', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    expect(removeNodes(wired, new Set(['a'])).edges).toEqual([]);
  });

  it('drops the frame membership of nodes whose frame is removed', () => {
    const framed = reframe({
      ...base,
      frames: [frameAround('section', 'Section', base.nodes)],
    });
    expect(framed.nodes.every((node) => node.frameId === 'section')).toBe(true);

    const bare = removeNodes(framed, new Set(['section']));
    expect(bare.nodes.every((node) => node.frameId === undefined)).toBe(true);
  });

  it('decides section membership by where a node sits, so moving one re-sections it', () => {
    const framed = reframe({
      ...base,
      frames: [
        {
          id: 'section',
          title: 'Section',
          position: { x: -50, y: -50 },
          size: { width: 200, height: 200 },
        },
      ],
    });
    expect(framed.nodes.find((node) => node.id === 'a')?.frameId).toBe('section');
    expect(framed.nodes.find((node) => node.id === 'b')?.frameId).toBeUndefined();

    const moved = reframe(
      updateNode<InputNode>(framed, 'b', (node) => ({ ...node, position: { x: 10, y: 10 } })),
    );
    expect(moved.nodes.find((node) => node.id === 'b')?.frameId).toBe('section');
  });
});

describe('table output columns (S60, S71-style)', () => {
  const withTable: GraphDocument = { ...base, nodes: [...base.nodes, table('t', ['value'], 400, 200)] };

  it('carries the wired edge along a rename, and regenerates its id', () => {
    const wired = connect(withTable, { node: 'a', port: 'value' }, { node: 't', port: 'value' });
    const renamed = renameColumn(wired, 't', 'value', 'width');
    const node = renamed.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual(['width']);
    expect(renamed.edges).toEqual([
      { id: 'a.value->t.width', from: { node: 'a', port: 'value' }, to: { node: 't', port: 'width' } },
    ]);
  });

  it('drops a column and whatever was wired to it', () => {
    const twoColumns: GraphDocument = { ...base, nodes: [...base.nodes, table('t', ['value', 'a'], 400, 200)] };
    const wired = connect(twoColumns, { node: 'b', port: 'value' }, { node: 't', port: 'value' });
    const dropped = removeColumn(wired, 't', 'value');
    const node = dropped.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual(['a']);
    expect(dropped.edges).toEqual([]);
  });

  it('closes a column when the edge feeding it is removed', () => {
    const wired = connect(withTable, { node: 'a', port: 'value' }, { node: 't', port: 'value' });
    const closed = removeEdges(wired, new Set(wired.edges.map((edge) => edge.id)));
    const node = closed.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual([]);
  });

  it('leaves a still-wired column untouched when an unrelated edge elsewhere is removed', () => {
    const twoColumns: GraphDocument = { ...base, nodes: [...base.nodes, table('t', ['value', 'a'], 400, 200)] };
    const wired = connect(
      connect(twoColumns, { node: 'a', port: 'value' }, { node: 't', port: 'value' }),
      { node: 'b', port: 'value' },
      { node: 't', port: 'a' },
    );
    const oneRemoved = removeEdges(wired, new Set([wired.edges[0]?.id as string]));
    const node = oneRemoved.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual(['a']);
  });

  it('closes a column when the node feeding it is removed', () => {
    const wired = connect(withTable, { node: 'a', port: 'value' }, { node: 't', port: 'value' });
    const closed = removeNodes(wired, new Set(['a']));
    const node = closed.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual([]);
  });

  it('relabels a column when it is rewired, excluding its own current name from the dedupe', () => {
    const wired = connect(withTable, { node: 'a', port: 'value' }, { node: 't', port: 'value' });
    // Rewiring 'value' to a source also called "value" keeps the same name —
    // it must not dedupe against itself and produce 'value2'.
    const same = relabelColumn(wired, 't', 'value', 'value');
    expect(same.column).toBe('value');

    const relabeled = relabelColumn(wired, 't', 'value', 'width');
    expect(relabeled.column).toBe('width');
    const node = relabeled.document.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual(['width']);
  });

  it('prunes edges into ports a new output kind does not have', () => {
    const twoColumns: GraphDocument = { ...base, nodes: [...base.nodes, table('t', ['value', 'a'], 400, 200)] };
    const wired = connect(twoColumns, { node: 'b', port: 'value' }, { node: 't', port: 'a' });
    const pruned = pruneEdgesTo(wired, 't', new Set(['value']));
    expect(pruned.edges).toEqual([]);
  });

  it('names a ghost-slot column after whatever base string it is given', () => {
    const named = addNamedColumn(withTable, 't', 'width');
    expect(named.column).toBe('width');
    const node = named.document.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual(['value', 'width']);
  });

  it('dedupes a ghost-slot name against a column already there', () => {
    const named = addNamedColumn(withTable, 't', 'value');
    expect(named.column).toBe('value2');
  });

  it('reorders columns, dropping before or after the target', () => {
    const three: GraphDocument = { ...base, nodes: [...base.nodes, table('t', ['value', 'a', 'b'], 400, 200)] };

    const after = reorderColumn(three, 't', 'value', 'b', 'after');
    const afterNode = after.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(afterNode.output.kind === 'table' && afterNode.output.columns).toEqual(['a', 'b', 'value']);

    const before = reorderColumn(three, 't', 'b', 'value', 'before');
    const beforeNode = before.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(beforeNode.output.kind === 'table' && beforeNode.output.columns).toEqual(['b', 'value', 'a']);
  });
});

describe('changeOutputKind — adapting existing wiring across a kind switch', () => {
  const areaFormula: FormulaNode = {
    kind: 'formula',
    id: 'area',
    position: { x: 0, y: 0 },
    formula: { id: 'invented.area', version: 1, hash: 'h' },
  };

  it('adopts the value edge as a table column, named after its source, entering table', () => {
    const doc: GraphDocument = { ...base, nodes: [...base.nodes, areaFormula, printOutput('result', 400, 0)] };
    const wired = connect(doc, { node: 'area', port: 'product' }, { node: 'result', port: 'value' });
    const switched = changeOutputKind(wired, 'result', { kind: 'table', columns: [] });
    const node = switched.nodes.find((entry) => entry.id === 'result') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual(['invented.area']);
    expect(switched.edges).toEqual([
      {
        id: 'area.product->result.invented.area',
        from: { node: 'area', port: 'product' },
        to: { node: 'result', port: 'invented.area' },
      },
    ]);
  });

  it('adopts the first column back onto `value`, leaving table', () => {
    const doc: GraphDocument = { ...base, nodes: [...base.nodes, areaFormula, table('result', ['width'], 400, 0)] };
    const wired = connect(doc, { node: 'area', port: 'product' }, { node: 'result', port: 'width' });
    const switched = changeOutputKind(wired, 'result', { kind: 'print' });
    const node = switched.nodes.find((entry) => entry.id === 'result') as OutputNode;
    expect(node.output).toEqual({ kind: 'print' });
    expect(switched.edges).toEqual([
      {
        id: 'area.product->result.value',
        from: { node: 'area', port: 'product' },
        to: { node: 'result', port: 'value' },
      },
    ]);
  });

  it('drops the rest of a multi-column table, keeping only the first column’s wire', () => {
    const doc: GraphDocument = {
      ...base,
      nodes: [...base.nodes, areaFormula, table('result', ['width', 'height'], 400, 0)],
    };
    const wired = connect(
      connect(doc, { node: 'area', port: 'product' }, { node: 'result', port: 'width' }),
      { node: 'b', port: 'value' },
      { node: 'result', port: 'height' },
    );
    const switched = changeOutputKind(wired, 'result', { kind: 'print' });
    expect(switched.edges).toEqual([
      {
        id: 'area.product->result.value',
        from: { node: 'area', port: 'product' },
        to: { node: 'result', port: 'value' },
      },
    ]);
  });

  it('does nothing when the kind is unchanged', () => {
    const doc: GraphDocument = { ...base, nodes: [...base.nodes, printOutput('result', 400, 0)] };
    expect(changeOutputKind(doc, 'result', { kind: 'print' })).toBe(doc);
  });

  it('has nothing to adapt when the output was not wired at all', () => {
    const doc: GraphDocument = { ...base, nodes: [...base.nodes, printOutput('result', 400, 0)] };
    const switched = changeOutputKind(doc, 'result', { kind: 'table', columns: [] });
    const node = switched.nodes.find((entry) => entry.id === 'result') as OutputNode;
    expect(node.output).toEqual({ kind: 'table', columns: [] });
  });
});

describe('nodeLabel — what a node calls itself, for anything that needs a name rather than an id', () => {
  it('uses the label the student typed, when there is one', () => {
    expect(nodeLabel({ ...input('a', 0, 0), label: 'Pad width w' })).toBe('Pad width w');
  });

  it('falls back to the id for an unlabelled input or output node', () => {
    expect(nodeLabel(input('w', 0, 0))).toBe('w');
    expect(nodeLabel(table('t', ['value'], 0, 0))).toBe('t');
  });

  it('falls back to the formula id for an unlabelled formula node', () => {
    const formulaNode: FormulaNode = {
      kind: 'formula',
      id: 'area1',
      position: { x: 0, y: 0 },
      formula: { id: 'invented.area', version: 1, hash: 'h' },
    };
    expect(nodeLabel(formulaNode)).toBe('invented.area');
  });
});

describe('renaming a node keeps table columns in sync', () => {
  it('renames a column still named after the node, once that node is renamed', () => {
    const wired = connect(
      { ...base, nodes: [...base.nodes, table('t', ['a'], 400, 0)] },
      { node: 'a', port: 'value' },
      { node: 't', port: 'a' },
    );
    const renamed = renameNode(wired, 'a', 'Pad width');
    const node = renamed.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual(['Pad width']);
    expect(renamed.edges).toEqual([
      {
        id: 'a.value->t.Pad width',
        from: { node: 'a', port: 'value' },
        to: { node: 't', port: 'Pad width' },
      },
    ]);
  });

  it('leaves a column alone once it has been manually renamed away from the source', () => {
    const wired = connect(
      { ...base, nodes: [...base.nodes, table('t', ['a'], 400, 0)] },
      { node: 'a', port: 'value' },
      { node: 't', port: 'a' },
    );
    const customised = renameColumn(wired, 't', 'a', 'width (mm)');
    const renamed = renameNode(customised, 'a', 'Pad width');
    const node = renamed.nodes.find((entry) => entry.id === 't') as OutputNode;
    // The column no longer matches 'a' — the old label — so it is left alone.
    expect(node.output.kind === 'table' && node.output.columns).toEqual(['width (mm)']);
  });

  it('leaves a column alone when it is fed by a different node than the one renamed', () => {
    const wired = connect(
      connect(
        { ...base, nodes: [...base.nodes, table('t', ['a', 'b'], 400, 0)] },
        { node: 'a', port: 'value' },
        { node: 't', port: 'a' },
      ),
      { node: 'b', port: 'value' },
      { node: 't', port: 'b' },
    );
    // Column 'a' is fed by node 'a', not 'b' — renaming 'b' must not touch it,
    // even though 'b' is also, coincidentally, a column name in this table.
    const renamed = renameNode(wired, 'b', 'Load');
    const node = renamed.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.columns).toEqual(['a', 'Load']);
  });

  it('does nothing via syncColumnLabels when the label did not actually change', () => {
    const wired = connect(
      { ...base, nodes: [...base.nodes, table('t', ['a'], 400, 0)] },
      { node: 'a', port: 'value' },
      { node: 't', port: 'a' },
    );
    expect(syncColumnLabels(wired, 'a', 'a', 'a')).toBe(wired);
  });
});

describe('setClosureExpression — a closure node’s ports follow its own expression', () => {
  it('rewrites the expression and leaves an unaffected wire alone', () => {
    const wired = connect(
      { ...base, nodes: [...base.nodes, closure('eq', 'a + b', 400, 0)] },
      { node: 'a', port: 'value' },
      { node: 'eq', port: 'a' },
    );
    const edited = setClosureExpression(wired, 'eq', 'a - b');
    const node = edited.nodes.find((entry) => entry.id === 'eq') as ClosureNode;
    expect(node.expression).toBe('a - b');
    expect(edited.edges).toEqual(wired.edges);
  });

  it('prunes a wire whose port the new expression no longer mentions', () => {
    const wired = connect(
      connect(
        { ...base, nodes: [...base.nodes, closure('eq', 'a + b', 400, 0)] },
        { node: 'a', port: 'value' },
        { node: 'eq', port: 'a' },
      ),
      { node: 'b', port: 'value' },
      { node: 'eq', port: 'b' },
    );
    // 'b' drops out of the expression entirely — its wire has nowhere left to land.
    const edited = setClosureExpression(wired, 'eq', 'a * 2');
    expect(edited.edges).toEqual([
      { id: 'a.value->eq.a', from: { node: 'a', port: 'value' }, to: { node: 'eq', port: 'a' } },
    ]);
  });

  it('prunes every wire when the new text does not parse, visibly rather than silently', () => {
    const wired = connect(
      { ...base, nodes: [...base.nodes, closure('eq', 'a + b', 400, 0)] },
      { node: 'a', port: 'value' },
      { node: 'eq', port: 'a' },
    );
    const edited = setClosureExpression(wired, 'eq', 'a + * b');
    expect(edited.edges).toEqual([]);
    const node = edited.nodes.find((entry) => entry.id === 'eq') as ClosureNode;
    expect(node.expression).toBe('a + * b');
  });
});
