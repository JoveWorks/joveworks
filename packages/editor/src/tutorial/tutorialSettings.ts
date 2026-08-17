/**
 * Whether the first-load walkthrough has been seen. Persisted the same way
 * `editorSettings.ts` persists its flags: `localStorage`, wrapped in
 * try/catch so private browsing or a full quota degrades to the default
 * rather than failing the app.
 */

const TUTORIAL_SEEN_KEY = 'joveworks:settings:tutorialSeen';

export const DEFAULT_TUTORIAL_SEEN = false;

export function loadTutorialSeen(): boolean {
  try {
    const raw = window.localStorage.getItem(TUTORIAL_SEEN_KEY);
    return raw === null ? DEFAULT_TUTORIAL_SEEN : raw === 'true';
  } catch {
    return DEFAULT_TUTORIAL_SEEN;
  }
}

export function saveTutorialSeen(seen: boolean): void {
  try {
    window.localStorage.setItem(TUTORIAL_SEEN_KEY, String(seen));
  } catch {
    // Same convenience-not-requirement stance as catalogueCache.ts.
  }
}
