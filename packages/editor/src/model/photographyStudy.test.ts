/**
 * Selection nodes and the Best Design card over a real, shipping catalogue.
 *
 * The kernel's own tests (`packages/kernel/src/select.test.ts`,
 * `evaluate.test.ts`) use invented arithmetic, which is right for testing
 * index bookkeeping and interpolation. This one is the other half: an actual
 * design study, built from the public **Photography** catalogue that ships
 * bundled with the editor, wired the way a student would wire it.
 *
 * The question is the one every photographer settles at the camera:
 *
 * > Stopping down buys depth of field and costs sharpness to diffraction.
 * > Which f-stop actually wins?
 *
 * Both effects are real formulas in the catalogue, pulling in opposite
 * directions, over an aperture axis whose values are the stops a lens can
 * physically be set to. That makes it the honest test of all four selection
 * modes plus the decision card — and it is what the docs example
 * (`docs/examples/choosing-an-aperture.md`) walks through, so the numbers
 * asserted here are the numbers documented there.
 *
 * Photography is also simply where this editor's public content is finished:
 * the shaft/beam nodes are still ROADMAP item 48.
 */

import { describe, expect, it } from 'vitest';

import { evaluateDocument, type BestDesignResult, type NumericSeries } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';
import { DOCUMENT_SCHEMA_VERSION, formulaRef, type Catalogue, type GraphDocument } from '@joveworks/schema';

import { lookup } from './analysis';
import { baseCatalogue, bundledCatalogues } from './catalogues';

const CATALOGUES: readonly Catalogue[] = [baseCatalogue(), ...bundledCatalogues()];

const formulaNode = (id: string, formulaId: string) => ({
  kind: 'formula' as const,
  id,
  position: { x: 0, y: 0 },
  formula: formulaRef(lookup(CATALOGUES, formulaId) as never),
});

const scalar = (id: string, value: number, unit: string) => ({
  kind: 'input' as const,
  id,
  position: { x: 0, y: 0 },
  label: id,
  value: { kind: 'scalar' as const, value, unit: parseUnit(unit) },
});

const category = (id: string, value: string) => ({
  kind: 'input' as const,
  id,
  position: { x: 0, y: 0 },
  label: id,
  value: { kind: 'categorical' as const, value },
});

/** The f-stops a lens can actually be set to — an explicit list, not a smooth range. */
const stops = (id: string, values: readonly number[]) => ({
  kind: 'input' as const,
  id,
  position: { x: 0, y: 0 },
  label: id,
  axisLabel: 'f-number',
  value: { kind: 'list' as const, values: [...values], unit: parseUnit('') },
});

const wire = (from: [string, string], to: [string, string]) => ({
  id: `${from[0]}.${from[1]}->${to[0]}.${to[1]}`,
  from: { node: from[0], port: from[1] },
  to: { node: to[0], port: to[1] },
});

const graph = (nodes: GraphDocument['nodes'], edges: GraphDocument['edges']): GraphDocument => ({
  schemaVersion: DOCUMENT_SCHEMA_VERSION,
  id: 'aperture',
  title: 'Choosing an aperture',
  nodes,
  edges,
  frames: [],
});

const APERTURES = [2.8, 4, 5.6, 8, 11, 16, 22];

/**
 * The study every case below shares.
 *
 *   camera ──► pixel pitch ──► circle of confusion ─┬─► hyperfocal ──► depth of field
 *                                                   │        ▲
 *   f-stop list (the axis) ───────────────────────────────────┘
 *              └────────────────────────────────► diffraction blur
 *
 * A 50 mm lens focused at 2 m on a Canon EOS R6 Mark III (5.16 µm pitch),
 * with "acceptably sharp" taken as a three-pixel circle of confusion.
 */
function study(extraNodes: GraphDocument['nodes'], extraEdges: GraphDocument['edges']): GraphDocument {
  return graph(
    [
      category('camera', 'Canon EOS R6 Mark III'),
      stops('N', APERTURES),
      scalar('f', 50, 'mm'),
      scalar('s', 2000, 'mm'),
      scalar('n', 3, ''),
      scalar('lambda', 0.00055, 'mm'),
      formulaNode('body', 'photography.camera.properties'),
      formulaNode('coc', 'photography.dof.circle-of-confusion-pixels'),
      formulaNode('hyper', 'photography.dof.hyperfocal-distance'),
      formulaNode('depth', 'photography.dof.limits'),
      formulaNode('blur', 'photography.diffraction.blur-diameter'),
      ...extraNodes,
    ],
    [
      wire(['camera', 'value'], ['body', 'camera']),
      wire(['body', 'p'], ['coc', 'p']),
      wire(['n', 'value'], ['coc', 'n']),
      wire(['f', 'value'], ['hyper', 'f']),
      wire(['N', 'value'], ['hyper', 'N']),
      wire(['coc', 'c'], ['hyper', 'c']),
      wire(['hyper', 'H'], ['depth', 'H']),
      wire(['s', 'value'], ['depth', 's']),
      wire(['f', 'value'], ['depth', 'f']),
      wire(['N', 'value'], ['blur', 'N']),
      wire(['lambda', 'value'], ['blur', 'lambda']),
      ...extraEdges,
    ],
  );
}

const selectNode = (id: string, mode: string, extra: Record<string, unknown> = {}) =>
  ({ kind: 'select' as const, id, position: { x: 0, y: 0 }, mode: mode as never, ...extra });

const checkNode = (id: string, comparison: string, threshold: number, unit: string) => ({
  kind: 'output' as const,
  id,
  position: { x: 0, y: 0 },
  label: id,
  output: {
    kind: 'check' as const,
    comparison: comparison as never,
    threshold: { value: threshold, unit: parseUnit(unit) },
  },
});

const numeric = (document: GraphDocument, node: string, port: string): NumericSeries => {
  const value = evaluateDocument(document, CATALOGUES).values.get(`${node}.${port}`);
  if (value === undefined || value.kind !== 'numeric') throw new Error(`no numeric ${node}.${port}`);
  return value;
};

describe('the study itself', () => {
  it('computes depth of field and diffraction blur across the seven stops', () => {
    const document = study([], []);
    const depth = numeric(document, 'depth', 'DoF');
    const blur = numeric(document, 'blur', 'b');

    expect(depth.axes.map((axis) => axis.label)).toEqual(['f-number']);
    expect(depth.data.map((value) => Number(value.toFixed(1)))).toEqual([
      135.3, 193.4, 271.2, 389.0, 538.9, 798.5, 1134.3,
    ]);
    // Canonical mm — 3.76 µm at f/2.8 up to 29.5 µm at f/22.
    expect(blur.data.map((value) => Number((value * 1000).toFixed(2)))).toEqual([
      3.76, 5.37, 7.52, 10.74, 14.76, 21.47, 29.52,
    ]);
    // Three pixels of 5.16 µm, read off the camera's own entry rather than typed.
    expect(numeric(document, 'coc', 'c').data[0]).toBeCloseTo(0.01548, 9);
  });
});

describe('reading an answer off the aperture axis', () => {
  it('interpolates the f-number where depth of field first reaches what is needed', () => {
    // `along` is the f-stop axis, so the answer is an f-number — even though
    // the value being searched is a length. That is the whole point of the
    // `along` port: `at` takes its dimension from the axis, not the value.
    const document = study(
      [selectNode('needed', 'crossing', { threshold: { value: 300, unit: parseUnit('mm') }, direction: 'any' })],
      [wire(['depth', 'DoF'], ['needed', 'value']), wire(['N', 'value'], ['needed', 'along'])],
    );
    const evaluation = evaluateDocument(document, CATALOGUES);
    const at = evaluation.values.get('needed.at') as NumericSeries;
    // Between f/5.6 (271 mm) and f/8 (389 mm). Interpolating over just those
    // two stops gives f/6.186, and the exact root of the continuous relation
    // is f/6.189 — three thousandths of a stop apart, because depth of field
    // is very nearly linear in f-number over this span.
    expect(at.data[0]).toBeCloseTo(6.186, 3);
    expect(at.axes).toEqual([]);

    // Depth of field is close to linear in f-number over this span, so the
    // coarse-sweep guard stays quiet — it is a numerical test, not a count.
    expect(evaluation.warnings.some((entry) => entry.kind === 'selectCoarseSweep')).toBe(false);
    // One crossing only: the relation is monotonic here.
    expect(evaluation.warnings.some((entry) => entry.kind === 'selectExtraCrossings')).toBe(false);
  });

  it('lands on a stop the lens actually has when asked for the first passing one', () => {
    // f/6.1 is not a setting. A Compare verdict plus `firstPassing` answers
    // with a stop from the list instead of a number between two of them.
    const document = study(
      [
        {
          kind: 'compare' as const,
          id: 'deep',
          position: { x: 0, y: 0 },
          comparison: '>=' as never,
          threshold: { value: 300, unit: parseUnit('mm') },
        },
        selectNode('buyable', 'firstPassing'),
      ],
      [
        wire(['depth', 'DoF'], ['deep', 'value']),
        wire(['deep', 'verdict'], ['buyable', 'value']),
        wire(['N', 'value'], ['buyable', 'along']),
      ],
    );
    expect(numeric(document, 'buyable', 'at').data).toEqual([8]);
  });

  it('reports both extrema at the ends of the sweep, because both relations are monotonic', () => {
    // Neither of these is a mistake: depth of field really does keep growing
    // as you stop down, and diffraction blur really is least wide open. That
    // the two answers sit at opposite ends of the axis is exactly why the
    // decision below needs constraints rather than one objective.
    const document = study(
      [selectNode('deepest', 'argMax'), selectNode('sharpest', 'argMin')],
      [
        wire(['depth', 'DoF'], ['deepest', 'value']),
        wire(['N', 'value'], ['deepest', 'along']),
        wire(['blur', 'b'], ['sharpest', 'value']),
        wire(['N', 'value'], ['sharpest', 'along']),
      ],
    );
    expect(numeric(document, 'deepest', 'at').data).toEqual([22]);
    expect(numeric(document, 'deepest', 'best').data.map((v) => Number(v.toFixed(1)))).toEqual([1134.3]);
    expect(numeric(document, 'sharpest', 'at').data).toEqual([2.8]);
  });
});

describe('the decision', () => {
  /**
   * Two checks pulling opposite ways: enough depth, and blur still under the
   * circle of confusion. The sharpness bound is *wired* from the circle of
   * confusion rather than retyped, so changing camera or pixel criterion
   * moves it automatically.
   */
  const decided = (direction: 'minimize' | 'maximize', objective: [string, string]) =>
    study(
      [
        checkNode('enough depth', '>=', 300, 'mm'),
        checkNode('sharp enough', '<=', 1, 'mm'),
        {
          kind: 'output' as const,
          id: 'best',
          position: { x: 0, y: 0 },
          label: 'best',
          output: {
            kind: 'bestDesign' as const,
            checks: ['enough depth', 'sharp enough'],
            direction,
          },
        },
      ],
      [
        wire(['depth', 'DoF'], ['enough depth', 'value']),
        wire(['blur', 'b'], ['sharp enough', 'value']),
        wire(['coc', 'c'], ['sharp enough', 'threshold']),
        wire(objective, ['best', 'objective']),
      ],
    );

  const cardOf = (document: GraphDocument): BestDesignResult => {
    const evaluation = evaluateDocument(document, CATALOGUES);
    return evaluation.outputs.find((entry) => entry.nodeId === 'best') as BestDesignResult;
  };

  it('picks the deepest stop that is still sharp, not the deepest stop', () => {
    const card = cardOf(decided('maximize', ['depth', 'DoF']));

    // f/2.8–f/5.6 lack depth; f/16 and f/22 are past the diffraction limit.
    expect(card.feasible).toEqual([false, false, false, true, true, false, false]);
    expect(card.feasibleCount).toBe(2);
    // f/11 — not f/22, which `argMax` alone answered with above.
    expect(card.winner?.at.map((entry) => [entry.axis.label, entry.value])).toEqual([['f-number', 11]]);
    expect(card.winner?.objective).toBeCloseTo(538.9, 1);
  });

  it('names diffraction as the governing constraint, with depth to spare', () => {
    const card = cardOf(decided('maximize', ['depth', 'DoF']));

    // At f/11: blur is 14.76 µm against a 15.48 µm circle of confusion — 4.7%
    // of room — while depth of field is 539 mm against 300 mm, 80% of room.
    // Normalising is what makes those two comparable at all.
    expect(card.winner?.governing?.checkId).toBe('sharp enough');
    expect(card.winner?.governing?.margin).toBeCloseTo(0.0465, 3);
    expect(card.winner?.margins.map((entry) => entry.checkId)).toEqual(['sharp enough', 'enough depth']);
    expect(card.winner?.margins[1]?.margin).toBeCloseTo(0.7964, 3);
  });

  it('picks the widest usable stop when the objective is sharpness instead', () => {
    // Same two constraints, opposite objective: least diffraction blur among
    // the stops that still give enough depth. That is f/8 — and it agrees
    // with what `firstPassing` answered, which is the consistency check
    // worth having between the two ways of asking.
    const card = cardOf(decided('minimize', ['blur', 'b']));
    expect(card.winner?.at[0]?.value).toBe(8);
    expect(card.winner?.governing?.checkId).toBe('enough depth');
  });

  it('reports an impossible pairing as an answer, naming the check that blocks the most stops', () => {
    // A two-pixel criterion is stricter, and 600 mm of depth at 2 m is a lot:
    // nothing satisfies both at once. That is a real finding about the
    // camera and the framing, not an error in the graph.
    const document = study(
      [
        checkNode('enough depth', '>=', 600, 'mm'),
        checkNode('sharp enough', '<=', 1, 'mm'),
        {
          kind: 'output' as const,
          id: 'best',
          position: { x: 0, y: 0 },
          label: 'best',
          output: {
            kind: 'bestDesign' as const,
            checks: ['enough depth', 'sharp enough'],
            direction: 'maximize' as const,
          },
        },
      ],
      [
        wire(['depth', 'DoF'], ['enough depth', 'value']),
        wire(['blur', 'b'], ['sharp enough', 'value']),
        wire(['coc', 'c'], ['sharp enough', 'threshold']),
        wire(['depth', 'DoF'], ['best', 'objective']),
      ],
    );
    // Two pixels rather than three, so the sharpness bound tightens.
    const stricter: GraphDocument = {
      ...document,
      nodes: document.nodes.map((node) => (node.id === 'n' ? scalar('n', 2, '') : node)),
    };
    const evaluation = evaluateDocument(stricter, CATALOGUES);
    const card = evaluation.outputs.find((entry) => entry.nodeId === 'best') as BestDesignResult;

    expect(card.winner).toBeUndefined();
    expect(card.feasibleCount).toBe(0);
    // Depth blocks six of the seven stops and sharpness four, so depth is
    // what the card points at — 600 mm at 2 m is the harder half of the ask,
    // and moving back is a better move than stopping down further.
    expect(card.blocking).toEqual({ checkId: 'enough depth', failures: 6 });
    expect(evaluation.warnings.some((entry) => entry.kind === 'bestDesignInfeasible')).toBe(true);
  });
});

describe('a second swept input', () => {
  it('collapses only the axis wired into `along`, leaving a stop per subject distance', () => {
    // Focus distance becomes an axis of its own. The selection still reduces
    // the aperture axis alone, so the answer is an f-number *per distance* —
    // a series to plot, not a single number.
    const document = study(
      [
        {
          kind: 'input' as const,
          id: 's2',
          position: { x: 0, y: 0 },
          label: 's2',
          axisLabel: 'subject distance',
          value: { kind: 'list' as const, values: [1500, 2000, 3000], unit: parseUnit('mm') },
        },
        selectNode('needed', 'crossing', { threshold: { value: 300, unit: parseUnit('mm') }, direction: 'any' }),
      ],
      [wire(['depth', 'DoF'], ['needed', 'value']), wire(['N', 'value'], ['needed', 'along'])],
    );
    // Swap the fixed subject distance for the swept one.
    const swept: GraphDocument = {
      ...document,
      edges: document.edges
        .filter((edge) => !(edge.from.node === 's' && edge.to.node === 'depth'))
        .concat([wire(['s2', 'value'], ['depth', 's'])]),
    };

    const at = numeric(swept, 'needed', 'at');
    expect(at.axes.map((axis) => axis.label)).toEqual(['subject distance']);
    expect(at.data).toHaveLength(3);
    // Closer subjects have less depth to give, so they need stopping down
    // further: 1.5 m wants f/11.07 where 2 m wants f/6.19.
    expect(at.data[0]).toBeCloseTo(11.066, 3);
    expect(at.data[1]).toBeCloseTo(6.186, 3);

    // At 3 m there is no crossing at all — the widest stop already gives
    // 307 mm, so the curve starts above the requirement and never meets it.
    // A blank cell plus a warning, not a failure: that is the ordinary
    // state of a study that is partly satisfied before it begins.
    expect(at.data[2]).toBeNaN();
    const warning = evaluateDocument(swept, CATALOGUES).warnings.find(
      (entry) => entry.kind === 'selectNoCrossing',
    );
    expect(warning?.message).toMatch(/at 1 of 3 points/u);
  });
});
