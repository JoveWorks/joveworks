import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDocument, hashRecord, serializeDocument } from '@joveworks/schema';

import {
  connectCourse,
  createWorkspace,
  deleteWorkspace,
  discoverCourses,
  HubCatalogueMismatchError,
  hubUrl,
  loadCatalogue,
  loadPublication,
  loadWorkspace,
  resolveCourseCatalogues,
  saveWorkspace,
  type HubCourse,
} from './hub';

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
        catalogues: [{ id: 'course-catalogue', version: 3, hash: 'abc123' }],
      })));
    vi.stubGlobal('fetch', fetch);

    await expect(connectCourse('http://localhost:8080', 'machine-design-2026', 'course-token')).resolves.toMatchObject({
      title: 'Machine design 2026',
      publications: [{ id: 'aB3dE5fG7hJ9' }],
      catalogues: [{ id: 'course-catalogue', version: 3 }],
    });
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/.well-known/joveworks', {});
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8080/api/v1/courses/machine-design-2026', {
      headers: { 'X-JoveWorks-Course-Token': 'course-token' },
    });
  });

  it('discovers course choices before a student selects one', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ protocolVersion: 1, api: '/api/v1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        protocolVersion: 1,
        courses: [{ slug: 'machine-design-2026', title: 'Machine design 2026' }],
      })));
    vi.stubGlobal('fetch', fetch);

    await expect(discoverCourses('http://localhost:8080')).resolves.toEqual([
      { slug: 'machine-design-2026', title: 'Machine design 2026' },
    ]);
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8080/api/v1/courses', {});
  });

  it('loads a publication and its exact catalogue version', async () => {
    const source = { hubUrl: 'http://localhost:8080', slug: 'machine-design-2026', title: 'Machine design 2026', publications: [], catalogues: [] };
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

  it('creates, saves, and loads an editable workspace without putting its edit token in the URL', async () => {
    const initial = emptyDocument('student-study', 'Student study');
    const changed = { ...initial, title: 'Student study — revised' };
    const saved = { id: 'Ab12Cd34Ef56', title: changed.title, document: serializeDocument(changed), catalogues: [], updatedAt: '2026-08-27 12:00:00' };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'Ab12Cd34Ef56', editToken: 'edit-capability' })))
      .mockResolvedValueOnce(new Response(JSON.stringify(saved)))
      .mockResolvedValueOnce(new Response(JSON.stringify(saved)));
    vi.stubGlobal('fetch', fetch);

    const created = await createWorkspace('http://localhost:8080', { title: initial.title, document: initial });
    expect(created.workspace).toMatchObject({ hubUrl: 'http://localhost:8080', id: 'Ab12Cd34Ef56', title: 'Student study' });
    expect(created.editToken).toBe('edit-capability');

    await expect(saveWorkspace(created.workspace, { title: changed.title, document: changed }, created.editToken)).resolves.toMatchObject({
      id: 'Ab12Cd34Ef56', title: 'Student study — revised',
    });
    await expect(loadWorkspace('http://localhost:8080', 'Ab12Cd34Ef56', 'edit-capability')).resolves.toMatchObject({
      id: 'Ab12Cd34Ef56', title: 'Student study — revised',
    });
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/api/v1/workspaces', expect.objectContaining({ method: 'POST' }));
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8080/api/v1/workspaces/Ab12Cd34Ef56', expect.objectContaining({
      method: 'PUT', headers: expect.objectContaining({ 'X-JoveWorks-Workspace-Token': 'edit-capability' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, 'http://localhost:8080/api/v1/workspaces/Ab12Cd34Ef56', expect.objectContaining({ method: 'GET' }));
  });

  it('deletes a workspace only with its edit token', async () => {
    const workspace = {
      hubUrl: 'http://localhost:8080', id: 'Ab12Cd34Ef56', title: 'Student study', document: emptyDocument('student-study', 'Student study'), catalogues: [],
    };
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);

    await expect(deleteWorkspace(workspace, 'edit-capability')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/workspaces/Ab12Cd34Ef56', expect.objectContaining({
      method: 'DELETE', headers: { 'X-JoveWorks-Workspace-Token': 'edit-capability' },
    }));
  });
});

describe('resolveCourseCatalogues', () => {
  // Invented content only — never a real Roloff & Matek formula (AGENTS.md).
  const catalogueA = { schemaVersion: 1, id: 'catalogue-a', name: 'A', restricted: false, formulas: [{ id: 'a.made-up', version: 1, expression: 'y = a*b + c' }] };
  const catalogueB = { schemaVersion: 1, id: 'catalogue-b', name: 'B', restricted: false, formulas: [] };
  // Hub uses SHA-256 catalogue revision hashes; their contents are opaque to
  // the editor transport layer, which only compares the inline hash to the ref.
  const refA = { id: 'catalogue-a', version: 1, hash: 'a'.repeat(64) };
  const refB = { id: 'catalogue-b', version: 1, hash: 'b'.repeat(64) };

  const course = (catalogueContents?: HubCourse['catalogueContents']): HubCourse => ({
    hubUrl: 'http://localhost:8080',
    slug: 'machine-design-2026',
    title: 'Machine design 2026',
    publications: [],
    catalogues: [refA, refB],
    ...(catalogueContents === undefined ? {} : { catalogueContents }),
  });

  it('resolves fully-inlined catalogues with no fetch at all', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const source = course([
      { ...refA, content: catalogueA },
      { ...refB, content: catalogueB },
    ]);

    await expect(resolveCourseCatalogues(source, source.catalogues!)).resolves.toEqual([catalogueA, catalogueB]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to per-ref fetching when a Hub sends only refs', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogueA), { headers: { ETag: `"${refA.hash}"` } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogueB), { headers: { ETag: `"${refB.hash}"` } }));
    vi.stubGlobal('fetch', fetch);
    const source = course(undefined);

    await expect(resolveCourseCatalogues(source, source.catalogues!)).resolves.toEqual([catalogueA, catalogueB]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fetches only the refs a Hub left out of a partially-inlined response', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(catalogueB), { headers: { ETag: `"${refB.hash}"` } }));
    vi.stubGlobal('fetch', fetch);
    const source = course([{ ...refA, content: catalogueA }]);

    await expect(resolveCourseCatalogues(source, source.catalogues!)).resolves.toEqual([catalogueA, catalogueB]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/catalogues/catalogue-b/1', {});
  });

  it('rejects an inline catalogue whose Hub hash does not match its ref, rather than preferring either side', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const source = course([{ ...refA, hash: 'c'.repeat(64), content: catalogueA }, { ...refB, content: catalogueB }]);

    await expect(resolveCourseCatalogues(source, source.catalogues!)).rejects.toThrow(HubCatalogueMismatchError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an inline catalogue whose version does not match its ref', async () => {
    const source = course([{ ...refA, version: 2, content: catalogueA }, { ...refB, content: catalogueB }]);

    await expect(resolveCourseCatalogues(source, source.catalogues!)).rejects.toThrow(HubCatalogueMismatchError);
  });

  it('resolves a subset of refs — a publication or workspace binding, not the whole course', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const source = course([{ ...refA, content: catalogueA }, { ...refB, content: catalogueB }]);

    await expect(resolveCourseCatalogues(source, [refB])).resolves.toEqual([catalogueB]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the course token and surfaces the 401 message when a fallback fetch needs it', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    const source = course(undefined);

    await expect(resolveCourseCatalogues(source, [refA], 'course-token')).rejects.toThrow('course access token');
    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/catalogues/catalogue-a/1', {
      headers: { 'X-JoveWorks-Course-Token': 'course-token' },
    });
  });
});
