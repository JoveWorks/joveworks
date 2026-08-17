/**
 * The two graphs the editor can open with, and the difference between them.
 *
 * **The pad-pressure study is built from base nodes only**, so it opens
 * with nothing loaded and carries no textbook content whatsoever. It exists to
 * exercise the thing milestone 1 is actually about: an input set to a range, a
 * whole downstream graph becoming a series, and a plot with a threshold on it.
 *
 * **The belt lab is the graph already known to be right** — it is the golden
 * fixture of `test/belt-goldens.test.ts`, wired on a canvas instead of in a
 * test. It names formulas by id and supplies numbers, and it holds no expression
 * of any kind: the references are built from the catalogue *in memory*, so
 * without that catalogue loaded the sample is unavailable rather than embedded.
 * That is what makes "the editor degrades honestly" a mechanism
 * rather than an intention: there is nothing to degrade from, so no fixture
 * ever goes stale against the catalogue it was built from.
 */

import { parseUnit } from '@joveworks/units';
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
} from '@joveworks/schema';

import { lookup } from './analysis';
import { edgeId } from './document';
import { type AppLocale } from '../i18n';
import dutchText from './sample-translations.json';

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

/** Examples are templates, not student-authored content, so their visible
 * text follows the app language at the moment the template is opened. */
function localizeExample(value: GraphDocument, locale: AppLocale): GraphDocument {
  if (locale === 'en') return value;
  const text = (english: string): string => (dutchText as Readonly<Record<string, string>>)[english] ?? english;
  return {
    ...value,
    title: text(value.title),
    nodes: value.nodes.map((node) => ({
      ...node,
      ...(node.label === undefined ? {} : { label: text(node.label) }),
      ...(node.kind === 'input' && node.axisLabel !== undefined ? { axisLabel: text(node.axisLabel) } : {}),
      ...(node.kind === 'output' && node.caption !== undefined ? { caption: text(node.caption) } : {}),
    })),
    frames: value.frames.map((frame) => ({
      ...frame,
      title: text(frame.title),
      ...(frame.note === undefined ? {} : { note: text(frame.note) }),
    })),
  };
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
 * canvas anyway. What it demonstrates is one range input, and everything
 * downstream of it is a series with no rewiring.
 */
export function padPressure(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
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
    wire('w.value', 'area.b'),
    wire('L.value', 'area.a'),
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

  return localizeExample(document('pad-pressure', 'Pad pressure sweep', withFrames, edges, frames), locale);
}

// --- a plain-language decision example, for demonstrations ------------------

/**
 * A deliberately familiar version of the pad-pressure study. It gives a
 * sponsor, partner, or first-time visitor one question to follow: how wide
 * must a temporary platform be before it stays within the agreed floor-load
 * limit? The graph uses only public base nodes, so it is always available and
 * does not expose catalogue or textbook content.
 */
export function platformFootprint(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
  const multiply = lookup(catalogues, 'multiply');
  const divide = lookup(catalogues, 'divide');
  if (multiply === undefined || divide === undefined) return undefined;

  const mm = parseUnit('mm');
  const stress = parseUnit('N/mm²');
  const nodes: GraphNode[] = [
    input('load', 'Equipment load', { kind: 'scalar', value: 12, unit: parseUnit('kN') }, at(0, 0)),
    input('length', 'Platform length', { kind: 'scalar', value: 1000, unit: mm }, at(0, 150)),
    {
      ...input('width', 'Platform width to compare', { kind: 'linear', start: 200, stop: 1200, points: 26, unit: mm }, at(0, 300)),
      axisLabel: 'platform width (mm)',
    },

    formulaNode('footprint', multiply, at(340, 220)),
    formulaNode('floor_pressure', divide, at(680, 90)),

    output('pressure', 'Pressure on the floor', { kind: 'print', unit: stress }, at(1020, 0)),
    output(
      'safe',
      'Within the agreed floor-load limit',
      { kind: 'check', comparison: '<=', threshold: { value: 0.02, unit: stress } },
      at(1020, 170),
    ),
    output(
      'decision_plot',
      'How width changes the floor pressure',
      { kind: 'plot', x: 'width', threshold: { value: 0.02, unit: stress }, unit: stress },
      at(1020, 340),
    ),
  ];
  const edges = [
    wire('width.value', 'footprint.b'),
    wire('length.value', 'footprint.a'),
    wire('load.value', 'floor_pressure.a'),
    wire('footprint.product', 'floor_pressure.b'),
    wire('floor_pressure.quotient', 'pressure.value'),
    wire('floor_pressure.quotient', 'safe.value'),
    wire('floor_pressure.quotient', 'decision_plot.value'),
  ];
  const frames = [
    {
      id: 'decision',
      title: 'A decision at a glance',
      note:
        'We compare platform widths for a fixed 12 kN equipment load. The line shows the ' +
        'pressure on the floor; the threshold marks the widths that meet the agreed limit. ' +
        'The same live graph supplies the value, the check, and the chart in this report.',
      position: at(960, -80),
      size: { width: 430, height: 620 },
    },
  ];
  const withFrames = nodes.map((node) =>
    node.kind === 'output' ? { ...node, frameId: 'decision' } : node,
  );

  return localizeExample(document('platform-footprint', 'Choose a safe platform size', withFrames, edges, frames), locale);
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
 * quarantined until its wrap-angle unit tag is confirmed. Drag it in from
 * the palette and the node says so; that is the quarantine gate, visible.
 */
export function beltLab(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
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
    output('out_f_B', 'Bending frequency f_B', { kind: 'print', unit: parseUnit('Hz') }, at(1120, 900)),
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

  return localizeExample(document('belt-lab', 'Belt lab', withFrames, edges, frames), locale);
}

// --- cantilever deflection across hollow sections, from the public catalogue -

/** The catalogue records this sample needs, by id. */
export const CANTILEVER_FORMULAS = [
  'multiply',
  'subtract',
  'basic.beam.moment-of-inertia-hollow-circle',
  'basic.beam.cantilever-deflection',
] as const;

/**
 * Tip deflection of a steel cantilever, swept over five standard outer
 * diameters at a fixed 3 mm wall thickness. `d_i` is derived from `d_o` on the
 * canvas — `d_o − 2t` via the base `multiply`/`subtract` nodes — rather than
 * typed twice, so the section stays consistent as `d_o` sweeps.
 *
 * A showcase of the public catalogue rather than a golden fixture: base
 * arithmetic feeding a catalogue formula chain, an explicit-list sweep, and
 * all three non-trivial output kinds (table, plot, check) reading the same
 * swept value. Only the 80 mm section clears the L/300 serviceability limit —
 * a genuine "sweep and read off" result, not a uniformly green one.
 */
export function cantileverHollowSections(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
  if (!provides(catalogues, CANTILEVER_FORMULAS)) return undefined;
  const formula = (id: string): Formula => lookup(catalogues, id) as Formula;

  const mm = parseUnit('mm');
  const limit = { value: 3.333, unit: mm };

  const nodes: GraphNode[] = [
    { ...input('d_o', 'Outer diameter d_o', { kind: 'list', values: [30, 40, 50, 60, 80], unit: mm }, at(0, 0)), axisLabel: 'd_o' },
    input('t', 'Wall thickness t', { kind: 'scalar', value: 3, unit: mm }, at(0, 180)),
    input('two', '2 (wall thickness on both sides)', { kind: 'scalar', value: 2, unit: parseUnit('') }, at(0, 320)),

    formulaNode('twice_t', formula('multiply'), at(280, 180)),
    formulaNode('d_i', formula('subtract'), at(520, 90)),
    formulaNode('I', formula('basic.beam.moment-of-inertia-hollow-circle'), at(760, 0)),

    input('F', 'Tip load F', { kind: 'scalar', value: 500, unit: parseUnit('N') }, at(0, 460)),
    input('L', 'Beam length L', { kind: 'scalar', value: 1000, unit: mm }, at(0, 600)),
    input('E', "Young's modulus E (steel)", { kind: 'scalar', value: 210000, unit: parseUnit('MPa') }, at(0, 740)),
    formulaNode('delta', formula('basic.beam.cantilever-deflection'), at(1000, 360)),

    output('out_table', 'Section results', { kind: 'table', columns: ['d_o', 'd_i', 'I', 'delta'] }, at(1240, 0)),
    output(
      'out_plot',
      'Deflection against outer diameter',
      { kind: 'plot', x: 'd_o', threshold: limit, unit: mm },
      at(1240, 210),
    ),
    output(
      'out_check',
      'Within the L/300 deflection limit',
      { kind: 'check', comparison: '<=', threshold: limit },
      at(1240, 410),
    ),
  ];

  const edges = [
    wire('t.value', 'twice_t.a'),
    wire('two.value', 'twice_t.b'),

    wire('d_o.value', 'd_i.a'),
    wire('twice_t.product', 'd_i.b'),

    wire('d_o.value', 'I.d_o'),
    wire('d_i.difference', 'I.d_i'),

    wire('F.value', 'delta.F'),
    wire('L.value', 'delta.L'),
    wire('E.value', 'delta.E'),
    wire('I.I', 'delta.I'),

    wire('d_o.value', 'out_table.d_o'),
    wire('d_i.difference', 'out_table.d_i'),
    wire('I.I', 'out_table.I'),
    wire('delta.delta', 'out_table.delta'),
    wire('delta.delta', 'out_plot.value'),
    wire('delta.delta', 'out_check.value'),
  ];

  const frames = [
    {
      id: 'sections',
      title: 'Cantilever beam — hollow circular sections',
      note:
        'Tip deflection of a steel cantilever (F = 500 N, L = 1000 mm) for five standard ' +
        'outer diameters at a fixed 3 mm wall thickness. The L/300 = 3.33 mm serviceability ' +
        'limit is crossed between 60 and 80 mm.',
      position: at(1180, -80),
      size: { width: 420, height: 700 },
    },
  ];

  const withFrames = nodes.map((node) =>
    node.kind === 'output' ? { ...node, frameId: 'sections' } : node,
  );

  return localizeExample(document('cantilever-hollow-sections', 'Cantilever — hollow sections', withFrames, edges, frames), locale);
}

// --- milling parameter study, from the public machining catalogue ----------

/** The catalogue records this sample needs, by id. */
export const MILLING_STUDY_FORMULAS = [
  'machining.speed.spindle-speed',
  'machining.milling.table-feed',
  'machining.milling.removal-rate',
  'machining.power.from-removal-rate',
  'machining.power.machine-input',
  'machining.torque.from-power',
  'machining.time.in-cut',
] as const;

/**
 * Rough-milling a pocket against a small machining centre's spindle envelope.
 * Chip load and radial engagement form a 5 × 4 grid; productivity rises with
 * both, while the power and torque contours cut different boundaries through
 * that grid. The best discrete point that clears both checks is f_z = 0.24 mm
 * and a_e = 30 mm, at Q = 132 cm³/min.
 *
 * This is deliberately an initial parameter study, not a claim that the most
 * productive surviving point is production-safe. The notebook records the
 * constant-specific-force assumption and the omitted stability/tool limits.
 */
export function millingPowerEnvelope(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
  if (!provides(catalogues, MILLING_STUDY_FORMULAS)) return undefined;
  const formula = (id: string): Formula => lookup(catalogues, id) as Formula;

  const mm = parseUnit('mm');
  const kilowatt = parseUnit('kW');
  const torque = parseUnit('Nm');

  const nodes: GraphNode[] = [
    input('D', 'Cutter diameter D', { kind: 'scalar', value: 50, unit: mm }, at(0, 0)),
    input('v_c', 'Target cutting speed v_c', { kind: 'scalar', value: 180, unit: parseUnit('m/min') }, at(0, 140)),
    formulaNode('spindle_speed', formula('machining.speed.spindle-speed'), at(300, 40)),

    {
      ...input('f_z', 'Chip load f_z', { kind: 'list', values: [0.08, 0.12, 0.16, 0.2, 0.24], unit: mm }, at(0, 340)),
      axisLabel: 'chip load f_z (mm/tooth)',
    },
    input('z_c', 'Effective teeth z_c', { kind: 'scalar', value: 4, unit: parseUnit('') }, at(0, 500)),
    formulaNode('table_feed', formula('machining.milling.table-feed'), at(360, 380)),

    {
      ...input('a_e', 'Radial engagement a_e', { kind: 'list', values: [10, 20, 30, 40], unit: mm }, at(0, 700)),
      axisLabel: 'radial engagement a_e (mm)',
    },
    input('a_p', 'Axial depth a_p', { kind: 'scalar', value: 4, unit: mm }, at(0, 860)),
    formulaNode('removal_rate', formula('machining.milling.removal-rate'), at(700, 560)),

    input('k_c', 'Specific cutting force k_c', { kind: 'scalar', value: 1800, unit: parseUnit('N/mm²') }, at(360, 780)),
    formulaNode('cutting_power', formula('machining.power.from-removal-rate'), at(980, 560)),
    input('eta', 'Machine efficiency eta', { kind: 'scalar', value: 0.85, unit: parseUnit('') }, at(700, 820)),
    formulaNode('machine_power', formula('machining.power.machine-input'), at(1240, 480)),
    formulaNode('cutting_torque', formula('machining.torque.from-power'), at(1240, 700)),

    input('L', 'Total toolpath length L', { kind: 'scalar', value: 800, unit: mm }, at(700, 1000)),
    formulaNode('cutting_time', formula('machining.time.in-cut'), at(980, 940)),

    output('out_n', 'Required spindle speed', { kind: 'print', unit: parseUnit('rpm') }, at(1680, 0)),
    output(
      'out_Q_plot',
      'Material-removal rate',
      { kind: 'plot', x: 'f_z', series: 'a_e', contour: true, unit: parseUnit('cm³/min') },
      at(1680, 300),
    ),
    output(
      'out_P_plot',
      'Machine input power envelope',
      { kind: 'plot', x: 'f_z', series: 'a_e', contour: true, threshold: { value: 5.5, unit: kilowatt }, unit: kilowatt },
      at(1680, 680),
    ),
    output(
      'out_P_check',
      'Within the 5.5 kW spindle limit',
      { kind: 'check', comparison: '<=', threshold: { value: 5.5, unit: kilowatt } },
      at(1680, 900),
    ),
    output(
      'out_M_plot',
      'Cutting torque envelope',
      { kind: 'plot', x: 'f_z', series: 'a_e', contour: true, threshold: { value: 35, unit: torque }, unit: torque },
      at(1680, 1080),
    ),
    output(
      'out_M_check',
      'Within the 35 Nm torque limit',
      { kind: 'check', comparison: '<=', threshold: { value: 35, unit: torque } },
      at(1680, 1300),
    ),
    output(
      'out_table',
      'Candidate cutting parameters',
      { kind: 'table', columns: ['f_z', 'a_e', 'v_f', 'Q', 'P_m', 'M_c', 't_c'] },
      at(1680, 1580),
    ),
  ];

  const edges = [
    wire('v_c.value', 'spindle_speed.v_c'),
    wire('D.value', 'spindle_speed.D'),

    wire('f_z.value', 'table_feed.f_z'),
    wire('z_c.value', 'table_feed.z_c'),
    wire('spindle_speed.n', 'table_feed.n'),

    wire('a_p.value', 'removal_rate.a_p'),
    wire('a_e.value', 'removal_rate.a_e'),
    wire('table_feed.v_f', 'removal_rate.v_f'),

    wire('k_c.value', 'cutting_power.k_c'),
    wire('removal_rate.Q', 'cutting_power.Q'),
    wire('cutting_power.P_c', 'machine_power.P_c'),
    wire('eta.value', 'machine_power.eta'),
    wire('cutting_power.P_c', 'cutting_torque.P_c'),
    wire('spindle_speed.n', 'cutting_torque.n'),

    wire('L.value', 'cutting_time.L'),
    wire('table_feed.v_f', 'cutting_time.v_f'),

    wire('spindle_speed.n', 'out_n.value'),
    wire('removal_rate.Q', 'out_Q_plot.value'),
    wire('machine_power.P_m', 'out_P_plot.value'),
    wire('machine_power.P_m', 'out_P_check.value'),
    wire('cutting_torque.M_c', 'out_M_plot.value'),
    wire('cutting_torque.M_c', 'out_M_check.value'),
    wire('f_z.value', 'out_table.f_z'),
    wire('a_e.value', 'out_table.a_e'),
    wire('table_feed.v_f', 'out_table.v_f'),
    wire('removal_rate.Q', 'out_table.Q'),
    wire('machine_power.P_m', 'out_table.P_m'),
    wire('cutting_torque.M_c', 'out_table.M_c'),
    wire('cutting_time.t_c', 'out_table.t_c'),
  ];

  const frames = [
    {
      id: 'tool-speed',
      title: '1. Tool and cutting speed',
      note:
        'A 50 mm, four-tooth cutter runs at a target cutting speed of 180 m/min. ' +
        'The diameter and cutting speed establish one spindle speed for the study.',
      position: at(1620, -80),
      size: { width: 440, height: 300 },
    },
    {
      id: 'productivity',
      title: '2. Productivity study',
      note:
        'Chip load and radial engagement are swept together. Axial depth stays at 4 mm; ' +
        'the removal-rate contour shows the productivity gained by moving across the grid.',
      position: at(1620, 240),
      size: { width: 440, height: 360 },
    },
    {
      id: 'constraints',
      title: '3. Spindle constraints',
      note:
        'The 5.5 kW input-power and 35 Nm cutting-torque limits cut different boundaries ' +
        'through the grid. A failed overall check means some candidates fail, not that every ' +
        'candidate does; use the contours to find the feasible region.',
      position: at(1620, 620),
      size: { width: 440, height: 780 },
    },
    {
      id: 'selection',
      title: '4. Candidate operating point',
      note:
        'The most productive point in this discrete grid that clears both limits is ' +
        'f_z = 0.24 mm/tooth and a_e = 30 mm, giving Q = 132 cm³/min. This is an initial ' +
        'power-envelope result with constant k_c—not a production recommendation. Tool ' +
        'deflection, chatter, chip thinning, workholding, and manufacturer limits remain to check.',
      position: at(1620, 1420),
      size: { width: 440, height: 520 },
    },
  ];

  const frameForOutput: Readonly<Record<string, string>> = {
    out_n: 'tool-speed',
    out_Q_plot: 'productivity',
    out_P_plot: 'constraints',
    out_P_check: 'constraints',
    out_M_plot: 'constraints',
    out_M_check: 'constraints',
    out_table: 'selection',
  };
  const withFrames = nodes.map((node) => {
    const frameId = frameForOutput[node.id];
    return node.kind === 'output' && frameId !== undefined ? { ...node, frameId } : node;
  });

  return localizeExample(document('milling-power-envelope', 'Pocket milling — power envelope', withFrames, edges, frames), locale);
}
