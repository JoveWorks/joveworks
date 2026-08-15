/**
 * Milestone 1's acceptance criterion: the belt lab, end to end through the
 * kernel (docs/PLAN.md, "Migration and verification").
 *
 * Two graphs, one per predecessor notebook — `notebooks/belt/Lab_belt.ipynb`
 * and `Lab_belt_incl_Fa.ipynb`, which differ only in the stock belt length
 * chosen (2187 mm against 2240 mm) and in the second one going on to the shaft
 * torque and the tangential force. The expected numbers are docs/PLAN.md's table,
 * recovered from the stored notebook outputs; they are not re-derived here.
 *
 * **The catalogue is not in this repository and never will be** (S45), so this
 * points at `MDS_CATALOGUE` and skips when it is unset, exactly as
 * `catalogue-check.test.ts` does:
 *
 *     MDS_CATALOGUE=~/source/machine-design-catalogue/formulas/c16-belt.json pnpm test
 *
 * What lives here is inputs and expected values — numbers, which carry no
 * citation and are safe in a public repo. The expressions they exercise stay in
 * the private half; this file names formulas only by id.
 *
 * **What this proves, and what it does not.** A reproduced golden shows the
 * transcription is *faithful*. It does not show the formula is *correct* — the
 * three defects the dimension check found in this same chapter would have
 * survived a green run here, because no golden path touches them. That is why
 * only the seven formulas below earn `verified` (S19) and the other forty-seven
 * records stay `unverified`.
 *
 * **β₁ is absent on purpose.** The wrap angle comes from `rm.16.24A`, which is
 * quarantined pending D20, and D20 was settled as option A — the quarantine
 * stands. Eleven of the twelve golden rows are reproduced; the twelfth is
 * asserted to be *refused*, which is the quarantine gate doing its job rather
 * than a gap in the test.
 */

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  SCHEMA_VERSION,
  formulaRef,
  loadCatalogue,
  parseDocument,
  serializeFormulaRef,
  type Catalogue,
  type Formula,
  type GraphDocument,
  type JsonObject,
} from '@mds/schema';
import { fromCanonical } from '@mds/units';
import { baseCatalogueJson } from '@mds/nodes';
import { evaluateDocument, type Evaluation, type ValueResult } from '@mds/kernel';

const path = process.env['MDS_CATALOGUE'];
const present = path !== undefined && path.length > 0 && existsSync(path);

const BASE: Catalogue = loadCatalogue(baseCatalogueJson());

const BELT: Catalogue = present
  ? loadCatalogue(readFileSync(path as string, 'utf8'))
  : { schemaVersion: SCHEMA_VERSION, id: 'absent', name: 'absent', restricted: true, formulas: [] };

const CATALOGUES: readonly Catalogue[] = [BASE, BELT];

function find(id: string): Formula {
  const formula = CATALOGUES.flatMap((catalogue) => catalogue.formulas).find(
    (entry) => entry.id === id,
  );
  if (formula === undefined) throw new Error(`no formula '${id}'`);
  return formula;
}

// --- building a graph out of JSON, as a saved document would arrive ----------

const node = (id: string, formulaId: string): JsonObject => ({
  kind: 'formula',
  id,
  position: { x: 0, y: 0 },
  formula: serializeFormulaRef(formulaRef(find(formulaId))),
});

const input = (id: string, value: number, unit: string): JsonObject => ({
  kind: 'input',
  id,
  position: { x: 0, y: 0 },
  value: { kind: 'scalar', value, unit },
});

const output = (id: string, unit?: string): JsonObject => ({
  kind: 'output',
  id,
  position: { x: 0, y: 0 },
  output: unit === undefined ? { kind: 'value' } : { kind: 'value', unit },
});

const wire = (from: string, to: string): JsonObject => {
  const [fromNode = '', fromPort = ''] = from.split('.');
  const [toNode = '', toPort = ''] = to.split('.');
  return {
    id: `${from}->${to}`,
    from: { node: fromNode, port: fromPort },
    to: { node: toNode, port: toPort },
  };
};

const graph = (id: string, title: string, nodes: JsonObject[], edges: JsonObject[]): GraphDocument =>
  parseDocument({ schemaVersion: SCHEMA_VERSION, id, title, nodes, edges, frames: [] });

/**
 * The assignment, as both notebooks state it.
 *
 * Two of these are worth naming. `d_dg` is 400 mm where the assignment text
 * says 420 — a defect in the source material, recorded rather than reproduced
 * differently (docs/PLAN.md). And `n` is a rotational *frequency*: 1500 rpm is 25
 * s⁻¹ canonically, which is what makes `v = π·d·n` come out at 7.069 m/s
 * without the 2π the old notebook's `rpm_` symbol carried.
 */
const ASSIGNMENT: readonly (readonly [string, number, string])[] = [
  ['P', 2200, 'W'], // motor rating
  ['K_A', 1.4, ''], // application factor, medium startup / 8 h per day
  ['d_dk', 90, 'mm'], // small pulley
  ['d_dg', 400, 'mm'], // large pulley — 420 in the assignment text
  ['eprime', 700, 'mm'], // provisional shaft distance
  ['P_N', 2300, 'W'], // table 16-15b
  ['U_z', 270, 'W'], // table 16-16b
  ['c_1', 0.98, ''], // table 16-17a, angle factor
  ['c_2', 1.08, ''], // table 16-17c, length factor
  ['zz', 2, ''], // pulleys the belt passes
  ['n', 1500, 'rpm'], // motor speed
];

/**
 * The belt lab as a graph.
 *
 * `Pprime = P·K_A` is a base-library `multiply` rather than a catalogue record,
 * because the notebook computes it inline and R&M does not number it. So is the
 * shaft torque in the `withForces` half: `T = P'/(2π·n)`, built from `pi`, two
 * multiplies and a divide, which keeps the 2π visible as arithmetic instead of
 * hiding it in a literal.
 */
function beltGraph(id: string, title: string, stockLength: number, withForces: boolean): GraphDocument {
  const nodes: JsonObject[] = [
    ...ASSIGNMENT.map(([name, value, unit]) => input(name, value, unit)),
    input('L_d', stockLength, 'mm'),

    node('Pprime', 'multiply'),
    node('ratio', 'rm.16.19A'),
    node('theoretical', 'rm.16.23'),
    node('shaft', 'rm.16.22'),
    node('belts', 'rm.16.29'),
    node('speed', 'rm.16.36'),
    node('bending', 'rm.16.37'),

    output('out_i'),
    output('out_Pprime', 'W'),
    output('out_d_dg', 'mm'),
    output('out_Lprime', 'mm'),
    output('out_L_d', 'mm'),
    output('out_e', 'mm'),
    output('out_z'),
    output('out_v', 'm/s'),
    output('out_f_B', 's-1'),
  ];

  const edges: JsonObject[] = [
    wire('P.value', 'Pprime.a'),
    wire('K_A.value', 'Pprime.b'),

    wire('d_dg.value', 'ratio.d_dg'),
    wire('d_dk.value', 'ratio.d_dk'),

    wire('eprime.value', 'theoretical.eprime'),
    wire('d_dg.value', 'theoretical.d_dg'),
    wire('d_dk.value', 'theoretical.d_dk'),

    wire('L_d.value', 'shaft.L_d'),
    wire('d_dg.value', 'shaft.d_dg'),
    wire('d_dk.value', 'shaft.d_dk'),

    wire('Pprime.product', 'belts.Pprime'),
    wire('P_N.value', 'belts.P_N'),
    wire('U_z.value', 'belts.U_z'),
    wire('c_1.value', 'belts.c_1'),
    wire('c_2.value', 'belts.c_2'),

    // The notebook drives the belt over the small pulley: d_w is d_dk.
    wire('d_dk.value', 'speed.d_w'),
    wire('n.value', 'speed.n'),

    wire('speed.v', 'bending.v'),
    wire('zz.value', 'bending.zz'),
    wire('L_d.value', 'bending.L_d'),

    wire('ratio.i', 'out_i.value'),
    wire('Pprime.product', 'out_Pprime.value'),
    wire('d_dg.value', 'out_d_dg.value'),
    wire('theoretical.Lprime', 'out_Lprime.value'),
    wire('L_d.value', 'out_L_d.value'),
    wire('shaft.e', 'out_e.value'),
    wire('belts.z', 'out_z.value'),
    wire('speed.v', 'out_v.value'),
    wire('bending.f_B', 'out_f_B.value'),
  ];

  if (withForces) {
    nodes.push(
      input('two', 2, ''),
      node('pi', 'pi'),
      node('turn', 'multiply'), // 2π
      node('omega', 'multiply'), // 2π·n, the angular speed the torque needs
      node('torque', 'divide'), // P'/(2π·n)
      node('tangential', 'rm.16.27'),
      output('out_T', 'Nm'),
      output('out_F_t', 'N'),
    );
    edges.push(
      wire('two.value', 'turn.a'),
      wire('pi.value', 'turn.b'),
      wire('turn.product', 'omega.a'),
      wire('n.value', 'omega.b'),
      wire('Pprime.product', 'torque.a'),
      wire('omega.product', 'torque.b'),
      wire('Pprime.product', 'tangential.Pprime'),
      wire('speed.v', 'tangential.v'),
      wire('torque.quotient', 'out_T.value'),
      wire('tangential.F_t', 'out_F_t.value'),
    );
  }

  return graph(id, title, nodes, edges);
}

// --- reading a result in the unit the notebook printed it in -----------------

/**
 * The value an output node shows, converted out of canonical units.
 *
 * Going through the output node rather than reading the port directly is the
 * point: mm-N-s means the belt speed is 7068.6 internally and the torque
 * 19608.7, and a golden that matched canonically while displaying wrongly would
 * be no use to a student. This is the boundary S53 says the goldens confirm.
 */
function shown(evaluation: Evaluation, nodeId: string): number {
  const result = evaluation.outputs.find((entry) => entry.nodeId === nodeId);
  if (result === undefined || result.kind !== 'value') throw new Error(`no value output '${nodeId}'`);
  const { series, unit }: ValueResult = result;
  if (series.kind !== 'numeric') throw new Error(`'${nodeId}' is not numeric`);
  const [first] = series.data;
  if (typeof first !== 'number') throw new Error(`'${nodeId}' produced nothing`);
  return fromCanonical(first, unit);
}

/** docs/PLAN.md: assert at rel=1e-3, because the stored outputs are 4 significant figures. */
function expectGolden(actual: number, expected: number, what: string): void {
  expect(Math.abs(actual - expected) / Math.abs(expected), `${what} = ${actual}`).toBeLessThan(1e-3);
}

// --- docs/PLAN.md's table ---------------------------------------------------------

const LAB_BELT: readonly (readonly [string, number, string])[] = [
  ['out_i', 4.444, 'i'],
  ['out_Pprime', 3080, "P'"],
  ['out_d_dg', 400, 'd_dg'],
  ['out_Lprime', 2204, "L'"],
  ['out_L_d', 2187, 'L_d'],
  ['out_e', 691.3, 'e'],
  ['out_z', 1.132, 'z'],
  ['out_v', 7.069, 'v'],
  ['out_f_B', 6.464, 'f_B'],
];

const LAB_BELT_INCL_FA: readonly (readonly [string, number, string])[] = [
  ['out_i', 4.444, 'i'],
  ['out_Pprime', 3080, "P'"],
  ['out_d_dg', 400, 'd_dg'],
  ['out_Lprime', 2204, "L'"],
  ['out_L_d', 2240, 'L_d'],
  ['out_e', 718.4, 'e'],
  ['out_z', 1.132, 'z'],
  ['out_v', 7.069, 'v'],
  ['out_f_B', 6.311, 'f_B'],
  ['out_T', 19.61, 'T'],
  ['out_F_t', 435.7, 'F_t'],
];

/** The formulas a golden above actually exercises, and therefore the ones that earn `verified`. */
const EXERCISED = [
  'rm.16.19A',
  'rm.16.22',
  'rm.16.23',
  'rm.16.27',
  'rm.16.29',
  'rm.16.36',
  'rm.16.37',
] as const;

describe.runIf(present)('the belt lab, end to end (milestone 1 acceptance)', () => {
  it('reproduces Lab_belt.ipynb — a 2187 mm belt', () => {
    const evaluation = evaluateDocument(beltGraph('lab-belt', 'Belt lab', 2187, false), CATALOGUES);
    expect(evaluation.warnings).toEqual([]);
    for (const [nodeId, expected, what] of LAB_BELT) {
      expectGolden(shown(evaluation, nodeId), expected, what);
    }
  });

  it('reproduces Lab_belt_incl_Fa.ipynb — a 2240 mm belt, with torque and belt force', () => {
    const document = beltGraph('lab-belt-fa', 'Belt lab, with shaft force', 2240, true);
    const evaluation = evaluateDocument(document, CATALOGUES);
    expect(evaluation.warnings).toEqual([]);
    for (const [nodeId, expected, what] of LAB_BELT_INCL_FA) {
      expectGolden(shown(evaluation, nodeId), expected, what);
    }
  });

  it('carries the canonical-unit traps rather than sidestepping them (S53)', () => {
    // Two orders of magnitude and a 2π live between the printed number and the
    // stored one. If a golden ever misses by a round factor, this is the line
    // that says which boundary moved.
    const evaluation = evaluateDocument(beltGraph('lab-belt', 'Belt lab', 2187, false), CATALOGUES);
    const speed = evaluation.values.get('speed.v');
    expect(speed?.kind === 'numeric' && speed.data[0]).toBeCloseTo(Math.PI * 90 * 25, 9);
  });

  it('cannot produce β₁: 16.24A is quarantined and D20 was settled as A', () => {
    // The honest half of the acceptance criterion. Eleven rows reproduce; the
    // wrap angle is refused, loudly, with the reason on the record (S19).
    const document = graph(
      'wrap-angle',
      'The golden D20 costs',
      [
        input('d_dg', 400, 'mm'),
        input('d_dk', 90, 'mm'),
        input('e', 691.3, 'mm'),
        node('wrap', 'rm.16.24A'),
      ],
      [
        wire('d_dg.value', 'wrap.d_dg'),
        wire('d_dk.value', 'wrap.d_dk'),
        wire('e.value', 'wrap.e'),
      ],
    );
    expect(() => evaluateDocument(document, CATALOGUES)).toThrow(/quarantined/u);
  });

  it('marks exactly the formulas a golden exercised as verified (S19)', () => {
    // `verified` is earned per formula, not per run: most of the chapter is
    // still `unverified` afterwards, and that is the status field working.
    const verified = BELT.formulas
      .filter((formula) => formula.status === 'verified')
      .map((formula) => formula.id)
      .sort();
    expect(verified).toEqual([...EXERCISED]);
  });
});

describe('the belt goldens', () => {
  it('are only run when a catalogue is named — the restricted half is another repo (S45)', () => {
    expect(present || path === undefined).toBe(true);
  });
});
