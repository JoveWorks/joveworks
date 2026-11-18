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

import type { Formula, LocalizedText, Port } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';
import { text } from './draft.js';

const shaftZ: Port = {
  kind: 'numeric', name: 'z', unit: parseUnit('mm'),
  description: text('Where to read the diagrams — leave unwired for the whole shaft, or wire the positions of the sections to check'),
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
  description: text('Which forces to follow: y, the vertical ones; x, the horizontal ones; or the resultant √(x² + y²) of both. z runs along the shaft'),
};

/**
 * Everything a shaft carries along its length, from one node: the support
 * reactions are solved from what is wired into `acting` — any arrangement of
 * supports, with the shaft's own stiffness section by section — and shear,
 * moment, deflection, slope and torque drawn along the shaft. Forces are
 * positive up in their plane, couples positive clockwise with z to the
 * right; the moment is positive when the shaft sags. Torques are taken as
 * already balanced (input in, output out).
 */
const shaftCalculation: Formula = {
  id: 'mechanics.shaft.calculation',
  version: 1,
  label: text('Shaft calculation'),
  description: text('Shear, moment and deflection'),
  outputs: [
    { kind: 'numeric', name: 'V', unit: parseUnit('N'), description: text('Shear force V(z)') },
    { kind: 'numeric', name: 'M', unit: parseUnit('Nmm'), description: text('Bending moment M(z), positive when the shaft sags') },
    { kind: 'numeric', name: 'y', unit: parseUnit('mm'), description: text('Deflection y(z), zero at every support') },
    { kind: 'numeric', name: 'theta', unit: parseUnit('rad'), description: text('Slope θ(z) = dy/dz, zero at a fixed support') },
    { kind: 'numeric', name: 'T', unit: parseUnit('Nmm'), description: text('Torque T(z), the running total of applied torque') },
  ],
  inputs: [shaftShaft, shaftActing, shaftPlane, shaftZ],
  shaft: {
    answers: 'diagrams',
    quantities: ['shear', 'moment', 'deflection', 'slope', 'torque'],
    acting: 'acting', shaft: 'shaft', axis: 'z', plane: 'plane',
  },
  status: 'unverified',
};

/**
 * The force and the moment one support applies to the shaft, for reporting
 * and checks — wire that Support node here as well as into `acting`. Signed
 * like the loads, so every force and reaction together sums to zero. Only a
 * fixed support takes a moment.
 */
const shaftReactions: Formula = {
  id: 'mechanics.shaft.reactions',
  version: 1,
  label: text('Support reaction'),
  description: text('Force and moment at a support'),
  outputs: [
    { kind: 'numeric', name: 'R', unit: parseUnit('N'), description: text('Reaction force, positive up') },
    { kind: 'numeric', name: 'M_R', unit: parseUnit('Nmm'), description: text('Reaction moment, positive clockwise — zero unless the support is fixed') },
  ],
  inputs: [
    shaftShaft,
    shaftActing,
    { kind: 'load', name: 'support', description: text('The support to report — one of those wired into acting') },
    shaftPlane,
  ],
  shaft: { answers: 'reactions', acting: 'acting', shaft: 'shaft', support: 'support', plane: 'plane' },
  status: 'unverified',
};

/**
 * Static sizing of a round shaft (`docs/shaft-sizing-plan.md`): the plain
 * strength-of-materials steps between a moment diagram and a diameter, and
 * the bending stress the stepped-shaft sample draws. They are ordinary
 * expressions, but they ship here with the diagrams rather than in the
 * example Mechanics catalogue, so a deployment can offer shafts without the
 * general mechanics examples. No fatigue — notch, size and surface factors
 * belong to the private catalogue.
 *
 * Release 0.34.1 shipped the four `mechanics.shaft.*` records in this
 * catalogue and `mechanics.beam.bending-stress` in the example one; every
 * id, version and hash is unchanged (pinned in `mechanicsNodes.test.ts`).
 */
function tr(en: string, nl: string): LocalizedText {
  return { en, nl };
}

/** Section moduli of a solid or hollow round shaft: W_b = π·(d⁴ − d_i⁴)/(32·d), W_p = 2·W_b; a bore needs d_i < d. */
const shaftSectionModulus: Formula = {
  id: 'mechanics.shaft.section-modulus',
  version: 1,
  label: tr('Section moduli of a round shaft', 'Weerstandsmomenten van een ronde as'),
  description: tr('Bending and torsion moduli', 'Buig- en torsieweerstandsmoment'),
  outputs: [
    { kind: 'numeric', name: 'W_b', unit: parseUnit('mm³'), description: tr('Axial section modulus, for bending', 'Axiaal weerstandsmoment, voor buiging') },
    { kind: 'numeric', name: 'W_p', unit: parseUnit('mm³'), description: tr('Polar section modulus, for torsion', 'Polair weerstandsmoment, voor torsie') },
  ],
  inputs: [
    { kind: 'numeric', name: 'd', unit: parseUnit('mm'), description: tr('Outer diameter', 'Buitendiameter') },
    {
      kind: 'numeric', name: 'd_i', unit: parseUnit('mm'), default: 0,
      description: tr('Bore diameter — 0 for a solid shaft, otherwise less than d', 'Boringdiameter — 0 voor een massieve as, anders kleiner dan d'),
    },
  ],
  expressions: { W_b: 'pi * (d**4 - d_i**4) / (32 * d)', W_p: '2 * W_b' },
  status: 'unverified',
};

/** Bending and torsion combined by von Mises into one equivalent bending moment. */
const shaftEquivalentMoment: Formula = {
  id: 'mechanics.shaft.equivalent-moment',
  version: 1,
  label: tr('Equivalent moment (von Mises)', 'Vergelijkingsmoment (von Mises)'),
  description: tr('M_v = √(M² + 0.75·T²)', 'M_v = √(M² + 0.75·T²)'),
  outputs: [{ kind: 'numeric', name: 'M_v', unit: parseUnit('Nmm'), description: tr('Equivalent bending moment', 'Vergelijkend buigmoment') }],
  inputs: [
    { kind: 'numeric', name: 'M', unit: parseUnit('Nmm'), description: tr('Bending moment', 'Buigmoment') },
    { kind: 'numeric', name: 'T', unit: parseUnit('Nmm'), default: 0, description: tr('Torque', 'Torsiemoment') },
  ],
  expressions: { M_v: 'sqrt(M**2 + 0.75 * T**2)' },
  status: 'unverified',
};

/** σ = M/W_b rearranged for a solid round shaft. Wants a moment magnitude: a signed moment gives a negative diameter. */
const shaftRequiredDiameter: Formula = {
  id: 'mechanics.shaft.required-diameter',
  version: 1,
  label: tr('Required diameter of a solid shaft', 'Benodigde diameter van een massieve as'),
  description: tr('Smallest solid diameter', 'Kleinste massieve diameter'),
  outputs: [{ kind: 'numeric', name: 'd', unit: parseUnit('mm'), description: tr('Required diameter', 'Benodigde diameter') }],
  inputs: [
    {
      kind: 'numeric', name: 'M_v', unit: parseUnit('Nmm'),
      description: tr('Equivalent (or resultant) bending moment, a magnitude', 'Vergelijkend (of resulterend) buigmoment, een grootte'),
    },
    { kind: 'numeric', name: 'sigma_allow', unit: parseUnit('N/mm²'), description: tr('Allowable bending stress', 'Toelaatbare buigspanning') },
  ],
  expressions: { d: 'cbrt(32 * M_v / (pi * sigma_allow))' },
  status: 'unverified',
};

/** Bending and torsional stress combined by von Mises. */
const shaftEquivalentStress: Formula = {
  id: 'mechanics.shaft.equivalent-stress',
  version: 1,
  label: tr('Equivalent stress (von Mises)', 'Vergelijkspanning (von Mises)'),
  description: tr('σ_v = √(σ_b² + 3·τ_t²)', 'σ_v = √(σ_b² + 3·τ_t²)'),
  outputs: [{ kind: 'numeric', name: 'sigma_v', unit: parseUnit('N/mm²'), description: tr('Equivalent stress', 'Vergelijkspanning') }],
  inputs: [
    { kind: 'numeric', name: 'sigma_b', unit: parseUnit('N/mm²'), description: tr('Bending stress', 'Buigspanning') },
    { kind: 'numeric', name: 'tau_t', unit: parseUnit('N/mm²'), default: 0, description: tr('Torsional shear stress', 'Torsieschuifspanning') },
  ],
  expressions: { sigma_v: 'sqrt(sigma_b**2 + 3 * tau_t**2)' },
  status: 'unverified',
};

/**
 * σ = M·c/I, as the example Mechanics catalogue shipped it — the citation
 * and the `Nm` moment unit included, since both are part of its hash.
 */
const beamBendingStress: Formula = {
  id: 'mechanics.beam.bending-stress',
  version: 1,
  description: tr('Bending stress at distance c from the neutral axis.', 'Buigspanning op afstand c van de neutrale as.'),
  outputs: [{ kind: 'numeric', name: 'sigma', unit: parseUnit('MPa') }],
  inputs: [
    { kind: 'numeric', name: 'M', unit: parseUnit('Nm') },
    { kind: 'numeric', name: 'c', unit: parseUnit('mm'), validRange: { min: 0 } },
    { kind: 'numeric', name: 'I', unit: parseUnit('mm⁴'), validRange: { min: 0 } },
  ],
  expressions: { sigma: 'M * c / I' },
  citation: 'Bending stress',
  status: 'unverified',
};

export const MECHANICS_OPERATIONS: readonly Formula[] = [
  shaftCalculation, shaftReactions,
  shaftSectionModulus, shaftEquivalentMoment, shaftRequiredDiameter, shaftEquivalentStress,
  beamBendingStress,
];
