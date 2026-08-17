/**
 * Small standalone editor preferences that don't warrant their own module —
 * such as whether the minimap and title math are drawn. Persisted the same way
 * `numberFormat.ts` is: `localStorage`, wrapped in try/catch so private
 * browsing or a full quota degrades to the default rather than failing the
 * app.
 */

const MINIMAP_KEY = 'joveworks:settings:minimapVisible';

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
