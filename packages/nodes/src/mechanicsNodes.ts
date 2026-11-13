/**
 * Generic mechanics content — beam/shaft load diagrams and the like
 * (ROADMAP item 8). Not R&M-specific, so it lives here in the public base
 * node library rather than a private catalogue, the same way `iso286.ts`'s
 * lookup-backed formulas do — built as `Formula` records directly rather
 * than through `draft.ts`'s `buildFormulas`, since `Draft` has no `shaft`
 * field.
 *
 * The diagrams take everything acting on a shaft — Load, Distributed load and
 * Support nodes — on one `acting` port, and the shaft itself from a Shaft
 * node, and solve the support reactions themselves (`FormulaShaft` in the
 * schema). They are version 2 of the ids release 0.33.0 shipped; version
 * 1, which paired positions and forces by wire order, lives on unchanged in
 * `mechanicsLegacyNodes.ts` for the NodeBooks saved against it.
 */

import type { Formula, Port } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';
import { text } from './draft.js';

const shaftZ: Port = {
  kind: 'numeric', name: 'z', unit: parseUnit('mm'),
  description: text('Where to evaluate — leave unwired to draw the diagram along the whole shaft'),
};

const shaftActing: Port = {
  kind: 'load', name: 'acting', variadic: true,
  description: text('Everything acting on the shaft — wire each Load, Distributed load and Support node here'),
};

const shaftShaft: Port = {
  kind: 'shaft', name: 'shaft',
  description: text('The shaft — its length, Young’s modulus and section, from a Shaft node'),
};

const shaftPlane: Port = {
  kind: 'categorical',
  name: 'plane',
  domain: ['x', 'y', 'resultant'],
  default: 'y',
  description: text('The transverse plane to draw, or the resultant √(x² + y²) of both'),
};

const SIGNS =
  'Forces are positive up in their plane, couples positive clockwise with z to the right. The ' +
  'support reactions are solved from everything wired in — any arrangement of supports, with the ' +
  'shaft’s own stiffness section by section — so nothing needs wiring back.';

const shaftTorque: Formula = {
  id: 'mechanics.shaft.torque',
  version: 2,
  label: text('Torque diagram'),
  description: text(
    'Torque along a shaft, T(z) — the running total of every load’s torque at or before z. ' +
      'Torques are taken as already balanced (input in, output out); this does not solve for a ' +
      'reaction torque.',
  ),
  outputs: [{ kind: 'numeric', name: 'T', unit: parseUnit('Nmm'), description: text('Torque at z — T(z)') }],
  inputs: [shaftZ, shaftActing, shaftShaft],
  shaft: { diagram: 'torque', acting: 'acting', shaft: 'shaft', axis: 'z' },
  status: 'unverified',
};

const shaftShear: Formula = {
  id: 'mechanics.shaft.shear',
  version: 2,
  label: text('Shear diagram'),
  description: text(`Shear force along a shaft, V(z) — every force, distributed load and support reaction at or before z. ${SIGNS}`),
  outputs: [{ kind: 'numeric', name: 'V', unit: parseUnit('N'), description: text('Shear at z — V(z)') }],
  inputs: [shaftZ, shaftActing, shaftShaft, shaftPlane],
  shaft: { diagram: 'shear', acting: 'acting', shaft: 'shaft', axis: 'z', plane: 'plane' },
  status: 'unverified',
};

const shaftMoment: Formula = {
  id: 'mechanics.shaft.moment',
  version: 2,
  label: text('Bending moment diagram'),
  description: text(
    'Bending moment along a shaft, M(z) — the moment about z of every force, distributed load ' +
      `and support reaction at or before z, plus each couple there. Positive when the shaft sags. ${SIGNS}`,
  ),
  outputs: [{ kind: 'numeric', name: 'M', unit: parseUnit('Nmm'), description: text('Moment at z — M(z)') }],
  inputs: [shaftZ, shaftActing, shaftShaft, shaftPlane],
  shaft: { diagram: 'moment', acting: 'acting', shaft: 'shaft', axis: 'z', plane: 'plane' },
  status: 'unverified',
};

const shaftDeflection: Formula = {
  id: 'mechanics.shaft.deflection',
  version: 2,
  label: text('Deflection diagram'),
  description: text(
    'A shaft’s deflection, y(z) — zero at every support and level at a fixed one, with the ' +
      `shaft’s own Young’s modulus and second moment of area, section by section. ${SIGNS}`,
  ),
  outputs: [{ kind: 'numeric', name: 'y', unit: parseUnit('mm'), description: text('Deflection at z — y(z)') }],
  inputs: [shaftZ, shaftActing, shaftShaft, shaftPlane],
  shaft: { diagram: 'deflection', acting: 'acting', shaft: 'shaft', axis: 'z', plane: 'plane' },
  status: 'unverified',
};

const shaftReactions: Formula = {
  id: 'mechanics.shaft.reactions',
  version: 1,
  label: text('Support reaction'),
  description: text(
    'The force and the moment one support applies to the shaft, for reporting and checks — wire ' +
      'that Support node here as well as into acting; the diagrams solve the reactions themselves. ' +
      'Signed like the loads, so all forces and reactions together sum to zero. Only a fixed support ' +
      `takes a moment. ${SIGNS}`,
  ),
  outputs: [
    { kind: 'numeric', name: 'R', unit: parseUnit('N'), description: text('Reaction force, positive up') },
    { kind: 'numeric', name: 'M_R', unit: parseUnit('Nmm'), description: text('Reaction moment, positive clockwise — zero unless the support is fixed') },
  ],
  inputs: [
    shaftActing,
    shaftShaft,
    { kind: 'load', name: 'support', description: text('The support to report — one of those wired into acting') },
    shaftPlane,
  ],
  shaft: { diagram: 'reactions', acting: 'acting', shaft: 'shaft', support: 'support', plane: 'plane' },
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
