import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_CONTOUR_PALETTE,
  loadContourPalette,
  saveContourPalette,
} from './editorSettings';

describe('contour palette preference', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('defaults to Viridis and restores a selected palette', () => {
    expect(loadContourPalette()).toBe(DEFAULT_CONTOUR_PALETTE);

    saveContourPalette('cividis');
    expect(loadContourPalette()).toBe('cividis');
  });

  it('ignores a stale palette value', () => {
    window.localStorage.setItem('joveworks:settings:contourPalette', 'rainbow');
    expect(loadContourPalette()).toBe(DEFAULT_CONTOUR_PALETTE);
  });
});
