/**
 * Recovery from an accidental tab close, not a replacement for explicit
 * Save (`files.ts`). A single localStorage slot holds the most recent
 * snapshot of whatever unsaved work is open; App.tsx refreshes it on a timer
 * and offers it back as a "restore unsaved work?" prompt the next time the
 * app loads. Explicit Save clears the slot — the document is safely on
 * disk, so there is nothing left to recover.
 */

const AUTOSAVE_KEY = 'joveworks:autosave';

export interface AutosaveSnapshot {
  readonly text: string;
  readonly savedAt: number;
}

export function saveAutosaveSnapshot(text: string): void {
  try {
    const snapshot: AutosaveSnapshot = { text, savedAt: Date.now() };
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
  } catch {
    // Private browsing, or storage full: autosave is a convenience the
    // session loses, not a requirement this one fails over.
  }
}

export function loadAutosaveSnapshot(): AutosaveSnapshot | undefined {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as Partial<AutosaveSnapshot>;
    if (typeof parsed.text !== 'string' || typeof parsed.savedAt !== 'number') return undefined;
    return { text: parsed.text, savedAt: parsed.savedAt };
  } catch {
    return undefined;
  }
}

export function clearAutosaveSnapshot(): void {
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Same convenience-not-requirement stance as above.
  }
}
