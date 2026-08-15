/**
 * A loaded catalogue, persisted across a reload — behind `localStorage`, the
 * same adapter boundary as `files.ts`, so a Tauri build can swap it
 * for a real cache without touching a call site.
 *
 * Without this, the one catalogue that actually matters — the restricted
 * one, handed to a student through the LMS — had to be re-picked from
 * disk on every page load, which is the "fresh manual load every time"
 * docs/UX-SPEC.md asks to remove. Loading a corrected file back in just
 * overwrites its entry: the catalogue's own id is the cache key, and
 * `withCatalogue` already replaces by id, so there is nothing further to
 * "check the version" of.
 *
 * Never the restricted content leaving the browser — this is storage
 * local to the student's own machine, not a network call.
 */

const PREFIX = 'mds:catalogue:';

function key(id: string): string {
  return `${PREFIX}${id}`;
}

/** Cache a catalogue's own text exactly as loaded, keyed by its id. */
export function cacheCatalogue(id: string, text: string): void {
  try {
    window.localStorage.setItem(key(id), text);
  } catch {
    // Private browsing, or storage full: caching is a convenience the next
    // session loses, not a requirement this one fails over.
  }
}

/** Every cached catalogue's text, in whatever order the browser stored them. */
export function cachedCatalogueTexts(): readonly string[] {
  try {
    const texts: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const stored = window.localStorage.key(i);
      if (stored === null || !stored.startsWith(PREFIX)) continue;
      const text = window.localStorage.getItem(stored);
      if (text !== null) texts.push(text);
    }
    return texts;
  } catch {
    return [];
  }
}
