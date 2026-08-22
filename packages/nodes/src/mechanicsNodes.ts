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

import type { Formula } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';
import { text } from './draft.js';

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
  piecewise: { kind: 'cumulativeStep', axis: 'z', breakpoints: 'position', values: 'torque' },
  status: 'unverified',
};

export const MECHANICS_OPERATIONS: readonly Formula[] = [shaftTorque];
