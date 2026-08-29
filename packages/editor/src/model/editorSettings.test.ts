import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ADVANCED_NODES,
  DEFAULT_CANVAS_CONTROLS_VISIBLE,
  DEFAULT_CONTOUR_PALETTE,
  DEFAULT_NOTEBOOK_WIDTH,
  DEFAULT_PALETTE_AT_BOTTOM,
  DEFAULT_PALETTE_HEIGHT,
  DEFAULT_PALETTE_WIDTH,
  DEFAULT_SNAP_TO_GRID,
  loadAdvancedNodes,
  loadCanvasControlsVisible,
  loadContourPalette,
  loadHubUrl,
  loadNotebookWidth,
  loadPaletteAtBottom,
  loadPaletteHeight,
  loadPaletteWidth,
  loadSnapToGrid,
  saveAdvancedNodes,
  saveCanvasControlsVisible,
  saveContourPalette,
  saveHubUrl,
  saveNotebookWidth,
  savePaletteAtBottom,
  savePaletteHeight,
  savePaletteWidth,
  saveSnapToGrid,
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

  it('persists magnetic-grid snapping independently of a graph file', () => {
    expect(loadSnapToGrid()).toBe(DEFAULT_SNAP_TO_GRID);

    saveSnapToGrid(true);

    expect(loadSnapToGrid()).toBe(true);
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

  it('defaults advanced nodes to off and persists the student turning it on', () => {
    expect(DEFAULT_ADVANCED_NODES).toBe(false);
    expect(loadAdvancedNodes()).toBe(false);

    saveAdvancedNodes(true);
    expect(loadAdvancedNodes()).toBe(true);

    saveAdvancedNodes(false);
    expect(loadAdvancedNodes()).toBe(false);
  });

  it('remembers the last successful Hub address independently of a course or workspace', () => {
    expect(loadHubUrl()).toBeUndefined();

    saveHubUrl('https://course.example.edu');

    expect(loadHubUrl()).toBe('https://course.example.edu');
  });

  it('defaults the palette to the left and persists pinning it to the bottom', () => {
    expect(loadPaletteAtBottom()).toBe(DEFAULT_PALETTE_AT_BOTTOM);

    savePaletteAtBottom(true);
    expect(loadPaletteAtBottom()).toBe(true);

    savePaletteAtBottom(false);
    expect(loadPaletteAtBottom()).toBe(false);
  });

  it('restores palette height and rejects a stale value outside its usable range', () => {
    expect(loadPaletteHeight()).toBe(DEFAULT_PALETTE_HEIGHT);

    savePaletteHeight(340);
    expect(loadPaletteHeight()).toBe(340);

    window.localStorage.setItem('joveworks:settings:paletteHeight', '20');
    expect(loadPaletteHeight()).toBe(DEFAULT_PALETTE_HEIGHT);
  });
});
