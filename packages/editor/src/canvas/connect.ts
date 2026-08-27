import { canConnect } from '@joveworks/kernel';
import type { Catalogue, Edge, GraphDocument } from '@joveworks/schema';

import {
  addNamedColumn,
  addPlotMeasure,
  connect,
  edgeId,
  NEW_COLUMN,
  NEW_PLOT_MEASURE,
  nodeLabel,
  relabelColumn,
} from '../model/document';

export type ConnectionResult =
  | {
      readonly ok: true;
      readonly document: GraphDocument;
      /** Re-resolve names against the document current when an edit commits. */
      readonly apply: (current: GraphDocument) => GraphDocument;
    }
  | {
      readonly ok: false;
      /** The attempted edit, retained by quick-add when its new node must remain. */
      readonly document: GraphDocument;
      readonly refusal: { readonly edge: Edge; readonly reason: string };
    };

/**
 * Validate and apply one landed wire, resolving a table's named input first.
 *
 * A table column follows the source node's visible title. Its ghost port must
 * therefore become a real, named port before the kernel can validate the edge;
 * rewiring a real column runs through the same path so its label keeps
 * following its new source. The returned refusal carries that resolved edge,
 * while callers decide whether the attempted document itself should persist.
 */
export function connectResolvingTableColumn(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  candidate: Edge,
  joinSpectrum: boolean,
): ConnectionResult {
  const initialTarget = document.nodes.find((node) => node.id === candidate.to.node);
  const resolvesTableColumn =
    initialTarget?.kind === 'output' && initialTarget.output.kind === 'table';
  const resolvesPlotMeasure =
    initialTarget?.kind === 'output' && initialTarget.output.kind === 'plot';
  const prepare = (current: GraphDocument): { readonly document: GraphDocument; readonly edge: Edge } => {
    let attempted = current;
    let to = candidate.to;

    if (resolvesTableColumn) {
      const source = current.nodes.find((node) => node.id === candidate.from.node);
      const base = source === undefined ? candidate.from.port : nodeLabel(source);
      const resolved =
        to.port === NEW_COLUMN
          ? addNamedColumn(current, to.node, base)
          : relabelColumn(current, to.node, to.port, base);
      attempted = resolved.document;
      to = { node: to.node, port: resolved.column };
    } else if (resolvesPlotMeasure && to.port === NEW_PLOT_MEASURE) {
      const source = current.nodes.find((node) => node.id === candidate.from.node);
      const label = source === undefined ? candidate.from.port : nodeLabel(source);
      const resolved = addPlotMeasure(current, to.node, label);
      attempted = resolved.document;
      to = { node: to.node, port: resolved.measure.id };
    }

    return { document: attempted, edge: { ...candidate, id: edgeId(candidate.from, to), to } };
  };

  const prepared = prepare(document);
  const verdict = canConnect(prepared.document, catalogues, prepared.edge);
  if (!verdict.ok) {
    return {
      ok: false,
      document: prepared.document,
      refusal: { edge: prepared.edge, reason: verdict.reason },
    };
  }

  const apply = (current: GraphDocument): GraphDocument => {
    const latest = prepare(current);
    return connect(latest.document, latest.edge.from, latest.edge.to, joinSpectrum);
  };
  return { ok: true, document: apply(document), apply };
}
