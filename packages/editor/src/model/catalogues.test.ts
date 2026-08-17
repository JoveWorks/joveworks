import { describe, expect, it } from 'vitest';

import { baseCatalogue, entries, search } from './catalogues';

describe('catalogue search', () => {
  const list = entries([baseCatalogue()]);

  it('fuzzy-matches formula descriptions and ranks matches', () => {
    expect(search(list, 'sqrrt').map(({ formula }) => formula.id)).toContain('squareRoot');
  });

  it('keeps catalogue order for an empty query', () => {
    expect(search(list, '')).toEqual(list);
  });
});
