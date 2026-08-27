/**
 * Version stamps — one per artefact, not one for the whole package.
 *
 * Two unrelated things carry a `schemaVersion`: a student's saved
 * `GraphDocument` (`document.ts`) and a formula `Catalogue` (`formula.ts`).
 * They used to share one
 * `SCHEMA_VERSION`, which sounds tidy right up until one of them needs to
 * change: a document-format bump forced `parseCatalogue` to demand the new
 * number too, so every catalogue already sitting on a school's LMS and cached
 * in students' browsers would suddenly be refused — and those are exactly the
 * files nobody can reach in to rewrite. Corrected formulas shipping mid-semester,
 * independent of any document change, is not a hypothetical; it is how this
 * course runs. So each artefact gets its own constant and its own check, and
 * bumping one must never make another artefact's existing files unreadable.
 *
 * `migrateDocument` (`migration.ts`) is the chain-walker for
 * `DOCUMENT_SCHEMA_VERSION` specifically: a student's NodeBook has to survive
 * being saved on one JoveWorks build and reopened on another, so a foreign
 * *document* version is bridged where possible, one step at a time. That
 * reasoning applies to the document version alone — a catalogue on a version
 * this build does not understand still gets the same
 * hard, named refusal `readSchemaVersion` below always gave, because nothing
 * here migrates catalogue content. Real student graphs and real cached
 * catalogues exist now (course beta): "regenerate the file" is no longer an
 * acceptable answer to "the version changed," which is the assumption this
 * file used to be written under.
 */

import { fail, join, readInteger, required, type JsonObject } from './json.js';

export const DOCUMENT_SCHEMA_VERSION = 1;
export const CATALOGUE_SCHEMA_VERSION = 1;

/**
 * Read and check one artefact's `schemaVersion`. `expected` and `artefact`
 * make the refusal specific — which artefact, which version — rather than a
 * bare number that could belong to either.
 */
export function readSchemaVersion(
  object: JsonObject,
  path: string,
  expected: number,
  artefact: string,
): number {
  const field = join(path, 'schemaVersion');
  const version = readInteger(required(object, 'schemaVersion', path), field, 1);
  if (version !== expected) {
    fail(
      field,
      `is ${version}, but this build reads ${artefact} schemaVersion ${expected} only.`,
    );
  }
  return version;
}
