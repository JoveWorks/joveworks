import { describe, expect, it } from 'vitest';

import { DOCUMENT_MIGRATIONS, migrateDocument, runMigrationChain, type SchemaMigrationStep } from './migration.js';
import { emptyDocument, serializeDocument } from './document.js';
import { SCHEMA_VERSION } from './version.js';
import type { JsonObject } from './json.js';

describe('the real document migration table', () => {
  it('is empty today, because schemaVersion 1 is the only version JoveWorks has ever shipped', () => {
    // If this starts failing, a second schemaVersion has shipped and this
    // assertion — not the fact — is what needs to change: add its step to
    // `DOCUMENT_MIGRATIONS` (a recorded no-op if the schema was only
    // widened, per this file's header) and update this test to match.
    expect(DOCUMENT_MIGRATIONS).toEqual({});
  });

  it('opens a current document unchanged — no step runs when the version is already current', () => {
    const document = serializeDocument(emptyDocument('doc-1', 'Empty study')) as JsonObject;
    expect(migrateDocument(document)).toEqual(emptyDocument('doc-1', 'Empty study'));
  });

  it('names a newer schemaVersion clearly rather than misparsing it', () => {
    const document = { ...serializeDocument(emptyDocument('doc-1', 'Empty study')), schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => migrateDocument(document)).toThrow(
      /newer version of JoveWorks/,
    );
  });
});

describe('the chain-walking machinery, exercised with synthetic steps', () => {
  /**
   * These steps are not a real historical migration — they exist only to
   * prove `runMigrationChain` walks a multi-step chain in order, applying
   * each step to the previous step's *output*, before the real table ever
   * needs to hold more than one entry.
   */
  const syntheticSteps: Readonly<Record<number, SchemaMigrationStep>> = {
    1: (raw) => ({ ...raw, upgradedThrough: [...(raw['upgradedThrough'] as string[] ?? []), '1->2'] }),
    2: (raw) => ({ ...raw, upgradedThrough: [...(raw['upgradedThrough'] as string[] ?? []), '2->3'] }),
  };

  it('applies one step per version, in order, stamping the version as it goes', () => {
    const result = runMigrationChain(syntheticSteps, { schemaVersion: 1 }, 1, 3, '');
    expect(result).toEqual({ schemaVersion: 3, upgradedThrough: ['1->2', '2->3'] });
  });

  it('is a no-op walk when the document is already at the target version', () => {
    const result = runMigrationChain(syntheticSteps, { schemaVersion: 3, mark: 'unchanged' }, 3, 3, '');
    expect(result).toEqual({ schemaVersion: 3, mark: 'unchanged' });
  });

  it('fails clearly on a gap in the chain, instead of silently skipping a version', () => {
    const gappy: Readonly<Record<number, SchemaMigrationStep>> = { 1: syntheticSteps[1] as SchemaMigrationStep };
    expect(() => runMigrationChain(gappy, { schemaVersion: 1 }, 1, 3, '')).toThrow(
      /no registered migration step from schemaVersion 2 to 3/,
    );
  });

  /**
   * A real future no-op step (schema widened, nothing to transform) looks
   * exactly like this: the identity function, kept as an explicit table
   * entry with a comment recording why, not an absence.
   */
  it('accepts an identity step as a legitimate, explicit no-op', () => {
    const noOpOnly: Readonly<Record<number, SchemaMigrationStep>> = {
      // Invented example: version 1 widened a field without changing its
      // shape, so nothing here needs to change on the way to version 2.
      1: (raw) => raw,
    };
    expect(runMigrationChain(noOpOnly, { schemaVersion: 1, title: 'kept' }, 1, 2, '')).toEqual({
      schemaVersion: 2,
      title: 'kept',
    });
  });
});
