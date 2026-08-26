/** Canvas-only projection helpers for collapsed grouping frames. */

import type { Edge, GraphDocument } from '@joveworks/schema';

export interface GroupPort {
  readonly nodeId: string;
  readonly port: string;
  readonly label: string;
}

export interface GroupPorts {
  readonly inputs: readonly GroupPort[];
  readonly outputs: readonly GroupPort[];
}

export interface CollapsedGroupSize {
  readonly width: number;
  readonly height: number;
}

const HEADER_HEIGHT = 32;
const PORT_HEIGHT = 24;
const GROUP_WIDTH = 260;

function frameById(document: GraphDocument, id: string) {
  return document.frames.find((frame) => frame.id === id);
}

/** Every node structurally inside a frame, including nested groups. */
export function nodesInGroup(document: GraphDocument, groupId: string): ReadonlySet<string> {
  const frames = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const frame of document.frames) {
      if (frame.frameId !== undefined && frames.has(frame.frameId) && !frames.has(frame.id)) {
        frames.add(frame.id);
        changed = true;
      }
    }
  }
  return new Set(document.nodes.filter((node) => node.frameId !== undefined && frames.has(node.frameId)).map((node) => node.id));
}

/** The outermost collapsed ancestor that replaces a node on the canvas. */
export function collapsedGroupForNode(
  document: GraphDocument,
  collapsed: ReadonlySet<string>,
  nodeId: string,
): string | undefined {
  let frameId = document.nodes.find((node) => node.id === nodeId)?.frameId;
  let result: string | undefined;
  const seen = new Set<string>();
  while (frameId !== undefined && !seen.has(frameId)) {
    seen.add(frameId);
    const frame = frameById(document, frameId);
    if (frame === undefined) return result;
    if (frame.kind === 'group' && collapsed.has(frame.id)) result = frame.id;
    frameId = frame.frameId;
  }
  return result;
}

/** Directly visible port labels for a collapsed group. */
export function groupPorts(document: GraphDocument, groupId: string): GroupPorts {
  const members = nodesInGroup(document, groupId);
  const nodeById = new Map(document.nodes.map((node) => [node.id, node] as const));
  const inputs = new Map<string, GroupPort>();
  const outputs = new Map<string, GroupPort>();
  for (const edge of document.edges) {
    if (members.has(edge.to.node) && !members.has(edge.from.node)) {
      const node = nodeById.get(edge.to.node);
      const key = `${edge.to.node}.${edge.to.port}`;
      inputs.set(key, { nodeId: edge.to.node, port: edge.to.port, label: `${node?.label ?? edge.to.node} · ${edge.to.port}` });
    }
    if (members.has(edge.from.node) && !members.has(edge.to.node)) {
      const node = nodeById.get(edge.from.node);
      const key = `${edge.from.node}.${edge.from.port}`;
      outputs.set(key, { nodeId: edge.from.node, port: edge.from.port, label: `${node?.label ?? edge.from.node} · ${edge.from.port}` });
    }
  }
  return { inputs: [...inputs.values()], outputs: [...outputs.values()] };
}

export function groupPortHandle(kind: 'input' | 'output', port: GroupPort): string {
  return `group-${kind}:${port.nodeId}:${port.port}`;
}

export function collapsedGroupSize(ports: GroupPorts): CollapsedGroupSize {
  return { width: GROUP_WIDTH, height: HEADER_HEIGHT + Math.max(ports.inputs.length, ports.outputs.length, 1) * PORT_HEIGHT };
}

/** Canvas elements hidden behind one or more collapsed groups. */
export function hiddenByCollapsedGroups(
  document: GraphDocument,
  collapsed: ReadonlySet<string>,
): ReadonlySet<string> {
  const hidden = new Set<string>();
  for (const node of document.nodes) {
    if (collapsedGroupForNode(document, collapsed, node.id) !== undefined) hidden.add(node.id);
  }
  for (const frame of document.frames) {
    let parent = frame.frameId;
    const seen = new Set<string>();
    while (parent !== undefined && !seen.has(parent)) {
      seen.add(parent);
      if (collapsed.has(parent)) {
        hidden.add(frame.id);
        break;
      }
      parent = frameById(document, parent)?.frameId;
    }
  }
  return hidden;
}

export function edgeTouchesHiddenNode(edge: Edge, hidden: ReadonlySet<string>): boolean {
  return hidden.has(edge.from.node) || hidden.has(edge.to.node);
}
