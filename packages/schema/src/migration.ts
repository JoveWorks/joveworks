/**
 * The upgrade path: turn a document saved against any previously-shipped
 * `schemaVersion` into one this build reads, explicitly, rather than the
 * implicit "it happens to still parse" `version.ts` describes.
 *
 * Why this exists now: students save NodeBooks on one JoveWorks build and
 * reopen them weeks later on another — the stable channel a school hosts and
 * the nightly channel that moves faster. `parseDocument` alone cannot bridge
 * that gap; it is deliberately strict (`readSchemaVersion` in `version.ts`),
 * because most callers *want* "this is not the version I understand" to be a
 * hard stop. `migrateDocument` is the one caller that instead tries to bridge
 * the gap first, by walking a chain of small, per-version steps, and only
 * then hands the result to `parseDocument` for full structural validation.
 *
 * The chain is keyed by the version a step upgrades *from*. Every version
 * that has ever shipped and been superseded must have an entry — including a
 * version that needed no transformation, because the schema was *widened*
 * rather than replaced (ROADMAP item 17's multi-output lesson: a one-output
 * formula record still parsed, serialized and **hashed** unchanged when
 * `output` grew from an object to `object | object[]`). Recording that as an
 * explicit no-op step (with a comment saying why) is what turns "we got
 * lucky" into "we checked" the next time the schema grows.
 *
 * As of this writing, document schemaVersion 1 is the only version JoveWorks
 * has ever shipped (see `version.ts` and the fixture corpus under
 * `packages/schema/fixtures/documents/`), and it is also
 * `DOCUMENT_SCHEMA_VERSION` today — so `DOCUMENT_MIGRATIONS` is empty: there
 * is nothing to migrate *from* yet, because nothing has been superseded yet.
 * The chain-walking machinery below is exercised by synthetic steps in
 * `migration.test.ts` rather than left untested until the day it is first
 * needed for real.
 */

import {
  fail,
  join,
  readInteger,
  readObject,
  required,
  type JsonObject,
  type JsonValue,
} from './json.js';
import { parseDocument, type GraphDocument } from './document.js';
import { DOCUMENT_SCHEMA_VERSION } from './version.js';

/** One step: the raw JSON of a document at version N, upgraded to version N+1's shape. */
export type SchemaMigrationStep = (raw: JsonObject) => JsonObject;

/**
 * Keyed by the version a step upgrades *from*. See this file's header for why
 * an empty table is the honest state today, and why a genuinely-unchanged
 * version still belongs here (as a no-op step) rather than being left out
 * once there is one to add.
 */
export const DOCUMENT_MIGRATIONS: Readonly<Record<number, SchemaMigrationStep>> = {};

/**
 * Walk `steps` from `fromVersion` to `toVersion`, applying one step per
 * version and stamping the result with the version it just became. Exported
 * separately from `migrateDocument` so the chain-walking logic itself — order,
 * stamping, the missing-step error — can be tested against a synthetic table
 * without waiting for a second real schema version to exist.
 */
export function runMigrationChain(
  steps: Readonly<Record<number, SchemaMigrationStep>>,
  raw: JsonObject,
  fromVersion: number,
  toVersion: number,
  path: string,
): JsonObject {
  let current = raw;
  for (let version = fromVersion; version < toVersion; version += 1) {
    const step = steps[version];
    if (step === undefined) {
      fail(
        join(path, 'schemaVersion'),
        `has no registered migration step from schemaVersion ${version} to ${version + 1}`,
      );
    }
    current = { ...step(current), schemaVersion: version + 1 };
  }
  return current;
}

/**
 * The one entry point app code should call to open a document that may have
 * been saved on an older JoveWorks: walks `DOCUMENT_MIGRATIONS` up to
 * `DOCUMENT_SCHEMA_VERSION`, then validates the result exactly as
 * `parseDocument` always has.
 *
 * This is document-version-specific — `DOCUMENT_SCHEMA_VERSION`, not any
 * other artefact's stamp (see `version.ts`) — because it is the *document*
 * that a student's stable/nightly split makes reopening-across-builds a real
 * scenario for. A `schemaVersion` newer than this build understands is
 * refused with a named, specific error — never a silent misparse — because
 * that is exactly the shape of that split: a document a nightly build wrote
 * with a schema this stable build has never heard of must say so in words a
 * student or instructor can act on ("open it with a newer JoveWorks"),
 * not fail deep inside node or edge parsing with an unrelated message.
 */
export function migrateDocument(value: JsonValue, path = ''): GraphDocument {
  const object = readObject(value, path);
  const field = join(path, 'schemaVersion');
  const version = readInteger(required(object, 'schemaVersion', path), field, 1);

  if (version > DOCUMENT_SCHEMA_VERSION) {
    fail(
      field,
      `is ${version} — this document was made with a newer version of JoveWorks than this ` +
        `build understands (this build reads up to document schemaVersion ${DOCUMENT_SCHEMA_VERSION}). ` +
        'Open it with a newer JoveWorks, or with the nightly channel, instead.',
    );
  }

  const upgraded = runMigrationChain(DOCUMENT_MIGRATIONS, object, version, DOCUMENT_SCHEMA_VERSION, path);
  return parseDocument(upgraded, path);
}
