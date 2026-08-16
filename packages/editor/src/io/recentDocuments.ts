/**
 * "Recent" for a file menu that has no real filesystem to remember paths
 * in — the browser file picker (`files.ts`) hands back text once and
 * forgets it. So the ribbon's Recent list, like `catalogueCache.ts` for
 * catalogues, caches the document's own content in localStorage, keyed by
 * its id, and reopening a recent entry replays that content rather than
 * re-prompting a file dialog.
 */

import { type GraphDocument, saveDocument } from '@mds/schema';

const RECENT_KEY = 'mds:recent';
const MAX_RECENT = 8;

export interface RecentDocument {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly openedAt: number;
}

export function loadRecentDocuments(): readonly RecentDocument[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentDocument =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentDocument).id === 'string' &&
        typeof (entry as RecentDocument).title === 'string' &&
        typeof (entry as RecentDocument).text === 'string' &&
        typeof (entry as RecentDocument).openedAt === 'number',
    );
  } catch {
    return [];
  }
}

/** Record a document as most-recently-used, replacing any earlier entry
 * with the same id and capping the list at `MAX_RECENT`. */
export function recordRecentDocument(document: GraphDocument): void {
  try {
    const entry: RecentDocument = {
      id: document.id,
      title: document.title,
      text: saveDocument(document),
      openedAt: Date.now(),
    };
    const rest = loadRecentDocuments().filter((existing) => existing.id !== document.id);
    const next = [entry, ...rest].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private browsing, or storage full: the Recent list is a convenience
    // that degrades to empty, not a requirement the app fails over.
  }
}
