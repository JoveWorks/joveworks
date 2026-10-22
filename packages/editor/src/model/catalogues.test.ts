import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { sourceHref } from '@joveworks/schema';

import { baseCatalogue, bundledCatalogues, entries, search } from './catalogues';

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
