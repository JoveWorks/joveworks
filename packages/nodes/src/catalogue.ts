/**
 * The base node library as a catalogue — unrestricted, citation-free, and
 * loaded the same way an R&M catalogue is.
 *
 * It is a **build artefact of this package**, not hand-written JSON: the records
 * are authored in TypeScript next door and serialized here. CLAUDE.md names
 * hand-editing catalogue JSON at scale as the smell that the authoring path is
 * missing, and it applies to us before it applies to anyone else.
 */

import {
  SCHEMA_VERSION,
  parseCatalogue,
  saveCatalogue,
  serializeCatalogue,
  type Catalogue,
} from '@joveworks/schema';

import { OPERATIONS } from './operations.js';
import { ARRAY_OPERATIONS } from './arrayNodes.js';

export const BASE_CATALOGUE_ID = 'base';
export const ARRAY_CATALOGUE_ID = 'array';

/**
 * The library as authored.
 *
 * `restricted: false` is the whole reason this package exists in the public
 * repository: arithmetic is not textbook content, so the app is demonstrable and
 * the kernel is testable end to end with no R&M material present at all.
 */
export const BASE_CATALOGUE: Catalogue = {
  schemaVersion: SCHEMA_VERSION,
  id: BASE_CATALOGUE_ID,
  name: { en: 'Base nodes', nl: 'Basisknooppunten' },
  restricted: false,
  formulas: OPERATIONS,
};

/** `arrayNodes.ts`'s reductions, as their own catalogue — see that file's docstring for why. */
export const ARRAY_CATALOGUE: Catalogue = {
  schemaVersion: SCHEMA_VERSION,
  id: ARRAY_CATALOGUE_ID,
  name: { en: 'Array nodes', nl: 'Arrayknooppunten' },
  restricted: false,
  formulas: ARRAY_OPERATIONS,
};

/**
 * A catalogue as a file, having been through the parser.
 *
 * The round trip is not ceremony: it is what makes an authored record and a
 * loaded record the same object, so a base node cannot quietly rely on something
 * only the TypeScript literal can express.
 */
export function baseCatalogueJson(): string {
  return saveCatalogue(parseCatalogue(serializeCatalogue(BASE_CATALOGUE)));
}

export function arrayCatalogueJson(): string {
  return saveCatalogue(parseCatalogue(serializeCatalogue(ARRAY_CATALOGUE)));
}
