/**
 * The sizing records moved here from the example Mechanics catalogue must
 * keep resolving exactly, so their refs are pinned as release 0.34.1 shipped
 * them — the four `mechanics.shaft.*` in this catalogue, the bending stress
 * in the example one.
 */

import { describe, expect, it } from 'vitest';
import { formulaRef, loadCatalogue } from '@joveworks/schema';

import { mechanicsCatalogueJson } from './catalogue.js';
import { MECHANICS_OPERATIONS } from './mechanicsNodes.js';

const SHIPPED = [
  { id: 'mechanics.shaft.section-modulus', version: 1, hash: 'f35fcfc6ce4314f3' },
  { id: 'mechanics.shaft.equivalent-moment', version: 1, hash: 'c911291c709aa537' },
  { id: 'mechanics.shaft.required-diameter', version: 1, hash: 'a498701bf52235fb' },
  { id: 'mechanics.shaft.equivalent-stress', version: 1, hash: '34d6ea09167aaa79' },
  { id: 'mechanics.beam.bending-stress', version: 1, hash: 'b4bf773478143cff' },
];

const shipped = (refs: readonly { id: string }[]) => refs.filter((ref) => SHIPPED.some(({ id }) => id === ref.id));

describe('the shaft sizing records', () => {
  it('keep the id, version and hash they shipped with', () => {
    expect(shipped(MECHANICS_OPERATIONS.map((formula) => formulaRef(formula)))).toEqual(SHIPPED);
  });

  it('still hash the same after a round trip through the catalogue file', () => {
    expect(shipped(loadCatalogue(mechanicsCatalogueJson()).formulas.map((formula) => formulaRef(formula)))).toEqual(SHIPPED);
  });
});
