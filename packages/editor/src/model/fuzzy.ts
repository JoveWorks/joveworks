/**
 * Subsequence fuzzy matching — "pdwd" finds "Pad width d" — for search boxes
 * too small for a real index (a document's own node count, not a catalogue).
 *
 * No dependency: a query matches when every one of its characters appears in
 * the target, in order, not necessarily contiguous. The score favours tight,
 * contiguous runs over scattered hits, so "width" ranks "Pad width" above
 * "Weighted distance" even though both match.
 */

/** The match score, or `undefined` when `query` is not a subsequence of `text` at all. */
export function fuzzyScore(query: string, text: string): number | undefined {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 0;

  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      streak += 1;
      score += streak;
      qi += 1;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : undefined;
}

/** `items`, kept to those `text` matches `query` against and ranked best-first; unfiltered and unranked when `query` is blank. */
export function fuzzySearch<T>(
  query: string,
  items: readonly T[],
  text: (item: T) => string,
): readonly T[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(trimmed, text(item)) }))
    .filter((entry): entry is { readonly item: T; readonly score: number } => entry.score !== undefined)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
