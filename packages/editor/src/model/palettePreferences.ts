/** Palette-only preferences. They are local to this browser, never graph data. */

const FAVOURITES_KEY = 'joveworks:palette:favourites';

export function loadFavourites(): ReadonlySet<string> {
  try {
    const value = JSON.parse(localStorage.getItem(FAVOURITES_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveFavourites(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...ids]));
  } catch {
    // Preferences are a convenience. A blocked/full store must not break the editor.
  }
}
