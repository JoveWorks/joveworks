/**
 * One document, one analysis, one way to change either.
 *
 * Node components are drawn by React Flow and cannot be passed the whole world
 * as props without threading it through the library, so the graph lives in a
 * context instead. `edit` takes a function over the document because every edit
 * in `model/document.ts` has that shape — the canvas describes a change, and the
 * app applies it and re-runs the kernel.
 */

import { createContext, useContext } from 'react';

import type { Catalogue, GraphDocument } from '@mds/schema';

import type { Analysis } from './model/analysis';

export interface GraphContextValue {
  readonly document: GraphDocument;
  readonly catalogues: readonly Catalogue[];
  readonly analysis: Analysis;
  readonly edit: (change: (document: GraphDocument) => GraphDocument) => void;
  /** Nodes held open while working elsewhere. */
  readonly pinned: ReadonlySet<string>;
  readonly togglePin: (id: string) => void;
}

export const GraphContext = createContext<GraphContextValue | undefined>(undefined);

export function useGraph(): GraphContextValue {
  const value = useContext(GraphContext);
  if (value === undefined) throw new Error('the canvas is outside its GraphContext');
  return value;
}
