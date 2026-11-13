import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { formulaRef, sourceHref } from '@joveworks/schema';
import { MECHANICS_LEGACY_OPERATIONS } from '@joveworks/nodes';

import { baseCatalogue, builtInCatalogues, bundledCatalogues, entries, removeCatalogue, search } from './catalogues';
import { lookupRef } from './analysis';

describe('bundled public catalogues', () => {
  it('ships the mechanics, machining, photography, and running sets', () => {
    expect(bundledCatalogues().map(({ id }) => id).sort()).toEqual([
      'public-machining',
      'public-mechanics',
      'public-photography',
      'public-running',
    ]);
  });
});

describe('the photography book', () => {
  const catalogue = bundledCatalogues().find(({ id }) => id === 'public-photography');
  const book = readFileSync(new URL('../catalogues/examples/photography.html', import.meta.url), 'utf-8');

  it('is the book the catalogue cites, next to it', () => {
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
