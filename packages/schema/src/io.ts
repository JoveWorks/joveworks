/**
 * Text in, records out — the only entry points app code should need.
 *
 * Everything a student loads arrives as text: an LMS catalogue file, an
 * exported graph, an IndexedDB autosave. These four functions are the boundary,
 * and nothing downstream is expected to have validated anything.
 *
 * No `fs` and no `fetch` here: reading the bytes belongs to the file
 * adapter, so a Tauri build can replace it without touching this package.
 */

import { parseCatalogue, serializeCatalogue, type Catalogue } from './formula.js';
import { parseDocument, serializeDocument, type GraphDocument } from './document.js';
import { readJsonText } from './json.js';

export function loadDocument(text: string): GraphDocument {
  return parseDocument(readJsonText(text));
}

/** Indented, because these files are read, diffed and reviewed by people. */
export function saveDocument(document: GraphDocument): string {
  return `${JSON.stringify(serializeDocument(document), null, 2)}\n`;
}

export function loadCatalogue(text: string): Catalogue {
  return parseCatalogue(readJsonText(text));
}

export function saveCatalogue(catalogue: Catalogue): string {
  return `${JSON.stringify(serializeCatalogue(catalogue), null, 2)}\n`;
}
