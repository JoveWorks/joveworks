/**
 * The shafts domain's kernel entry (ROADMAP item 19): everything in it that
 * runs without React — the Shaft, Support, Load and Distributed load nodes,
 * the `load` and `shaft` port kinds, the `shaft:` evaluator and the Shaft
 * view, for the formats and the kernel — registered as this module loads.
 * A build that includes the domain imports this before it opens a document
 * or a catalogue; nothing in the core packages imports it.
 *
 * It is also the worked example of a domain with code. Its catalogue
 * (`catalogues/shafts.json`) needs none: the editor finds it by glob, as it
 * does any domain's.
 */

import './schema.js';
import './kernel/index.js';

export * from './schema.js';
export * from './kernel/index.js';

/** The id of the domain's Shafts catalogue (`catalogues/shafts.json`). */
export const SHAFTS_CATALOGUE_ID = 'public-shafts';
