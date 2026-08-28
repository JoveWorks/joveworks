import { describe, expect, it } from 'vitest';

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

describe('catalogue search', () => {
  const list = entries([baseCatalogue()]);

  it('fuzzy-matches formula descriptions and ranks matches', () => {
    expect(search(list, 'sqrrt').map(({ formula }) => formula.id)).toContain('base.math.square-root');
  });

  it('keeps catalogue order for an empty query', () => {
    expect(search(list, '')).toEqual(list);
  });
});
