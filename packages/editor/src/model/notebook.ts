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
 * Exposed slider inputs that structurally influence one rendered result.
 *
 * Ordinary dependencies are graph edges. Composite report outputs additionally
 * reference Check outputs by id, so those references join the walk exactly as
 * if they were edges. Equation outputs are intentionally excluded: a slider
 * may feed the formula they display, but changing it does not change the
 * rendered expression and presenting a control there would promise an effect
 * the reader cannot see.
 */
export function exposedSlidersFor(
  document: GraphDocument,
  resultNodeId: string,
): readonly ExposedSliderInput[] {
  const nodes = new Map(document.nodes.map((node) => [node.id, node] as const));
  const target = nodes.get(resultNodeId);
  if (target?.kind === 'output' && target.output.kind === 'equation') return [];

  const incoming = new Map<string, string[]>();
  for (const edge of document.edges) {
    const sources = incoming.get(edge.to.node);
    if (sources === undefined) incoming.set(edge.to.node, [edge.from.node]);
    else sources.push(edge.from.node);
  }

  const found = new Map<string, ExposedSliderInput>();
  const seen = new Set<string>();
  const pending = [resultNodeId];
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
