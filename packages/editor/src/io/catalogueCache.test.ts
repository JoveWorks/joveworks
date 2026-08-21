import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cacheCatalogue, cachedCatalogueTexts, markLockedCatalogueUnlocked, unlockedLockedCatalogueIds } from './catalogueCache';

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

  it('starts with no locked catalogue marked unlocked', () => {
    expect(unlockedLockedCatalogueIds()).toEqual(new Set());
  });

  it('remembers a locked catalogue as unlocked by its own id, not the decrypted content', () => {
    markLockedCatalogueUnlocked('rm-c16-belt');
    expect(unlockedLockedCatalogueIds()).toEqual(new Set(['rm-c16-belt']));
  });

  it('accumulates rather than overwriting on a second unlock', () => {
    markLockedCatalogueUnlocked('rm-c16-belt');
    markLockedCatalogueUnlocked('rm-2026-fall');
    expect(unlockedLockedCatalogueIds()).toEqual(new Set(['rm-c16-belt', 'rm-2026-fall']));
  });

  it('does not mark the same id twice', () => {
    markLockedCatalogueUnlocked('rm-c16-belt');
    markLockedCatalogueUnlocked('rm-c16-belt');
    expect(unlockedLockedCatalogueIds()).toEqual(new Set(['rm-c16-belt']));
  });
});
