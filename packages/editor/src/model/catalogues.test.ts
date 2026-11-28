import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { CATALOGUE_SCHEMA_VERSION, formulaRef, parseCatalogue, sourceHref, tableFormula } from '@joveworks/schema';

import { baseCatalogue, builtInCatalogues, bundledCatalogues, entries, removeCatalogue, search } from './catalogues';
import { lookupRef } from './analysis';

describe('bundled public catalogues', () => {
  it('ships the mechanics, machining, photography, running, shafts and example-table sets', () => {
    expect(bundledCatalogues().map(({ id }) => id).sort()).toEqual([
      'public-machining',
      'public-mechanics',
      'public-photography',
      'public-running',
      'public-shafts',
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

describe('the built-in libraries', () => {
  it('are the base and array nodes and the bundled catalogues, and only the first two are permanent', () => {
    const catalogues = builtInCatalogues();
    expect(catalogues.slice(0, 2).map(({ id }) => id)).toEqual(['base', 'array']);
    expect(removeCatalogue(catalogues, 'base')).toHaveLength(catalogues.length);
    expect(removeCatalogue(catalogues, 'public-shafts')).toHaveLength(catalogues.length - 1);
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

