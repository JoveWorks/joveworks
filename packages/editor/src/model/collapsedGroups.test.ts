import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, type GraphDocument, type GraphNode } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import { collapsedGroupForNode, groupPorts, hiddenByCollapsedGroups } from './collapsedGroups';

const input = (id: string, frameId?: string): GraphNode => ({
  kind: 'input', id, position: { x: 0, y: 0 }, value: { kind: 'scalar', value: 1, unit: parseUnit('') }, ...(frameId === undefined ? {} : { frameId }),
});

const document: GraphDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'groups',
  title: 'Groups',
  nodes: [input('outside'), input('inner', 'group'), input('nested', 'child'), input('sink')],
  edges: [
    { id: 'in', from: { node: 'outside', port: 'value' }, to: { node: 'inner', port: 'a' } },
    { id: 'internal', from: { node: 'inner', port: 'value' }, to: { node: 'nested', port: 'b' } },
    { id: 'out', from: { node: 'nested', port: 'value' }, to: { node: 'sink', port: 'value' } },
  ],
  frames: [
    { id: 'section', title: 'Section', position: { x: 0, y: 0 }, size: { width: 600, height: 400 } },
    { id: 'group', kind: 'group', frameId: 'section', title: 'Group', position: { x: 20, y: 20 }, size: { width: 400, height: 300 } },
    { id: 'child', kind: 'group', frameId: 'group', title: 'Child', position: { x: 40, y: 40 }, size: { width: 200, height: 150 } },
  ],
};

describe('collapsed groups', () => {
  it('derives the group interface from crossing edges, not internal wires', () => {
    expect(groupPorts(document, 'group')).toEqual({
      inputs: [{ nodeId: 'inner', port: 'a', label: 'inner · a' }],
      outputs: [{ nodeId: 'nested', port: 'value', label: 'nested · value' }],
    });
  });

  it('uses the outermost collapsed group to replace a nested node', () => {
    expect(collapsedGroupForNode(document, new Set(['child']), 'nested')).toBe('child');
    expect(collapsedGroupForNode(document, new Set(['group', 'child']), 'nested')).toBe('group');
  });

  it('hides descendants but leaves the collapsed group itself visible', () => {
    expect(hiddenByCollapsedGroups(document, new Set(['group']))).toEqual(new Set(['inner', 'nested', 'child']));
  });
});
