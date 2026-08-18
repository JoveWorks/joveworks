import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_CANVAS_CONTROLS_VISIBLE,
  DEFAULT_CONTOUR_PALETTE,
  DEFAULT_NOTEBOOK_WIDTH,
  DEFAULT_PALETTE_WIDTH,
  loadCanvasControlsVisible,
  loadContourPalette,
  loadNotebookWidth,
  loadPaletteWidth,
  saveCanvasControlsVisible,
  saveContourPalette,
  saveNotebookWidth,
  savePaletteWidth,
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

  it('restores canvas-control visibility independently of a graph file', () => {
    expect(loadCanvasControlsVisible()).toBe(DEFAULT_CANVAS_CONTROLS_VISIBLE);

    saveCanvasControlsVisible(false);

    expect(loadCanvasControlsVisible()).toBe(false);
  });

  it('restores panel widths and rejects stale values outside their usable ranges', () => {
    expect(loadPaletteWidth()).toBe(DEFAULT_PALETTE_WIDTH);
    expect(loadNotebookWidth()).toBe(DEFAULT_NOTEBOOK_WIDTH);

    savePaletteWidth(420);
    saveNotebookWidth(620);
    expect(loadPaletteWidth()).toBe(420);
    expect(loadNotebookWidth()).toBe(620);

    window.localStorage.setItem('joveworks:settings:paletteWidth', '120');
    window.localStorage.setItem('joveworks:settings:notebookWidth', 'not-a-number');
    expect(loadPaletteWidth()).toBe(DEFAULT_PALETTE_WIDTH);
    expect(loadNotebookWidth()).toBe(DEFAULT_NOTEBOOK_WIDTH);
  });
});
