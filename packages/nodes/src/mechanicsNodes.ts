/**
 * Generic mechanics content — beam/shaft load diagrams and the like
 * (ROADMAP item 8). Not R&M-specific, so it lives here in the public base
 * node library rather than a private catalogue, the same way `iso286.ts`'s
 * lookup-backed formulas do — built as `Formula` records directly rather
 * than through `draft.ts`'s `buildFormulas`, since `Draft` has no `shaft`
 * field.
 *
 * The diagrams take their loads from Load and Distributed load nodes on one
 * `loads` port and solve the support reactions themselves (`FormulaShaft` in
 * the schema). They are version 2 of the ids release 0.33.0 shipped; version
 * 1, which paired positions and forces by wire order, lives on unchanged in
 * `mechanicsLegacyNodes.ts` for the NodeBooks saved against it.
 */

import type { Formula, Port } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';
import { text } from './draft.js';

const shaftZ: Port = {
  kind: 'numeric', name: 'z', unit: parseUnit('mm'), default: 0,
  description: text('Position along the shaft — sweep it to draw the diagram'),
};

const shaftLoads: Port = {
  kind: 'load', name: 'loads', variadic: true,
  description: text('Every load on the shaft — wire each Load and Distributed load node here'),
};

const shaftSupports: readonly Port[] = [
  { kind: 'numeric', name: 'supportA', unit: parseUnit('mm'), description: text('Position of support A') },
  { kind: 'numeric', name: 'supportB', unit: parseUnit('mm'), description: text('Position of support B') },
];

function shaftPlane(resultant: boolean): Port {
  return {
    kind: 'categorical',
    name: 'plane',
    domain: resultant ? ['x', 'y', 'resultant'] : ['x', 'y'],
    default: 'y',
    description: text(
      resultant
        ? 'The transverse plane to draw, or the resultant √(x² + y²) of both'
        : 'The transverse plane to solve — a reaction is signed, so one plane at a time',
    ),
  };
}

const SIGNS =
  'Forces are positive up in their plane, couples positive clockwise with z to the right; ' +
  'the reactions at the two supports are solved from the loads, so nothing needs wiring back.';

const shaftTorque: Formula = {
  id: 'mechanics.shaft.torque',
  version: 2,
  label: text('Torque diagram'),
  description: text(
    'Torque along a shaft at a given position, T(z) — the running total of every load’s torque ' +
      'at or before that position. Torques are taken as already balanced (input in, output out); ' +
      'this does not solve for a reaction torque.',
  ),
  outputs: [{ kind: 'numeric', name: 'T', unit: parseUnit('Nmm'), description: text('Torque at z — T(z)') }],
  inputs: [shaftZ, shaftLoads],
  shaft: { diagram: 'torque', loads: 'loads', axis: 'z' },
  status: 'unverified',
};

const shaftShear: Formula = {
  id: 'mechanics.shaft.shear',
  version: 2,
  label: text('Shear diagram'),
  description: text(
    'Shear force along a shaft on two simple supports at a given position, V(z) — every force, ' +
      `distributed load and support reaction at or before that position. ${SIGNS}`,
  ),
  outputs: [{ kind: 'numeric', name: 'V', unit: parseUnit('N'), description: text('Shear at z — V(z)') }],
  inputs: [shaftZ, shaftLoads, ...shaftSupports, shaftPlane(true)],
  shaft: { diagram: 'shear', loads: 'loads', axis: 'z', supports: ['supportA', 'supportB'], plane: 'plane' },
  status: 'unverified',
};

const shaftMoment: Formula = {
  id: 'mechanics.shaft.moment',
  version: 2,
  label: text('Bending moment diagram'),
  description: text(
    'Bending moment along a shaft on two simple supports at a given position, M(z) — the moment ' +
      'about z of every force, distributed load and support reaction at or before that position, ' +
      `plus each bending couple there. Positive when the shaft sags. ${SIGNS}`,
  ),
  outputs: [{ kind: 'numeric', name: 'M', unit: parseUnit('Nmm'), description: text('Moment at z — M(z)') }],
  inputs: [shaftZ, shaftLoads, ...shaftSupports, shaftPlane(true)],
  shaft: { diagram: 'moment', loads: 'loads', axis: 'z', supports: ['supportA', 'supportB'], plane: 'plane' },
  status: 'unverified',
};

const shaftDeflection: Formula = {
  id: 'mechanics.shaft.deflection',
  version: 2,
  label: text('Deflection diagram'),
  description: text(
    "A shaft's deflection on two simple supports at a given position, y(z) — zero at both " +
      "supports, from Young's modulus E and the section's second moment of area I. Point loads " +
      `and couples only: a distributed load is refused. ${SIGNS}`,
  ),
  outputs: [{ kind: 'numeric', name: 'y', unit: parseUnit('mm'), description: text('Deflection at z — y(z)') }],
  inputs: [
    shaftZ, shaftLoads, ...shaftSupports, shaftPlane(true),
    { kind: 'numeric', name: 'E', unit: parseUnit('N/mm²'), description: text("Young's modulus") },
    { kind: 'numeric', name: 'I', unit: parseUnit('mm⁴'), description: text("The section's second moment of area") },
  ],
  shaft: {
    diagram: 'deflection', loads: 'loads', axis: 'z', supports: ['supportA', 'supportB'], plane: 'plane',
    modulus: 'E', secondMomentOfArea: 'I',
  },
  status: 'unverified',
};

const shaftReactions: Formula = {
  id: 'mechanics.shaft.reactions',
  version: 1,
  label: text('Support reactions'),
  description: text(
    'The reactions at the two simple supports of a shaft, in one plane — for reporting and ' +
      'checks; the diagrams solve them themselves. Signed like the loads, so ' +
      'Σ forces + R_A + R_B = 0.',
  ),
  outputs: [
    { kind: 'numeric', name: 'R_A', unit: parseUnit('N'), description: text('Reaction at support A, positive up') },
    { kind: 'numeric', name: 'R_B', unit: parseUnit('N'), description: text('Reaction at support B, positive up') },
  ],
  inputs: [shaftLoads, ...shaftSupports, shaftPlane(false)],
  shaft: { diagram: 'reactions', loads: 'loads', supports: ['supportA', 'supportB'], plane: 'plane' },
  status: 'unverified',
};

/**
 * Static sizing of a round shaft (Phase 1 of `docs/shaft-sizing-plan.md`):
 * the plain strength-of-materials steps between a moment diagram and a
 * diameter. No fatigue — notch, size and surface factors belong to the
 * private catalogue.
 */
const shaftSectionModulus: Formula = {
  id: 'mechanics.shaft.section-modulus',
  version: 1,
  label: text('Section moduli of a round shaft'),
  description: text(
    'Axial (bending) and polar (torsion) section moduli of a solid or hollow round shaft, ' +
      'W_b = π·(d⁴ − d_i⁴)/(32·d) and W_p = 2·W_b. Leave d_i at 0 for a solid shaft; a ' +
      'hollow shaft needs d_i < d.',
  ),
  outputs: [
    { kind: 'numeric', name: 'W_b', unit: parseUnit('mm³'), description: text('Axial section modulus, for bending') },
    { kind: 'numeric', name: 'W_p', unit: parseUnit('mm³'), description: text('Polar section modulus, for torsion') },
  ],
  inputs: [
    { kind: 'numeric', name: 'd', unit: parseUnit('mm'), description: text('Outer diameter') },
    { kind: 'numeric', name: 'd_i', unit: parseUnit('mm'), default: 0, description: text('Bore diameter — 0 for a solid shaft, otherwise less than d') },
  ],
  expressions: { W_b: 'pi * (d**4 - d_i**4) / (32 * d)', W_p: '2 * W_b' },
  status: 'unverified',
};

const shaftEquivalentMoment: Formula = {
  id: 'mechanics.shaft.equivalent-moment',
  version: 1,
  label: text('Equivalent moment (von Mises)'),
  description: text(
    'Bending and torsion combined into one equivalent bending moment by the von Mises ' +
      'criterion, M_v = √(M² + 0.75·T²). Leave T at 0 for bending alone.',
  ),
  outputs: [{ kind: 'numeric', name: 'M_v', unit: parseUnit('Nmm'), description: text('Equivalent bending moment') }],
  inputs: [
    { kind: 'numeric', name: 'M', unit: parseUnit('Nmm'), description: text('Bending moment') },
    { kind: 'numeric', name: 'T', unit: parseUnit('Nmm'), default: 0, description: text('Torque') },
  ],
  expressions: { M_v: 'sqrt(M**2 + 0.75 * T**2)' },
  status: 'unverified',
};

const shaftRequiredDiameter: Formula = {
  id: 'mechanics.shaft.required-diameter',
  version: 1,
  label: text('Required diameter of a solid shaft'),
  description: text(
    'The smallest solid round shaft whose bending stress stays at the allowable stress, ' +
      'd = ∛(32·M_v/(π·σ_allow)) — σ = M/W_b rearranged for d. Expects a moment magnitude ' +
      '(a resultant or equivalent moment): a signed moment gives a negative diameter.',
  ),
  outputs: [{ kind: 'numeric', name: 'd', unit: parseUnit('mm'), description: text('Required diameter') }],
  inputs: [
    { kind: 'numeric', name: 'M_v', unit: parseUnit('Nmm'), description: text('Equivalent (or resultant) bending moment, a magnitude') },
    { kind: 'numeric', name: 'sigma_allow', unit: parseUnit('N/mm²'), description: text('Allowable bending stress') },
  ],
  expressions: { d: 'cbrt(32 * M_v / (pi * sigma_allow))' },
  status: 'unverified',
};

const shaftEquivalentStress: Formula = {
  id: 'mechanics.shaft.equivalent-stress',
  version: 1,
  label: text('Equivalent stress (von Mises)'),
  description: text(
    'Bending and torsional stress combined into one equivalent stress by the von Mises ' +
      'criterion, σ_v = √(σ_b² + 3·τ_t²). Leave τ_t at 0 for bending alone.',
  ),
  outputs: [{ kind: 'numeric', name: 'sigma_v', unit: parseUnit('N/mm²'), description: text('Equivalent stress') }],
  inputs: [
    { kind: 'numeric', name: 'sigma_b', unit: parseUnit('N/mm²'), description: text('Bending stress') },
    { kind: 'numeric', name: 'tau_t', unit: parseUnit('N/mm²'), default: 0, description: text('Torsional shear stress') },
  ],
  expressions: { sigma_v: 'sqrt(sigma_b**2 + 3 * tau_t**2)' },
  status: 'unverified',
};

export const MECHANICS_OPERATIONS: readonly Formula[] = [
  shaftTorque, shaftShear, shaftMoment, shaftDeflection, shaftReactions,
  shaftSectionModulus, shaftEquivalentMoment, shaftRequiredDiameter, shaftEquivalentStress,
];
