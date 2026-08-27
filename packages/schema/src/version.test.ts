import { describe, expect, it } from 'vitest';

import { parseCatalogue } from './formula.js';
import { emptyDocument, parseDocument, serializeDocument } from './document.js';
import { parseLockedCatalogue } from './lockedCatalogue.js';
import { CATALOGUE_SCHEMA_VERSION, DOCUMENT_SCHEMA_VERSION, readSchemaVersion } from './version.js';
import type { JsonObject } from './json.js';

/**
 * An invented formula — never real R&M content, per CLAUDE.md — just enough
 * of a `Formula` to build a minimal catalogue for these tests.
 */
const invented: JsonObject = {
  id: 'demo.sum',
  version: 1,
  output: { kind: 'numeric', name: 'y', unit: 'N' },
  inputs: [
    { kind: 'numeric', name: 'a', unit: 'N' },
    { kind: 'numeric', name: 'b', unit: 'N' },
  ],
  expression: 'a + b',
  description: { en: 'An invented formula, used because a real one may not be redistributed.' },
  status: 'unverified',
};

const catalogueJson: JsonObject = {
  schemaVersion: CATALOGUE_SCHEMA_VERSION,
  id: 'demo',
  name: { en: 'Invented demonstration formulas' },
  restricted: false,
  formulas: [invented],
};

const documentJson: JsonObject = serializeDocument(emptyDocument('doc-1', 'Empty study'));

const lockedCatalogueJson: JsonObject = {
  schemaVersion: CATALOGUE_SCHEMA_VERSION,
  id: 'demo-locked',
  name: { en: 'Locked demonstration' },
  kdf: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 1, salt: 'AAAA' },
  cipher: { algorithm: 'AES-GCM', iv: 'AAAA' },
  ciphertext: 'AAAA',
};

describe('each artefact accepts its own schemaVersion', () => {
  it('parseDocument accepts DOCUMENT_SCHEMA_VERSION', () => {
    expect(() => parseDocument(documentJson)).not.toThrow();
  });

  it('parseCatalogue accepts CATALOGUE_SCHEMA_VERSION', () => {
    expect(() => parseCatalogue(catalogueJson)).not.toThrow();
  });

  it('parseLockedCatalogue accepts CATALOGUE_SCHEMA_VERSION', () => {
    expect(() => parseLockedCatalogue(lockedCatalogueJson)).not.toThrow();
  });
});

describe('each artefact refuses a foreign version and names itself', () => {
  it('parseDocument names "document" in its refusal', () => {
    expect(() => parseDocument({ ...documentJson, schemaVersion: DOCUMENT_SCHEMA_VERSION + 1 })).toThrow(
      /schemaVersion: is 2, but this build reads document schemaVersion 1 only/,
    );
  });

  it('parseCatalogue names "catalogue" in its refusal', () => {
    expect(() => parseCatalogue({ ...catalogueJson, schemaVersion: CATALOGUE_SCHEMA_VERSION + 1 })).toThrow(
      /schemaVersion: is 2, but this build reads catalogue schemaVersion 1 only/,
    );
  });

  it('parseLockedCatalogue names "locked catalogue" in its refusal', () => {
    expect(() =>
      parseLockedCatalogue({ ...lockedCatalogueJson, schemaVersion: CATALOGUE_SCHEMA_VERSION + 1 }),
    ).toThrow(/schemaVersion: is 2, but this build reads locked catalogue schemaVersion 1 only/);
  });
});

/**
 * The point of the whole split: three artefacts used to share one
 * `SCHEMA_VERSION`, so bumping it to ship a document-format change made
 * `parseCatalogue` refuse every catalogue already cached in a browser or
 * hosted on a school's LMS — files nobody can reach in to rewrite. Each
 * artefact now carries its own stamp and its own check, so this must not
 * happen again.
 */
describe('bumping one artefact does not disturb another artefact already on disk', () => {
  it('a document schemaVersion this build no longer understands does not touch an unrelated, still-valid catalogue', () => {
    // Simulate "the document format shipped a bump": readSchemaVersion is
    // told to expect a newer document version than the one on this object.
    expect(() =>
      readSchemaVersion({ schemaVersion: DOCUMENT_SCHEMA_VERSION }, '', DOCUMENT_SCHEMA_VERSION + 1, 'document'),
    ).toThrow(/document schemaVersion 2 only/);

    // A catalogue already on disk at its own, entirely unrelated version —
    // the file a school's LMS is already serving and a browser has already
    // cached — must still parse. Nothing about the document bump above
    // reached into CATALOGUE_SCHEMA_VERSION or this parser.
    expect(() => parseCatalogue(catalogueJson)).not.toThrow();
  });

  it('a catalogue schemaVersion this build no longer understands does not touch an unrelated, still-valid document', () => {
    // Simulate "corrected formulas shipped mid-semester, bumping the
    // catalogue format" the same way.
    expect(() =>
      readSchemaVersion({ schemaVersion: CATALOGUE_SCHEMA_VERSION }, '', CATALOGUE_SCHEMA_VERSION + 1, 'catalogue'),
    ).toThrow(/catalogue schemaVersion 2 only/);

    // A student's saved NodeBook, untouched by that catalogue bump, must
    // still open.
    expect(() => parseDocument(documentJson)).not.toThrow();
  });
});
