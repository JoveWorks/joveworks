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

import { parseUnit, type Unit } from '@joveworks/units';
import {
  DOCUMENT_SCHEMA_VERSION,
  formulaRef,
  loadDocument,
  type Catalogue,
  type Formula,
  type FormulaNode,
  type GraphDocument,
  type GraphNode,
  type InputNode,
  type MonteCarloGeneratorNode,
  type MonteCarloReceiverNode,
  type Output,
  type OutputNode,
  type Position,
  type ValueSpec,
} from '@joveworks/schema';

import { lookup } from './analysis';
import { edgeId, frameAround as frameAroundExact } from './document';
import { GAP as CANVAS_GRID_SIZE } from './layout-constants';
import { type AppLocale } from '../i18n';
import dutchText from './sample-translations.json';
import wildlifeCameraComparisonSource from './wildlife-camera-comparison.json';

const snapExampleCoordinate = (value: number): number =>
  Math.round(value / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;

const at = (x: number, y: number): Position => ({
  x: snapExampleCoordinate(x),
  y: snapExampleCoordinate(y),
});

/**
 * `frameAround`, snapped to the canvas grid the same way every other example
 * frame is (`at`'s own snap) — its own top edge sits half a `GAP` above the
 * padding line for a title bar, which is not itself a grid multiple. The
 * right/bottom edge is left exactly where `frameAround` put it, since only a
 * frame's `position` needs grid alignment (`samples.test.ts`'s check), not
 * its `size`.
 */
function frameAround(
  id: string,
  title: string,
  nodes: readonly GraphNode[],
  padding?: number,
): ReturnType<typeof frameAroundExact> {
  const frame = frameAroundExact(id, title, nodes, padding);
  const x = snapExampleCoordinate(frame.position.x);
  const y = snapExampleCoordinate(frame.position.y);
  return {
    ...frame,
    position: { x, y },
    size: { width: frame.position.x + frame.size.width - x, height: frame.position.y + frame.size.height - y },
  };
}

function input(id: string, label: string, value: ValueSpec, position: Position): InputNode {
  return { kind: 'input', id, label, value, position };
}

function formulaNode(id: string, formula: Formula, position: Position): FormulaNode {
  return { kind: 'formula', id, formula: formulaRef(formula), position };
}

function output(id: string, label: string, spec: Output, position: Position): OutputNode {
  return { kind: 'output', id, label, output: spec, position };
}

function normalGenerator(
  id: string,
  label: string,
  mean: number,
  stddev: number,
  count: number,
  unit: Unit,
  position: Position,
): MonteCarloGeneratorNode {
  return { kind: 'monteCarloGenerator', id, label, distribution: 'normal', mean, stddev, count, unit, position };
}

/**
 * `min`/`max` here are only the fallback the node falls back to once its
 * wired `min`/`max` edge (`MIN_PORT`/`MAX_PORT`, `packages/schema/src/document.ts`)
 * is removed — a caller wiring both is free to pick any placeholder that
 * satisfies `min < max`.
 */
function uniformGenerator(
  id: string,
  label: string,
  min: number,
  max: number,
  count: number,
  unit: Unit,
  position: Position,
): MonteCarloGeneratorNode {
  return { kind: 'monteCarloGenerator', id, label, distribution: 'uniform', min, max, count, unit, position };
}

function receiver(id: string, label: string, sampleLimit: number, position: Position): MonteCarloReceiverNode {
  return { kind: 'monteCarloReceiver', id, label, sampleLimit, position };
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
  marks: GraphDocument['marks'] = undefined,
): GraphDocument {
  return { schemaVersion: DOCUMENT_SCHEMA_VERSION, id, title, nodes, edges, frames, ...(marks === undefined ? {} : { marks }) };
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

const PAD = ['base.math.multiply', 'base.math.divide'] as const;

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
  const multiply = lookup(catalogues, 'base.math.multiply');
  const divide = lookup(catalogues, 'base.math.divide');
  if (multiply === undefined || divide === undefined) return undefined;

  const mm = parseUnit('mm');
  const stress = parseUnit('Pa');

  const nodes: GraphNode[] = [
    { ...input('F', 'Pad load F', { kind: 'slider', value: 12, min: 5, max: 20, unit: parseUnit('kN') }, at(0, 0)), exposeInNotebook: true },
    { ...input('L', 'Pad length L', { kind: 'slider', value: 40, min: 20, max: 80, unit: mm }, at(0, 150)), exposeInNotebook: true },
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
      { kind: 'check', comparison: '<=', threshold: { value: 2_000_000, unit: stress } },
      at(1020, 170),
    ),
    output(
      'p_plot',
      'Pressure against pad width',
      { kind: 'plot', x: 'w', threshold: { value: 2_000_000, unit: stress }, unit: stress },
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
        'The authored case starts at a 12 kN load and 40 mm pad length. Use the controls below ' +
        'to test those assumptions while pad width remains the 10 to 60 mm sweep; ' +
        'the pressure limit is 2 MPa.',
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
  const multiply = lookup(catalogues, 'base.math.multiply');
  const divide = lookup(catalogues, 'base.math.divide');
  if (multiply === undefined || divide === undefined) return undefined;

  const mm = parseUnit('mm');
  const stress = parseUnit('Pa');
  const nodes: GraphNode[] = [
    { ...input('load', 'Equipment load', { kind: 'slider', value: 12, min: 5, max: 20, unit: parseUnit('kN') }, at(0, 0)), exposeInNotebook: true },
    { ...input('length', 'Platform length', { kind: 'slider', value: 1000, min: 500, max: 2000, unit: mm }, at(0, 150)), exposeInNotebook: true },
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
      { kind: 'check', comparison: '<=', threshold: { value: 20_000, unit: stress } },
      at(1020, 170),
    ),
    output(
      'decision_plot',
      'How width changes the floor pressure',
      { kind: 'plot', x: 'width', threshold: { value: 20_000, unit: stress }, unit: stress },
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
        'The authored case starts at a 12 kN equipment load and 1000 mm platform length. ' +
        'Use the controls below to see the value, check, and chart update together; ' +
        'the width sweep and agreed floor-load threshold remain fixed.',
      position: at(960, -80),
      size: { width: 430, height: 620 },
    },
  ];
  const withFrames = nodes.map((node) =>
    node.kind === 'output' ? { ...node, frameId: 'decision' } : node,
  );

  return localizeExample(document('platform-footprint', 'Choose a safe platform size', withFrames, edges, frames), locale);
}

// --- Monte Carlo: a clearance-fit stack-up (ROADMAP.md #13, #27, #31) -------

/**
 * The classic tolerance stack-up, on a real ISO 286 fit rather than two
 * hand-picked ± numbers. A nominal Ø20 mm hole/shaft pair, each toleranced by
 * a chosen letter and IT grade (H7 for the hole, g6 for the shaft — an easy
 * running clearance fit), is looked up twice per feature — its `lower` and
 * `upper` limit deviation — through `base.iso286.hole-deviation`/
 * `base.iso286.shaft-deviation` (`packages/nodes/src/iso286.ts`), added back onto
 * the nominal diameter, and wired straight into a *uniform* generator's
 * `min`/`max` ports (`MIN_PORT`/`MAX_PORT`, wireable-with-typed-default the
 * same way `CompareNode.threshold` is — `packages/kernel/src/graph.ts`'s
 * `monteCarloGenerator` branch). A uniform draw across the standard's hard
 * bounds is the honest read of what ISO 286 actually promises — a normal
 * draw would need a σ this graph has no standard to derive from a nominal
 * size and tolerance class alone.
 *
 * Their clearance is still the two draws subtracted trial by trial, not one
 * worst-case subtraction: two independent generators, `hole` and `shaft`,
 * feed a `subtract` node directly. Every Monte Carlo generator's axis shares
 * one trial identity (`packages/kernel/src/graph.ts`'s `Resolution.axes` doc
 * comment), so the two combine sample-for-sample rather than broadcasting
 * into their cross-product grid the way two ordinary independent sweeps
 * would (`series.ts`'s `unionAxes`) — a 1,000-sample pairing, not a
 * 1,000,000-cell grid.
 */
export function monteCarloClearance(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
  const subtract = lookup(catalogues, 'base.math.subtract');
  const add = lookup(catalogues, 'base.math.add');
  const holeDeviation = lookup(catalogues, 'base.iso286.hole-deviation');
  const shaftDeviation = lookup(catalogues, 'base.iso286.shaft-deviation');
  if (subtract === undefined || add === undefined || holeDeviation === undefined || shaftDeviation === undefined) {
    return undefined;
  }

  const mm = parseUnit('mm');
  const categorical = (value: string): ValueSpec => ({ kind: 'categorical', value });

  const fitNodes: GraphNode[] = [
    input('nominal_d', 'Nominal diameter', { kind: 'scalar', value: 20, unit: mm }, at(0, -260)),
    input('hole_letter', 'Hole tolerance position', categorical('H'), at(0, -180)),
    input('hole_grade', 'Hole IT grade', categorical('7'), at(0, -100)),
    input('shaft_letter', 'Shaft tolerance position', categorical('g'), at(0, 20)),
    input('shaft_grade', 'Shaft IT grade', categorical('6'), at(0, 100)),
    input('limit_lower', 'Lower limit', categorical('lower'), at(0, 220)),
    input('limit_upper', 'Upper limit', categorical('upper'), at(0, 300)),

    formulaNode('hole_lower', holeDeviation, at(340, -220)),
    formulaNode('hole_upper', holeDeviation, at(340, -100)),
    formulaNode('shaft_lower', shaftDeviation, at(340, 60)),
    formulaNode('shaft_upper', shaftDeviation, at(340, 180)),

    formulaNode('hole_min', add, at(680, -220)),
    formulaNode('hole_max', add, at(680, -100)),
    formulaNode('shaft_min', add, at(680, 60)),
    formulaNode('shaft_max', add, at(680, 180)),
  ];

  const stackUpNodes: GraphNode[] = [
    uniformGenerator('hole', 'Hole diameter', 19.98, 20.04, 1000, mm, at(1020, -140)),
    uniformGenerator('shaft', 'Shaft diameter', 19.95, 20, 1000, mm, at(1020, 60)),

    formulaNode('clearance', subtract, at(1360, -40)),

    output('out_clearance', 'Clearance', { kind: 'print', unit: mm, figures: 4 }, at(1700, -140)),
    output(
      'out_positive',
      'Clearance stays positive (no interference)',
      { kind: 'check', comparison: '>=', threshold: { value: 0, unit: mm } },
      at(1700, 40),
    ),
  ];

  const distributionNodes: GraphNode[] = [receiver('watch', 'Clearance distribution', 1000, at(1700, 220))];

  const nodes: GraphNode[] = [...fitNodes, ...stackUpNodes, ...distributionNodes];

  const edges = [
    ...(['hole_lower', 'hole_upper'] as const).map((id) => wire('nominal_d.value', `${id}.diameter`)),
    ...(['shaft_lower', 'shaft_upper'] as const).map((id) => wire('nominal_d.value', `${id}.diameter`)),
    wire('hole_letter.value', 'hole_lower.letter'),
    wire('hole_grade.value', 'hole_lower.grade'),
    wire('limit_lower.value', 'hole_lower.limit'),
    wire('hole_letter.value', 'hole_upper.letter'),
    wire('hole_grade.value', 'hole_upper.grade'),
    wire('limit_upper.value', 'hole_upper.limit'),
    wire('shaft_letter.value', 'shaft_lower.letter'),
    wire('shaft_grade.value', 'shaft_lower.grade'),
    wire('limit_lower.value', 'shaft_lower.limit'),
    wire('shaft_letter.value', 'shaft_upper.letter'),
    wire('shaft_grade.value', 'shaft_upper.grade'),
    wire('limit_upper.value', 'shaft_upper.limit'),

    wire('nominal_d.value', 'hole_min.a'),
    wire('hole_lower.deviation', 'hole_min.b'),
    wire('nominal_d.value', 'hole_max.a'),
    wire('hole_upper.deviation', 'hole_max.b'),
    wire('nominal_d.value', 'shaft_min.a'),
    wire('shaft_lower.deviation', 'shaft_min.b'),
    wire('nominal_d.value', 'shaft_max.a'),
    wire('shaft_upper.deviation', 'shaft_max.b'),

    wire('hole_min.sum', 'hole.min'),
    wire('hole_max.sum', 'hole.max'),
    wire('shaft_min.sum', 'shaft.min'),
    wire('shaft_max.sum', 'shaft.max'),

    wire('hole.value', 'clearance.a'),
    wire('shaft.value', 'clearance.b'),
    wire('clearance.difference', 'out_clearance.value'),
    wire('clearance.difference', 'out_positive.value'),
    wire('clearance.difference', 'watch.sample'),
  ];

  // Three sections: picking the fit, the stack-up's numbers, and —
  // separately — the receiver that watches them accumulate. Different
  // content, different note, so a student can read "which fit is this",
  // "what the calculation says" and "what playback shows" as three distinct
  // claims rather than one frame doing all three jobs.
  const frames = [
    {
      ...frameAround('fit', 'Pick an ISO fit', fitNodes),
      note:
        'A Ø20 mm hole and shaft, each toleranced by an ISO 286 letter and IT grade — H7 for the hole, g6 for the shaft, an easy running clearance fit. Looking up each feature’s lower and upper limit deviation and adding it back onto the nominal diameter gives the hard bounds the two generators on the right draw uniformly across — change a letter or grade here and both redraw from the standard, not from a hand-typed ± number.',
    },
    {
      ...frameAround('stack-up', 'Clearance-fit stack-up', stackUpNodes),
      note:
        'The hole and shaft each vary from part to part within their ISO-fit bounds. Their clearance is the two draws subtracted trial by trial, not one worst-case subtraction — the value and interference check both read that same difference.',
    },
    {
      ...frameAround('distribution', 'Watch it converge', distributionNodes),
      note:
        'Press play and watch the samples accumulate and the mean converge — a single worst-case subtraction would miss how rarely the extremes actually coincide.',
    },
  ];

  const withFrames = nodes.map((node) => {
    if (fitNodes.some((candidate) => candidate.id === node.id)) return { ...node, frameId: 'fit' };
    if (stackUpNodes.some((candidate) => candidate.id === node.id)) return { ...node, frameId: 'stack-up' };
    return { ...node, frameId: 'distribution' };
  });

  return localizeExample(
    document('monte-carlo-clearance', 'Clearance-fit stack-up', withFrames, edges, frames),
    locale,
  );
}

// --- reliability: load against strength --------------------------------------

/** A complete public reliability report built only from the base catalogue. */
export function reliabilityLoadStrength(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
  const subtract = lookup(catalogues, 'base.math.subtract');
  if (subtract === undefined) return undefined;
  const stress = parseUnit('N/mm²');
  const count = 2_000;
  const nodes: GraphNode[] = [
    { kind: 'monteCarloGenerator', id: 'load', label: 'Applied stress', distribution: 'lognormal', mean: 180, stddev: 25, count, unit: stress, position: at(0, 0) },
    { kind: 'monteCarloGenerator', id: 'strength', label: 'Material strength', distribution: 'lognormal', mean: 260, stddev: 30, count, unit: stress, position: at(0, 220) },
    formulaNode('margin', subtract, at(360, 100)),
    { kind: 'compare', id: 'margin_verdict', label: 'Margin verdict', comparison: '>=', threshold: { value: 0, unit: stress }, position: at(700, 0) },
    { kind: 'statistic', id: 'running_pf', label: 'Running failure probability', statistic: 'probability', match: 'fail', running: true, position: at(700, 220) },
    output('margin_check', 'Strength exceeds load', { kind: 'check', comparison: '>=', threshold: { value: 0, unit: stress } }, at(1040, 0)),
    output('margin_distribution', 'Strength margin distribution', { kind: 'distribution', view: 'histogram', percentiles: [5, 50, 95], fit: true }, at(1040, 180)),
    output('reliability', 'Reliability report', { kind: 'reliability', checks: ['margin_check'], confidence: 0.95 }, at(1040, 360)),
    output('convergence', 'Failure probability convergence', { kind: 'plot', x: 'load' }, at(1040, 540)),
  ];
  const edges = [
    wire('strength.value', 'margin.a'),
    wire('load.value', 'margin.b'),
    wire('margin.difference', 'margin_verdict.value'),
    wire('margin_verdict.verdict', 'running_pf.value'),
    wire('load.value', 'running_pf.along'),
    wire('margin.difference', 'margin_check.value'),
    wire('margin.difference', 'margin_distribution.value'),
    wire('running_pf.result', 'convergence.value'),
  ];
  const reportOutputs = nodes.filter((node): node is OutputNode => node.kind === 'output');
  const frame = {
    ...frameAround('report', 'Load against strength', reportOutputs, 50),
    note: 'The histogram shows the margin distribution; Pf, its interval and beta state the reliability, and the running estimate shows whether the sample count was enough.',
  };
  const withFrame = nodes.map((node) => node.kind === 'output' ? { ...node, frameId: 'report' } : node);
  return localizeExample(document('reliability-load-strength', 'Load against strength — reliability', withFrame, edges, [frame]), locale);
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
  'base.math.multiply',
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

    formulaNode('Pprime', formula('base.math.multiply'), at(380, 0)),
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

// --- cylindrical press fit, from PressFit1_TD.ipynb -------------------------

/** The restricted records used by the first press-fit notebook. */
export const PRESSFIT_LAB_FORMULAS = [
  'rm.12.5.helper-a', 'rm.12.5.helper-b', 'rm.12.8.helper-a', 'rm.12.8',
  'rm.12.9', 'rm.12.9.helper-a', 'rm.12.12', 'rm.12.13', 'rm.12.14',
  'rm.12.15', 'rm.12.16A', 'rm.12.16B.hollow', 'rm.12.17', 'rm.12.18',
  'rm.12.19', 'rm.12.20.helper-a',
] as const;

/**
 * The worked cylindrical press-fit calculation from `PressFit1_TD.ipynb`.
 * Inputs use the stated dimensions and material data; the result is a fit and
 * tolerance window, not a formula embedded in this public editor package.
 */
export function pressfitLab(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
  if (!provides(catalogues, PRESSFIT_LAB_FORMULAS)) return undefined;
  const formula = (id: string): Formula => lookup(catalogues, id) as Formula;
  const stress = parseUnit('N/mm²');
  const um = parseUnit('µm');

  const values: readonly (readonly [string, string, number, string])[] = [
    ['D_Ii', 'Hub bore D_Ii', 60, 'mm'], ['D_F', 'Fit diameter D_F', 100, 'mm'],
    ['D_Uu', 'Hub outside diameter D_Uu', 160, 'mm'], ['l_F', 'Fit length l_F', 50, 'mm'],
    ['F_t', 'Tangential load F_t', 0, 'N'], ['F_l', 'Longitudinal load F_l', 5000, 'N'],
    ['K_A', 'Load factor K_A', 2, ''], ['S_S', 'Slip safety S_S', 1.75, ''],
    ['mu', 'Friction coefficient μ', 0.07, ''], ['E_U', "Hub Young's modulus E_U", 210000, 'N/mm²'],
    ['E_I', "Shaft Young's modulus E_I", 210000, 'N/mm²'], ['nu_U', "Hub Poisson ratio ν_U", 0.3, ''],
    ['nu_I', "Shaft Poisson ratio ν_I", 0.3, ''], ['Rz_UI', 'Hub roughness Rz_UI', 6.3, 'µm'],
    ['Rz_Iu', 'Shaft roughness Rz_Iu', 4, 'µm'], ['R_eU', 'Hub yield strength R_eU', 220.9, 'N/mm²'],
    ['R_eI', 'Shaft yield strength R_eI', 328.3, 'N/mm²'], ['S_pU', 'Hub plastic safety S_pU', 1.15, ''],
    ['S_pI', 'Shaft plastic safety S_pI', 1.15, ''],
  ];

  const nodes: GraphNode[] = [
    ...values.map(([id, label, value, unit], index) => input(id, label, { kind: 'scalar', value, unit: parseUnit(unit) }, at(0, index * 82))),
    formulaNode('F_res', formula('rm.12.8.helper-a'), at(310, 360)),
    formulaNode('F_S', formula('rm.12.8'), at(570, 360)),
    formulaNode('A_F', formula('rm.12.9.helper-a'), at(310, 80)),
    formulaNode('p_Fmin', formula('rm.12.9'), at(830, 250)),
    formulaNode('Q_U', formula('rm.12.5.helper-a'), at(310, 680)),
    formulaNode('Q_I', formula('rm.12.5.helper-b'), at(310, 820)),
    formulaNode('K', formula('rm.12.12'), at(570, 760)),
    formulaNode('Z_min', formula('rm.12.13'), at(1090, 250)),
    formulaNode('G', formula('rm.12.14'), at(570, 1050)),
    formulaNode('S_nmin', formula('rm.12.15'), at(1350, 250)),
    formulaNode('p_FmaxU', formula('rm.12.16A'), at(830, 620)),
    formulaNode('p_FmaxI', formula('rm.12.16B.hollow'), at(830, 780)),
    formulaNode('Z_max', formula('rm.12.17'), at(1090, 620)),
    formulaNode('S_nmax', formula('rm.12.18'), at(1350, 620)),
    formulaNode('P_T', formula('rm.12.19'), at(1610, 440)),
    formulaNode('T_B', formula('rm.12.20.helper-a'), at(1870, 440)),
    output('out_F_S', 'Resulting design force F_S', { kind: 'print', unit: parseUnit('N') }, at(1610, 80)),
    output('out_p_Fmin', 'Minimum contact pressure p_Fmin', { kind: 'print', unit: stress }, at(1610, 180)),
    output('out_S_nmin', 'Minimum interference S_nmin', { kind: 'print', unit: um }, at(2130, 80)),
    output('out_p_FmaxU', 'Maximum hub pressure p_Fmax', { kind: 'print', unit: stress }, at(1610, 620)),
    output('out_S_nmax', 'Maximum interference S_nmax', { kind: 'print', unit: um }, at(2130, 620)),
    output('out_P_T', 'Permissible fit tolerance P_T', { kind: 'print', unit: um }, at(2130, 440)),
    output('out_T_B', 'Hub tolerance share T_B', { kind: 'print', unit: um }, at(2130, 540)),
  ];

  const wires: readonly (readonly [string, string])[] = [
    ['F_t.value', 'F_res.F_t'], ['F_l.value', 'F_res.F_l'], ['S_S.value', 'F_S.S_S'], ['K_A.value', 'F_S.K_A'], ['F_res.F_res', 'F_S.F_res'],
    ['D_F.value', 'A_F.D_F'], ['l_F.value', 'A_F.l_F'], ['F_S.F_S', 'p_Fmin.F_S'], ['A_F.A_F', 'p_Fmin.A_F'], ['mu.value', 'p_Fmin.mu'],
    ['D_F.value', 'Q_U.D_F'], ['D_Uu.value', 'Q_U.D_Uu'], ['D_Ii.value', 'Q_I.D_Ii'], ['D_F.value', 'Q_I.D_F'],
    ['E_U.value', 'K.E_U'], ['E_I.value', 'K.E_I'], ['Q_I.Q_I', 'K.Q_I'], ['nu_I.value', 'K.nu_I'], ['Q_U.Q_U', 'K.Q_U'], ['nu_U.value', 'K.nu_U'],
    ['p_Fmin.p_Fmin', 'Z_min.p_Fmin'], ['D_F.value', 'Z_min.D_F'], ['E_U.value', 'Z_min.E_U'], ['K.K', 'Z_min.K'],
    ['Rz_UI.value', 'G.Rz_UI'], ['Rz_Iu.value', 'G.Rz_Iu'], ['Z_min.Z_min', 'S_nmin.Z_min'], ['G.G', 'S_nmin.G'],
    ['R_eU.value', 'p_FmaxU.R_eU'], ['S_pU.value', 'p_FmaxU.S_pU'], ['Q_U.Q_U', 'p_FmaxU.Q_U'],
    ['R_eI.value', 'p_FmaxI.R_eI'], ['S_pI.value', 'p_FmaxI.S_pI'], ['Q_I.Q_I', 'p_FmaxI.Q_I'],
    ['p_FmaxU.p_Fmax', 'Z_max.p_Fmax'], ['D_F.value', 'Z_max.D_F'], ['E_U.value', 'Z_max.E_U'], ['K.K', 'Z_max.K'],
    ['Z_max.Z_max', 'S_nmax.Z_max'], ['G.G', 'S_nmax.G'], ['S_nmax.S_nmax', 'P_T.S_nmax'], ['S_nmin.S_nmin', 'P_T.S_nmin'], ['P_T.P_T', 'T_B.P_T'],
    ['F_S.F_S', 'out_F_S.value'], ['p_Fmin.p_Fmin', 'out_p_Fmin.value'], ['S_nmin.S_nmin', 'out_S_nmin.value'], ['p_FmaxU.p_Fmax', 'out_p_FmaxU.value'], ['S_nmax.S_nmax', 'out_S_nmax.value'], ['P_T.P_T', 'out_P_T.value'], ['T_B.T_B', 'out_T_B.value'],
  ];
  const edges = wires.map(([from, to]) => wire(from, to));
  const frames = [{ id: 'pressfit-results', title: 'Cylindrical press-fit results', note: 'The PressFit1 lab derives the required interference and permissible tolerance window for a 100 mm fit. The source omits F_res’s tag; R&M sign-off declares it a force in N.', position: at(1560, -60), size: { width: 860, height: 800 } }];
  const withFrames = nodes.map((node) => node.kind === 'output' ? { ...node, frameId: 'pressfit-results' } : node);
  return localizeExample(document('pressfit-lab', 'Cylindrical press-fit lab', withFrames, edges, frames), locale);
}

// --- cantilever deflection across hollow sections, from the public catalogue -

/** The catalogue records this sample needs, by id. */
export const CANTILEVER_FORMULAS = [
  'base.math.multiply',
  'base.math.subtract',
  'mechanics.beam.moment-of-inertia-hollow-circle',
  'mechanics.beam.cantilever-deflection',
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
    // Swept, not a slider: the second axis is what gives the trade-off a real
    // front rather than a single monotonic curve. The tip load below keeps the
    // notebook control, and is the better one to drag anyway — it moves the
    // whole front instead of walking along it.
    { ...input('t', 'Wall thickness t', { kind: 'list', values: [2, 3, 4, 5], unit: mm }, at(0, 180)), axisLabel: 't' },
    input('two', '2 (wall thickness on both sides)', { kind: 'scalar', value: 2, unit: parseUnit('') }, at(0, 320)),

    formulaNode('twice_t', formula('base.math.multiply'), at(280, 180)),
    formulaNode('d_i', formula('base.math.subtract'), at(520, 90)),
    formulaNode('I', formula('mechanics.beam.moment-of-inertia-hollow-circle'), at(760, 0)),

    // Cross-section area stands in for mass: one material, one length, so the
    // section that uses less metal is the lighter beam. There is no
    // hollow-circle area formula in the public catalogue, so it is composed
    // from base nodes — π/4 · (d_o² − d_i²) — which is what base nodes are for.
    input('quarter_pi', 'π/4', { kind: 'scalar', value: Math.PI / 4, unit: parseUnit('') }, at(280, 1180)),
    formulaNode('do_sq', formula('base.math.multiply'), at(520, 900)),
    formulaNode('di_sq', formula('base.math.multiply'), at(520, 1040)),
    formulaNode('sq_diff', formula('base.math.subtract'), at(760, 960)),
    formulaNode('area', formula('base.math.multiply'), at(1000, 1040)),

    { ...input('F', 'Tip load F', { kind: 'slider', value: 500, min: 100, max: 1000, unit: parseUnit('N') }, at(0, 460)), exposeInNotebook: true },
    input('L', 'Beam length L', { kind: 'scalar', value: 1000, unit: mm }, at(0, 600)),
    input('E', "Young's modulus E (steel)", { kind: 'scalar', value: 210000, unit: parseUnit('MPa') }, at(0, 740)),
    formulaNode('delta', formula('mechanics.beam.cantilever-deflection'), at(1000, 360)),

    output('out_table', 'Section results', { kind: 'table', columns: ['d_o', 't', 'A', 'delta'] }, at(1240, 0)),
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
    output(
      'out_pareto',
      'Material against deflection',
      { kind: 'pareto', xDirection: 'minimize', yDirection: 'minimize', checks: ['out_check'] },
      at(1240, 600),
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

    wire('d_o.value', 'do_sq.a'),
    wire('d_o.value', 'do_sq.b'),
    wire('d_i.difference', 'di_sq.a'),
    wire('d_i.difference', 'di_sq.b'),
    wire('do_sq.product', 'sq_diff.a'),
    wire('di_sq.product', 'sq_diff.b'),
    wire('sq_diff.difference', 'area.a'),
    wire('quarter_pi.value', 'area.b'),

    wire('area.product', 'out_pareto.x'),
    wire('delta.delta', 'out_pareto.y'),

    wire('d_o.value', 'out_table.d_o'),
    wire('t.value', 'out_table.t'),
    wire('area.product', 'out_table.A'),
    wire('delta.delta', 'out_table.delta'),
    wire('delta.delta', 'out_plot.value'),
    wire('delta.delta', 'out_check.value'),
  ];

  const frames = [
    {
      id: 'sections',
      title: 'Cantilever beam — hollow circular sections',
      note:
        'Tip deflection of a steel cantilever over five outer diameters and four wall ' +
        'thicknesses. Cross-section area stands in for mass: one material, one length, so the ' +
        'section that uses less metal is the lighter beam. Only six of the twenty sections ' +
        'meet the L/300 = 3.33 mm serviceability limit at the authored 500 N tip load; the ' +
        'rest are drawn hollow on the front and never compete. Of the six, four are worth ' +
        'arguing about and two are simply beaten — an 80 mm tube with a 2 mm wall (candidate ' +
        'A) is both lighter and stiffer than a 60 mm tube with a 4 mm wall, which is the ' +
        'reason bicycles and aircraft are built from large thin tubes rather than small ' +
        'thick ones. Along the front itself there is no such free lunch: past candidate A ' +
        'every millimetre of deflection costs metal. Drag the tip load to test that ' +
        'assumption — the front moves with it, and the marked candidate can stop passing. ' +
        'Beam length stays fixed at 1000 mm, so the displayed limit remains consistent.',
      position: at(1180, -80),
      size: { width: 420, height: 980 },
    },
  ];

  const withFrames = nodes.map((node) =>
    node.kind === 'output' ? { ...node, frameId: 'sections' } : node,
  );

  // The lightest section that still meets the limit, and the corner of the front
  // where the trade-off starts to cost something. Canonical mm.
  const marks = [{ at: { d_o: 80, t: 2 } }];

  return localizeExample(
    document('cantilever-hollow-sections', 'Cantilever — hollow sections', withFrames, edges, frames, marks),
    locale,
  );
}

// --- milling parameter study, from the public machining catalogue ----------

/** The catalogue records this sample needs, by id. */
export const MILLING_STUDY_FORMULAS = [
  'machining.material.properties',
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
    { ...input('a_p', 'Axial depth a_p', { kind: 'slider', value: 4, min: 1, max: 8, unit: mm }, at(0, 860)), exposeInNotebook: true },
    formulaNode('removal_rate', formula('machining.milling.removal-rate'), at(700, 560)),

    formulaNode('material', formula('machining.material.properties'), at(360, 780)),
    formulaNode('cutting_power', formula('machining.power.from-removal-rate'), at(980, 560)),
    { ...input('eta', 'Machine efficiency eta', { kind: 'slider', value: 0.85, min: 0.6, max: 0.95, unit: parseUnit('') }, at(700, 820)), exposeInNotebook: true },
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
      'out_feasible',
      'Within both spindle limits at once',
      { kind: 'feasibility', checks: ['out_P_check', 'out_M_check'], x: 'f_z', series: 'a_e' },
      at(1680, 1500),
    ),
    output(
      'out_table',
      'Candidate cutting parameters',
      {
        kind: 'table',
        columns: ['f_z', 'a_e', 'v_f', 'Q', 'P_m', 'M_c', 't_c'],
        figures: { f_z: 2, a_e: 2, v_f: 2, Q: 2, P_m: 2, M_c: 2, t_c: 2 },
      },
      at(1680, 1820),
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

    wire('material.k_c', 'cutting_power.k_c'),
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
        'Chip load and radial engagement are swept together. Axial depth starts at 4 mm and ' +
        'can be changed with the controls below; the contour shows how productivity moves across the grid.',
      position: at(1620, 240),
      size: { width: 440, height: 360 },
    },
    {
      id: 'constraints',
      title: '3. Spindle constraints',
      note:
        'The 5.5 kW input-power and 35 Nm cutting-torque limits cut different boundaries ' +
        'through the grid. A failed overall check means some candidates fail, not that every ' +
        'candidate does; use the contours to find the feasible region — or read it directly off ' +
        'the shaded feasibility below, which is both limits at once. Axial depth and machine ' +
        'efficiency start at their authored values and can be varied with the controls below.',
      position: at(1620, 620),
      size: { width: 440, height: 980 },
    },
    {
      id: 'selection',
      title: '4. Candidate operating point',
      note:
        'At the authored input values, candidate A is marked at f_z = 0.24 mm/tooth and ' +
        'a_e = 30 mm, giving Q = 132 cm³/min: the most productive point in this discrete ' +
        'grid that clears both limits. It carries the same letter on every figure above, so ' +
        'the row below and the shaded map are talking about the same cut. Note there is no ' +
        'trade-off to weigh here — removal rate, power and torque all rise together with ' +
        'f_z·a_e, so the only thing holding productivity back is the spindle limits. This is ' +
        'an initial power-envelope result with constant k_c—not a production recommendation. ' +
        'Tool deflection, chatter, chip thinning, workholding, and manufacturer limits ' +
        'remain to check.',
      position: at(1620, 1640),
      size: { width: 440, height: 600 },
    },
  ];

  const frameForOutput: Readonly<Record<string, string>> = {
    out_n: 'tool-speed',
    out_Q_plot: 'productivity',
    out_P_plot: 'constraints',
    out_P_check: 'constraints',
    out_M_plot: 'constraints',
    out_M_check: 'constraints',
    out_feasible: 'constraints',
    out_table: 'selection',
  };
  const withFrames = nodes.map((node) => {
    const frameId = frameForOutput[node.id];
    return node.kind === 'output' && frameId !== undefined ? { ...node, frameId } : node;
  });

  // The operating point the notebook argues for, marked so it is identified on
  // the Pareto chart, both contour plots, the feasibility map and the table row
  // at once — canonical mm, which is what the axis coordinates are in.
  const marks = [{ at: { f_z: 0.24, a_e: 30 } }];

  return localizeExample(
    document('milling-power-envelope', 'Pocket milling — power envelope', withFrames, edges, frames, marks),
    locale,
  );
}

// --- depth of field, from the public Photography catalogue ------------------

export const DEPTH_OF_FIELD_FORMULAS = [
  'photography.dof.circle-of-confusion',
  'photography.dof.hyperfocal-distance',
  'photography.dof.limits',
] as const;

/**
 * How much of the scene stays acceptably sharp, swept over focal length and
 * aperture — not one number for one setting, but the grid a kit bag
 * represents.
 *
 * The subject stays fixed at 1.5 m throughout, and the aperture list stops at
 * f/11: both keep the hyperfocal distance comfortably above the subject
 * distance for every cell (the far limit and the total only hold while
 * `s < H`), so every point in the grid is a valid reading rather than an
 * out-of-domain one.
 */
export function depthOfField(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
  if (!provides(catalogues, DEPTH_OF_FIELD_FORMULAS)) return undefined;
  const formula = (id: string): Formula => lookup(catalogues, id) as Formula;

  const mm = parseUnit('mm');
  const m = parseUnit('m');

  const nodes: GraphNode[] = [
    input('d', 'Sensor diagonal d', { kind: 'scalar', value: 43.27, unit: mm }, at(-165, 495)),
    formulaNode('coc', formula('photography.dof.circle-of-confusion'), at(165, 660)),
    input('s', 'Subject distance s', { kind: 'scalar', value: 1.5, unit: m }, at(-165, 220)),

    {
      ...input('f', 'Focal length f', { kind: 'linear', start: 24, stop: 105, points: 5, unit: mm }, at(-165, 330)),
      axisLabel: 'focal length f (mm)',
    },
    {
      ...input('N', 'Aperture N', { kind: 'list', values: [2.8, 4, 5.6, 8, 11], unit: parseUnit('') }, at(-165, 0)),
      axisLabel: 'aperture N (f-stop)',
    },
    formulaNode('hyperfocal', formula('photography.dof.hyperfocal-distance'), at(495, 605)),
    formulaNode('dof', formula('photography.dof.limits'), at(880, 385)),

    output(
      'out_table',
      'Depth of field by lens and aperture',
      { kind: 'table', columns: ['f', 'N', 'DoF'], figures: { f: 0, N: 1, DoF: 2 } },
      at(1595, -55),
    ),

    output(
      'out_dof_plot',
      'Depth of field across the grid',
      { kind: 'plot', x: 'N', series: 'f', contour: true, unit: m },
      at(1595, 275),
    ),
    output(
      'out_dof_check',
      'At least 0.5 m of depth of field',
      { kind: 'check', comparison: '>=', threshold: { value: 0.5, unit: m } },
      at(1595, 495),
    ),
    output(
      'out_feasible',
      'Usable depth of field across the grid',
      { kind: 'feasibility', checks: ['out_dof_check'], x: 'N', series: 'f' },
      at(1595, 715),
    ),

    output('out_sensitivity', 'What moves depth of field most', { kind: 'sensitivity' }, at(1595, 990)),
  ];

  const edges = [
    wire('d.value', 'coc.d'),

    wire('f.value', 'hyperfocal.f'),
    wire('N.value', 'hyperfocal.N'),
    wire('coc.c', 'hyperfocal.c'),

    wire('hyperfocal.H', 'dof.H'),
    wire('s.value', 'dof.s'),
    wire('f.value', 'dof.f'),

    wire('f.value', 'out_table.f'),
    wire('N.value', 'out_table.N'),
    wire('dof.DoF', 'out_table.DoF'),

    wire('dof.DoF', 'out_dof_plot.value'),
    wire('dof.DoF', 'out_dof_check.value'),
    wire('dof.DoF', 'out_sensitivity.value'),
  ];

  const frames = [
    {
      id: 'sweep',
      title: '1. Aperture × focal length grid',
      note:
        'Focal length sweeps linearly from 24 to 105 mm across five points, crossed with five ' +
        'full-stop apertures, producing a 5×5 grid of hyperfocal distances and depths of field.',
      position: at(1540, -110),
      size: { width: 330, height: 275 },
    },
    {
      id: 'depth-of-field',
      title: '2. Depth of field across the grid',
      note:
        'Wide focal lengths hold well over half a metre of depth of field even wide open; the ' +
        '105 mm end never reaches it in this grid, wide open or stopped down to f/11. 0.5 m marks ' +
        'a usable margin for this subject distance, not a universal minimum.',
      position: at(1540, 220),
      size: { width: 330, height: 660 },
    },
    {
      id: 'sensitivity',
      title: '3. What drives depth of field',
      note:
        'The tornado ranks focal length and aperture by how much each moves total depth of ' +
        'field on its own — useful for deciding which dial to reach for first.',
      position: at(1540, 935),
      size: { width: 330, height: 220 },
    },
  ];

  const frameForOutput: Readonly<Record<string, string>> = {
    out_table: 'sweep',
    out_dof_plot: 'depth-of-field',
    out_dof_check: 'depth-of-field',
    out_feasible: 'depth-of-field',
    out_sensitivity: 'sensitivity',
  };
  const withFrames = nodes.map((node) => {
    const frameId = frameForOutput[node.id];
    return node.kind === 'output' && frameId !== undefined ? { ...node, frameId } : node;
  });

  return localizeExample(document('depth-of-field', 'Depth of field — aperture and focal length', withFrames, edges, frames), locale);
}

// --- choose an aperture, from the public Photography catalogue --------------

export const APERTURE_DECISION_FORMULAS = [
  'photography.camera.properties',
  'photography.dof.circle-of-confusion-pixels',
  'photography.dof.hyperfocal-distance',
  'photography.dof.limits',
  'photography.diffraction.blur-diameter',
] as const;

/**
 * Pick a real f-stop that gives at least 300 mm of depth of field without
 * letting diffraction blur exceed a three-pixel circle of confusion.
 *
 * The Best Design output is the point of this example: it maximises depth of
 * field only among candidates that pass both checks, so it selects f/11 rather
 * than the unconstrained maximum at f/22.
 */
export function apertureDecision(catalogues: readonly Catalogue[], locale: AppLocale = 'en'): GraphDocument | undefined {
  if (!provides(catalogues, APERTURE_DECISION_FORMULAS)) return undefined;
  const formula = (id: string): Formula => lookup(catalogues, id) as Formula;

  const dimensionless = parseUnit('');
  const mm = parseUnit('mm');
  const micrometre = parseUnit('µm');

  const nodes: GraphNode[] = [
    input('f', 'Focal length', { kind: 'scalar', value: 50, unit: mm }, at(330, -55)),
    {
      ...input(
        'N',
        'Available apertures',
        { kind: 'list', values: [2.8, 4, 5.6, 8, 11, 16, 22], unit: dimensionless },
        at(330, 55),
      ),
      axisLabel: 'aperture (f-number)',
    },
    input('s', 'Focus distance', { kind: 'scalar', value: 2, unit: parseUnit('m') }, at(330, -165)),
    formulaNode('camera', formula('photography.camera.properties'), at(330, 330)),
    input(
      'blurPixels',
      'Acceptable blur circle',
      { kind: 'scalar', value: 3, unit: dimensionless },
      at(330, 770),
    ),

    formulaNode('coc', formula('photography.dof.circle-of-confusion-pixels'), at(715, 550)),
    formulaNode('hyperfocal', formula('photography.dof.hyperfocal-distance'), at(1155, 55)),
    formulaNode('diffraction', formula('photography.diffraction.blur-diameter'), at(1155, 330)),
    formulaNode('dof', formula('photography.dof.limits'), at(1540, -55)),

    {
      ...output('dofPlot', 'Depth of field by aperture', { kind: 'plot', x: 'N', unit: mm }, at(2145, 110)),
      caption: 'Stopping down increases the distance range that appears acceptably sharp.',
    },
    {
      ...output(
        'diffractionPlot',
        'Diffraction blur by aperture',
        { kind: 'plot', x: 'N', unit: micrometre },
        at(2145, 330),
      ),
      caption: 'The threshold is the camera-specific three-pixel blur circle; lower is sharper.',
    },
    {
      ...output(
        'enoughDepth',
        'At least 300 mm of depth of field',
        { kind: 'check', comparison: '>=', threshold: { value: 300, unit: mm } },
        at(2145, 715),
      ),
      caption: 'Reject apertures that leave less than 300 mm of the scene acceptably sharp.',
    },
    {
      ...output(
        'sharpEnough',
        'Diffraction stays within the blur limit',
        { kind: 'check', comparison: '<=', threshold: { value: 15, unit: micrometre } },
        at(2145, 935),
      ),
      caption: 'The limit is wired from the selected camera and the three-pixel criterion above.',
    },
    {
      ...output(
        'bestAperture',
        'Best aperture for maximum usable depth',
        { kind: 'bestDesign', checks: ['enoughDepth', 'sharpEnough'], direction: 'maximize' },
        at(2145, 1265),
      ),
      caption: 'Choose the greatest depth of field among the f-stops that pass both checks.',
    },
  ];

  const edges = [
    wire('camera.p', 'coc.p'),
    wire('blurPixels.value', 'coc.n'),

    wire('f.value', 'hyperfocal.f'),
    wire('N.value', 'hyperfocal.N'),
    wire('coc.c', 'hyperfocal.c'),

    wire('hyperfocal.H', 'dof.H'),
    wire('f.value', 'dof.f'),
    wire('s.value', 'dof.s'),

    wire('N.value', 'diffraction.N'),

    wire('dof.DoF', 'dofPlot.value'),
    wire('diffraction.b', 'diffractionPlot.value'),
    wire('coc.c', 'diffractionPlot.threshold'),

    wire('dof.DoF', 'enoughDepth.value'),
    wire('diffraction.b', 'sharpEnough.value'),
    wire('coc.c', 'sharpEnough.threshold'),
    wire('dof.DoF', 'bestAperture.objective'),
  ];

  const frames = [
    {
      id: 'tradeoff',
      title: '1. The aperture trade-off',
      note:
        'For a 50 mm lens focused at 2 m, stopping down increases depth of field but also ' +
        'increases diffraction blur. The blur threshold comes from three pixels on the selected ' +
        'camera, so it follows the camera choice instead of being copied by hand.',
      position: at(2090, 55),
      size: { width: 330, height: 550 },
    },
    {
      id: 'requirements',
      title: '2. Which f-stops are usable?',
      note:
        'A candidate must provide at least 300 mm of depth of field and keep diffraction blur ' +
        'within the three-pixel limit. Only f/8 and f/11 satisfy both requirements.',
      position: at(2090, 660),
      size: { width: 330, height: 495 },
    },
    {
      id: 'decision',
      title: '3. Choose the best feasible aperture',
      note:
        'Best Design maximises depth of field only among candidates that pass both checks. It ' +
        'selects f/11: f/16 and f/22 give more depth, but their diffraction blur is too large.',
      position: at(2090, 1210),
      size: { width: 330, height: 275 },
    },
  ];

  const frameForOutput: Readonly<Record<string, string>> = {
    dofPlot: 'tradeoff',
    diffractionPlot: 'tradeoff',
    enoughDepth: 'requirements',
    sharpEnough: 'requirements',
    bestAperture: 'decision',
  };
  const withFrames = nodes.map((node) => {
    const frameId = frameForOutput[node.id];
    return node.kind === 'output' && frameId !== undefined ? { ...node, frameId } : node;
  });

  return localizeExample(
    document('aperture-decision', 'Choose an aperture — depth versus diffraction', withFrames, edges, frames),
    locale,
  );
}

// --- compare wildlife camera systems, from the public Photography catalogue -

export const WILDLIFE_CAMERA_COMPARISON_FORMULAS = [
  'photography.camera.properties',
  'photography.lens.properties',
  'photography.format.equivalent-focal-length',
  'photography.format.equivalent-aperture',
  'photography.format.crop-factor',
  'photography.dof.limits',
  'photography.dof.hyperfocal-distance',
  'photography.dof.circle-of-confusion-pixels',
  'photography.diffraction.blur-diameter',
  'photography.lens.magnification-from-focal',
] as const;

/**
 * Compare a full-frame wildlife setup with an APS-C alternative over each
 * lens's focal-length and aperture ranges. The imported NodeBook is the
 * authored example; formula references are refreshed from the catalogue at
 * open time so a bundled catalogue update cannot leave its hashes stale.
 */
export function wildlifeCameraComparison(
  catalogues: readonly Catalogue[],
  locale: AppLocale = 'en',
): GraphDocument | undefined {
  if (!provides(catalogues, WILDLIFE_CAMERA_COMPARISON_FORMULAS)) return undefined;

  const source = loadDocument(JSON.stringify(wildlifeCameraComparisonSource));
  const nodes = source.nodes.map((node) => {
    if (node.kind !== 'formula') return node;
    const current = lookup(catalogues, node.formula.id);
    return current === undefined ? node : { ...node, formula: formulaRef(current) };
  });

  return localizeExample({ ...source, nodes }, locale);
}
