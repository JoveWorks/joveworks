/**
 * Selection-only canvas commands.
 *
 * Selection is deliberately supplied as a set of document node ids: edges and
 * frames may also be selected by React Flow, but neither is silently pulled
 * into these commands. Nodes are partitioned by section membership so an
 * alignment or layout can never move a node into another notebook section.
 */

import type { GraphDocument, GraphNode } from '@mds/schema';

import { GAP, NODE_HEIGHT, NODE_WIDTH } from './layout-constants';
import { autoArrange } from './layout';

export type Alignment =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'horizontal-centre'
  | 'vertical-centre';

export interface NodeSize {
  readonly width: number;
  readonly height: number;
}

export type NodeSizes = ReadonlyMap<string, NodeSize>;

function selectedGroups(document: GraphDocument, selected: ReadonlySet<string>): GraphNode[][] {
  const groups = new Map<string, GraphNode[]>();
  for (const node of document.nodes) {
    if (!selected.has(node.id)) continue;
    const key = node.frameId ?? '';
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [node]);
    else group.push(node);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function sizeOf(node: GraphNode, sizes: NodeSizes): NodeSize {
  return sizes.get(node.id) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
}

/** Align selected nodes without crossing section boundaries. */
export function alignSelection(
  document: GraphDocument,
  selected: ReadonlySet<string>,
  alignment: Alignment,
  sizes: NodeSizes = new Map(),
): GraphDocument {
  const positions = new Map<string, GraphNode['position']>();
  for (const group of selectedGroups(document, selected)) {
    const left = Math.min(...group.map((node) => node.position.x));
    const right = Math.max(...group.map((node) => node.position.x + sizeOf(node, sizes).width));
    const top = Math.min(...group.map((node) => node.position.y));
    const bottom = Math.max(...group.map((node) => node.position.y + sizeOf(node, sizes).height));
    const centreX = (left + right) / 2;
    const centreY = (top + bottom) / 2;

    for (const node of group) {
      const size = sizeOf(node, sizes);
      const x =
        alignment === 'left'
          ? left
          : alignment === 'right'
            ? right - size.width
            : alignment === 'horizontal-centre'
              ? centreX - size.width / 2
              : node.position.x;
      const y =
        alignment === 'top'
          ? top
          : alignment === 'bottom'
            ? bottom - size.height
            : alignment === 'vertical-centre'
              ? centreY - size.height / 2
              : node.position.y;
      positions.set(node.id, { x, y });
    }
  }
  return positions.size === 0
    ? document
    : {
        ...document,
        nodes: document.nodes.map((node) => {
          const position = positions.get(node.id);
          return position === undefined ? node : { ...node, position };
        }),
      };
}

/**
 * Arrange only the selected nodes. The induced graph is laid out with the
 * normal crossing-reducing layered algorithm, then translated back to the
 * selection's old top-left so the command does not jump to the canvas origin.
 */
export function arrangeSelection(
  document: GraphDocument,
  selected: ReadonlySet<string>,
): GraphDocument {
  const positions = new Map<string, GraphNode['position']>();
  for (const group of selectedGroups(document, selected)) {
    const ids = new Set(group.map((node) => node.id));
    const left = Math.min(...group.map((node) => node.position.x));
    const top = Math.min(...group.map((node) => node.position.y));
    const isolated: GraphDocument = {
      ...document,
      nodes: group.map(({ frameId: _frameId, ...node }) => node),
      edges: document.edges.filter((edge) => ids.has(edge.from.node) && ids.has(edge.to.node)),
      frames: [],
    };
    const arranged = autoArrange(isolated);
    const arrangedLeft = Math.min(...arranged.nodes.map((node) => node.position.x));
    const arrangedTop = Math.min(...arranged.nodes.map((node) => node.position.y));
    for (const node of arranged.nodes) {
      positions.set(node.id, {
        x: node.position.x + left - arrangedLeft,
        y: node.position.y + top - arrangedTop,
      });
    }
  }
  if (positions.size === 0) return document;

  const nodes = document.nodes.map((node) => {
    const position = positions.get(node.id);
    return position === undefined ? node : { ...node, position };
  });
  // Keep notebook order stable by never moving a frame's origin. A section
  // grows only when necessary, and only towards its right/bottom edges.
  const frames = document.frames.map((frame) => {
    const members = nodes.filter((node) => node.frameId === frame.id && positions.has(node.id));
    if (members.length === 0) return frame;
    const width = Math.max(
      frame.size.width,
      ...members.map((node) => node.position.x + NODE_WIDTH + GAP - frame.position.x),
    );
    const height = Math.max(
      frame.size.height,
      ...members.map((node) => node.position.y + NODE_HEIGHT + GAP - frame.position.y),
    );
    return width === frame.size.width && height === frame.size.height
      ? frame
      : { ...frame, size: { width, height } };
  });
  return { ...document, nodes, frames };
}
