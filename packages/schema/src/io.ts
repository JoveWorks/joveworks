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
import { fail, readJsonText, type JsonValue } from './json.js';
import { parseDocument as parseYamlDocument, stringify as stringifyYaml, visit } from 'yaml';

export type CatalogueFormat = 'json' | 'yaml';

/** File-name policy lives here so every catalogue-loading surface agrees. */
export function catalogueFormatFromFileName(fileName: string): CatalogueFormat {
  return /\.ya?ml$/i.test(fileName) ? 'yaml' : 'json';
}

function readYamlText(text: string): JsonValue {
  const document = parseYamlDocument(text, {
    schema: 'core',
    version: '1.2',
    customTags: [],
    resolveKnownTags: false,
    merge: false,
    stringKeys: true,
    uniqueKeys: true,
    strict: true,
  });
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem !== undefined) {
    fail('', `is not valid YAML — ${problem.message}`);
  }
  let anchor: string | undefined;
  visit(document, {
    Node: (_key, node) => {
      if (node.anchor !== undefined) anchor = node.anchor;
    },
  });
  if (anchor !== undefined) fail('', `is not valid YAML — anchor '${anchor}' is not allowed`);
  try {
    // Catalogue YAML is data, not a macro language. Disallow aliases so a
    // record always has one visible, reviewable spelling in the source file.
    return document.toJS({ maxAliasCount: 0 }) as JsonValue;
  } catch (error) {
    fail('', `is not valid YAML — ${(error as Error).message}`);
  }
}

/**
 * Mirrors `readYamlText`'s dialect exactly — core schema, YAML 1.2 — so
 * anything this writes is guaranteed to satisfy the loader's own rules.
 *
 * `aliasDuplicateObjects: false` is the one that matters: a serialized
 * catalogue repeats small identical objects constantly (shared port shapes,
 * empty descriptors), and `yaml`'s stringifier anchors/aliases repeated
 * objects by default. `readYamlText` rejects any anchor on sight, so without
 * this option a round-tripped catalogue would fail to load.
 */
function writeYamlText(value: JsonValue): string {
  // `stringify` already ends its output with a trailing newline.
  return stringifyYaml(value, {
    schema: 'core',
    version: '1.2',
    aliasDuplicateObjects: false,
  });
}

export function loadDocument(text: string): GraphDocument {
  return parseDocument(readJsonText(text));
}

/** Indented, because these files are read, diffed and reviewed by people. */
export function saveDocument(document: GraphDocument): string {
  return `${JSON.stringify(serializeDocument(document), null, 2)}\n`;
}

export function loadCatalogue(text: string, format: CatalogueFormat = 'json'): Catalogue {
  return parseCatalogue(format === 'yaml' ? readYamlText(text) : readJsonText(text));
}

export function saveCatalogue(catalogue: Catalogue, format: CatalogueFormat = 'json'): string {
  const value = serializeCatalogue(catalogue);
  return format === 'yaml' ? writeYamlText(value) : `${JSON.stringify(value, null, 2)}\n`;
}
