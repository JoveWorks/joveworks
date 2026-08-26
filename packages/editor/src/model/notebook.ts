/** Shared rules for turning graph structure into NodeBook reading order and controls. */

import type { GraphDocument, GraphNode, InputNode, Position, SliderValue } from '@joveworks/schema';

import { updateNode } from './document';

export type ExposedSliderInput = InputNode & {
  readonly value: SliderValue;
  readonly exposeInNotebook: true;
};

/** Two near-aligned nodes read left-to-right instead of by incidental sub-pixel y differences. */
const ROW_TOLERANCE = 100;

/** Top-to-bottom, then left-to-right on near-ties — comic-book reading order. */
export function readingOrder(
  a: { readonly position: Position },
  b: { readonly position: Position },
): number {
  const dy = a.position.y - b.position.y;
  return Math.abs(dy) > ROW_TOLERANCE ? dy : a.position.x - b.position.x;
}

/**
 * The NodeBook section that owns a node. Group frames are transparent: walk
 * through nested groups until a section is found. A top-level group therefore
 * behaves like an unframed node in the NodeBook.
 */
export function notebookSectionId(document: GraphDocument, node: GraphNode): string | undefined {
  let frameId = node.frameId;
  const seen = new Set<string>();
  while (frameId !== undefined && !seen.has(frameId)) {
    seen.add(frameId);
    const frame = document.frames.find((candidate) => candidate.id === frameId);
    if (frame === undefined) return undefined;
    if (frame.kind !== 'group') return frame.id;
    frameId = frame.frameId;
  }
  return undefined;
}

function referencedChecks(node: GraphNode): readonly string[] {
  if (node.kind !== 'output') return [];
  switch (node.output.kind) {
    case 'feasibility':
    case 'bestDesign':
    case 'reliability':
      return node.output.checks;
    default:
      return [];
  }
}

/**
 * Exposed slider inputs that structurally influence the given results.
 *
 * Ordinary dependencies are graph edges. Composite report outputs additionally
 * reference Check outputs by id, so those references join the walk exactly as
 * if they were edges. Equation outputs are intentionally excluded: a slider
 * may feed the formula they display, but changing it does not change the
 * rendered expression and presenting a control there would promise an effect
 * the reader cannot see.
 *
 * Several results can be asked about at once — a section presents one set of
 * controls above its results rather than repeating a slider under each result
 * it happens to drive — and the union is deduplicated by node id.
 */
export function exposedSlidersFor(
  document: GraphDocument,
  resultNodeIds: string | readonly string[],
): readonly ExposedSliderInput[] {
  const nodes = new Map(document.nodes.map((node) => [node.id, node] as const));
  const seeds = (typeof resultNodeIds === 'string' ? [resultNodeIds] : resultNodeIds).filter((id) => {
    const target = nodes.get(id);
    return !(target?.kind === 'output' && target.output.kind === 'equation');
  });

  const incoming = new Map<string, string[]>();
  for (const edge of document.edges) {
    const sources = incoming.get(edge.to.node);
    if (sources === undefined) incoming.set(edge.to.node, [edge.from.node]);
    else sources.push(edge.from.node);
  }

  const found = new Map<string, ExposedSliderInput>();
  const seen = new Set<string>();
  const pending = [...seeds];
  while (pending.length > 0) {
    const id = pending.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.get(id);
    if (node === undefined) continue;
    if (
      node.kind === 'input' &&
      node.value.kind === 'slider' &&
      node.exposeInNotebook === true
    ) {
      found.set(node.id, node as ExposedSliderInput);
    }
    pending.push(...(incoming.get(id) ?? []), ...referencedChecks(node));
  }

  return [...found.values()].sort(readingOrder);
}

/** Change the one source value every canvas/notebook/viewer clone reads. */
export function withSliderValue(
  document: GraphDocument,
  sliderId: string,
  value: number,
): GraphDocument {
  return updateNode<InputNode>(document, sliderId, (input) =>
    input.value.kind === 'slider'
      ? { ...input, value: { ...input.value, value } }
      : input,
  );
}
