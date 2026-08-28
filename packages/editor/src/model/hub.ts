/**
 * The browser boundary for JoveWorks Hub.
 *
 * Hub deliberately returns ordinary JSON documents and catalogues. This layer
 * validates the small transport envelope; `loadDocument` and `loadCatalogue`
 * remain the authoritative schema validators when App.tsx opens the content.
 * Course access tokens are accepted for this browser session only. The source
 * itself is remembered, but a secret never joins localStorage.
 */

import { loadDocument, serializeDocument, type CompiledNotebook, type GraphDocument, type JsonValue } from '@joveworks/schema';

const PROTOCOL_VERSION = 1;

export interface HubPublicationSummary {
  readonly id: string;
  readonly title: string;
  readonly mode: 'viewer' | 'editor';
  readonly publishedAt: string;
}

export interface HubCourse {
  readonly hubUrl: string;
  readonly slug: string;
  readonly title: string;
  readonly publications: readonly HubPublicationSummary[];
  /** Every immutable catalogue revision currently used by this course. */
  readonly catalogues?: readonly HubCatalogueRef[];
  /**
   * The same catalogues' full documents, inline — a Hub new enough to send
   * this spares the client the extra round trip `loadCatalogue` would
   * otherwise need per entry in `catalogues`. Optional for the same reason
   * `catalogues` refs alone remain fully supported: an older Hub, or one
   * Thomas hasn't redeployed yet, sends only refs, and the client falls back
   * to fetching each one individually.
   */
  readonly catalogueContents?: readonly HubCatalogueContent[];
}

/** Enough metadata to choose a course before loading its full manifest. */
export interface HubCourseSummary {
  readonly slug: string;
  readonly title: string;
}

export interface HubCatalogueRef {
  readonly id: string;
  readonly version: number;
  readonly hash: string;
}

/**
 * A catalogue ref plus the document it points to, both delivered in the same
 * course response. `id`/`version`/`hash` are repeated here (rather than
 * nesting under the ref) so this shape stands on its own the way
 * `HubCatalogueRef` does; `resolveCourseCatalogues` still cross-checks it
 * against the matching entry in `catalogues` rather than trusting it alone —
 * see the hash note there.
 */
export interface HubCatalogueContent extends HubCatalogueRef {
  readonly content: JsonValue;
}

export interface HubPublication {
  readonly id: string;
  readonly title: string;
  readonly mode: 'viewer' | 'editor';
  readonly document: JsonValue;
  readonly catalogues: readonly HubCatalogueRef[];
}

/** A student-owned mutable workspace, identified by the Hub and protected by an edit capability. */
export interface HubWorkspace {
  readonly hubUrl: string;
  readonly id: string;
  readonly title: string;
  readonly document: GraphDocument;
  readonly courseSlug?: string;
  readonly catalogues: readonly HubCatalogueRef[];
  readonly updatedAt?: string;
}

export interface HubWorkspaceDraft {
  readonly title: string;
  readonly document: GraphDocument;
  readonly compiledNotebook: CompiledNotebook;
  readonly courseSlug?: string;
  readonly catalogues?: readonly HubCatalogueRef[];
}

export interface CreatedHubWorkspace {
  readonly workspace: HubWorkspace;
  /** Store this capability locally; never put it in a shareable URL. */
  readonly editToken: string;
}

/** The token is deliberately an argument, never included in a shareable workspace link. */
const WORKSPACE_TOKEN_HEADER = 'X-JoveWorks-Workspace-Token';

export function hubUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Enter a complete Hub address, such as https://course.example.edu.');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('A Hub must use HTTPS (HTTP is accepted only for localhost).');
  }
  if (url.search !== '' || url.hash !== '') throw new Error('Use the Hub address without a query or fragment.');
  return url.toString().replace(/\/$/, '');
}

export async function connectCourse(
  rawHubUrl: string,
  courseSlug: string,
  courseToken?: string,
): Promise<HubCourse> {
  const base = hubUrl(rawHubUrl);
  const slug = courseSlug.trim();
  if (slug.length === 0) throw new Error('Enter the course slug supplied by your instructor.');
  const discovery = await discover(base);
  const course = await getJson(resolve(base, `${discovery.api}/courses/${encodeURIComponent(slug)}`), courseToken);
  return parseCourse(base, course);
}

/** Discover the courses exposed by a compatible Hub without knowing a slug. */
export async function discoverCourses(rawHubUrl: string): Promise<readonly HubCourseSummary[]> {
  const base = hubUrl(rawHubUrl);
  const discovery = await discover(base);
  const index = await getJson(resolve(base, `${discovery.api}/courses`));
  if (!isObject(index) || index.protocolVersion !== PROTOCOL_VERSION || !Array.isArray(index.courses)) {
    throw new Error('The Hub returned an invalid course list.');
  }
  return index.courses.map((course) => {
    if (!isObject(course) || typeof course.slug !== 'string' || typeof course.title !== 'string') {
      throw new Error('The Hub course list contains an invalid course.');
    }
    return { slug: course.slug, title: course.title };
  });
}

export async function loadPublication(
  source: HubCourse,
  publicationId: string,
  courseToken?: string,
): Promise<HubPublication> {
  const publication = await getJson(
    resolve(source.hubUrl, `/api/v1/publications/${encodeURIComponent(publicationId)}`),
    courseToken,
  );
  if (!isObject(publication) || publication.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error('The Hub returned an incompatible publication.');
  }
  if (publication.id !== publicationId || typeof publication.title !== 'string' || !isMode(publication.mode)) {
    throw new Error('The Hub returned an invalid publication.');
  }
  if (!('document' in publication) || !Array.isArray(publication.catalogues)) {
    throw new Error('The Hub publication is missing its document or catalogue references.');
  }
  return {
    id: publication.id,
    title: publication.title,
    mode: publication.mode,
    document: publication.document as JsonValue,
    catalogues: publication.catalogues.map(parseCatalogueRef),
  };
}

/**
 * A catalogue whose `hash` (and/or `version`) does not match the ref it is
 * meant to satisfy — whether that ref came from a separate fetch's ETag or
 * from a Hub's inline `catalogueContents`. Graphs reference formulas by id,
 * version, and content hash (AGENTS.md); silently accepting a mismatched
 * catalogue would let a student recompute different numbers than the ones
 * their graph was saved against, so this is a hard failure rather than a
 * fallback to whichever source disagreed.
 */
export class HubCatalogueMismatchError extends Error {
  override readonly name = 'HubCatalogueMismatchError';
  constructor(id: string) {
    super(`Catalogue ${id} does not match the published revision.`);
  }
}

export async function loadCatalogue(
  source: HubCourse,
  catalogue: HubCatalogueRef,
  courseToken?: string,
): Promise<JsonValue> {
  const response = await getJsonResponse(
    resolve(source.hubUrl, `/api/v1/catalogues/${encodeURIComponent(catalogue.id)}/${catalogue.version}`),
    courseToken,
  );
  // A publication's catalogue reference is load-bearing. The path pins the
  // server's immutable version; ETag also proves the response is the exact
  // content hash the publication named, rather than merely an id/version that
  // a broken or misconfigured server happened to return.
  const hash = response.etag?.replace(/^"|"$/g, '');
  if (hash !== catalogue.hash) throw new HubCatalogueMismatchError(catalogue.id);
  return response.value;
}

/**
 * Every catalogue in `refs` (a publication's, a workspace's, or a whole
 * course's), resolved with no second round trip for any ref `source`
 * already inlined via `catalogueContents`. `refs` is a caller-supplied list
 * rather than always `source.catalogues`, because a publication or a saved
 * workspace can reference a subset of the course's catalogues; matching is
 * still against `source.catalogueContents` by id, so an inline entry helps
 * whichever ref list needs it. A ref missing from `catalogueContents` (an
 * older Hub that sent none, or one that only inlined some) falls back to the
 * existing per-ref `loadCatalogue` fetch, so a refs-only Hub keeps working
 * unchanged, and partial inlining works the same way one ref at a time.
 *
 * Inline content is never trusted at face value: each one is matched to its
 * ref by id, version, and the same server-issued SHA-256 value a separate
 * fetch exposes as its ETag. Hub's catalogue hash is a transport/content
 * revision hash; it is intentionally distinct from the schema's FNV formula
 * hashes. A mismatch
 * throws `HubCatalogueMismatchError` instead of silently preferring the
 * inline copy or the ref.
 *
 * Restricted catalogue content is gated by the course token on the request
 * (unchanged — see the module header), not by any client-side encryption of
 * the payload: an inline entry is a plain catalogue document like any other,
 * and this function does not special-case locked/encrypted catalogues.
 */
export async function resolveCourseCatalogues(
  source: HubCourse,
  refs: readonly HubCatalogueRef[],
  courseToken?: string,
): Promise<readonly JsonValue[]> {
  const inline = new Map((source.catalogueContents ?? []).map((entry) => [`${entry.id}\n${entry.version}`, entry] as const));
  return Promise.all(refs.map(async (ref) => {
    const content = inline.get(`${ref.id}\n${ref.version}`);
    if (content === undefined) {
      if ((source.catalogueContents ?? []).some((entry) => entry.id === ref.id)) {
        throw new HubCatalogueMismatchError(ref.id);
      }
      return loadCatalogue(source, ref, courseToken);
    }
    if (content.id !== ref.id || content.version !== ref.version || content.hash !== ref.hash) {
      throw new HubCatalogueMismatchError(ref.id);
    }
    return content.content;
  }));
}

export async function createWorkspace(
  rawHubUrl: string,
  draft: HubWorkspaceDraft,
): Promise<CreatedHubWorkspace> {
  const base = hubUrl(rawHubUrl);
  const value = await requestJson(
    resolve(base, '/api/v1/workspaces'),
    'POST',
    {
      title: draft.title,
      document: serializeDocument(draft.document),
      compiledNotebook: draft.compiledNotebook as unknown as JsonValue,
      ...(draft.courseSlug === undefined ? {} : { courseSlug: draft.courseSlug, catalogues: (draft.catalogues ?? []).map((catalogue) => ({ id: catalogue.id, version: catalogue.version, hash: catalogue.hash })) }),
    },
  );
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.editToken !== 'string') {
    throw new Error('The Hub did not return an edit token for the new workspace.');
  }
  return {
    workspace: { hubUrl: base, id: value.id, title: draft.title, document: draft.document, ...(draft.courseSlug === undefined ? { catalogues: [] } : { courseSlug: draft.courseSlug, catalogues: draft.catalogues ?? [] }) },
    editToken: value.editToken,
  };
}

export async function loadWorkspace(
  rawHubUrl: string,
  workspaceId: string,
  workspaceToken: string,
): Promise<HubWorkspace> {
  const base = hubUrl(rawHubUrl);
  const value = await requestJson(
    resolve(base, `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`),
    'GET',
    undefined,
    workspaceToken,
  );
  return parseWorkspace(base, value);
}

export async function saveWorkspace(
  workspace: HubWorkspace,
  draft: HubWorkspaceDraft,
  workspaceToken: string,
): Promise<HubWorkspace> {
  const value = await requestJson(
    resolve(workspace.hubUrl, `/api/v1/workspaces/${encodeURIComponent(workspace.id)}`),
    'PUT',
    {
      title: draft.title,
      document: serializeDocument(draft.document),
      compiledNotebook: draft.compiledNotebook as unknown as JsonValue,
      ...(draft.courseSlug === undefined ? {} : { courseSlug: draft.courseSlug, catalogues: (draft.catalogues ?? []).map((catalogue) => ({ id: catalogue.id, version: catalogue.version, hash: catalogue.hash })) }),
    },
    workspaceToken,
  );
  return parseWorkspace(workspace.hubUrl, value);
}

export async function deleteWorkspace(workspace: HubWorkspace, workspaceToken: string): Promise<void> {
  await requestJson(
    resolve(workspace.hubUrl, `/api/v1/workspaces/${encodeURIComponent(workspace.id)}`),
    'DELETE',
    undefined,
    workspaceToken,
  );
}

export async function createWorkspaceShare(workspace: HubWorkspace, workspaceToken: string): Promise<string> {
  const value = await requestJson(resolve(workspace.hubUrl, `/api/v1/workspaces/${encodeURIComponent(workspace.id)}/shares`), 'POST', undefined, workspaceToken);
  if (!isObject(value) || typeof value.url !== 'string') throw new Error('The Hub returned an invalid student share link.');
  return value.url;
}

export async function loadSharedWorkspace(rawHubUrl: string, shareId: string): Promise<HubWorkspace> {
  const base = hubUrl(rawHubUrl);
  return parseWorkspace(base, await requestJson(resolve(base, `/api/v1/shares/${encodeURIComponent(shareId)}`), 'GET'));
}

function resolve(base: string, path: string): string {
  return new URL(path.replace(/^\//, ''), `${base}/`).toString();
}

async function getJson(url: string, courseToken?: string): Promise<JsonValue> {
  return (await getJsonResponse(url, courseToken)).value;
}

interface JsonResponse {
  readonly value: JsonValue;
  readonly etag?: string;
}

async function getJsonResponse(url: string, courseToken?: string): Promise<JsonResponse> {
  let response: Response;
  try {
    response = await fetch(
      url,
      courseToken === undefined || courseToken.length === 0 ? {} : { headers: { 'X-JoveWorks-Course-Token': courseToken } },
    );
  } catch {
    throw new Error('Could not reach that Hub. Check the address and your connection.');
  }
  if (response.status === 401) throw new Error('This course material needs the course access token. Connect again and enter it.');
  if (response.status === 404) throw new Error('That course material was not found on this Hub.');
  if (!response.ok) throw new Error(`The Hub could not complete this request (${response.status}).`);
  try {
    const value = await response.json() as JsonValue;
    const etag = response.headers.get('ETag');
    return etag === null ? { value } : { value, etag };
  } catch {
    throw new Error('The Hub returned invalid JSON.');
  }
}

async function requestJson(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: JsonValue,
  workspaceToken?: string,
): Promise<JsonValue> {
  const headers: Record<string, string> = {};
  if (workspaceToken !== undefined && workspaceToken.length > 0) headers[WORKSPACE_TOKEN_HEADER] = workspaceToken;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Could not reach that Hub. Check the address and your connection.');
  }
  if (response.status === 401) throw new Error('This workspace needs an access token.');
  if (response.status === 404) throw new Error('That workspace was not found on this Hub.');
  if (response.status === 409 || response.status === 412) throw new Error('This workspace changed elsewhere; reload it before saving.');
  if (!response.ok) throw new Error(`The Hub could not complete this workspace request (${response.status}).`);
  if (response.status === 204) return null;
  try {
    return await response.json() as JsonValue;
  } catch {
    throw new Error('The Hub returned invalid workspace JSON.');
  }
}

function parseWorkspace(hubUrl_: string, value: JsonValue): HubWorkspace {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || !('document' in value) || !Array.isArray(value.catalogues)) {
    throw new Error('The Hub returned an invalid workspace.');
  }
  let document: GraphDocument;
  try {
    document = loadDocument(JSON.stringify(value.document));
  } catch {
    throw new Error('The Hub returned an invalid workspace document.');
  }
  return {
    hubUrl: hubUrl_,
    id: value.id,
    title: value.title,
    document,
    ...(typeof value.courseSlug === 'string' ? { courseSlug: value.courseSlug } : {}),
    catalogues: value.catalogues.map(parseCatalogueRef),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  };
}

function parseCourse(hubUrl_: string, value: JsonValue): HubCourse {
  if (!isObject(value) || value.protocolVersion !== PROTOCOL_VERSION || typeof value.slug !== 'string' || typeof value.title !== 'string' || !Array.isArray(value.publications) || !Array.isArray(value.catalogues)) {
    throw new Error('The Hub returned an invalid course manifest.');
  }
  if (value.catalogueContents !== undefined && !Array.isArray(value.catalogueContents)) {
    throw new Error('The Hub returned invalid inline catalogue contents.');
  }
  return {
    hubUrl: hubUrl_,
    slug: value.slug,
    title: value.title,
    publications: value.publications.map(parsePublicationSummary),
    catalogues: value.catalogues.map(parseCatalogueRef),
    ...(value.catalogueContents === undefined ? {} : { catalogueContents: value.catalogueContents.map(parseCatalogueContent) }),
  };
}

async function discover(base: string): Promise<{ readonly api: string }> {
  const discovery = await getJson(resolve(base, '/.well-known/joveworks'));
  if (!isObject(discovery) || discovery.protocolVersion !== PROTOCOL_VERSION || typeof discovery.api !== 'string') {
    throw new Error('That server is not a compatible JoveWorks Hub.');
  }
  return { api: discovery.api };
}

function parsePublicationSummary(value: JsonValue): HubPublicationSummary {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || !isMode(value.mode) || typeof value.publishedAt !== 'string') {
    throw new Error('The Hub course manifest contains an invalid publication.');
  }
  return { id: value.id, title: value.title, mode: value.mode, publishedAt: value.publishedAt };
}

function parseCatalogueRef(value: JsonValue): HubCatalogueRef {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.version !== 'number' || !Number.isInteger(value.version) || typeof value.hash !== 'string') {
    throw new Error('The Hub publication contains an invalid catalogue reference.');
  }
  return { id: value.id, version: value.version, hash: value.hash };
}

function parseCatalogueContent(value: JsonValue): HubCatalogueContent {
  if (
    !isObject(value)
    || typeof value.id !== 'string'
    || typeof value.version !== 'number'
    || !Number.isInteger(value.version)
    || typeof value.hash !== 'string'
    || !('content' in value)
  ) {
    throw new Error('The Hub course manifest contains an invalid inline catalogue.');
  }
  return { id: value.id, version: value.version, hash: value.hash, content: value.content as JsonValue };
}

function isMode(value: unknown): value is 'viewer' | 'editor' {
  return value === 'viewer' || value === 'editor';
}

function isObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
