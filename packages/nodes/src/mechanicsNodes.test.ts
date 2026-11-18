/**
 * The sizing records moved here from the example Mechanics catalogue must
 * keep resolving exactly, so their refs are pinned as release 0.34.1 shipped
 * them — the four `mechanics.shaft.*` in this catalogue, the rest in the
 * example one.
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
  { id: 'mechanics.rotation.power-from-torque', version: 1, hash: '179fe27117903227' },
  { id: 'mechanics.rotation.torque-from-power', version: 1, hash: '449bc00bc24b1866' },
  { id: 'mechanics.torsion.polar-moment-solid', version: 1, hash: 'baa85bb3032d36c6' },
  { id: 'mechanics.torsion.polar-moment-hollow', version: 1, hash: '7714f5d161220b85' },
  { id: 'mechanics.torsion.shear-stress', version: 1, hash: '5d51301ed43b17f0' },
  { id: 'mechanics.stress.shear', version: 1, hash: 'e1a2e12febc54ecb' },
  { id: 'mechanics.beam.moment-of-inertia-circle', version: 1, hash: '2c8d97cf8e9d9370' },
  { id: 'mechanics.beam.moment-of-inertia-hollow-circle', version: 1, hash: 'ea8f90077578aa6e' },
  { id: 'mechanics.stress.factor-of-safety', version: 1, hash: '630d5d9b89524eed' },
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
