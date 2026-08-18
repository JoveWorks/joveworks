/**
 * Small standalone editor preferences that don't warrant their own module —
 * such as whether the minimap and title math are drawn. Persisted the same way
 * `numberFormat.ts` is: `localStorage`, wrapped in try/catch so private
 * browsing or a full quota degrades to the default rather than failing the
 * app.
 */

const MINIMAP_KEY = 'joveworks:settings:minimapVisible';
const LANGUAGE_KEY = 'joveworks:settings:language';
const CANVAS_CONTROLS_VISIBLE_KEY = 'joveworks:settings:canvasControlsVisible';
const PALETTE_WIDTH_KEY = 'joveworks:settings:paletteWidth';
const NOTEBOOK_WIDTH_KEY = 'joveworks:settings:notebookWidth';

export type AppLocale = 'en' | 'nl';

export function loadAppLocale(): AppLocale {
  try {
    const raw = window.localStorage.getItem(LANGUAGE_KEY);
    if (raw === 'en' || raw === 'nl') return raw;
    return navigator.language.toLowerCase().startsWith('nl') ? 'nl' : 'en';
  } catch {
    return 'en';
  }
}

export function saveAppLocale(locale: AppLocale): void {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, locale);
  } catch {
    // A preference must not prevent the editor starting.
  }
}

/** Off by default — a small canvas overview is a convenience, not something
 * every graph is big enough to need cluttering the view for. */
export const DEFAULT_MINIMAP_VISIBLE = false;

export function loadMinimapVisible(): boolean {
  try {
    const raw = window.localStorage.getItem(MINIMAP_KEY);
    return raw === null ? DEFAULT_MINIMAP_VISIBLE : raw === 'true';
  } catch {
    return DEFAULT_MINIMAP_VISIBLE;
  }
}

export function saveMinimapVisible(visible: boolean): void {
  try {
    window.localStorage.setItem(MINIMAP_KEY, String(visible));
  } catch {
    // Same convenience-not-requirement stance as catalogueCache.ts.
  }
}

function loadBoolean(key: string, defaultValue: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? defaultValue : raw === 'true';
  } catch {
    return defaultValue;
  }
}

function saveBoolean(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // A preference must not prevent the editor starting.
  }
}

/** Workspace chrome is local to this device, never part of a graph file. */
export const DEFAULT_CANVAS_CONTROLS_VISIBLE = true;

export function loadCanvasControlsVisible(): boolean {
  return loadBoolean(CANVAS_CONTROLS_VISIBLE_KEY, DEFAULT_CANVAS_CONTROLS_VISIBLE);
}

export function saveCanvasControlsVisible(visible: boolean): void {
  saveBoolean(CANVAS_CONTROLS_VISIBLE_KEY, visible);
}

export const DEFAULT_PALETTE_WIDTH = 360;
export const DEFAULT_NOTEBOOK_WIDTH = 540;

function loadWidth(key: string, defaultValue: number, min: number, max: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return defaultValue;
    const value = Number(raw);
    return Number.isFinite(value) && value >= min && value <= max ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveWidth(key: string, width: number): void {
  try {
    window.localStorage.setItem(key, String(width));
  } catch {
    // A preference must not prevent the editor starting.
  }
}

export function loadPaletteWidth(): number {
  return loadWidth(PALETTE_WIDTH_KEY, DEFAULT_PALETTE_WIDTH, 200, 480);
}

export function savePaletteWidth(width: number): void {
  saveWidth(PALETTE_WIDTH_KEY, width);
}

export function loadNotebookWidth(): number {
  return loadWidth(NOTEBOOK_WIDTH_KEY, DEFAULT_NOTEBOOK_WIDTH, 240, 800);
}

export function saveNotebookWidth(width: number): void {
  saveWidth(NOTEBOOK_WIDTH_KEY, width);
}

const TITLE_MATH_KEY = 'joveworks:settings:titleMathRendering';

/** Mathematical notation is useful in engineering labels, but remains a
 * display preference: documents always contain the raw title string. */
export const DEFAULT_TITLE_MATH_RENDERING = true;

export function loadTitleMathRendering(): boolean {
  try {
    const raw = window.localStorage.getItem(TITLE_MATH_KEY);
    return raw === null ? DEFAULT_TITLE_MATH_RENDERING : raw !== 'false';
  } catch {
    return DEFAULT_TITLE_MATH_RENDERING;
  }
}

export function saveTitleMathRendering(enabled: boolean): void {
  try {
    window.localStorage.setItem(TITLE_MATH_KEY, String(enabled));
  } catch {
    // A preference must not prevent the editor starting.
  }
}

const THEME_KEY = 'joveworks:settings:theme';

export type ThemePreference = 'light' | 'dark' | 'system';

/** Follows the OS by default — a student's own preference, not this app's. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export function loadThemePreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Same convenience-not-requirement stance as catalogueCache.ts.
  }
}

const CONTOUR_PALETTE_KEY = 'joveworks:settings:contourPalette';

/** Sequential schemes make an ordered surface legible without the false
 * boundaries of a rainbow scale. Viridis is also robust for colour-vision
 * differences and in greyscale printouts. */
export const CONTOUR_PALETTES = {
  viridis: 'Viridis',
  cividis: 'Cividis',
  inferno: 'Inferno',
  magma: 'Magma',
  plasma: 'Plasma',
} as const;

export type ContourPalette = keyof typeof CONTOUR_PALETTES;

export const DEFAULT_CONTOUR_PALETTE: ContourPalette = 'viridis';

function isContourPalette(value: string | null): value is ContourPalette {
  return value !== null && value in CONTOUR_PALETTES;
}

export function loadContourPalette(): ContourPalette {
  try {
    const raw = window.localStorage.getItem(CONTOUR_PALETTE_KEY);
    return isContourPalette(raw) ? raw : DEFAULT_CONTOUR_PALETTE;
  } catch {
    return DEFAULT_CONTOUR_PALETTE;
  }
}

export function saveContourPalette(palette: ContourPalette): void {
  try {
    window.localStorage.setItem(CONTOUR_PALETTE_KEY, palette);
  } catch {
    // A preference must not prevent the editor starting.
  }
}
