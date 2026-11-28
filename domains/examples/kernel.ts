/**
 * The examples domain's kernel entry (ROADMAP item 19): everything in it
 * that runs without React — the shafts' node, port and output kinds for the
 * formats and the kernel — registered as this module loads. A build that
 * includes the domain imports this before it opens a document or a
 * catalogue; nothing in the core packages imports it.
 *
 * The domain's catalogues (`catalogues/`) and books (`books/`) need no code:
 * the editor finds them by glob.
 */

import './shafts/schema.js';
import './shafts/kernel/index.js';

export * from './shafts/schema.js';
export * from './shafts/kernel/index.js';

/** The id of the domain's Shafts catalogue (`catalogues/shafts.json`). */
export const SHAFTS_CATALOGUE_ID = 'public-shafts';
