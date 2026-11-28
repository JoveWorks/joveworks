import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { CATALOGUE_SCHEMA_VERSION, formulaRef, parseCatalogue, sourceHref, tableFormula } from '@joveworks/schema';
import { MECHANICS_LEGACY_CATALOGUE_ID, MECHANICS_LEGACY_OPERATIONS } from '@joveworks/nodes';

import { baseCatalogue, builtInCatalogues, bundledCatalogues, entries, removeCatalogue, search } from './catalogues';
import { lookupRef } from './analysis';
import { browsable } from './browsable';

describe('bundled public catalogues', () => {
  it('ships the mechanics, machining, photography, running and example-table sets', () => {
    expect(bundledCatalogues().map(({ id }) => id).sort()).toEqual([
      'public-machining',
      'public-mechanics',
      'public-photography',
      'public-running',
      'public-tables-demo',
    ]);
  });
});

describe('the photography book', () => {
  const catalogue = bundledCatalogues().find(({ id }) => id === 'public-photography');
  const book = readFileSync(new URL('../../../../domains/examples/books/photography.html', import.meta.url), 'utf-8');

  it('is the book the catalogue cites, in its domain', () => {
    expect(catalogue?.source?.url).toBe('photography.html');
  });

  // A renumbered equation in the book must not leave a formula's "?" opening
  // the top of the page.
  it('has every anchor a formula links to', () => {
    const links = (catalogue?.formulas ?? []).flatMap((formula) => {
      const href = catalogue === undefined ? undefined : sourceHref(catalogue, formula);
      return href === undefined || !href.includes('#') ? [] : [href];
    });
    expect(links.length).toBeGreaterThan(20);
    const missing = links
      .map((href) => href.replace(/^photography\.html#/, ''))
      .filter((anchor) => !book.includes(`id="${anchor}"`));
    expect(missing).toEqual([]);
  });
});

describe('catalogue search', () => {
  const list = entries([baseCatalogue()]);

  it('fuzzy-matches formula descriptions and ranks matches', () => {
    expect(search(list, 'sqrrt').map(({ formula }) => formula.id)).toContain('base.math.square-root');
  });

  it('keeps catalogue order for an empty query', () => {
    expect(search(list, '')).toEqual(list);
  });
});

describe('the legacy mechanics catalogue', () => {
  const catalogues = builtInCatalogues();
  const ids = catalogues.map((catalogue) => catalogue.id);

  it('loads after the current mechanics catalogue, and cannot be removed', () => {
    expect(ids.indexOf('mechanics-legacy')).toBe(ids.indexOf('mechanics') + 1);
    expect(removeCatalogue(catalogues, 'mechanics-legacy')).toHaveLength(catalogues.length);
  });

  it('is the catalogue browsable() hides, by its real id', () => {
    expect(browsable(catalogues).map((catalogue) => catalogue.id)).toEqual(ids.filter((id) => id !== MECHANICS_LEGACY_CATALOGUE_ID));
    expect(ids).toContain(MECHANICS_LEGACY_CATALOGUE_ID);
  });

  it('is never offered in the palette — the Shaft calculation replaces its diagrams', () => {
    expect(entries(catalogues).some((entry) => entry.catalogue.id === 'mechanics-legacy')).toBe(false);
    expect(entries(catalogues).filter((entry) => entry.formula.id === 'mechanics.shaft.moment')).toHaveLength(0);
    expect(entries(catalogues).filter((entry) => entry.formula.id === 'mechanics.shaft.calculation')).toHaveLength(1);
  });

  it('still answers a v1 reference with the v1 record, and a node shows where it came from', () => {
    const v1 = MECHANICS_LEGACY_OPERATIONS.find((formula) => formula.id === 'mechanics.shaft.moment');
    if (v1 === undefined) throw new Error('no v1 moment record');
    const found = lookupRef(catalogues, formulaRef(v1));
    expect(found?.formula.version).toBe(1);
    expect(found?.catalogue.id).toBe('mechanics-legacy');
    // Nothing newer shares the id, so a stale reference still lands on the shipped record.
    expect(lookupRef(catalogues, { id: 'mechanics.shaft.moment', version: 9, hash: 'gone' })?.formula.version).toBe(1);
  });
});

describe("a catalogue's tables in the palette", () => {
  // Invented: two widget sizes, not R&M content.
  const catalogue = parseCatalogue({
    schemaVersion: CATALOGUE_SCHEMA_VERSION,
    id: 'demo-tables',
    name: { en: 'Invented tables' },
    restricted: false,
    formulas: [
      {
        id: 'demo.double', version: 1,
        output: { kind: 'numeric', name: 'y', unit: '' },
        inputs: [{ kind: 'numeric', name: 'x', unit: '' }],
        expression: '2*x',
        description: { en: 'Invented.' }, status: 'unverified',
      },
    ],
    tables: [
      {
        id: 'demo.widgets', version: 1,
        label: { en: 'Widget sizes' },
        description: { en: 'Invented widget sizes.' },
        citation: 'Table 0-1',
        key: { name: 'size' },
        columns: [{ name: 'w', unit: 'mm' }],
        rows: [['S', 10], ['M', 12]],
      },
    ],
  });
  const table = catalogue.tables?.[0];

  it('lists each table in its own catalogue, after the formulas', () => {
    const listed = entries([catalogue]);
    expect(listed.map((entry) => entry.formula.id)).toEqual(['demo.double', 'demo.widgets']);
    expect(listed[1]?.table).toBe(table);
    expect(listed[1]?.catalogue).toBe(catalogue);
  });

  it('finds a table by its label and by its citation', () => {
    expect(search(entries([catalogue]), 'widget').map((entry) => entry.formula.id)).toContain('demo.widgets');
    expect(search(entries([catalogue]), '0-1').map((entry) => entry.formula.id)).toContain('demo.widgets');
  });

  it('resolves a reference to a table the way the kernel does', () => {
    if (table === undefined) throw new Error('the fixture has a table');
    const form = tableFormula(table);
    expect(lookupRef([catalogue], formulaRef(form))?.formula).toBe(form);
  });
});

