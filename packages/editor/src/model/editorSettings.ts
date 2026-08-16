/**
 * Small standalone editor preferences that don't warrant their own module —
 * today just whether the minimap is drawn. Persisted the same way
 * `numberFormat.ts` is: `localStorage`, wrapped in try/catch so private
 * browsing or a full quota degrades to the default rather than failing the
 * app.
 */

const MINIMAP_KEY = 'mds:settings:minimapVisible';

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

const THEME_KEY = 'mds:settings:theme';

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
