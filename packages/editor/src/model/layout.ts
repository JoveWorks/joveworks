/**
 * Auto-arrange: lay the canvas out by graph topology. Inputs left, outputs
 * right, both vertically stacked; everything else placed by longest-path
 * rank and ordered within its column to cut down crossings — the layered
 * algorithm itself lives in `layered-layout.ts`, worked over an abstract
 * block graph. This file only maps a `GraphDocument` onto that abstraction.
 *
 * A frame and all its member nodes still move together as one rigid block —
 * frame membership and internal layout stay untouched — but a frame now
 * participates in ranking as a single compound node, so it can land between
 * loose nodes at whatever column its own external connections place it,
 * rather than living in a row of its own. Internal frame edges are invisible
 * to layering, by construction: they never leave the block they're inside.
 *
 * A loose (unframed) output node is pulled out of the ranked layout
 * entirely and placed in a row underneath it instead. An output node that
 * lives inside a frame is not pulled out — the frame stays a single rigid
 * block regardless of what's inside it.
 *
 * A cyclic document (unreachable through the editor, since connecting an
 * edge that would close one is refused at connect time — but a hand-edited
 * file can still carry one) can't be ranked, so it falls back to the old
 * edge-ignoring grid pack instead of throwing or leaving the button inert.
 */

import type { Frame, GraphDocument, GraphNode, Position } from '@joveworks/schema';

import { GAP, NODE_HEIGHT, NODE_WIDTH } from './layout-constants';
import { computeLayeredPositions, type LayoutBlock, type LayoutEdge } from './layered-layout';

const BLOCKS_PER_ROW = 4;

interface Block {
  readonly key: string;
  readonly origin: Position;
  readonly width: number;
  readonly height: number;
}

function nodeBlock(node: GraphNode): Block {
  return { key: `node:${node.id}`, origin: node.position, width: NODE_WIDTH, height: NODE_HEIGHT };
}

function frameBlock(frame: Frame): Block {
  return { key: `frame:${frame.id}`, origin: frame.position, width: frame.size.width, height: frame.size.height };
}

function applyDeltas(document: GraphDocument, deltaByKey: ReadonlyMap<string, Position>): GraphDocument {
  const frames = document.frames.map((frame) => {
    const delta = deltaByKey.get(`frame:${frame.id}`);
    if (delta === undefined) return frame;
    return { ...frame, position: { x: frame.position.x + delta.x, y: frame.position.y + delta.y } };
  });

  const nodes = document.nodes.map((node) => {
    const delta =
      node.frameId !== undefined ? deltaByKey.get(`frame:${node.frameId}`) : deltaByKey.get(`node:${node.id}`);
    if (delta === undefined) return node;
    return { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } };
  });

  return { ...document, nodes, frames };
}

/** The old edge-ignoring row packer — the fallback for a document that can't be ranked. */
function packGrid(document: GraphDocument): GraphDocument {
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

  return applyDeltas(document, deltaByKey);
}

function blockKeyOf(node: GraphNode): string {
  return node.frameId !== undefined ? `frame:${node.frameId}` : `node:${node.id}`;
}

function buildLayoutBlocks(document: GraphDocument): readonly LayoutBlock[] {
  const membersByFrame = new Map<string, GraphNode[]>();
  for (const node of document.nodes) {
    if (node.frameId === undefined) continue;
    const list = membersByFrame.get(node.frameId);
    if (list === undefined) membersByFrame.set(node.frameId, [node]);
    else list.push(node);
  }

  const frameBlocks: LayoutBlock[] = document.frames.map((frame) => {
    const members = membersByFrame.get(frame.id) ?? [];
    return {
      key: `frame:${frame.id}`,
      width: frame.size.width,
      height: frame.size.height,
      origin: frame.position,
      hasInput: members.some((node) => node.kind === 'input'),
      hasOutput: members.some((node) => node.kind === 'output'),
      bottomRow: false,
    };
  });

  const looseBlocks: LayoutBlock[] = document.nodes
    .filter((node) => node.frameId === undefined)
    .map((node) => ({
      key: `node:${node.id}`,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      origin: node.position,
      hasInput: node.kind === 'input',
      hasOutput: node.kind === 'output',
      bottomRow: node.kind === 'output',
    }));

  return [...frameBlocks, ...looseBlocks];
}

function buildLayoutEdges(document: GraphDocument): readonly LayoutEdge[] {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node] as const));
  const edges: LayoutEdge[] = [];
  for (const edge of document.edges) {
    const from = nodeById.get(edge.from.node);
    const to = nodeById.get(edge.to.node);
    if (from === undefined || to === undefined) continue;
    const fromKey = blockKeyOf(from);
    const toKey = blockKeyOf(to);
    if (fromKey === toKey) continue; // an edge wholly inside one frame doesn't cross its boundary
    edges.push({ from: fromKey, to: toKey });
  }
  return edges;
}

export function autoArrange(document: GraphDocument): GraphDocument {
  const blocks = buildLayoutBlocks(document);
  const edges = buildLayoutEdges(document);
  const result = computeLayeredPositions(blocks, edges);
  if (result.cyclic) return packGrid(document);

  const blockByKey = new Map(blocks.map((block) => [block.key, block] as const));
  const deltaByKey = new Map<string, Position>();
  for (const [key, position] of result.positions) {
    const block = blockByKey.get(key)!;
    deltaByKey.set(key, { x: position.x - block.origin.x, y: position.y - block.origin.y });
  }

  return applyDeltas(document, deltaByKey);
}
