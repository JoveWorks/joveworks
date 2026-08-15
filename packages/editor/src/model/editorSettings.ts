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
