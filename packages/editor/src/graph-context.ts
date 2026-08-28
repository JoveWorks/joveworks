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

import type { Catalogue, GraphDocument } from '@joveworks/schema';

import type { Analysis } from './model/analysis';
import type { MonteCarloPlaybackState } from './model/monteCarloPlayback';
import type { UserEquation } from './model/userEquations';

export interface GraphContextValue {
  readonly document: GraphDocument;
  readonly catalogues: readonly Catalogue[];
  readonly userEquations: readonly UserEquation[];
  readonly saveUserEquation: (label: string, expression: string) => void;
  readonly removeUserEquation: (id: string) => void;
  readonly analysis: Analysis;
  readonly edit: (change: (document: GraphDocument) => GraphDocument) => void;
  /**
   * Like `edit`, but for a change that is one tick of a longer gesture (a
   * drag, a keystroke) — applies immediately without recording its own undo
   * step. `commitEdit` finalizes everything since the last commit into one
   * step, at the gesture's end (drag-stop, resize-end, blur).
   */
  readonly editLive: (change: (document: GraphDocument) => GraphDocument) => void;
  readonly commitEdit: () => void;
  /** Nodes whose detail is explicitly expanded. */
  readonly expanded: ReadonlySet<string>;
  readonly toggleExpanded: (id: string) => void;
  /** Group frames compacted into derived canvas-only macro-nodes. */
  readonly collapsedGroups: ReadonlySet<string>;
  readonly toggleGroupCollapsed: (id: string) => void;
  /**
   * What's currently selected on the canvas — nodes, frames and edges alike,
   * by id. Lives here rather than in `Canvas.tsx` alone (despite being
   * exactly the kind of session-local, not-part-of-the-document state that
   * comment describes) because actions outside the canvas — the Edit ribbon's
   * "Group into new section" — need to read it too.
   */
  readonly selected: ReadonlySet<string>;
  readonly setSelected: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;
  /**
   * What the notebook is currently hovering, by id — a section title hovers
   * its frame, a result block hovers its output node. Lives here for the
   * same reason `selected` does: the notebook and the canvas are siblings
   * under this context, not parent/child, so there is nowhere closer to
   * share it.
   */
  readonly hovered: ReadonlySet<string>;
  readonly setHovered: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;
  /**
   * Whether a marquee (drag-select) rectangle is currently being dragged.
   * `NodeShell` reads this to keep a node's DOM footprint at its collapsed
   * (or pinned-open) size for the whole drag — otherwise hover or the
   * marquee's own live selection would open a node mid-drag, growing the box
   * React Flow hit-tests against and dropping it back out of the selection
   * it was already fully inside of.
   */
  readonly marqueeActive: boolean;
  readonly setMarqueeActive: (active: boolean) => void;
  /**
   * Monte Carlo playback: one shared position for the whole document
   * (`ROADMAP.md` #27, #31), held here, one level above any single view, so
   * every receiver's canvas node and notebook entry
   * (`MonteCarloReceiverPlayback.tsx`) read and drive the same position
   * rather than independent ones — every generator shares one trial axis,
   * so there is one "how far into the run we are" to show, not one per
   * receiver.
   */
  readonly monteCarloPlayback: MonteCarloPlaybackState;
  readonly toggleMonteCarloPlayback: () => void;
  readonly stepMonteCarloPlayback: () => void;
  readonly resetMonteCarloPlayback: () => void;
}

export const GraphContext = createContext<GraphContextValue | undefined>(undefined);

export function useGraph(): GraphContextValue {
  const value = useContext(GraphContext);
  if (value === undefined) throw new Error('the canvas is outside its GraphContext');
  return value;
}
