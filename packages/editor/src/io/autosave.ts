/**
 * Recovery from an accidental tab close, not a replacement for explicit
 * Save (`files.ts`). App.tsx refreshes a snapshot of unsaved work on a timer
 * and offers it back the next time the app loads. Explicit Save clears it —
 * the document is safely on disk, so there is nothing left to recover.
 *
 * **One slot per tab.** A single shared slot let two tabs with different
 * unsaved documents overwrite each other's snapshot, and opening a file in
 * one cleared the other's. Each tab now writes under its own id, kept in
 * `sessionStorage` so it survives a reload of that tab and no other. A tab
 * restores its own slot after a reload; a new tab, finding none, takes over
 * the newest slot a *closed* tab left behind — which is what recovering from
 * a closed tab needs — and never one a tab still has open. A tab marks its
 * slot as left when it unloads; a slot nobody has written for
 * `ABANDONED_AFTER_MS` counts as left too, since a tab that is open with
 * unsaved work rewrites its slot on every timer tick, and one that crashed
 * never got to mark it.
 */

/** The one slot every build before per-tab slots wrote; read as a leftover, never written. */
const LEGACY_KEY = 'joveworks:autosave';
const SLOT_PREFIX = 'joveworks:autosave:tab:';
const TAB_KEY = 'joveworks:tab';
/** Enough for a few tabs at once; the oldest beyond this are dropped. */
const MAX_SLOTS = 5;
/** Well past App.tsx's 30 s tick, and past a background tab's throttled one. */
const ABANDONED_AFTER_MS = 5 * 60_000;
/** A snapshot that could not be opened, moved out of the slot the timer overwrites. */
const SET_ASIDE_KEY = 'joveworks:autosave:set-aside';

export interface AutosaveSnapshot {
  readonly text: string;
  readonly savedAt: number;
  /** The storage key it was read from, when it was read from one. */
  readonly slot?: string;
  /** Written as its tab unloaded — so no tab is still working on it. */
  readonly left?: boolean;
}

let fallbackTabId: string | undefined;

/** This tab's id: stable across its reloads, distinct from every other tab's. */
function tabId(): string {
  try {
    const existing = window.sessionStorage.getItem(TAB_KEY);
    if (existing !== null) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(TAB_KEY, created);
    return created;
  } catch {
    fallbackTabId ??= crypto.randomUUID();
    return fallbackTabId;
  }
}

const ownSlot = (): string => `${SLOT_PREFIX}${tabId()}`;

function slotKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key !== null && (key === LEGACY_KEY || key.startsWith(SLOT_PREFIX))) keys.push(key);
  }
  return keys;
}

/** `leaving` on the way out of the tab, so another tab may take the work over. */
export function saveAutosaveSnapshot(text: string, leaving = false): void {
  try {
    window.localStorage.setItem(ownSlot(), JSON.stringify({ text, savedAt: Date.now(), ...(leaving ? { left: true } : {}) }));
    const stale = slotKeys()
      .map((key) => ({ key, savedAt: readSnapshot(key)?.savedAt ?? 0 }))
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(MAX_SLOTS);
    for (const { key } of stale) window.localStorage.removeItem(key);
  } catch {
    // Private browsing, or storage full: autosave is a convenience the
    // session loses, not a requirement this one fails over.
  }
}

/** This tab's own snapshot, or else the newest one a closed tab left behind. */
export function loadAutosaveSnapshot(): AutosaveSnapshot | undefined {
  const own = ownSlot();
  const mine = readSnapshot(own);
  if (mine !== undefined) return mine;
  const now = Date.now();
  try {
    return slotKeys()
      .map(readSnapshot)
      .filter((snapshot): snapshot is AutosaveSnapshot => snapshot !== undefined)
      .filter((snapshot) => snapshot.slot === LEGACY_KEY || snapshot.left === true || now - snapshot.savedAt > ABANDONED_AFTER_MS)
      .sort((a, b) => b.savedAt - a.savedAt)[0];
  } catch {
    return undefined;
  }
}

/** Make a restored snapshot this tab's own, so it is not offered to the next tab as well. */
export function claimAutosaveSnapshot(snapshot: AutosaveSnapshot): void {
  const own = ownSlot();
  if (snapshot.slot === undefined || snapshot.slot === own) return;
  try {
    window.localStorage.setItem(own, JSON.stringify({ text: snapshot.text, savedAt: snapshot.savedAt }));
    window.localStorage.removeItem(snapshot.slot);
  } catch {
    // Left where it was; the worst case is that it is offered again.
  }
}

function readSnapshot(key: string): AutosaveSnapshot | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as Partial<AutosaveSnapshot>;
    if (typeof parsed.text !== 'string' || typeof parsed.savedAt !== 'number') return undefined;
    return { text: parsed.text, savedAt: parsed.savedAt, slot: key, ...(parsed.left === true ? { left: true } : {}) };
  } catch {
    return undefined;
  }
}

/** This tab's snapshot only: saving or opening here says nothing about another tab's work. */
export function clearAutosaveSnapshot(): void {
  try {
    window.localStorage.removeItem(ownSlot());
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
    window.localStorage.setItem(SET_ASIDE_KEY, JSON.stringify({ text: snapshot.text, savedAt: snapshot.savedAt }));
    window.localStorage.removeItem(snapshot.slot ?? ownSlot());
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
