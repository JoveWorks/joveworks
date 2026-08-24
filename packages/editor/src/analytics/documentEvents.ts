/** Classify deliberate structural edits without inspecting graph content. */

import { isRange, type GraphDocument, type GraphNode } from '@joveworks/schema';

import type { AnalyticsEvent, AnalyticsNodeKind } from './analytics';

function nodeKind(node: GraphNode): AnalyticsNodeKind {
  return node.kind;
}

function outputEvent(node: GraphNode): AnalyticsEvent | undefined {
  if (node.kind !== 'output') return undefined;
  if (node.output.kind === 'plot') return { name: 'plot_created', props: { mode: node.output.contour ? 'contour' : 'line' } };
  if (node.output.kind === 'table') return { name: 'table_created' };
  if (node.output.kind === 'check') return { name: 'check_created' };
  return undefined;
}

/** Events caused by one editor transaction. Never returns graph data. */
export function documentEvents(before: GraphDocument, after: GraphDocument): readonly AnalyticsEvent[] {
  const events: AnalyticsEvent[] = [];
  const previous = new Map(before.nodes.map((node) => [node.id, node]));

  for (const node of after.nodes) {
    const old = previous.get(node.id);
    if (old === undefined) {
      events.push({ name: 'node_added', props: { kind: nodeKind(node) } });
      const output = outputEvent(node);
      if (output !== undefined) events.push(output);
      continue;
    }
    if (node.kind === 'input' && old.kind === 'input' && node.value.kind !== old.value.kind && isRange(node.value)) {
      events.push({ name: 'sweep_configured', props: { kind: node.value.kind } });
    }
    const oldOutput = outputEvent(old);
    const newOutput = outputEvent(node);
    if (newOutput !== undefined && JSON.stringify(newOutput) !== JSON.stringify(oldOutput)) events.push(newOutput);
  }

  const oldFrames = new Set(before.frames.map((frame) => frame.id));
  for (const frame of after.frames) {
    if (!oldFrames.has(frame.id)) events.push({ name: 'node_added', props: { kind: 'frame' } });
  }

  const oldEdges = new Set(before.edges.map((edge) => edge.id));
  for (const edge of after.edges) {
    if (!oldEdges.has(edge.id)) events.push({ name: 'nodes_connected' });
  }
  return events;
}
