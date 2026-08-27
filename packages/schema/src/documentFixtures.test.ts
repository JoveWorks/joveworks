/**
 * The versioned document-compatibility corpus: one saved-document fixture per
 * interesting shape, checked into the repo as JSON under
 * `packages/schema/fixtures/documents/<schemaVersion>/`, loaded here through
 * `migrateDocument` (the real upgrade entry point, `migration.ts`) rather than
 * `parseDocument` directly — the point is to prove the path a reopened
 * NodeBook actually takes still works, not just that the shape still parses.
 *
 * Only `v1` exists, because schemaVersion 1 is the only version JoveWorks has
 * ever shipped (`version.ts`, `migration.ts`). A fixture set for an earlier
 * version would misrepresent history, so none exists — see the ROADMAP item
 * 17 update and the task report for why.
 *
 * Fixtures are invented documents: any formula they reference is a made-up
 * id (`fixture.*`) with an invented expression, never real Roloff & Matek
 * content, and their hashes are placeholder strings, not computed against a
 * real catalogue — that is deliberate, a document fixture only has to prove
 * the *document* shape round-trips, not resolve against a catalogue.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { migrateDocument } from './migration.js';
import { DOCUMENT_SCHEMA_VERSION } from './version.js';
import type { JsonValue } from './json.js';

const fixturesRoot = fileURLToPath(new URL('../fixtures/documents', import.meta.url));

function loadFixture(version: string, name: string): JsonValue {
  const text = readFileSync(`${fixturesRoot}/${version}/${name}`, 'utf8');
  return JSON.parse(text) as JsonValue;
}

describe('every shipped schemaVersion has a fixture set that still opens', () => {
  const versionDirs = readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it('covers at least schemaVersion 1, the only version ever shipped', () => {
    expect(versionDirs).toEqual(['v1']);
  });

  for (const versionDir of versionDirs) {
    describe(versionDir, () => {
      const files = readdirSync(`${fixturesRoot}/${versionDir}`).filter((name) => name.endsWith('.json'));

      it('is not empty', () => {
        expect(files.length).toBeGreaterThan(0);
      });

      for (const file of files) {
        it(`${file} migrates and parses`, () => {
          const raw = loadFixture(versionDir, file);
          const document = migrateDocument(raw);
          expect(document.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
        });
      }
    });
  }
});

describe('v1 fixture shapes', () => {
  it('scalar-graph.json: a plain scalar graph with no axes', () => {
    const document = migrateDocument(loadFixture('v1', 'scalar-graph.json'));
    expect(document.nodes.map((node) => node.kind)).toEqual(['input', 'input', 'input', 'formula', 'output']);
    expect(document.edges).toHaveLength(4);
    expect(document.frames).toHaveLength(0);
  });

  it('swept-range-graph.json: a range node introduces the plotted axis', () => {
    const document = migrateDocument(loadFixture('v1', 'swept-range-graph.json'));
    const range = document.nodes.find((node) => node.kind === 'range');
    expect(range).toMatchObject({ id: 'width', spacing: 'linear', start: 10, stop: 50, count: 5 });
    const plot = document.nodes.find((node) => node.id === 'areaPlot');
    expect(plot).toMatchObject({ kind: 'output', output: { kind: 'plot', x: 'width' } });
  });

  it('frames-and-sections-graph.json: a nested section inside a group frame', () => {
    const document = migrateDocument(loadFixture('v1', 'frames-and-sections-graph.json'));
    expect(document.frames.map((frame) => [frame.id, frame.kind])).toEqual([
      ['annotations', 'group'],
      ['sizing', 'section'],
      ['scratch', 'section'],
    ]);
    expect(document.frames.find((frame) => frame.id === 'scratch')?.frameId).toBe('annotations');
    expect(document.nodes.filter((node) => node.frameId === 'sizing')).toHaveLength(4);
  });

  it('marks-graph.json: marks are axis coordinates, not row indices', () => {
    const document = migrateDocument(loadFixture('v1', 'marks-graph.json'));
    expect(document.marks).toEqual([
      { at: { diameter: 40, grade: 'hard' } },
      { at: { diameter: 20 } },
    ]);
  });

  it('formula-ref-graph.json: formula nodes carry id, version and hash — never the expression', () => {
    const document = migrateDocument(loadFixture('v1', 'formula-ref-graph.json'));
    const formulaNodes = document.nodes.filter((node) => node.kind === 'formula');
    expect(formulaNodes.map((node) => (node as { formula: { id: string; version: number; hash: string } }).formula)).toEqual([
      { id: 'fixture.product', version: 1, hash: '5555555555555555' },
      { id: 'fixture.product', version: 2, hash: '6666666666666666' },
    ]);
  });
});
