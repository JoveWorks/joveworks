/**
 * What a NodeBook figure needs to know that its own result does not carry.
 *
 * The figures below this file are presentation-only: they draw an evaluated
 * result and nothing else. That is what lets the editor's NodeBook panel and
 * a published NodeBook share them rather than keeping two renderers in sync
 * (ROADMAP item 38). But a figure does need a few facts that live outside its
 * result — whether an axis was a logarithmic sweep, what a referenced Check
 * node is called, how this reader writes numbers — and every one of those is
 * a *fact about the display*, not a handle on the graph.
 *
 * So they arrive here, resolved: the editor resolves them from the open
 * document and its settings, and the compiler resolves the same values into
 * the published report. Neither the source graph nor the catalogue it came
 * from crosses this line.
 */

import { createContext, useContext } from 'react';

import { PLAIN_NUMBER_FORMAT, type NumberFormat } from '@joveworks/units';

import { DEFAULT_CONTOUR_PALETTE, type AppLocale, type ContourPalette } from '../model/editorSettings';

/**
 * What an axis was swept as, for the two decisions that need it: a
 * logarithmic sweep gets a logarithmic scale (the straight line on a Wöhler
 * plot is only straight on log-log), and a continuous pair of axes gets a
 * contour rather than a heatmap.
 */
export interface AxisNature {
  readonly continuous: boolean;
  readonly logarithmic: boolean;
}

export type AxisNatures = Readonly<Record<string, AxisNature>>;

const UNKNOWN_AXIS: AxisNature = { continuous: false, logarithmic: false };

/** An axis nobody described is discrete and linear — the conservative reading. */
export function axisNature(natures: AxisNatures, axisId: string): AxisNature {
  return natures[axisId] ?? UNKNOWN_AXIS;
}

export interface NotebookDisplay {
  readonly format: NumberFormat;
  readonly contourPalette: ContourPalette;
  /** Whether `a_1` is typeset as notation or printed with its underscore showing. */
  readonly titleMath: boolean;
  /** The NodeBook's own language, which need not be the app's. */
  readonly locale: AppLocale;
  readonly axes: AxisNatures;
  /**
   * Check node id → its title. Composite outputs (feasibility, best design,
   * reliability, stress) reference checks by id and have to name them.
   */
  readonly checkLabels: Readonly<Record<string, string>>;
}

/**
 * Enough to draw with when nothing has been provided — a figure rendered in a
 * test, or before the editor has mounted its own provider.
 */
export const DEFAULT_DISPLAY: NotebookDisplay = {
  format: PLAIN_NUMBER_FORMAT,
  contourPalette: DEFAULT_CONTOUR_PALETTE,
  titleMath: true,
  locale: 'en',
  axes: {},
  checkLabels: {},
};

const DisplayContext = createContext<NotebookDisplay>(DEFAULT_DISPLAY);

export const DisplayProvider = DisplayContext.Provider;

export function useDisplay(): NotebookDisplay {
  return useContext(DisplayContext);
}
