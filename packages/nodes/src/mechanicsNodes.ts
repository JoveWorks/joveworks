/**
 * Generic mechanics content — beam/shaft load diagrams and the like
 * (ROADMAP item 8). Not R&M-specific, so it lives here in the public base
 * node library rather than a private catalogue, the same way `iso286.ts`'s
 * lookup-backed formulas do — built as `Formula` records directly rather
 * than through `draft.ts`'s `buildFormulas`, since `Draft` has no
 * `piecewise` field.
 *
 * Each formula's `expression` is unused at evaluation time (`piecewise`
 * short-circuits it, the same way `lookup` does in `iso286.ts`) but is kept
 * real and dimensionally consistent with the output, for the palette's
 * equation display and for the schema's own bookkeeping.
 */

import type { Formula, Port } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';
import { text } from './draft.js';

/**
 * A support's position and reaction, as two more single-valued breakpoint
 * entries alongside a diagram's load spectrum — left unwired (both default
 * to 0) for a diagram that only shows the applied loads, such as the one a
 * reaction is itself solved from. `FormulaPiecewise`'s docstring is why this
 * is two named ports per support rather than one more wire into `position`/
 * `force`: the pairing is declared once, here, not left to wire order.
 */
function supportPorts(letter: 'A' | 'B'): readonly Port[] {
  return [
    {
      kind: 'numeric', name: `support${letter}`, unit: parseUnit('mm'), default: 0,
      description: text(`Position of support ${letter} — leave unwired if this diagram excludes reactions`),
    },
    {
      kind: 'numeric', name: `reaction${letter}`, unit: parseUnit('N'), default: 0,
      description: text(`Support ${letter}'s reaction, signed — leave unwired if this diagram excludes reactions`),
    },
  ];
}

const shaftTorque: Formula = {
  id: 'shaftTorque',
  version: 1,
  label: text('Torque diagram'),
  description: text(
    'Torque along a shaft at a given position, T(z) — the running total of every applied ' +
      'torque at or before that position. Torques are taken as already balanced ' +
      '(input in, output out); this does not solve for a reaction torque.',
  ),
  output: { kind: 'numeric', name: 'T', unit: parseUnit('Nmm'), description: text('Torque at z — T(z)') },
  inputs: [
    { kind: 'numeric', name: 'z', unit: parseUnit('mm'), default: 0, description: text('Position along the shaft') },
    { kind: 'spectrum', name: 'position', unit: parseUnit('mm'), description: text('Position of each applied torque') },
    { kind: 'spectrum', name: 'torque', unit: parseUnit('Nmm'), description: text('Torque applied at each position, signed') },
  ],
  expression: 'sum(torque)',
  piecewise: { kind: 'cumulativeStep', axis: 'z', breakpoints: ['position'], values: ['torque'] },
  status: 'unverified',
};

const shaftShear: Formula = {
  id: 'shaftShear',
  version: 1,
  label: text('Shear diagram'),
  description: text(
    'Shear force along a shaft at a given position, V(z) — the running total of every ' +
      'transverse point load, plus either support’s reaction once wired, at or before that ' +
      'position. Apply once per transverse plane (x, y).',
  ),
  output: { kind: 'numeric', name: 'V', unit: parseUnit('N'), description: text('Shear at z — V(z)') },
  inputs: [
    { kind: 'numeric', name: 'z', unit: parseUnit('mm'), default: 0, description: text('Position along the shaft') },
    { kind: 'spectrum', name: 'position', unit: parseUnit('mm'), description: text('Position of each applied point load') },
    { kind: 'spectrum', name: 'force', unit: parseUnit('N'), description: text('Each point load, signed') },
    ...supportPorts('A'),
    ...supportPorts('B'),
  ],
  expression: 'sum(force)',
  piecewise: {
    kind: 'cumulativeStep', axis: 'z',
    breakpoints: ['position', 'supportA', 'supportB'],
    values: ['force', 'reactionA', 'reactionB'],
  },
  status: 'unverified',
};

const shaftMoment: Formula = {
  id: 'shaftMoment',
  version: 1,
  label: text('Bending moment diagram'),
  description: text(
    'Bending moment along a shaft at a given position, M(z) — the moment about z of every ' +
      'transverse point load, plus either support’s reaction once wired, at or before that ' +
      "position, M(z) = Σ force·(z − position). The closed-form integral of shaftShear's " +
      "result. Leave both supports unwired and evaluate at a support's own position instead " +
      "of sweeping z to get the moment that support's reaction is solved from (divide by the " +
      'support span, negate, then subtract from the load total for the other support — ' +
      'ordinary base nodes, not a third piecewise kind).',
  ),
  output: { kind: 'numeric', name: 'M', unit: parseUnit('Nmm'), description: text('Moment at z — M(z)') },
  inputs: [
    { kind: 'numeric', name: 'z', unit: parseUnit('mm'), default: 0, description: text('Position along the shaft') },
    { kind: 'spectrum', name: 'position', unit: parseUnit('mm'), description: text('Position of each applied point load') },
    { kind: 'spectrum', name: 'force', unit: parseUnit('N'), description: text('Each point load, signed') },
    ...supportPorts('A'),
    ...supportPorts('B'),
  ],
  expression: 'sum(force) * z',
  piecewise: {
    kind: 'cumulativeMoment', axis: 'z',
    breakpoints: ['position', 'supportA', 'supportB'],
    values: ['force', 'reactionA', 'reactionB'],
  },
  status: 'unverified',
};

/**
 * A distributed load's own shear/moment contribution, kept separate from
 * `shaftShear`/`shaftMoment` rather than folded in as more optional ports
 * the way a support's reaction was: a spectrum port has no `default` (only
 * a numeric port does), so an optional spectrum input would have to be
 * wired to a `[0]`-rate placeholder just to be left out — worse than
 * wiring an `add` node only when a distributed load actually exists.
 */
const shaftDistributedShear: Formula = {
  id: 'shaftDistributedShear',
  version: 1,
  label: text('Distributed-load shear contribution'),
  description: text(
    "A uniform distributed load's own contribution to the shear diagram at a given position — " +
      "add this to shaftShear's output (an ordinary add node) for the combined diagram. Wire " +
      'as many start/end/rate spectra as the shaft has distributed loads.',
  ),
  output: { kind: 'numeric', name: 'V', unit: parseUnit('N'), description: text('Shear contribution at z') },
  inputs: [
    { kind: 'numeric', name: 'z', unit: parseUnit('mm'), default: 0, description: text('Position along the shaft') },
    { kind: 'spectrum', name: 'start', unit: parseUnit('mm'), description: text('Start of each distributed load') },
    { kind: 'spectrum', name: 'end', unit: parseUnit('mm'), description: text('End of each distributed load') },
    { kind: 'spectrum', name: 'rate', unit: parseUnit('N/mm'), description: text('Load per unit length, signed, over its span') },
  ],
  expression: 'sum(rate) * z',
  piecewise: { kind: 'cumulativeStep', axis: 'z', distributedStart: ['start'], distributedEnd: ['end'], distributedRate: ['rate'] },
  status: 'unverified',
};

const shaftDistributedMoment: Formula = {
  id: 'shaftDistributedMoment',
  version: 1,
  label: text('Distributed-load moment contribution'),
  description: text(
    "A uniform distributed load's own contribution to the bending-moment diagram at a given " +
      "position — add this to shaftMoment's output (an ordinary add node) for the combined " +
      'diagram. Wire as many start/end/rate spectra as the shaft has distributed loads.',
  ),
  output: { kind: 'numeric', name: 'M', unit: parseUnit('Nmm'), description: text('Moment contribution at z') },
  inputs: [
    { kind: 'numeric', name: 'z', unit: parseUnit('mm'), default: 0, description: text('Position along the shaft') },
    { kind: 'spectrum', name: 'start', unit: parseUnit('mm'), description: text('Start of each distributed load') },
    { kind: 'spectrum', name: 'end', unit: parseUnit('mm'), description: text('End of each distributed load') },
    { kind: 'spectrum', name: 'rate', unit: parseUnit('N/mm'), description: text('Load per unit length, signed, over its span') },
  ],
  expression: 'sum(rate) * z * z',
  piecewise: { kind: 'cumulativeMoment', axis: 'z', distributedStart: ['start'], distributedEnd: ['end'], distributedRate: ['rate'] },
  status: 'unverified',
};

export const MECHANICS_OPERATIONS: readonly Formula[] = [
  shaftTorque, shaftShear, shaftMoment, shaftDistributedShear, shaftDistributedMoment,
];
