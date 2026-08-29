import { loadCatalogue, loadDocument, type Catalogue, type CompiledNotebook, type GraphDocument, type JsonValue } from '@joveworks/schema';

import { analyse } from '../model/analysis';
import { builtInCatalogues, withCatalogue } from '../model/catalogues';
import { notebookDisplayOf } from '../model/notebook';
import { compiledDisplaySettings } from '../present/compiled';
import { compileNotebook } from '../model/compiledNotebook';
import { withSliderValue } from '../model/notebook';
import { DEFAULT_NUMBER_FORMAT_SETTINGS } from '../model/numberFormat';

interface SourceEnvelope {
  readonly document: GraphDocument;
  readonly catalogues: readonly Catalogue[];
}

export class CloudAccessRequired extends Error {}

async function json(url: string, token?: string): Promise<JsonValue> {
  const response = await fetch(url, token === undefined ? {} : { headers: { 'X-JoveWorks-Cloud-Token': token } });
  if (response.status === 401) throw new CloudAccessRequired('Cloud access is required.');
  if (!response.ok) throw new Error(`The interactive source could not be loaded (${response.status}).`);
  return await response.json() as JsonValue;
}

function record(value: JsonValue): Readonly<Record<string, JsonValue>> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error('The Hub returned invalid source material.');
  return value;
}

async function loadSource(kind: 'publication' | 'share', id: string, hub: string, token?: string): Promise<SourceEnvelope> {
  const raw = record(await json(`${hub}/api/v1/${kind === 'publication' ? 'publications' : 'shares'}/${encodeURIComponent(id)}`, token));
  if (!('document' in raw) || !Array.isArray(raw.catalogues)) throw new Error('The Hub source is incomplete.');
  const document = loadDocument(JSON.stringify(raw.document));
  const catalogues = await Promise.all(raw.catalogues.map(async (entry) => {
    const ref = record(entry);
    if (typeof ref.id !== 'string' || typeof ref.version !== 'number') throw new Error('The Hub catalogue pin is invalid.');
    return loadCatalogue(JSON.stringify(await json(`${hub}/api/v1/catalogues/${encodeURIComponent(ref.id)}/${ref.version}`, token)));
  }));
  // The Hub pins only what the document imported. The base, array, mechanics
  // and bundled libraries ship with the app and are pinned by nobody, so
  // without them every base-library node fails to resolve here and every
  // output downstream of one arrives unavailable — a report that read
  // correctly as published went blank the moment its controls were
  // activated. A pinned catalogue still wins on an id collision.
  return { document, catalogues: catalogues.reduce((all, pinned) => withCatalogue(all, pinned), builtInCatalogues()) };
}

export interface InteractiveNotebook {
  readonly notebook: CompiledNotebook;
  readonly change: (sliderId: string, value: number) => InteractiveNotebook;
  readonly reset: () => InteractiveNotebook;
}

/**
 * The published report's own display settings drive every recompile, so
 * moving a slider changes the numbers and nothing else about how they are
 * written — a reader's own preferences never rewrite someone else's report.
 * With no published report to read them from (a viewer that failed to fetch
 * one), the editor defaults stand in.
 */
type DisplaySettings = Parameters<typeof notebookDisplayOf>[1];

function session(
  authored: GraphDocument,
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  settings: DisplaySettings,
): InteractiveNotebook {
  return {
    notebook: compileNotebook(document, analyse(document, catalogues), notebookDisplayOf(document, settings)),
    change: (sliderId, value) => session(authored, withSliderValue(document, sliderId, value), catalogues, settings),
    reset: () => session(authored, authored, catalogues, settings),
  };
}

export async function activateNotebook(
  kind: 'publication' | 'share',
  id: string,
  hub: string,
  token?: string,
  published?: CompiledNotebook,
): Promise<InteractiveNotebook> {
  const source = await loadSource(kind, id, hub, token);
  const settings: DisplaySettings = published === undefined
    ? { numberFormat: DEFAULT_NUMBER_FORMAT_SETTINGS, contourPalette: 'viridis', titleMathRendering: true, locale: 'en' }
    : compiledDisplaySettings(published);
  return session(source.document, source.document, source.catalogues, settings);
}
