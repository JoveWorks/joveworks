import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cacheCatalogue, cachedCatalogueTexts } from './catalogueCache';

describe('catalogue cache', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        get length() {
          return storage.size;
        },
        key: (i: number) => [...storage.keys()][i] ?? null,
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('caches a catalogue by its own id and lists its text back', () => {
    cacheCatalogue('demo-restricted', '{"id":"demo-restricted"}');
    expect(cachedCatalogueTexts()).toEqual(['{"id":"demo-restricted"}']);
  });
});
