/**
 * The base node library: the nodes a graph is built from before any
 * textbook content is loaded. Unrestricted, and it cites nothing.
 *
 * **Only one of the three kinds of base node is catalogue content**, and that
 * turned out to be the useful finding of this step:
 *
 * - **Operations** — arithmetic, the function whitelist, `sum`/`prod` — are
 *   `Formula` records, and live here. They are the palette's third source
 *   alongside the R&M catalogues.
 * - **Literal inputs** are *not* records. An input node carries a `ValueSpec`
 *   directly (`schema/value.ts`): a scalar, a categorical choice, a spectrum, or
 *   a range. There is no formula behind `250 kW`, so a `literal` catalogue entry
 *   would be an empty box wrapping a field the document already has.
 * - **Output nodes** are *not* records either. The four kinds — value,
 *   check, plot, table — are an `Output` variant on the node
 *   (`schema/document.ts`), because each one is a *rendering choice over a value
 *   already computed*: which unit, how many figures, which axis is x, which
 *   comparison against which threshold. None of that is an expression, so none
 *   of it is a formula. The split is therefore: **the schema owns what the
 *   student chose, the editor owns how it is drawn** — the check node's
 *   comparison and threshold are schema, the pass/fail badge is editor; a plot's
 *   x-axis and threshold are schema, the curve is editor.
 *
 * What operations *did* need was a schema change: see
 * `@joveworks/units/generic`. A port that declares `N` cannot express `add`.
 */

export { OPERATIONS } from './operations.js';
export { BASE_CATALOGUE, BASE_CATALOGUE_ID, baseCatalogueJson } from './catalogue.js';
