/**
 * The document edits, which are the only thing the canvas can do to a graph.
 *
 * The fixtures are invented — `a`, `b`, a frame — and deliberately carry no
 * formula at all: these functions never look at one, and a catalogue record here
 * would be a citation for someone to copy (CLAUDE.md).
 */

import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_SCHEMA_VERSION,
  type ClosureNode,
  type FormulaNode,
  type GraphDocument,
  type GraphNode,
  type InputNode,
  type OutputNode,
  type PackNode,
  type UnpackNode,
  type WaypointNode,
} from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import {
  addNamedColumn,
  addPlotMeasure,
  addNode,
  changeOutputKind,
  connect,
  defaultOutput,
  duplicateNode,
  duplicateSelection,
  frameAround,
  frameDescendantIds,
  groupIntoGroup,
  groupIntoSection,
  moveFrameContents,
  moveFrame,
  nodeLabel,
  pruneEdgesTo,
  reframe,
  relabelColumn,
  removeColumn,
  removePlotMeasure,
  removeEdges,
  removeNodes,
  renameColumn,
  renameNode,
  reorderFrame,
  reorderColumn,
  setClosureExpression,
  setColumnFigures,
  syncColumnLabels,
  toggleCandidate,
  uniqueId,
  updateNode,
} from './document';

const input = (id: string, x: number, y: number): InputNode => ({
  kind: 'input',
  id,
  position: { x, y },
  value: { kind: 'scalar', value: 1, unit: parseUnit('mm') },
});

describe('Plot measure port lifecycle', () => {
  const plotNode = (): OutputNode => ({
    kind: 'output', id: 'plot', position: { x: 200, y: 0 }, output: { kind: 'plot', measures: [] },
  });

  it('adds stable value ids while keeping reader labels separate', () => {
    const document = { ...base, nodes: [...base.nodes, plotNode()] };
    const first = addPlotMeasure(document, 'plot', 'stress');
    const second = addPlotMeasure(first.document, 'plot', 'mass');
    const plot = second.document.nodes.find((node) => node.id === 'plot') as OutputNode;
    expect(plot.output.kind === 'plot' ? plot.output.measures : []).toEqual([
      { id: 'value', label: 'stress' },
      { id: 'value2', label: 'mass' },
    ]);
  });

  it('removes both a measure and its paired threshold edge', () => {
    const document = { ...base, nodes: [...base.nodes, plotNode()] };
    const added = addPlotMeasure(addPlotMeasure(document, 'plot', 'stress').document, 'plot', 'mass').document;
    const wired = connect(
      connect(added, { node: 'a', port: 'value' }, { node: 'plot', port: 'value2' }),
      { node: 'b', port: 'value' },
      { node: 'plot', port: 'value2Threshold' },
    );
    const removed = removePlotMeasure(wired, 'plot', 'value2');
    expect(removed.edges).toEqual([]);
    const plot = removed.nodes.find((node) => node.id === 'plot') as OutputNode;
    expect(plot.output.kind === 'plot' ? plot.output.measures : []).toEqual([{ id: 'value', label: 'stress' }]);
  });

  it('adopts one value when switching into Plot and prunes extras when leaving', () => {
    const withOutput = { ...base, nodes: [...base.nodes, printOutput('result', 200, 0)] };
    const wired = connect(withOutput, { node: 'a', port: 'value' }, { node: 'result', port: 'value' });
    const plotted = changeOutputKind(wired, 'result', defaultOutput('plot'));
    const plot = plotted.nodes.find((node) => node.id === 'result') as OutputNode;
    expect(plot.output.kind === 'plot' ? plot.output.measures?.[0]?.id : undefined).toBe('value');
    const withSecond = addPlotMeasure(plotted, 'result', 'second').document;
    const multi = connect(withSecond, { node: 'b', port: 'value' }, { node: 'result', port: 'value2' });
    const printed = changeOutputKind(multi, 'result', defaultOutput('print'));
    expect(printed.edges.map((edge) => edge.to.port)).toEqual(['value']);
  });

  it('adopts the first remaining stable port after the original measure was removed', () => {
    const document = { ...base, nodes: [...base.nodes, plotNode()] };
    const added = addPlotMeasure(addPlotMeasure(document, 'plot', 'first').document, 'plot', 'second').document;
    const wired = connect(added, { node: 'b', port: 'value' }, { node: 'plot', port: 'value2' });
    const withoutFirst = removePlotMeasure(wired, 'plot', 'value');
    const printed = changeOutputKind(withoutFirst, 'plot', defaultOutput('print'));
    expect(printed.edges).toEqual([
      { id: 'b.value->plot.value', from: { node: 'b', port: 'value' }, to: { node: 'plot', port: 'value' } },
    ]);
  });
});

const range = (id: string, x: number, y: number): GraphNode => ({
  kind: 'range',
  id,
  position: { x, y },
  spacing: 'linear',
  start: 0,
  stop: 1,
  count: 5,
  unit: parseUnit(''),
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
  schemaVersion: DOCUMENT_SCHEMA_VERSION,
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
    expect(duplicated.document.nodes.slice(-2).map((node) => node.position)).toEqual([
      { x: 32, y: 32 },
      { x: 432, y: 32 },
    ]);
    expect(duplicated.document.edges.at(-1)).toEqual({
      id: 'a2.value->b2.x',
      from: { node: 'a2', port: 'value' },
      to: { node: 'b2', port: 'x' },
    });
  });

  it('pastes a selection at an anchor while preserving its relative layout', () => {
    const spaced = {
      ...base,
      nodes: [input('a', 100, 80), input('b', 260, 200)],
    };
    const pasted = duplicateSelection(
      spaced,
      spaced,
      new Set(['a', 'b']),
      false,
      { x: 500, y: 400 },
    );

    expect(pasted.document.nodes.slice(-2).map((node) => node.position)).toEqual([
      { x: 500, y: 400 },
      { x: 660, y: 520 },
    ]);
  });

  it('leaves edges alone when duplicating a node with no incoming wire', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    const duplicated = duplicateSelection(wired, wired, new Set(['a']), true);
    expect(duplicated.document.edges).toEqual(wired.edges);
  });

  it('leaves a pasted node unwired even though its source had an external input (paste is not duplicate)', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    const duplicated = duplicateSelection(wired, wired, new Set(['b']));
    expect(duplicated.document.edges).toEqual(wired.edges);
  });

  it('reconnects a duplicate to the same external source that feeds the original, only when asked to', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    const duplicated = duplicateSelection(wired, wired, new Set(['b']), true);
    expect(duplicated.document.edges.at(-1)).toEqual({
      id: 'a.value->b2.x',
      from: { node: 'a', port: 'value' },
      to: { node: 'b2', port: 'x' },
    });
  });

  it('does not reconnect to an external source absent from the target document', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    const empty: GraphDocument = { ...base, nodes: [] };
    const duplicated = duplicateSelection(empty, wired, new Set(['b']), true);
    expect(duplicated.document.edges).toEqual([]);
  });

  it('duplicating a single node reconnects its incoming wire but not its outgoing one', () => {
    const wired = connect(base, { node: 'a', port: 'value' }, { node: 'b', port: 'x' });
    const duplicated = duplicateNode(wired, 'b');
    expect(duplicated.edges.at(-1)).toEqual({
      id: 'a.value->b2.x',
      from: { node: 'a', port: 'value' },
      to: { node: 'b2', port: 'x' },
    });

    const duplicatedSource = duplicateNode(wired, 'a');
    expect(duplicatedSource.edges).toEqual(wired.edges);
  });

  it('duplicating a range node reconnects its wired count port to the same source, kind-agnostic like every other node', () => {
    const withRange = addNode(base, range('r', 200, 0));
    const wired = connect(withRange, { node: 'a', port: 'value' }, { node: 'r', port: 'count' });
    const duplicated = duplicateNode(wired, 'r');
    expect(duplicated.edges.at(-1)).toEqual({
      id: 'a.value->r2.count',
      from: { node: 'a', port: 'value' },
      to: { node: 'r2', port: 'count' },
    });
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

  describe('nested group frames', () => {
    const section = {
      id: 'section',
      title: 'Section',
      position: { x: -100, y: -100 },
      size: { width: 800, height: 400 },
    } as const;

    it('puts a group and its nodes inside the surrounding section', () => {
      const grouped = groupIntoGroup({ ...base, frames: [section] }, new Set(['a']), { x: 999, y: 999 });
      const group = grouped.frames.find((frame) => frame.kind === 'group');
      expect(group?.frameId).toBe('section');
      expect(grouped.nodes.find((node) => node.id === 'a')?.frameId).toBe(group?.id);
      expect(grouped.nodes.find((node) => node.id === 'b')?.frameId).toBe('section');
    });

    it('wraps a selected section in a canvas-only group without changing its NodeBook role', () => {
      const grouped = groupIntoGroup({ ...base, frames: [section] }, new Set(['section']), { x: 999, y: 999 });
      const group = grouped.frames.find((frame) => frame.kind === 'group');
      expect(group).toBeDefined();
      expect(grouped.frames.find((frame) => frame.id === 'section')?.frameId).toBe(group?.id);
      expect(grouped.nodes.every((node) => node.frameId === 'section')).toBe(true);
    });

    it('makes repeated grouping visibly wrap the prior group instead of tracing its border', () => {
      const once = groupIntoGroup({ ...base, frames: [section] }, new Set(['a']), { x: 999, y: 999 });
      const inner = once.frames.find((frame) => frame.kind === 'group')!;
      const twice = groupIntoGroup(once, new Set(['a']), { x: 999, y: 999 });
      const outer = twice.frames.find((frame) => frame.id !== inner.id && frame.kind === 'group')!;
      expect(twice.frames.find((frame) => frame.id === inner.id)?.frameId).toBe(outer.id);
      expect(outer.size.width).toBeGreaterThan(inner.size.width);
      expect(outer.size.height).toBeGreaterThan(inner.size.height);
    });

    it('keeps an oversized group nested by its title anchor', () => {
      const outer = { ...section, id: 'outer', kind: 'group' as const, size: { width: 300, height: 200 } };
      const child = { ...outer, id: 'child', position: { x: 0, y: 0 }, size: { width: 600, height: 400 } };
      const reframed = reframe({ ...base, frames: [outer, child] });
      expect(reframed.frames.find((frame) => frame.id === 'child')?.frameId).toBe('outer');
    });

    it('moves every nested group and node with a parent frame', () => {
      const nested = groupIntoGroup({ ...base, frames: [section] }, new Set(['a']), { x: 999, y: 999 });
      const group = nested.frames.find((frame) => frame.kind === 'group')!;
      const moved = moveFrameContents(nested, 'section', 20, 30);
      expect(moved.frames.find((frame) => frame.id === group.id)?.position).toEqual({
        x: group.position.x + 20,
        y: group.position.y + 30,
      });
      expect(moved.nodes.find((node) => node.id === 'a')?.position).toEqual({ x: 20, y: 30 });
      expect(moved.nodes.find((node) => node.id === 'b')?.position).toEqual({ x: 420, y: 30 });
      expect(frameDescendantIds(nested, 'section')).toEqual(new Set(['section', group.id]));
    });

    it('detaches nested groups when their parent section is deleted', () => {
      const nested = groupIntoGroup({ ...base, frames: [section] }, new Set(['a']), { x: 999, y: 999 });
      const remaining = removeNodes(nested, new Set(['section']));
      expect(remaining.frames).toHaveLength(1);
      expect(remaining.frames[0]?.frameId).toBeUndefined();
    });

    it('reorders sections without turning groups into notebook entries or burying their canvas layer', () => {
      const second = { ...section, id: 'second', title: 'Second', position: { x: 800, y: -100 } };
      const nested = groupIntoGroup({ ...base, frames: [section, second] }, new Set(['a']), { x: 999, y: 999 });
      const moved = moveFrame(nested, 'section', 'down');
      expect(moved.frames.map((frame) => frame.id)).toEqual(['second', 'section', 'group']);
      const reordered = reorderFrame(moved, 'section', 'second', 'before');
      expect(reordered.frames.map((frame) => frame.id)).toEqual(['section', 'second', 'group']);
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

  it('sets and clears a column figures count, edited in the notebook rather than the node panel', () => {
    const figured = setColumnFigures(withTable, 't', 'value', 2);
    const node = figured.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(node.output.kind === 'table' && node.output.figures).toEqual({ value: 2 });

    const cleared = setColumnFigures(figured, 't', 'value', undefined);
    const clearedNode = cleared.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(clearedNode.output.kind === 'table' && clearedNode.output.figures).toBeUndefined();
  });

  it('carries a column figures count forward across a rename, and drops it on removal', () => {
    const figured = setColumnFigures(withTable, 't', 'value', 2);
    const renamed = renameColumn(figured, 't', 'value', 'width');
    const renamedNode = renamed.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(renamedNode.output.kind === 'table' && renamedNode.output.figures).toEqual({ width: 2 });

    const removed = removeColumn(figured, 't', 'value');
    const removedNode = removed.nodes.find((entry) => entry.id === 't') as OutputNode;
    expect(removedNode.output.kind === 'table' && removedNode.output.figures).toBeUndefined();
  });

});

describe('toggleCandidate — one marked design, document-wide', () => {
  const base: GraphDocument = { schemaVersion: 1, id: 'd', title: 'T', nodes: [], edges: [], frames: [] };

  it('marks a candidate and unmarks the same one again', () => {
    const marked = toggleCandidate(base, { at: { d: 40 } });
    expect(marked.marks).toEqual([{ at: { d: 40 } }]);

    // Removing the last mark drops the field rather than leaving an empty
    // array behind, the same way every other optional field here is handled.
    expect(toggleCandidate(marked, { at: { d: 40 } }).marks).toBeUndefined();
  });

  it('matches by coordinate, not by object identity', () => {
    const marked = toggleCandidate(base, { at: { d: 40, T: 80 } });
    // A different object, the same design — this is the case a per-figure mark
    // could never get right, because each figure would hold its own copy.
    expect(toggleCandidate(marked, { at: { T: 80, d: 40 } }).marks).toBeUndefined();
  });

  it('does not confuse a design with one that names more axes', () => {
    const marked = toggleCandidate(base, { at: { d: 40 } });
    const both = toggleCandidate(marked, { at: { d: 40, T: 80 } });
    expect(both.marks).toHaveLength(2);
  });

  it('appends, so an earlier mark keeps its letter when a later one is added', () => {
    const first = toggleCandidate(base, { at: { d: 40 } });
    const second = toggleCandidate(first, { at: { d: 50 } });
    expect(second.marks?.[0]).toEqual({ at: { d: 40 } });
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

  it('prunes the stale value edge entering `feasibility` — the one kind that goes to zero ports', () => {
    const doc: GraphDocument = { ...base, nodes: [...base.nodes, areaFormula, printOutput('result', 400, 0)] };
    const wired = connect(doc, { node: 'area', port: 'product' }, { node: 'result', port: 'value' });
    const switched = changeOutputKind(wired, 'result', { kind: 'feasibility', checks: [] });
    const node = switched.nodes.find((entry) => entry.id === 'result') as OutputNode;
    expect(node.output).toEqual({ kind: 'feasibility', checks: [] });
    expect(switched.edges).toEqual([]);
  });
});

describe('defaultOutput — the shared default per output kind', () => {
  it('gives a feasibility output an empty checks list', () => {
    expect(defaultOutput('feasibility')).toEqual({ kind: 'feasibility', checks: [] });
  });

  it('gives a sensitivity output no fields at all', () => {
    expect(defaultOutput('sensitivity')).toEqual({ kind: 'sensitivity' });
  });

  it("uses the context unit for a check's typed threshold, when one is given", () => {
    const output = defaultOutput('check', parseUnit('N/mm²'));
    expect(output.kind === 'check' && output.threshold.unit.symbol).toBe('N/mm²');
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
        { node: 'via', port: 'in0' },
      ),
      { node: 'via', port: 'out0' },
      { node: 'b', port: 'x' },
    );
    const spliced = removeNodes(wired, new Set(['via']));
    expect(spliced.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(spliced.edges).toEqual([
      { id: 'a.value->b.x', from: { node: 'a', port: 'value' }, to: { node: 'b', port: 'x' } },
    ]);
  });

  it('reconnects each waypoint channel only to its matching downstream target', () => {
    const withWaypoint = { ...base, nodes: [...base.nodes, waypoint('via', 200, 0)] };
    const wired = connect(
      connect(
        connect(withWaypoint, { node: 'a', port: 'value' }, { node: 'via', port: 'in0' }),
        { node: 'b', port: 'value' },
        { node: 'via', port: 'in1' },
      ),
      { node: 'via', port: 'out1' },
      { node: 'a', port: 'x' },
    );
    const spliced = removeNodes(wired, new Set(['via']));
    const pairs = spliced.edges
      .map((edge) => `${edge.from.node}->${edge.to.node}`)
      .sort();
    expect(pairs).toEqual(['b->a']);
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
          connect(withNodes, { node: 'a', port: 'value' }, { node: 'via1', port: 'in0' }),
          { node: 'via1', port: 'out0' },
          { node: 'via2', port: 'in0' },
        ),
        { node: 'via2', port: 'out0' },
        { node: 'b', port: 'x' },
      ),
      { node: 'a', port: 'value' },
      { node: 'via2', port: 'in1' },
    );
    const spliced = removeNodes(wired, new Set(['via1', 'via2']));
    // No splice attempted for a multi-routing-node batch: every edge that
    // touched either deleted node is simply gone, same as deleting any
    // other pair of ordinary nodes would leave.
    expect(spliced.edges).toEqual([]);
    expect(spliced.nodes.map((node) => node.id)).toEqual(['a', 'b']);
  });
});
