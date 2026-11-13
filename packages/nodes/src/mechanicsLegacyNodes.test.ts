/**
 * The shipped mechanics records must keep resolving exactly, so their refs
 * are pinned here as they stood before they moved into the legacy catalogue.
 */

import { describe, expect, it } from 'vitest';
import { formulaRef, loadCatalogue } from '@joveworks/schema';

import { mechanicsLegacyCatalogueJson } from './catalogue.js';
import { MECHANICS_LEGACY_OPERATIONS } from './mechanicsLegacyNodes.js';

const SHIPPED = [
  { id: 'mechanics.shaft.torque', version: 1, hash: '4de327e826fa50fa' },
  { id: 'mechanics.shaft.shear', version: 1, hash: 'dceacbfa7f9e7c68' },
  { id: 'mechanics.shaft.moment', version: 1, hash: '61d72a89077a155c' },
  { id: 'mechanics.shaft.deflection-term', version: 1, hash: '949e661441cc7f27' },
  { id: 'mechanics.shaft.deflection', version: 1, hash: '24db3304eb1a7e72' },
  { id: 'mechanics.shaft.distributed-shear', version: 1, hash: 'bf1557e2a31ecfd1' },
  { id: 'mechanics.shaft.distributed-moment', version: 1, hash: 'fcbaf2cd22b12725' },
];

describe('the legacy mechanics catalogue', () => {
  it('holds every shipped record with its id, version and hash unchanged', () => {
    expect(MECHANICS_LEGACY_OPERATIONS.map((formula) => formulaRef(formula))).toEqual(SHIPPED);
  });

  it('still hashes the same after a round trip through the catalogue file', () => {
    expect(loadCatalogue(mechanicsLegacyCatalogueJson()).formulas.map((formula) => formulaRef(formula))).toEqual(SHIPPED);
  });
});
