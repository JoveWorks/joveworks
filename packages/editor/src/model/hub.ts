/**
 * The browser boundary for JoveWorks Hub.
 *
 * Hub deliberately returns ordinary JSON documents and catalogues. This layer
 * validates the small transport envelope; `loadDocument` and `loadCatalogue`
 * remain the authoritative schema validators when App.tsx opens the content.
 * Course access tokens are accepted for this browser session only. The source
 * itself is remembered, but a secret never joins localStorage.
 */

import { loadDocument, serializeDocument, type GraphDocument, type JsonValue } from '@joveworks/schema';

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
}

export interface HubCatalogueRef {
  readonly id: string;
  readonly version: number;
  readonly hash: string;
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
  readonly updatedAt?: string;
}

export interface HubWorkspaceDraft {
  readonly title: string;
  readonly document: GraphDocument;
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
  const discovery = await getJson(resolve(base, '/.well-known/joveworks'));
  if (!isObject(discovery) || discovery.protocolVersion !== PROTOCOL_VERSION || typeof discovery.api !== 'string') {
    throw new Error('That server is not a compatible JoveWorks Hub.');
  }
  const course = await getJson(resolve(base, `${discovery.api}/courses/${encodeURIComponent(slug)}`), courseToken);
  return parseCourse(base, course);
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
  if (hash !== catalogue.hash) throw new Error(`Catalogue ${catalogue.id} does not match the published revision.`);
  return response.value;
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
    },
  );
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.editToken !== 'string') {
    throw new Error('The Hub did not return an edit token for the new workspace.');
  }
  return {
    workspace: { hubUrl: base, id: value.id, title: draft.title, document: draft.document },
    editToken: value.editToken,
  };
}

export async function loadWorkspace(
  rawHubUrl: string,
  workspaceId: string,
): Promise<HubWorkspace> {
  const base = hubUrl(rawHubUrl);
  const value = await requestJson(
    resolve(base, `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`),
    'GET',
    undefined,
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
    },
    workspaceToken,
  );
  return parseWorkspace(workspace.hubUrl, value);
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
  method: 'GET' | 'POST' | 'PUT',
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
  try {
    return await response.json() as JsonValue;
  } catch {
    throw new Error('The Hub returned invalid workspace JSON.');
  }
}

function parseWorkspace(hubUrl_: string, value: JsonValue): HubWorkspace {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || !('document' in value)) {
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
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  };
}

function parseCourse(hubUrl_: string, value: JsonValue): HubCourse {
  if (!isObject(value) || value.protocolVersion !== PROTOCOL_VERSION || typeof value.slug !== 'string' || typeof value.title !== 'string' || !Array.isArray(value.publications)) {
    throw new Error('The Hub returned an invalid course manifest.');
  }
  return {
    hubUrl: hubUrl_,
    slug: value.slug,
    title: value.title,
    publications: value.publications.map(parsePublicationSummary),
  };
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

function isMode(value: unknown): value is 'viewer' | 'editor' {
  return value === 'viewer' || value === 'editor';
}

function isObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
