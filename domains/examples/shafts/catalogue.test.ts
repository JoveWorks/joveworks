/**
 * The Shafts catalogue (`../catalogues/shafts.json`) must keep resolving
 * exactly: every record's id, version and hash pinned as they shipped when
 * the shafts were still built into the core (release 0.36.0, and 0.34.1 for
 * the sizing records). The three general ones that moved to the base
 * library — torque and power, factor of safety — are pinned there.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { formulaRef, loadCatalogue } from '@joveworks/schema';

import { SHAFTS_CATALOGUE_ID } from '../kernel.js';

const SHIPPED = [
  { id: 'mechanics.shaft.calculation', version: 1, hash: '7642623a15bf9f02' },
  { id: 'mechanics.shaft.reactions', version: 1, hash: '842e00e0a90b9fb3' },
  { id: 'mechanics.shaft.section-modulus', version: 1, hash: 'f35fcfc6ce4314f3' },
  { id: 'mechanics.shaft.equivalent-moment', version: 1, hash: 'c911291c709aa537' },
  { id: 'mechanics.shaft.required-diameter', version: 1, hash: 'a498701bf52235fb' },
  { id: 'mechanics.shaft.equivalent-stress', version: 1, hash: '34d6ea09167aaa79' },
  { id: 'mechanics.beam.bending-stress', version: 1, hash: 'b4bf773478143cff' },
  { id: 'mechanics.torsion.polar-moment-solid', version: 1, hash: 'baa85bb3032d36c6' },
  { id: 'mechanics.torsion.polar-moment-hollow', version: 1, hash: '7714f5d161220b85' },
  { id: 'mechanics.torsion.shear-stress', version: 1, hash: '5d51301ed43b17f0' },
  { id: 'mechanics.stress.shear', version: 1, hash: 'e1a2e12febc54ecb' },
  { id: 'mechanics.beam.moment-of-inertia-circle', version: 1, hash: '2c8d97cf8e9d9370' },
  { id: 'mechanics.beam.moment-of-inertia-hollow-circle', version: 1, hash: 'ea8f90077578aa6e' },
];

const catalogue = loadCatalogue(readFileSync(new URL('../catalogues/shafts.json', import.meta.url), 'utf8'));

describe('the Shafts catalogue', () => {
  it('is the one the domain names', () => {
    expect(catalogue.id).toBe(SHAFTS_CATALOGUE_ID);
  });

  it('keeps every record’s id, version and hash', () => {
    expect(catalogue.formulas.map((formula) => formulaRef(formula))).toEqual(SHIPPED);
  });
});
