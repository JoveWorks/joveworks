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
  type PackNode,
  type UnpackNode,
  type WaypointNode,
} from '@mds/schema';
import { parseUnit } from '@mds/units';

import {
  addNamedColumn,
  addNode,
  changeOutputKind,
  connect,
  duplicateNode,
  duplicateSelection,
  frameAround,
  groupIntoSection,
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

  it('joins a spectrum port instead of replacing it, when told to', () => {
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

  it('duplicates selected nodes with their internal wires and selects the copies', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    const duplicated = duplicateSelection(wired, wired, new Set(['a', 'b']));

    expect([...duplicated.ids]).toEqual(['a2', 'b2']);
    expect(duplicated.document.nodes.map((node) => node.id)).toEqual(['a', 'b', 'a2', 'b2']);
    expect(duplicated.document.edges.at(-1)).toEqual({
      id: 'a2.value->b2.x',
      from: { node: 'a2', port: 'value' },
      to: { node: 'b2', port: 'x' },
    });
  });

  it('copies only wires wholly inside the selection', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    const duplicated = duplicateSelection(wired, wired, new Set(['a']));
    expect(duplicated.document.edges).toEqual(wired.edges);
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

  describe('groupIntoSection — "Group into new section", selection-aware', () => {
    it('frames only the selected nodes, not every free one in the document', () => {
      const grouped = groupIntoSection(base, new Set(['a']), { x: 999, y: 999 });
      expect(grouped.nodes.find((node) => node.id === 'a')?.frameId).toBeDefined();
      expect(grouped.nodes.find((node) => node.id === 'b')?.frameId).toBeUndefined();
    });

    it('ignores ids in the selection that are not document nodes (an edge or a frame)', () => {
      const grouped = groupIntoSection(base, new Set(['a', 'some-edge-id']), { x: 999, y: 999 });
      expect(grouped.frames).toHaveLength(1);
      expect(grouped.nodes.find((node) => node.id === 'a')?.frameId).toBeDefined();
    });

    it('spawns an empty section at the given position rather than sweeping every free node', () => {
      const grouped = groupIntoSection(base, new Set(), { x: 123, y: 456 });
      expect(grouped.frames).toHaveLength(1);
      expect(grouped.frames[0]?.position).toEqual({ x: 123, y: 456 });
      expect(grouped.nodes.every((node) => node.frameId === undefined)).toBe(true);
    });
  });
});

describe('table output columns', () => {
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

describe('removeNodes — splicing a deleted routing node', () => {
  const waypoint = (id: string, x: number, y: number): WaypointNode => ({
    kind: 'waypoint',
    id,
    position: { x, y },
  });
  const pack = (id: string, x: number, y: number): PackNode => ({ kind: 'pack', id, position: { x, y } });
  const unpack = (id: string, x: number, y: number): UnpackNode => ({
    kind: 'unpack',
    id,
    position: { x, y },
  });

  it('reconnects a waypoint’s source directly to its target when the waypoint is deleted', () => {
    const wired = connect(
      connect(
        { ...base, nodes: [...base.nodes, waypoint('via', 200, 0)] },
        { node: 'a', port: 'value' },
        { node: 'via', port: 'in' },
      ),
      { node: 'via', port: 'out' },
      { node: 'b', port: 'x' },
    );
    const spliced = removeNodes(wired, new Set(['via']));
    expect(spliced.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(spliced.edges).toEqual([
      { id: 'a.value->b.x', from: { node: 'a', port: 'value' }, to: { node: 'b', port: 'x' } },
    ]);
  });

  it('reconnects every upstream source to every downstream target, fan-in and fan-out alike', () => {
    const withWaypoint = { ...base, nodes: [...base.nodes, waypoint('via', 200, 0)] };
    const wired = connect(
      connect(
        connect(withWaypoint, { node: 'a', port: 'value' }, { node: 'via', port: 'in' }, true),
        { node: 'b', port: 'value' },
        { node: 'via', port: 'in' },
        true,
      ),
      { node: 'via', port: 'out' },
      { node: 'a', port: 'x' },
    );
    const spliced = removeNodes(wired, new Set(['via']));
    const pairs = spliced.edges
      .map((edge) => `${edge.from.node}->${edge.to.node}`)
      .sort();
    expect(pairs).toEqual(['a->a', 'b->a']);
  });

  it('reconnects a pack/unpack pair channel by channel, in fan-out to several unpacks', () => {
    const withNodes = {
      ...base,
      nodes: [...base.nodes, pack('bundle', 200, 0), unpack('splitA', 400, 0), unpack('splitB', 400, 100)],
    };
    let wired = withNodes;
    wired = connect(wired, { node: 'a', port: 'value' }, { node: 'bundle', port: 'in0' });
    wired = connect(wired, { node: 'b', port: 'value' }, { node: 'bundle', port: 'in1' });
    wired = connect(wired, { node: 'bundle', port: 'bundle' }, { node: 'splitA', port: 'bundle' });
    wired = connect(wired, { node: 'bundle', port: 'bundle' }, { node: 'splitB', port: 'bundle' });
    // splitA forwards both channels; splitB only channel 0, onto a distinct
    // port so its edge does not collide with splitA's own.
    wired = connect(wired, { node: 'splitA', port: 'out0' }, { node: 'a', port: 'x' });
    wired = connect(wired, { node: 'splitA', port: 'out1' }, { node: 'b', port: 'x' });
    wired = connect(wired, { node: 'splitB', port: 'out0' }, { node: 'a', port: 'y' });

    // Delete the pack — the splice adds a direct edge from each channel's
    // upstream source to each fed unpack's own downstream target, channel
    // by channel: channel 0 (`a`) fans out to both splitA's and splitB's
    // downstream targets, channel 1 (`b`) only to splitA's. The unpack
    // nodes themselves are not deleted (only `bundle` was), so their own
    // — now orphaned — downstream edges are left in place alongside the
    // new direct ones, exactly as any other node's edges survive a
    // neighbour's deletion.
    const afterPackDeleted = removeNodes(wired, new Set(['bundle']));
    const pairsFromPackDelete = afterPackDeleted.edges
      .map((edge) => `${edge.from.node}->${edge.to.node}`)
      .sort();
    expect(pairsFromPackDelete).toEqual(['a->a', 'a->a', 'b->b', 'splitA->a', 'splitA->b', 'splitB->a']);

    // Deleting one unpack out of several sharing a pack only touches that
    // unpack's own downstream edges — splitB's out0 (fed by channel 0, `a`)
    // reconnects; splitA and the pack itself are untouched.
    const afterUnpackDeleted = removeNodes(wired, new Set(['splitB']));
    expect(afterUnpackDeleted.nodes.some((node) => node.id === 'bundle')).toBe(true);
    expect(afterUnpackDeleted.nodes.some((node) => node.id === 'splitA')).toBe(true);
    expect(
      afterUnpackDeleted.edges.some(
        (edge) => edge.from.node === 'a' && edge.from.port === 'value' && edge.to.node === 'a' && edge.to.port === 'y',
      ),
    ).toBe(true);
  });

  it('drops an unwired channel with nothing synthesized, the same as any other unwired port', () => {
    const withNodes = { ...base, nodes: [...base.nodes, pack('bundle', 200, 0), unpack('split', 400, 0)] };
    const wired = connect(
      connect(
        connect(withNodes, { node: 'a', port: 'value' }, { node: 'bundle', port: 'in0' }),
        { node: 'bundle', port: 'bundle' },
        { node: 'split', port: 'bundle' },
      ),
      { node: 'split', port: 'out0' },
      { node: 'b', port: 'x' },
    );
    // Channel 0 is wired both sides and splices; there is no channel 1 at
    // all, so nothing is synthesized for it.
    const spliced = removeNodes(wired, new Set(['bundle', 'split']));
    expect(spliced.edges).toEqual([]);
  });

  it('falls back to the ordinary no-splice delete when a batch deletes more than one routing node', () => {
    const withNodes = { ...base, nodes: [...base.nodes, waypoint('via1', 200, 0), waypoint('via2', 200, 100)] };
    const wired = connect(
      connect(
        connect(
          connect(withNodes, { node: 'a', port: 'value' }, { node: 'via1', port: 'in' }),
          { node: 'via1', port: 'out' },
          { node: 'via2', port: 'in' },
        ),
        { node: 'via2', port: 'out' },
        { node: 'b', port: 'x' },
      ),
      { node: 'a', port: 'value' },
      { node: 'via2', port: 'in' },
      true,
    );
    const spliced = removeNodes(wired, new Set(['via1', 'via2']));
    // No splice attempted for a multi-routing-node batch: every edge that
    // touched either deleted node is simply gone, same as deleting any
    // other pair of ordinary nodes would leave.
    expect(spliced.edges).toEqual([]);
    expect(spliced.nodes.map((node) => node.id)).toEqual(['a', 'b']);
  });
});
