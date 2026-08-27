/**
 * The loaded catalogues, and the palette that lists them.
 *
 * The base node library and the array node library are always present, and a
 * restricted catalogue arrives as a file through the LMS or the Hub — so the
 * palette has two or more sources and one kind of entry once a catalogue is
 * actually loaded. Nothing here treats a restricted catalogue differently
 * from an unrestricted one *for computing*; the `restricted` flag is what an
 * export must honour, and it is carried through so the UI can say where a
 * formula came from.
 */

import {
  localize,
  parseCatalogue,
  loadCatalogue,
  ports,
  type Catalogue,
  type Formula,
  type JsonValue,
} from '@joveworks/schema';
import type { AppLocale } from './editorSettings';
import {
  ARRAY_CATALOGUE_ID,
  BASE_CATALOGUE_ID,
  MECHANICS_CATALOGUE_ID,
  arrayCatalogueJson,
  baseCatalogueJson,
  mechanicsCatalogueJson,
} from '@joveworks/nodes';
import { fuzzySearch } from './fuzzy';

export interface PaletteEntry {
  readonly formula: Formula;
  readonly catalogue: Catalogue;
}

/** The base library, parsed the same way a loaded file is. */
export function baseCatalogue(): Catalogue {
  return loadCatalogue(baseCatalogueJson());
}

/** The array-node library, parsed the same way a loaded file is. */
export function arrayCatalogue(): Catalogue {
  return loadCatalogue(arrayCatalogueJson());
}

/** The mechanics-node library (beam/shaft diagrams, ROADMAP item 8), parsed the same way a loaded file is. */
export function mechanicsCatalogue(): Catalogue {
  return loadCatalogue(mechanicsCatalogueJson());
}

const bundledCatalogueModules = import.meta.glob<JsonValue>('../catalogues/*.json', {
  eager: true,
  import: 'default',
});

const bundledYamlCatalogueModules = import.meta.glob<string>('../catalogues/*.{yaml,yml}', {
  eager: true,
  import: 'default',
  query: '?raw',
});

/**
 * Every catalogue that ships with the app alongside the base nodes: files
 * dropped in `src/catalogues/` — textbook-independent, `restricted: false`,
 * hand-authored per `docs/authoring-catalogues.md` rather than extracted
 * from a source. Unlike the R&M catalogue these need no LMS handout —
 * nothing in them is restricted, so there is no reason to make a student
 * import them by hand.
 */
export function bundledCatalogues(): readonly Catalogue[] {
  return [
    ...Object.values(bundledCatalogueModules).map((data) => parseCatalogue(data)),
    ...Object.values(bundledYamlCatalogueModules).map((text) => loadCatalogue(text, 'yaml')),
  ];
}

/**
 * Add or replace a catalogue by id. Loading the same file twice is a normal
 * thing to do — a corrected catalogue lands the same way the first one did
 * — and it must not leave two copies lying around to trip over.
 */
export function withCatalogue(
  catalogues: readonly Catalogue[],
  loaded: Catalogue,
): readonly Catalogue[] {
  const replaced = catalogues.map((existing) => (existing.id === loaded.id ? loaded : existing));
  return replaced.some((existing) => existing.id === loaded.id) ? replaced : [...replaced, loaded];
}

/** Base, Array and Mechanics nodes are all always present — none can be removed. */
const PERMANENT_CATALOGUE_IDS = new Set([BASE_CATALOGUE_ID, ARRAY_CATALOGUE_ID, MECHANICS_CATALOGUE_ID]);

export function removeCatalogue(
  catalogues: readonly Catalogue[],
  id: string,
): readonly Catalogue[] {
  return catalogues.filter((catalogue) => catalogue.id !== id || PERMANENT_CATALOGUE_IDS.has(catalogue.id));
}

export function entries(catalogues: readonly Catalogue[]): readonly PaletteEntry[] {
  return catalogues.flatMap((catalogue) =>
    catalogue.formulas.map((formula) => ({ formula, catalogue })),
  );
}

/**
 * Find a formula the way a student looks for one: fuzzy-matched by equation
 * number, symbol, description, citation, or port metadata.
 */
export function search(list: readonly PaletteEntry[], query: string, locale: AppLocale = 'en'): readonly PaletteEntry[] {
  return fuzzySearch(query, list, ({ formula }) =>
    [
      formula.id,
      formula.citation ?? '',
      localize(formula.description, locale),
      ...ports(formula).map((port) => `${port.name} ${port.description === undefined ? '' : localize(port.description, locale)}`),
    ]
      .join(' ')
      .toLowerCase(),
  );
}
