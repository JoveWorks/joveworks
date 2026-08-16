/**
 * The loaded catalogues, and the palette that lists them.
 *
 * The base node library is always present and the R&M catalogue arrives as
 * a file through the LMS, so the palette has two or more sources and one
 * kind of entry. Nothing here treats a restricted catalogue differently from an
 * unrestricted one *for computing*; the `restricted` flag is what an export must
 * honour, and it is carried through so the UI can say where a formula came
 * from.
 */

import { parseCatalogue, loadCatalogue, ports, type Catalogue, type Formula, type JsonValue } from '@mds/schema';
import { BASE_CATALOGUE_ID, baseCatalogueJson } from '@mds/nodes';

import basicMechanicsData from '../catalogues/basic-mechanics.json';

export interface PaletteEntry {
  readonly formula: Formula;
  readonly catalogue: Catalogue;
}

/** The base library, parsed the same way a loaded file is. */
export function baseCatalogue(): Catalogue {
  return loadCatalogue(baseCatalogueJson());
}

export const BASIC_MECHANICS_CATALOGUE_ID = 'public-basic-mechanics';

/**
 * A second catalogue that ships with the app alongside the base nodes:
 * textbook-independent basic-mechanics formulas (stress, beams, torsion,
 * dynamics), `restricted: false`, hand-authored per
 * `docs/authoring-catalogues.md` rather than extracted from a source. Unlike
 * the R&M catalogue it needs no LMS handout — nothing in it is restricted, so
 * there is no reason to make a student import it by hand.
 */
export function basicMechanicsCatalogue(): Catalogue {
  return parseCatalogue(basicMechanicsData as JsonValue);
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

export function removeCatalogue(
  catalogues: readonly Catalogue[],
  id: string,
): readonly Catalogue[] {
  return catalogues.filter((catalogue) => catalogue.id !== id || catalogue.id === BASE_CATALOGUE_ID);
}

export function entries(catalogues: readonly Catalogue[]): readonly PaletteEntry[] {
  return catalogues.flatMap((catalogue) =>
    catalogue.formulas.map((formula) => ({ formula, catalogue })),
  );
}

/**
 * Find a formula the way a student looks for one: by equation number, by symbol,
 * or by what it computes (OVERVIEW's "drag in formulas by equation number or by
 * what they compute"). Every word of the query has to match somewhere.
 */
export function search(list: readonly PaletteEntry[], query: string): readonly PaletteEntry[] {
  const words = query.toLowerCase().split(/\s+/u).filter((word) => word.length > 0);
  if (words.length === 0) return list;
  return list.filter(({ formula }) => {
    const haystack = [
      formula.id,
      formula.citation ?? '',
      formula.description,
      ...ports(formula).map((port) => `${port.name} ${port.description ?? ''}`),
    ]
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
