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
    window.localStorage.setItem(KEY, JSON.stringify(sources));
  } catch {
    // A remembered source is a convenience; the current course still works.
  }
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
