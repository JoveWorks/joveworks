/**
 * The version stamp (S25).
 *
 * One integer, on every document this package writes. There is deliberately **no
 * migration chain**: a chain protects existing user graphs, and there are none
 * yet — until real student work exists, the format may change and documents are
 * regenerated. The stamp still costs one field and earns it immediately, because
 * without it a file written today could not be identified later.
 *
 * So a foreign version is a clear refusal, not a silent best-effort read. When
 * the chain arrives, this is the only place that has to learn about it.
 */

import { fail, join, readInteger, required, type JsonObject } from './json.js';

export const SCHEMA_VERSION = 1;

export function readSchemaVersion(object: JsonObject, path: string): number {
  const field = join(path, 'schemaVersion');
  const version = readInteger(required(object, 'schemaVersion', path), field, 1);
  if (version !== SCHEMA_VERSION) {
    fail(
      field,
      `is ${version}, but this build reads version ${SCHEMA_VERSION} only. ` +
        'Documents are regenerated rather than migrated until real graphs exist (S25)',
    );
  }
  return version;
}
