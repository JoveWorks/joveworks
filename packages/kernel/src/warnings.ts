/**
 * What the kernel says without refusing.
 *
 * The line between a warning and an error is drawn by S6/S18 on one side and
 * S23/S40 on the other: **a bad connection does not attach**, so anything about
 * wiring is an error, while a formula that has changed under a saved graph, or
 * one used outside the condition R&M states for it, is a result you should look
 * at rather than a result that cannot exist.
 */

export const WARNING_KINDS = [
  /** The catalogue's formula no longer matches the reference the graph saved (S23). */
  'formulaChanged',
  /** The product of the axis lengths has grown large (S43's guard). */
  'largeGrid',
  /** A formula was used outside its `appliesWhen` condition (S40). */
  'appliesWhen',
  /** A plot names an axis its data does not vary along. */
  'plotAxis',
] as const;

export type WarningKind = (typeof WARNING_KINDS)[number];

export interface Warning {
  readonly kind: WarningKind;
  readonly message: string;
  /** The node to attach it to on the canvas, where there is one. */
  readonly nodeId?: string;
}
