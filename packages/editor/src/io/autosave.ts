/**
 * Recovery from an accidental tab close, not a replacement for explicit
 * Save (`files.ts`). A single localStorage slot holds the most recent
 * snapshot of whatever unsaved work is open; App.tsx refreshes it on a timer
 * and offers it back as a "restore unsaved work?" prompt the next time the
 * app loads. Explicit Save clears the slot — the document is safely on
 * disk, so there is nothing left to recover.
 */

const AUTOSAVE_KEY = 'joveworks:autosave';
/** A snapshot that could not be opened, moved out of the slot the timer overwrites. */
const SET_ASIDE_KEY = 'joveworks:autosave:set-aside';

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
  return readSnapshot(AUTOSAVE_KEY);
}

function readSnapshot(key: string): AutosaveSnapshot | undefined {
  try {
    const raw = window.localStorage.getItem(key);
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

/**
 * Keep a snapshot this build could not open out of harm's way. Left in the
 * autosave slot it would be overwritten by the first timer tick after the
 * student starts working on the default document instead — and a snapshot
 * that fails to open today (a newer build wrote it, or a bug in this one)
 * may well open on the next release.
 */
export function setAsideAutosaveSnapshot(snapshot: AutosaveSnapshot): void {
  try {
    window.localStorage.setItem(SET_ASIDE_KEY, JSON.stringify(snapshot));
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // If it cannot be set aside, leave it where it is.
  }
}

export function loadSetAsideSnapshot(): AutosaveSnapshot | undefined {
  return readSnapshot(SET_ASIDE_KEY);
}

export function clearSetAsideSnapshot(): void {
  try {
    window.localStorage.removeItem(SET_ASIDE_KEY);
  } catch {
    // As above.
  }
}
