import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectCourse, hubUrl, loadCatalogue, loadPublication } from './hub';

afterEach(() => vi.unstubAllGlobals());

describe('Hub addresses', () => {
  it('normalises a Hub root without widening its path', () => {
    expect(hubUrl('https://course.example.edu/')).toBe('https://course.example.edu');
    expect(hubUrl('https://engineering.example.edu/joveworks/')).toBe('https://engineering.example.edu/joveworks');
  });

  it('requires HTTPS except for local development', () => {
    expect(hubUrl('http://localhost:8080')).toBe('http://localhost:8080');
    expect(() => hubUrl('http://course.example.edu')).toThrow('HTTPS');
    expect(() => hubUrl('course.example.edu')).toThrow('complete Hub address');
  });

  it('refuses URLs whose query or fragment could change the source unexpectedly', () => {
    expect(() => hubUrl('https://course.example.edu/?course=one')).toThrow('query or fragment');
    expect(() => hubUrl('https://course.example.edu/#catalogues')).toThrow('query or fragment');
  });
});

describe('Hub API transport', () => {
  it('discovers a Hub before loading the named course', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ protocolVersion: 1, api: '/api/v1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        protocolVersion: 1,
        slug: 'machine-design-2026',
        title: 'Machine design 2026',
        publications: [{ id: 'aB3dE5fG7hJ9', title: 'Belt study', mode: 'viewer', publishedAt: '2026-08-27 08:00:00' }],
      })));
    vi.stubGlobal('fetch', fetch);

    await expect(connectCourse('http://localhost:8080', 'machine-design-2026', 'course-token')).resolves.toMatchObject({
      title: 'Machine design 2026',
      publications: [{ id: 'aB3dE5fG7hJ9' }],
    });
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/.well-known/joveworks', {});
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8080/api/v1/courses/machine-design-2026', {
      headers: { 'X-JoveWorks-Course-Token': 'course-token' },
    });
  });

  it('loads a publication and its exact catalogue version', async () => {
    const source = { hubUrl: 'http://localhost:8080', slug: 'machine-design-2026', title: 'Machine design 2026', publications: [] };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        protocolVersion: 1,
        id: 'aB3dE5fG7hJ9',
        title: 'Belt study',
        mode: 'viewer',
        document: { schemaVersion: 1, id: 'belt-study' },
        catalogues: [{ id: 'course-catalogue', version: 3, hash: 'abc123' }],
      })))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ schemaVersion: 1, id: 'course-catalogue', name: 'Course', restricted: true, formulas: [] }),
        { headers: { ETag: '"abc123"' } },
      ));
    vi.stubGlobal('fetch', fetch);

    const publication = await loadPublication(source, 'aB3dE5fG7hJ9', 'course-token');
    await expect(loadCatalogue(source, publication.catalogues[0]!, 'course-token')).resolves.toMatchObject({ id: 'course-catalogue' });
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/api/v1/publications/aB3dE5fG7hJ9', {
      headers: { 'X-JoveWorks-Course-Token': 'course-token' },
    });
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8080/api/v1/catalogues/course-catalogue/3', {
      headers: { 'X-JoveWorks-Course-Token': 'course-token' },
    });
  });
});
