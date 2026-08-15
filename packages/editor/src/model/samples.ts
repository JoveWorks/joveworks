/**
 * The two graphs the editor can open with, and the difference between them.
 *
 * **The pad-pressure study is built from base nodes only** (S42), so it opens
 * with nothing loaded and carries no textbook content whatsoever. It exists to
 * exercise the thing milestone 1 is actually about: an input set to a range, a
 * whole downstream graph becoming a series, and a plot with a threshold on it.
 *
 * **The belt lab is the graph already known to be right** — it is the golden
 * fixture of `test/belt-goldens.test.ts`, wired on a canvas instead of in a
 * test. It names formulas by id and supplies numbers, and it holds no expression
 * of any kind: the references are built from the catalogue *in memory*, so
 * without that catalogue loaded the sample is unavailable rather than embedded
 * (S23/S45). That is the honest degradation NEXT.md asks for.
 */

import { parseUnit } from '@mds/units';
import {
  SCHEMA_VERSION,
  formulaRef,
  type Catalogue,
  type Formula,
  type FormulaNode,
  type GraphDocument,
  type GraphNode,
  type InputNode,
  type Output,
  type OutputNode,
  type Position,
  type ValueSpec,
} from '@mds/schema';

import { lookup } from './analysis';
import { edgeId } from './document';

const at = (x: number, y: number): Position => ({ x, y });

function input(id: string, label: string, value: ValueSpec, position: Position): InputNode {
  return { kind: 'input', id, label, value, position };
}

function formulaNode(id: string, formula: Formula, position: Position): FormulaNode {
  return { kind: 'formula', id, formula: formulaRef(formula), position };
}

function output(id: string, label: string, spec: Output, position: Position): OutputNode {
  return { kind: 'output', id, label, output: spec, position };
}

function wire(from: string, to: string) {
  const [fromNode = '', fromPort = ''] = from.split('.');
  const [toNode = '', toPort = ''] = to.split('.');
  const endpoints = { from: { node: fromNode, port: fromPort }, to: { node: toNode, port: toPort } };
  return { id: edgeId(endpoints.from, endpoints.to), ...endpoints };
}

function document(
  id: string,
  title: string,
  nodes: readonly GraphNode[],
  edges: readonly { id: string; from: { node: string; port: string }; to: { node: string; port: string } }[],
  frames: GraphDocument['frames'] = [],
): GraphDocument {
  return { schemaVersion: SCHEMA_VERSION, id, title, nodes, edges, frames };
}

/** Every id present in the loaded catalogues? A sample needs all of its own. */
export function provides(catalogues: readonly Catalogue[], ids: readonly string[]): boolean {
  return ids.every((id) => lookup(catalogues, id) !== undefined);
}

// --- base nodes only: a sweep and a plot -------------------------------------

const PAD = ['multiply', 'divide'] as const;

/**
 * Pressure under a rectangular pad, swept over its width.
 *
 * `p = F / (w · L)` is the definition of pressure rather than anything a book
 * numbers, which is deliberate: a demo fixture must not be a catalogue formula
 * (CLAUDE.md), and this one is assembled from `multiply` and `divide` on the
 * canvas anyway. What it demonstrates is S29 and S43 — one range input, and
 * everything downstream of it is a series with no rewiring.
 */
export function padPressure(catalogues: readonly Catalogue[]): GraphDocument | undefined {
  const multiply = lookup(catalogues, 'multiply');
  const divide = lookup(catalogues, 'divide');
  if (multiply === undefined || divide === undefined) return undefined;

  const mm = parseUnit('mm');
  const stress = parseUnit('N/mm²');

  const nodes: GraphNode[] = [
    input('F', 'Pad load F', { kind: 'scalar', value: 12, unit: parseUnit('kN') }, at(0, 0)),
    input('L', 'Pad length L', { kind: 'scalar', value: 40, unit: mm }, at(0, 150)),
    {
      ...input('w', 'Pad width w', { kind: 'linear', start: 10, stop: 60, points: 26, unit: mm }, at(0, 300)),
      axisLabel: 'pad width w (mm)',
    },

    formulaNode('area', multiply, at(340, 220)),
    formulaNode('pressure', divide, at(680, 90)),

    output('p', 'Contact pressure p', { kind: 'print', unit: stress }, at(1020, 0)),
    output(
      'p_check',
      'Pressure within the bearing limit',
      { kind: 'check', comparison: '<=', threshold: { value: 2, unit: stress } },
      at(1020, 170),
    ),
    output(
      'p_plot',
      'Pressure against pad width',
      { kind: 'plot', x: 'w', threshold: { value: 2, unit: stress }, unit: stress },
      at(1020, 340),
    ),
  ];

  const edges = [
    wire('w.value', 'area.a'),
    wire('L.value', 'area.b'),
    wire('F.value', 'pressure.a'),
    wire('area.product', 'pressure.b'),
    wire('pressure.quotient', 'p.value'),
    wire('pressure.quotient', 'p_check.value'),
    wire('pressure.quotient', 'p_plot.value'),
  ];

  const frames = [
    {
      id: 'sizing',
      title: 'Pad sizing',
      note:
        'A 12 kN load on a 40 mm pad, swept across pad widths from 10 to 60 mm. The pressure ' +
        'limit is 2 N/mm², and the plot says where the sweep crosses it.',
      position: at(960, -80),
      size: { width: 400, height: 620 },
    },
  ];

  const withFrames = nodes.map((node) =>
    node.kind === 'output' ? { ...node, frameId: 'sizing' } : node,
  );

  return document('pad-pressure', 'Pad pressure sweep', withFrames, edges, frames);
}

// --- the belt lab, which needs its catalogue ---------------------------------

/**
 * The assignment, exactly as `test/belt-goldens.test.ts` states it — numbers,
 * which carry no citation and are safe here. `d_dg` is 400 mm where the
 * assignment text says 420; that is a defect in the source material, recorded
 * rather than quietly corrected.
 */
const ASSIGNMENT: readonly (readonly [string, string, number, string])[] = [
  ['P', 'Motor rating P', 2200, 'W'],
  ['K_A', 'Application factor K_A', 1.4, ''],
  ['d_dk', 'Small pulley d_dk', 90, 'mm'],
  ['d_dg', 'Large pulley d_dg', 400, 'mm'],
  ['eprime', "Provisional shaft distance e'", 700, 'mm'],
  ['P_N', 'Rated power P_N', 2300, 'W'],
  ['U_z', 'Power increment U_z', 270, 'W'],
  ['c_1', 'Angle factor c_1', 0.98, ''],
  ['c_2', 'Length factor c_2', 1.08, ''],
  ['zz', 'Pulleys passed z', 2, ''],
  ['n', 'Motor speed n', 1500, 'rpm'],
  ['L_d', 'Stock belt length L_d', 2187, 'mm'],
];

/** The catalogue records the belt lab needs, by id. */
export const BELT_LAB_FORMULAS = [
  'multiply',
  'rm.16.19A',
  'rm.16.23',
  'rm.16.22',
  'rm.16.29',
  'rm.16.36',
  'rm.16.37',
] as const;

/**
 * The belt lab as a canvas graph: `Lab_belt.ipynb`, whose eleven reproducible
 * golden values are the milestone 1 acceptance criterion.
 *
 * β₁ is absent for the reason it is absent from the test — `rm.16.24A` is
 * quarantined and D20 was settled as option A (S66). Drag it in from the palette
 * and the node says so; that is the quarantine gate, visible.
 */
export function beltLab(catalogues: readonly Catalogue[]): GraphDocument | undefined {
  if (!provides(catalogues, BELT_LAB_FORMULAS)) return undefined;
  const formula = (id: string): Formula => lookup(catalogues, id) as Formula;

  const nodes: GraphNode[] = [
    ...ASSIGNMENT.map(([id, label, value, unit], i) =>
      input(id, label, { kind: 'scalar', value, unit: parseUnit(unit) }, at(0, i * 110)),
    ),

    formulaNode('Pprime', formula('multiply'), at(380, 0)),
    formulaNode('ratio', formula('rm.16.19A'), at(380, 220)),
    formulaNode('theoretical', formula('rm.16.23'), at(380, 440)),
    formulaNode('shaft', formula('rm.16.22'), at(380, 660)),
    formulaNode('belts', formula('rm.16.29'), at(380, 880)),
    formulaNode('speed', formula('rm.16.36'), at(380, 1100)),
    formulaNode('bending', formula('rm.16.37'), at(760, 1100)),

    output('out_i', 'Transmission ratio i', { kind: 'print' }, at(1120, 0)),
    output('out_Pprime', "Design power P'", { kind: 'print', unit: parseUnit('W') }, at(1120, 150)),
    output('out_Lprime', "Theoretical belt length L'", { kind: 'print', unit: parseUnit('mm') }, at(1120, 300)),
    output('out_e', 'Shaft distance e', { kind: 'print', unit: parseUnit('mm') }, at(1120, 450)),
    output('out_z', 'Belts required z', { kind: 'print' }, at(1120, 600)),
    output('out_v', 'Belt speed v', { kind: 'print', unit: parseUnit('m/s') }, at(1120, 750)),
    output('out_f_B', 'Bending frequency f_B', { kind: 'print', unit: parseUnit('s-1') }, at(1120, 900)),
  ];

  const edges = [
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

    // The lab drives the belt over the small pulley: d_w is d_dk.
    wire('d_dk.value', 'speed.d_w'),
    wire('n.value', 'speed.n'),

    wire('speed.v', 'bending.v'),
    wire('zz.value', 'bending.zz'),
    wire('L_d.value', 'bending.L_d'),

    wire('ratio.i', 'out_i.value'),
    wire('Pprime.product', 'out_Pprime.value'),
    wire('theoretical.Lprime', 'out_Lprime.value'),
    wire('shaft.e', 'out_e.value'),
    wire('belts.z', 'out_z.value'),
    wire('speed.v', 'out_v.value'),
    wire('bending.f_B', 'out_f_B.value'),
  ];

  const frames = [
    {
      id: 'results',
      title: 'Belt drive results',
      note:
        'The lab assignment: a 2.2 kW motor at 1500 rpm, 90 mm and 400 mm pulleys, 700 mm ' +
        'provisional shaft distance, on a 2187 mm stock belt. These are the values the course ' +
        'notebook records.',
      position: at(1060, -80),
      size: { width: 420, height: 1120 },
    },
  ];

  const withFrames = nodes.map((node) =>
    node.kind === 'output' ? { ...node, frameId: 'results' } : node,
  );

  return document('belt-lab', 'Belt lab', withFrames, edges, frames);
}
