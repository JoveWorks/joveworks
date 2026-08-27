/**
 * What the kernel says without refusing.
 *
 * The line between a warning and an error: **a bad connection does not attach**, so anything about
 * wiring is an error, while a formula that has changed under a saved graph, or
 * one used outside the condition R&M states for it, is a result you should look
 * at rather than a result that cannot exist.
 */

export const WARNING_KINDS = [
  /** The catalogue's formula no longer matches the reference the graph saved. */
  'formulaChanged',
  /** The product of the axis lengths has grown large enough to warn about. */
  'largeGrid',
  /** A formula was used outside its `appliesWhen` condition. */
  'appliesWhen',
  /** A plot names an axis its data does not vary along. */
  'plotAxis',
  /** A plot's data varies along more axes than it has slots (x/series/facet) for. */
  'plotAxisDropped',
  /** A contoured plot also has a facet axis, which the contour path ignores. */
  'plotContourFacet',
  'plotAxesUnsupported',
  /** A contoured plot has lost the second axis a contour needs, so it draws as a line. */
  'plotContourFlat',
  /** A Sensitivity candidate could not be evaluated at its low/high bound — skipped, not fatal. */
  'sensitivityCandidateSkipped',
  /** A selection found no crossing (or no usable value) along the axis it searched. */
  'selectNoCrossing',
  /** The sweep is too coarse for the interpolated crossing to be trusted. */
  'selectCoarseSweep',
  /** More than one crossing was found; the first is the one wired onward. */
  'selectExtraCrossings',
  /** A `firstPassing` selection found no passing point at all. */
  'selectNothingPasses',
  /** No candidate satisfies every referenced check at once — the failure card. */
  'bestDesignInfeasible',
  /** Every feasible candidate scores the same, so the winner is arbitrary. */
  'bestDesignFlat',
  /**
   * A referenced check cannot be ranked for "governing": `==`/`!=` have no
   * margin to normalise, and a zero threshold makes the ratio meaningless.
   * Not in the plan's original list — the exclusion is silent otherwise, and
   * a card that quietly drops a constraint from the ranking is the kind of
   * thing this project warns about rather than hides.
   */
  'bestDesignUnrankable',
  /** An unwired Statistic collapsed multiple axes into one pooled answer. */
  'statisticPooledAxes',
  /** Sample standard deviation needs at least two samples. */
  'statisticTooFewSamples',
  /** A Distribution figure omitted axes beyond its over/facet slots. */
  'distributionAxisDropped',
  /** A Distribution figure received no finite samples. */
  'distributionEmpty',
  /** Referenced checks do not vary along the Monte Carlo trial axis. */
  'reliabilityNoTrials',
  /** No failures were observed, so only the trial-resolution bound is known. */
  'reliabilityUnresolved',
  /** Discrete values and weights could not form a valid probability mass. */
  'monteCarloDiscreteWeights',
  /** No candidate satisfies every referenced check, so the front is empty. */
  'paretoInfeasible',
  /** A candidate's objective did not evaluate to a number, so it cannot compete. */
  'paretoUndefinedPoint',
  /** The study has one candidate, so there is no trade-off to draw a front through. */
  'paretoFlat',
  /**
   * A marked candidate no longer lands on a sample: the range moved under it.
   * A mark is a claim about a specific design, so a mark that has quietly
   * stopped describing one — or been snapped to a neighbour — is exactly the
   * kind of thing to say out loud rather than redraw.
   */
  'candidateStale',
] as const;

export type WarningKind = (typeof WARNING_KINDS)[number];

export interface Warning {
  readonly kind: WarningKind;
  readonly message: string;
  /** The node to attach it to on the canvas, where there is one. */
  readonly nodeId?: string;
}
