/**
 * Display labels for pack/unpack channels.
 *
 * `in0` and `out0` identify a channel in the saved graph; they are not its
 * meaning. A pack takes that meaning from the port wired into each channel,
 * and an unpack restores the same ordered labels from the pack feeding its
 * bundle.
 */

import { packChannelIndices, waypointChannelIndices } from '@joveworks/kernel';
import type { Endpoint, GraphDocument } from '@joveworks/schema';

import { nodeLabel } from '../model/document';

function incomingEdge(document: GraphDocument, target: Endpoint) {
  return document.edges.find(
    (edge) => edge.to.node === target.node && edge.to.port === target.port,
  );
}

/** The readable name of a source endpoint, following a waypoint when needed. */
function sourceLabel(document: GraphDocument, source: Endpoint): string {
  const node = document.nodes.find((candidate) => candidate.id === source.node);
  if (node === undefined) return source.port;

  // An input's only port is mechanically called `value`; its title carries the
  // useful name a student assigned to the source instead.
  if (node.kind === 'input') return nodeLabel(node);

  // A waypoint does not rename a value, so keep tracing to the real source.
  const match = /^out(\d+)$/u.exec(source.port);
  if (node.kind === 'waypoint' && match !== null) {
    const edge = incomingEdge(document, { node: node.id, port: `in${match[1]}` });
    if (edge !== undefined) return sourceLabel(document, edge.from);
  }

  return source.port;
}

/** Labels for a pack's live channels, in the same order as its bundle. */
export function packChannelLabels(document: GraphDocument, packId: string): readonly string[] {
  return packChannelIndices(document, packId).map((channel) => {
    const edge = incomingEdge(document, { node: packId, port: `in${channel}` });
    return edge === undefined ? `in${channel}` : sourceLabel(document, edge.from);
  });
}

/** Labels for an unpack's outputs, inherited from the pack that feeds it. */
export function unpackChannelLabels(document: GraphDocument, unpackId: string): readonly string[] {
  const edge = incomingEdge(document, { node: unpackId, port: 'bundle' });
  if (edge === undefined) return [];
  return packChannelLabels(document, edge.from.node);
}

/**
 * Labels for a waypoint's own channels, in the same order as its live
 * `inN`/`outN` pairs — a waypoint relays a value unchanged, so one label
 * names both ends of a channel, taken from whatever feeds its `in` side.
 */
export function waypointChannelLabels(document: GraphDocument, waypointId: string): readonly string[] {
  return waypointChannelIndices(document, waypointId).map((channel) => {
    const edge = incomingEdge(document, { node: waypointId, port: `in${channel}` });
    return edge === undefined ? `in${channel}` : sourceLabel(document, edge.from);
  });
}
