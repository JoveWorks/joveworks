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
  isRelativeLink,
  ports,
  sourceHref,
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
 * The example catalogues in `src/catalogues/examples/` — photography,
 * running, machining and basic mechanics — ship only when the build sets
 * `VITE_EXAMPLE_CATALOGUES=on`. The public Netlify build asks for them; a
 * school deploying its own course catalogue leaves the flag unset. Vite
 * replaces the env check with a literal, so without the flag the ternary
 * folds to `{}` and Rollup drops the example files from the bundle entirely
 * rather than just hiding them. The samples built on them hide themselves
 * through `provides`.
 */
const EXAMPLES_ENABLED = import.meta.env.VITE_EXAMPLE_CATALOGUES === 'on';

const exampleCatalogueModules = EXAMPLES_ENABLED
  ? import.meta.glob<JsonValue>('../catalogues/examples/*.json', { eager: true, import: 'default' })
  : {};

const exampleYamlCatalogueModules = EXAMPLES_ENABLED
  ? import.meta.glob<string>('../catalogues/examples/*.{yaml,yml}', { eager: true, import: 'default', query: '?raw' })
  : {};

/**
 * The books that ship beside the bundled catalogues: `photography.html` next
 * to `photography.json`, cited by a relative `source.url`. Vite hashes the
 * emitted file name, so a relative link cannot simply be resolved against
 * the catalogue's directory — it is looked up here by file name instead.
 * Gated like the catalogues, so a school's build carries no example book.
 */
const bundledBookModules = import.meta.glob<string>('../catalogues/*.html', {
  eager: true,
  import: 'default',
  query: '?url',
});

const exampleBookModules = EXAMPLES_ENABLED
  ? import.meta.glob<string>('../catalogues/examples/*.html', { eager: true, import: 'default', query: '?url' })
  : {};

const BUNDLED_BOOKS: ReadonlyMap<string, string> = new Map(
  Object.entries({ ...bundledBookModules, ...exampleBookModules }).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
);

/**
 * A relative source link made absolute: `photography.html#eq-1.1` becomes
 * the hosted book plus its anchor. A relative link to a book the app does not
 * host — a loaded file cannot bring its book along — resolves to nothing, so
 * the "?" falls back to the ordinary help.
 */
function hostedLink(link: string): string | undefined {
  if (!isRelativeLink(link)) return link;
  const split = link.search(/[?#]/);
  const file = split === -1 ? link : link.slice(0, split);
  const book = BUNDLED_BOOKS.get(file);
  if (book === undefined) return undefined;
  return new URL(book + (split === -1 ? '' : link.slice(split)), window.location.href).href;
}

/**
 * Every catalogue that ships with the app alongside the base nodes: files
 * dropped in `src/catalogues/`, plus the examples when they are switched
 * on — textbook-independent, `restricted: false`, hand-authored per
 * `docs/authoring-catalogues.md` rather than extracted from a source. Unlike
 * the R&M catalogue these need no LMS handout — nothing in them is
 * restricted, so there is no reason to make a student import them by hand.
 */
export function bundledCatalogues(): readonly Catalogue[] {
  return [
    ...[...Object.values(bundledCatalogueModules), ...Object.values(exampleCatalogueModules)].map((data) => parseCatalogue(data)),
    ...[...Object.values(bundledYamlCatalogueModules), ...Object.values(exampleYamlCatalogueModules)].map((text) => loadCatalogue(text, 'yaml')),
  ];
}

/**
 * The libraries that are always present, before anything is loaded.
 *
 * Every one of these ships `restricted: false` and is compiled into the app
 * rather than fetched, so a graph that uses a base, array or mechanics node
 * evaluates anywhere the app runs. The published-NodeBook viewer needs
 * exactly the same set when it activates interactive controls: the Hub pins
 * only the catalogues a document *imported*, so re-evaluating against those
 * alone drops every base-library node — and with it every output downstream
 * of one.
 */
export function builtInCatalogues(): readonly Catalogue[] {
  return [baseCatalogue(), arrayCatalogue(), mechanicsCatalogue(), ...bundledCatalogues()];
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

/**
 * Where a formula's "?" opens, when its catalogue links into the book it
 * cites, and the tooltip that says so. Found by identity rather than id —
 * ids are only unique within one catalogue, and the formulas a graph
 * resolves to are the very objects its catalogues were parsed into.
 */
export function formulaSource(
  catalogues: readonly Catalogue[],
  formula: Formula,
  locale: AppLocale,
): { readonly href: string; readonly title?: string } | undefined {
  const catalogue = catalogues.find((candidate) => candidate.formulas.includes(formula));
  if (catalogue === undefined) return undefined;
  const link = sourceHref(catalogue, formula);
  const href = link === undefined ? undefined : hostedLink(link);
  if (href === undefined) return undefined;
  const title = catalogue.source?.title;
  return title === undefined ? { href } : { href, title: localize(title, locale) };
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
