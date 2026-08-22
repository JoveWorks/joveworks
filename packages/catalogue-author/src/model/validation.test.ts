/**
 * Invented fixtures only — never real R&M content or terminology, per
 * AGENTS.md's public/restricted-content boundary.
 */

import { describe, expect, it } from 'vitest';

import { emptyCatalogue, emptyFormula, emptyPort, type DraftCatalogue, type DraftFormula } from './draft';
import { validateCatalogue } from './validation';

function catalogueWith(formulas: readonly DraftFormula[]): DraftCatalogue {
  return { ...emptyCatalogue(), id: 'invented', name: { en: 'Invented catalogue' }, formulas };
}

/** y = a*b + c, with a dimensionless, b and c in mm — so y is also mm. */
function validFormula(): DraftFormula {
  return {
    ...emptyFormula(),
    id: 'invented.1',
    version: '1',
    expression: 'a * b + c',
    description: { en: 'An invented relation, for tests only.' },
    output: { ...emptyPort('numeric'), name: 'y', unit: 'mm' },
    inputs: [
      { ...emptyPort('numeric'), name: 'a', unit: '' },
      { ...emptyPort('numeric'), name: 'b', unit: 'mm' },
      { ...emptyPort('numeric'), name: 'c', unit: 'mm' },
    ],
  };
}

describe('validateCatalogue', () => {
  it('accepts a clean invented formula and produces an exportable catalogue', () => {
    const validation = validateCatalogue(catalogueWith([validFormula()]));
    expect(validation.catalogueErrors).toEqual([]);
    expect(validation.formulas.every((formula) => formula.errors.length === 0)).toBe(true);
    expect(validation.catalogue).toBeDefined();
    expect(validation.catalogue?.formulas).toHaveLength(1);
  });

  it('flags a dimension mismatch instead of silently accepting it', () => {
    const bad = validFormula();
    const withWrongUnit = { ...bad, output: { ...bad.output, unit: 's' } };
    const validation = validateCatalogue(catalogueWith([withWrongUnit]));
    expect(validation.formulas[0]?.errors.length).toBeGreaterThan(0);
    expect(validation.catalogue).toBeUndefined();
  });

  it('collects every duplicate id rather than stopping at the first', () => {
    const a = validFormula();
    const b = { ...validFormula(), key: 'formula-other' };
    const validation = validateCatalogue(catalogueWith([a, b]));
    expect(validation.catalogueErrors.some((error) => error.message.includes('appears twice'))).toBe(true);
    expect(validation.catalogue).toBeUndefined();
  });

  it('requires a quarantine reason once a formula is quarantined', () => {
    const quarantined = { ...validFormula(), status: 'quarantined' as const };
    const validation = validateCatalogue(catalogueWith([quarantined]));
    expect(validation.formulas[0]?.errors.some((error) => error.message.includes('quarantineReason'))).toBe(
      true,
    );
  });

  it('notes when a quarantined formula would actually pass, without blocking export', () => {
    const quarantined = {
      ...validFormula(),
      status: 'quarantined' as const,
      quarantineReason: { en: 'Marked quarantined for this test even though it checks out.' },
    };
    const validation = validateCatalogue(catalogueWith([quarantined]));
    expect(validation.formulas[0]?.errors).toEqual([]);
    expect(validation.formulas[0]?.quarantineNote).toBeDefined();
    expect(validation.catalogue).toBeDefined();
  });

  it('reports the catalogue metadata itself, e.g. a missing id', () => {
    const validation = validateCatalogue({ ...catalogueWith([validFormula()]), id: '' });
    expect(validation.catalogueErrors.length).toBeGreaterThan(0);
    expect(validation.catalogue).toBeUndefined();
  });
});
