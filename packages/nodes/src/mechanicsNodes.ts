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
 * Only what needs the kernel's shaft solve. The plain sizing formulas that
 * follow a moment diagram (section moduli, von Mises, required diameter)
 * are ordinary expressions and live in the public Mechanics catalogue
 * (`packages/editor/src/catalogues/examples/basic-mechanics.json`).
 */
export const MECHANICS_OPERATIONS: readonly Formula[] = [shaftCalculation, shaftReactions];
