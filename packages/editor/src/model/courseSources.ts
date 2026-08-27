/** Remember course sources and their last safe manifest, never their token. */

import type { HubCourse } from './hub';

const KEY = 'joveworks:course-sources';

export function loadCourseSources(): readonly HubCourse[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHubCourse);
  } catch {
    return [];
  }
}

export function saveCourseSources(sources: readonly HubCourse[]): void {
  try {
    // Drop `catalogueContents` before persisting: it is the full catalogue
    // documents, already duplicated into `catalogueCache` by id once parsed,
    // and "last safe manifest" was always meant to be the small refs list —
    // not a second copy of potentially-restricted content sitting in
    // localStorage for as long as the course source is remembered. Losing it
    // here just means the next session falls back to `loadCatalogue`'s
    // per-ref fetch, exactly like a Hub that never inlined it.
    window.localStorage.setItem(KEY, JSON.stringify(sources.map(withoutInlineContents)));
  } catch {
    // A remembered source is a convenience; the current course still works.
  }
}

function withoutInlineContents(source: HubCourse): HubCourse {
  if (source.catalogueContents === undefined) return source;
  const { catalogueContents: _catalogueContents, ...rest } = source;
  return rest;
}

export function withCourseSource(sources: readonly HubCourse[], source: HubCourse): readonly HubCourse[] {
  return [source, ...sources.filter((candidate) => candidate.hubUrl !== source.hubUrl || candidate.slug !== source.slug)];
}

function isHubCourse(value: unknown): value is HubCourse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<HubCourse>;
  return typeof candidate.hubUrl === 'string'
    && typeof candidate.slug === 'string'
    && typeof candidate.title === 'string'
    && (candidate.catalogues === undefined || (
      Array.isArray(candidate.catalogues)
      && candidate.catalogues.every((catalogue) =>
        typeof catalogue === 'object'
        && catalogue !== null
        && typeof catalogue.id === 'string'
        && typeof catalogue.version === 'number'
        && typeof catalogue.hash === 'string',
      )
    ))
    && Array.isArray(candidate.publications)
    && candidate.publications.every((publication) =>
      typeof publication === 'object'
      && publication !== null
      && typeof publication.id === 'string'
      && typeof publication.title === 'string'
      && (publication.mode === 'viewer' || publication.mode === 'editor')
      && typeof publication.publishedAt === 'string',
    );
}
