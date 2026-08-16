/**
 * Auto-arrange: repack the canvas so nothing overlaps, without touching
 * frame membership or wiring. Edges are ignored — this is a packing pass,
 * not a topology-aware layout (see ROADMAP.md's "Auto-arrange the graph").
 *
 * A frame and all its member nodes move together as one rigid block, so
 * "frames keep their contents" holds both in membership (untouched) and in
 * internal layout (untouched) — only a block's outer position changes.
 */

import type { Frame, GraphDocument, GraphNode, Position } from '@mds/schema';

// Mirrors the nominal node footprint `frameAround` already assumes, so a
// frame sized by one code path agrees with spacing computed by this one.
const NODE_WIDTH = 260;
const NODE_HEIGHT = 180;
const GAP = 48;
const BLOCKS_PER_ROW = 4;

interface Block {
  readonly key: string;
  readonly origin: Position;
  readonly width: number;
  readonly height: number;
  readonly frameId?: string;
  readonly nodeId?: string;
}

function nodeBlock(node: GraphNode): Block {
  return {
    key: `node:${node.id}`,
    origin: node.position,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    nodeId: node.id,
  };
}

function frameBlock(frame: Frame): Block {
  return {
    key: `frame:${frame.id}`,
    origin: frame.position,
    width: frame.size.width,
    height: frame.size.height,
    frameId: frame.id,
  };
}

/** Repack frames (with their members) and loose nodes into a non-overlapping grid. */
export function autoArrange(document: GraphDocument): GraphDocument {
  const loose = document.nodes.filter((node) => node.frameId === undefined);
  const blocks = [...document.frames.map(frameBlock), ...loose.map(nodeBlock)].sort(
    (a, b) => a.origin.y - b.origin.y || a.origin.x - b.origin.x,
  );

  const deltaByKey = new Map<string, Position>();
  let rowTop = 0;
  let rowHeight = 0;
  let cursorX = 0;
  let column = 0;
  for (const block of blocks) {
    if (column === BLOCKS_PER_ROW) {
      rowTop += rowHeight + GAP;
      rowHeight = 0;
      cursorX = 0;
      column = 0;
    }
    deltaByKey.set(block.key, { x: cursorX - block.origin.x, y: rowTop - block.origin.y });
    cursorX += block.width + GAP;
    rowHeight = Math.max(rowHeight, block.height);
    column += 1;
  }

  const frames = document.frames.map((frame) => {
    const delta = deltaByKey.get(`frame:${frame.id}`)!;
    return { ...frame, position: { x: frame.position.x + delta.x, y: frame.position.y + delta.y } };
  });

  const nodes = document.nodes.map((node) => {
    const delta =
      node.frameId !== undefined
        ? deltaByKey.get(`frame:${node.frameId}`)
        : deltaByKey.get(`node:${node.id}`);
    if (delta === undefined) return node;
    return { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } };
  });

  return { ...document, nodes, frames };
}
