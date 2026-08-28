import { loadCatalogue, loadDocument, type Catalogue, type CompiledNotebook, type GraphDocument, type JsonValue } from '@joveworks/schema';

import { analyse } from '../model/analysis';
import { compileNotebook } from '../model/compiledNotebook';
import { withSliderValue } from '../model/notebook';

interface SourceEnvelope {
  readonly document: GraphDocument;
  readonly catalogues: readonly Catalogue[];
}

export class CourseAccessRequired extends Error {}

async function json(url: string, token?: string): Promise<JsonValue> {
  const response = await fetch(url, token === undefined ? {} : { headers: { 'X-JoveWorks-Course-Token': token } });
  if (response.status === 401) throw new CourseAccessRequired('Course access is required.');
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
  return { document, catalogues };
}

export interface InteractiveNotebook {
  readonly notebook: CompiledNotebook;
  readonly change: (sliderId: string, value: number) => InteractiveNotebook;
  readonly reset: () => InteractiveNotebook;
}

function session(authored: GraphDocument, document: GraphDocument, catalogues: readonly Catalogue[]): InteractiveNotebook {
  return {
    notebook: compileNotebook(document, analyse(document, catalogues)),
    change: (sliderId, value) => session(authored, withSliderValue(document, sliderId, value), catalogues),
    reset: () => session(authored, authored, catalogues),
  };
}

export async function activateNotebook(kind: 'publication' | 'share', id: string, hub: string, token?: string): Promise<InteractiveNotebook> {
  const source = await loadSource(kind, id, hub, token);
  return session(source.document, source.document, source.catalogues);
}
