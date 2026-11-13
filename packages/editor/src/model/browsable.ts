/**
 * Which catalogues a student browses. Kept apart from `catalogues.ts`, which
 * bundles every catalogue file the app ships: the published-NodeBook viewer
 * reaches this through `ValueEditor` and must not pull those files in (the
 * bundle guard in `vite.config.ts` refuses any catalogue in the viewer).
 */

import type { Catalogue } from '@joveworks/schema';

/**
 * Catalogues that resolve old documents but are never offered: their records
 * have successors under the same ids, so a student browsing them would only
 * meet each formula twice. A hidden catalogue still resolves every reference
 * to it, exactly as before.
 */
// Spelled out rather than imported: `@joveworks/nodes` would bring its records
// into the viewer with it. `catalogues.test.ts` checks this is the legacy id.
const HIDDEN_CATALOGUE_IDS: ReadonlySet<string> = new Set(['mechanics-legacy']);

/** The catalogues a student browses — the palette, its search, the table pickers. */
export function browsable(catalogues: readonly Catalogue[]): readonly Catalogue[] {
  return catalogues.filter((catalogue) => !HIDDEN_CATALOGUE_IDS.has(catalogue.id));
}
