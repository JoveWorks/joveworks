/**
 * Three mechanics relations general enough for the base library: power and
 * torque at a rotational speed, both ways round, and a design factor of
 * safety against yield. They shipped in the Shafts catalogue until the
 * shafts became a domain of their own (ROADMAP item 19); their ids,
 * versions and hashes are unchanged (pinned in `catalogue.test.ts`), so a
 * NodeBook saved against them still resolves exactly.
 */

import type { Formula, LocalizedText } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

function tr(en: string, nl: string): LocalizedText {
  return { en, nl };
}

const rotationPowerFromTorque: Formula = {
  id: 'mechanics.rotation.power-from-torque',
  version: 1,
  description: tr('Transmitted power from torque and rotational speed.', 'Overgedragen vermogen uit koppel en toerental.'),
  outputs: [{ kind: 'numeric', name: 'P', unit: parseUnit('W') }],
  inputs: [
    { kind: 'numeric', name: 'T', unit: parseUnit('Nm') },
    { kind: 'numeric', name: 'n', unit: parseUnit('rpm'), validRange: { min: 0 } },
  ],
  expressions: { P: '2 * pi * n * T' },
  citation: 'Power from torque and speed',
  variantOf: 'mechanics.rotation.power-torque-relation',
  status: 'unverified',
};

const rotationTorqueFromPower: Formula = {
  id: 'mechanics.rotation.torque-from-power',
  version: 1,
  description: tr('Torque from transmitted power and rotational speed — same relation, solved for T.', 'Koppel van overgedragen vermogen en rotatiesnelheid - dezelfde relatie, opgelost voor T.'),
  outputs: [{ kind: 'numeric', name: 'T', unit: parseUnit('Nm') }],
  inputs: [
    { kind: 'numeric', name: 'P', unit: parseUnit('W'), validRange: { min: 0 } },
    { kind: 'numeric', name: 'n', unit: parseUnit('rpm'), validRange: { min: 0 } },
  ],
  expressions: { T: 'P / (2 * pi * n)' },
  citation: 'Torque from power and speed',
  variantOf: 'mechanics.rotation.power-torque-relation',
  status: 'unverified',
};

const stressFactorOfSafety: Formula = {
  id: 'mechanics.stress.factor-of-safety',
  version: 1,
  description: tr('Design factor of safety against yield.', 'Ontwerpfactor van veiligheid tegen opbrengst.'),
  outputs: [{ kind: 'numeric', name: 'n', unit: parseUnit('') }],
  inputs: [
    { kind: 'numeric', name: 'sigma_yield', unit: parseUnit('MPa'), validRange: { min: 0 } },
    { kind: 'numeric', name: 'sigma_allow', unit: parseUnit('MPa'), validRange: { min: 0 } },
  ],
  expressions: { n: 'sigma_yield / sigma_allow' },
  citation: 'Factor of safety',
  status: 'unverified',
};

export const GENERAL_MECHANICS_OPERATIONS: readonly Formula[] = [rotationPowerFromTorque, rotationTorqueFromPower, stressFactorOfSafety];
