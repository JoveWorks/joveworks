/**
 * The belt lab, opened the way the editor opens it.
 *
 * `test/belt-goldens.test.ts` proves the kernel reproduces the notebook. This
 * proves the *editor's* path to the same numbers — sample builder, analysis,
 * output results — which is the path a student actually takes, and the one that
 * could quietly diverge from the test's hand-built document.
 *
 * The catalogue is not in this repository and never will be, so this skips
 * without `JOVEWORKS_CATALOGUE`, exactly as the goldens test does. What is asserted
 * here is numbers and ids; no expression appears.
 */

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  catalogueFormatFromFileName,
  loadCatalogue,
  type Catalogue,
  type GraphDocument,
} from '@joveworks/schema';
import { fromCanonical, parseUnit } from '@joveworks/units';

import { analyse } from './analysis';
import { baseCatalogue, bundledCatalogues } from './catalogues';
import { DEFAULT_ADVANCED_NODES } from './editorSettings';
import { GAP } from './layout-constants';
import {
  apertureDecision,
  beltLab,
  cantileverHollowSections,
  depthOfField,
  wildlifeCameraComparison,
  millingPowerEnvelope,
  monteCarloClearance,
  padPressure,
  platformFootprint,
  pressfitLab,
} from './samples';

const path = process.env['JOVEWORKS_CATALOGUE'];
const present = path !== undefined && path.length > 0 && existsSync(path);

const PUBLIC_CATALOGUES: readonly Catalogue[] = [baseCatalogue(), ...bundledCatalogues()];
const CATALOGUES: readonly Catalogue[] = present
  ? [
      ...PUBLIC_CATALOGUES,
      loadCatalogue(
        readFileSync(path as string, 'utf8'),
        catalogueFormatFromFileName(path as string),
      ),
    ]
  : PUBLIC_CATALOGUES;
const catalogueFormulaIds = new Set(CATALOGUES.flatMap((catalogue) => catalogue.formulas.map((formula) => formula.id)));
const beltPresent = catalogueFormulaIds.has('rm.16.19A');
const pressfitPresent = catalogueFormulaIds.has('rm.12.8');

describe('the samples the editor opens with', () => {
  it('offers the pad sweep with nothing but the base library loaded', () => {
    expect(padPressure([baseCatalogue()])).toBeDefined();
  });

  it('renders example-owned text in the selected app language', () => {
    const example = padPressure([baseCatalogue()], 'nl');
    expect(example?.title).toBe('Pad druk vegen');
    expect(example?.nodes.find((node) => node.id === 'F')?.label).toBe('Padbelasting F');
  });

  it('withholds the belt lab until its catalogue is loaded, rather than embedding it', () => {
    expect(beltLab([baseCatalogue()])).toBeUndefined();
  });

  it('offers the Monte Carlo clearance stack-up with nothing but the base library loaded', () => {
    const example = monteCarloClearance([baseCatalogue()]);
    expect(example).toBeDefined();
    // Two independent generators — hole and shaft — feeding one `subtract`
    // node: they pair sample-by-sample rather than gridding (`ROADMAP.md`
    // #31), which is what makes wiring both straight in safe now.
    expect(example?.nodes.filter((node) => node.kind === 'monteCarloGenerator')).toHaveLength(2);
    expect(example?.nodes.some((node) => node.kind === 'monteCarloReceiver')).toBe(true);
  });

  it('wires the clearance example so the kernel evaluates it end to end', () => {
    const example = monteCarloClearance([baseCatalogue()]) as GraphDocument;
    const analysis = analyse(example, [baseCatalogue()]);
    expect(analysis.states.get('out_clearance') ?? 'ok').toBe('ok');
    expect(analysis.states.get('watch') ?? 'ok').toBe('ok');
  });

  // Beta gating (packages/editor/src/palette/advancedNodes.ts) only hides the
  // Monte Carlo palette entries when the "advanced nodes" preference is off
  // — it must never stop a document that already uses them from working.
  // `analyse` here is exactly what the editor and the NodeBook call to load
  // and render a document, and it never consults the preference, so this
  // stands in for "opens a cloud-supplied NodeBook with the setting off".
  it('still loads, evaluates, and renders a Monte Carlo sample with advanced nodes off (the beta default)', () => {
    expect(DEFAULT_ADVANCED_NODES).toBe(false);

    const example = monteCarloClearance([baseCatalogue()]) as GraphDocument;
    expect(example.nodes.some((node) => node.kind === 'monteCarloGenerator')).toBe(true);
    expect(example.nodes.some((node) => node.kind === 'monteCarloReceiver')).toBe(true);

    const analysis = analyse(example, [baseCatalogue()]);
    expect(analysis.message).toBeUndefined();
    expect(analysis.states.get('out_clearance') ?? 'ok').toBe('ok');
    expect(analysis.states.get('watch') ?? 'ok').toBe('ok');
  });

  it('offers the milling power-envelope study from the bundled public catalogue', () => {
    expect(millingPowerEnvelope(PUBLIC_CATALOGUES)).toBeDefined();
  });

  it('uses the machining-material library for its cutting-force estimate', () => {
    const example = millingPowerEnvelope(PUBLIC_CATALOGUES);
    expect(example?.nodes.some((node) => node.id === 'material' && node.kind === 'formula')).toBe(true);
    expect(example?.edges.some((edge) => edge.from.node === 'material' && edge.from.port === 'k_c' && edge.to.node === 'cutting_power')).toBe(true);
  });

  it('opens the wildlife camera comparison from the bundled public catalogue', () => {
    const example = wildlifeCameraComparison(PUBLIC_CATALOGUES);
    expect(example).toBeDefined();
    expect(example?.id).toBe('wildlife-camera-comparison');
    expect(example?.nodes).toHaveLength(35);
    expect(example?.edges).toHaveLength(54);
    expect(example?.frames.map((frame) => frame.note)).toHaveLength(2);

    const analysis = analyse(example as GraphDocument, PUBLIC_CATALOGUES);
    expect(analysis.message).toBeUndefined();
    expect([...analysis.states.values()].every((state) => state === 'ok')).toBe(true);
  });

  it('exposes a curated set of sliders and evaluates every travel endpoint', () => {
    const examples = [
      padPressure(PUBLIC_CATALOGUES),
      platformFootprint(PUBLIC_CATALOGUES),
      cantileverHollowSections(PUBLIC_CATALOGUES),
      millingPowerEnvelope(PUBLIC_CATALOGUES),
    ];
    const expected = [
      ['F', 'L'],
      ['load', 'length'],
      // The cantilever's wall thickness became a swept axis, so the tip load is
      // its one exposed control — and the better one to drag: it moves the whole
      // Pareto front rather than walking along it.
      ['F'],
      ['a_p', 'eta'],
    ];

    examples.forEach((example, exampleIndex) => {
      expect(example).toBeDefined();
      const exposed = (example?.nodes ?? []).filter(
        (node) => node.kind === 'input' && node.value.kind === 'slider' && node.exposeInNotebook === true,
      );
      expect(exposed.map((node) => node.id)).toEqual(expected[exampleIndex]);
      for (const slider of exposed) {
        if (slider.kind !== 'input' || slider.value.kind !== 'slider' || example === undefined) continue;
        for (const value of [slider.value.min, slider.value.max]) {
          const atEndpoint: GraphDocument = {
            ...example,
            nodes: example.nodes.map((node) =>
              node.id === slider.id && node.kind === 'input' && node.value.kind === 'slider'
                ? { ...node, value: { ...node.value, value } }
                : node,
            ),
          };
          expect(analyse(atEndpoint, PUBLIC_CATALOGUES).message).toBeUndefined();
        }
      }
    });
  });

  it('snaps example nodes and sections to the canvas grid', () => {
    const example = millingPowerEnvelope(PUBLIC_CATALOGUES);
    expect(example).toBeDefined();
    const aligned = (value: number): boolean => Number.isInteger(value / GAP);
    for (const node of example?.nodes ?? []) {
      expect(aligned(node.position.x)).toBe(true);
      expect(aligned(node.position.y)).toBe(true);
    }
    for (const frame of example?.frames ?? []) {
      expect(aligned(frame.position.x)).toBe(true);
      expect(aligned(frame.position.y)).toBe(true);
    }
  });
});

describe('the milling power-envelope study through the editor', () => {
  it('evaluates its 5 × 4 grid and crosses both spindle constraints', () => {
    const document = millingPowerEnvelope(PUBLIC_CATALOGUES);
    expect(document).toBeDefined();
    const analysis = analyse(document as NonNullable<typeof document>, PUBLIC_CATALOGUES);

    expect(analysis.message).toBeUndefined();
    expect([...analysis.states.values()].every((state) => state === 'ok')).toBe(true);

    const removalRate = analysis.evaluation?.values.get('removal_rate.Q');
    expect(removalRate?.kind).toBe('numeric');
    expect(removalRate?.kind === 'numeric' && removalRate.data).toHaveLength(20);
    const rates =
      removalRate?.kind === 'numeric'
        ? removalRate.data.map((value) => fromCanonical(value, parseUnit('cm³/min')))
        : [];
    expect(Math.max(...rates)).toBeCloseTo(176.013, 3);
    expect(rates.some((value) => Math.abs(value - 132.009) < 0.01)).toBe(true);

    const outputs = analysis.evaluation?.outputs ?? [];
    const powerCheck = outputs.find((entry) => entry.nodeId === 'out_P_check');
    const torqueCheck = outputs.find((entry) => entry.nodeId === 'out_M_check');
    expect(powerCheck?.kind === 'check' && powerCheck.passed).toBe(false);
    expect(torqueCheck?.kind === 'check' && torqueCheck.passed).toBe(false);

    const productivity = outputs.find((entry) => entry.nodeId === 'out_Q_plot');
    expect(productivity?.kind).toBe('plot');
    expect(productivity?.kind === 'plot' && productivity.x.axis.id).toBe('f_z');
    expect(productivity?.kind === 'plot' && productivity.series2?.axis.id).toBe('a_e');

    const table = outputs.find((entry) => entry.nodeId === 'out_table');
    expect(table?.kind).toBe('table');
    if (table?.kind !== 'table') throw new Error('missing machining table');
    expect(table.axes.map((axis) => axis.id)).toEqual(['f_z', 'a_e']);
    expect(table.columns.map((column) => column.series.data)).toEqual([
      [0.08, 0.08, 0.08, 0.08, 0.12, 0.12, 0.12, 0.12, 0.16, 0.16, 0.16, 0.16, 0.2, 0.2, 0.2, 0.2, 0.24, 0.24, 0.24, 0.24],
      [10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40],
      expect.any(Array),
      expect.any(Array),
      expect.any(Array),
      expect.any(Array),
      expect.any(Array),
    ]);
    expect(table.columns.every((column) => column.series.data.length === 20)).toBe(true);
    expect(document?.nodes.find((node) => node.id === 'out_table')).toMatchObject({
      output: { figures: { f_z: 2, a_e: 2, v_f: 2, Q: 2, P_m: 2, M_c: 2, t_c: 2 } },
    });

    // Both spindle limits are crossed by some, but not all, of the grid
    // (the checks above are 'passed: false' each) — a genuinely mixed
    // feasible region, which is exactly what makes this study a good
    // demonstration of the shaded Feasibility output.
    const feasible = outputs.find((entry) => entry.nodeId === 'out_feasible');
    expect(feasible?.kind).toBe('feasibility');
    if (feasible?.kind !== 'feasibility') throw new Error('missing feasibility output');
    expect(feasible.mask).toHaveLength(20);
    expect(feasible.mask.some(Boolean)).toBe(true);
    expect(feasible.mask.some((value) => !value)).toBe(true);
  });
});

describe('the depth-of-field study through the editor', () => {
  it('offers the study from the bundled public catalogue', () => {
    expect(depthOfField(PUBLIC_CATALOGUES)).toBeDefined();
  });

  it('evaluates its 5 × 5 grid and crosses the depth-of-field threshold', () => {
    const document = depthOfField(PUBLIC_CATALOGUES);
    expect(document).toBeDefined();
    const analysis = analyse(document as NonNullable<typeof document>, PUBLIC_CATALOGUES);

    expect(analysis.message).toBeUndefined();
    expect([...analysis.states.values()].every((state) => state === 'ok')).toBe(true);

    const dof = analysis.evaluation?.values.get('dof.DoF');
    expect(dof?.kind).toBe('numeric');
    const depths = dof?.kind === 'numeric' ? dof.data.map((value) => fromCanonical(value, parseUnit('m'))) : [];
    expect(depths).toHaveLength(25);
    // Every point stays within the near/far-limit formula's own domain
    // (s < H) — the whole grid is a valid reading, not merely 25 numbers.
    expect(depths.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(Math.min(...depths)).toBeCloseTo(0.031, 3);
    expect(Math.max(...depths)).toBeCloseTo(6.763, 3);

    const outputs = analysis.evaluation?.outputs ?? [];
    // A mixed pass/fail, like the milling study above: worth demonstrating
    // the shaded Feasibility output precisely because it is not uniform.
    const feasible = outputs.find((entry) => entry.nodeId === 'out_feasible');
    expect(feasible?.kind).toBe('feasibility');
    if (feasible?.kind !== 'feasibility') throw new Error('missing feasibility output');
    expect(feasible.mask).toHaveLength(25);
    expect(feasible.mask.some(Boolean)).toBe(true);
    expect(feasible.mask.some((value) => !value)).toBe(true);

    const table = outputs.find((entry) => entry.nodeId === 'out_table');
    expect(table?.kind).toBe('table');
    if (table?.kind !== 'table') throw new Error('missing depth-of-field table');
    expect(table.axes.map((axis) => axis.id)).toEqual(['f', 'N']);
  });
});

describe('the aperture decision through the editor', () => {
  it('selects the deepest f-stop that passes both depth and diffraction checks', () => {
    const document = apertureDecision(PUBLIC_CATALOGUES);
    expect(document).toBeDefined();
    const analysis = analyse(document as NonNullable<typeof document>, PUBLIC_CATALOGUES);

    expect(analysis.message).toBeUndefined();
    expect([...analysis.states.values()].every((state) => state === 'ok')).toBe(true);

    const result = analysis.evaluation?.outputs.find((entry) => entry.nodeId === 'bestAperture');
    expect(result?.kind).toBe('bestDesign');
    if (result?.kind !== 'bestDesign') throw new Error('missing aperture decision');

    expect(result.feasibleCount).toBe(2);
    expect(result.winner?.at.map((entry) => [entry.axis.label, entry.value])).toEqual([
      ['aperture (f-number)', 11],
    ]);
    expect(result.winner?.governing?.checkId).toBe('sharpEnough');
  });
});

describe.runIf(beltPresent)('the belt lab through the editor', () => {
  it('reproduces the golden values of Lab_belt.ipynb', () => {
    const document = beltLab(CATALOGUES);
    expect(document).toBeDefined();
    const analysis = analyse(document as NonNullable<typeof document>, CATALOGUES);

    expect(analysis.message).toBeUndefined();
    expect([...analysis.states.values()].every((state) => state === 'ok')).toBe(true);

    const shown = (nodeId: string): number => {
      const result = analysis.evaluation?.outputs.find((entry) => entry.nodeId === nodeId);
      if (result === undefined || result.kind !== 'value') throw new Error(`no output '${nodeId}'`);
      if (result.series.kind !== 'numeric') throw new Error(`'${nodeId}' is not numeric`);
      return fromCanonical(result.series.data[0] as number, result.unit);
    };

    // From the stored notebook outputs, at rel=1e-3 because they are 4 figures.
    const golden: readonly (readonly [string, number])[] = [
      ['out_i', 4.444],
      ['out_Pprime', 3080],
      ['out_Lprime', 2204],
      ['out_e', 691.3],
      ['out_z', 1.132],
      ['out_v', 7.069],
      ['out_f_B', 6.464],
    ];
    for (const [nodeId, expected] of golden) {
      expect(Math.abs(shown(nodeId) - expected) / expected, nodeId).toBeLessThan(1e-3);
    }
  });
});

describe.runIf(pressfitPresent)('the press-fit lab through the editor', () => {
  it('reproduces the values recorded by PressFit1_TD.ipynb', () => {
    const document = pressfitLab(CATALOGUES);
    expect(document).toBeDefined();
    const analysis = analyse(document as NonNullable<typeof document>, CATALOGUES);
    expect(analysis.message).toBeUndefined();
    expect([...analysis.states.values()].every((state) => state === 'ok')).toBe(true);

    const shown = (nodeId: string): number => {
      const result = analysis.evaluation?.outputs.find((entry) => entry.nodeId === nodeId);
      if (result === undefined || result.kind !== 'print' || result.series.kind !== 'numeric') {
        throw new Error(`no numeric output '${nodeId}'`);
      }
      return fromCanonical(result.series.data[0] as number, result.unit);
    };
    const golden: readonly (readonly [string, number])[] = [
      ['out_F_S', 17500], ['out_p_Fmin', 15.92], ['out_S_nmin', 41.64],
      ['out_p_FmaxU', 67.58], ['out_S_nmax', 150.1], ['out_P_T', 108.4], ['out_T_B', 65.05],
    ];
    for (const [nodeId, expected] of golden) {
      expect(Math.abs(shown(nodeId) - expected) / expected, nodeId).toBeLessThan(1e-3);
    }
  });
});

describe('the cantilever study, as a trade-off', () => {
  it('offers a real front: four candidates worth arguing about, two simply beaten', () => {
    const document = cantileverHollowSections(PUBLIC_CATALOGUES);
    expect(document).toBeDefined();
    const analysis = analyse(document as NonNullable<typeof document>, PUBLIC_CATALOGUES);
    expect(analysis.message).toBeUndefined();
    expect([...analysis.states.values()].every((state) => state === 'ok')).toBe(true);

    const front = (analysis.evaluation?.outputs ?? []).find((entry) => entry.nodeId === 'out_pareto');
    if (front?.kind !== 'pareto') throw new Error('missing pareto output');
    expect(front.axes.map((axis) => axis.id)).toEqual(['d_o', 't']);
    expect(front.points).toHaveLength(20);

    // The point of this sample. Fourteen sections miss the L/300 limit and
    // never compete; of the six that pass, two are beaten outright — which is
    // what makes the chart worth drawing rather than a straight line.
    expect(front.feasibleCount).toBe(6);
    expect(front.frontCount).toBe(4);

    // Row-major over [d_o, t]: cell 16 is d_o = 80 mm with a 2 mm wall, and
    // cell 14 is d_o = 60 mm with a 4 mm wall. The big thin tube is lighter
    // *and* stiffer, so the small thick one is dominated — the classic result
    // this study exists to show.
    const at = (cell: number) => front.points[cell] as NonNullable<(typeof front.points)[number]>;
    expect(at(16).onFront).toBe(true);
    expect(at(14).feasible).toBe(true);
    expect(at(14).onFront).toBe(false);
    expect(at(16).x).toBeLessThan(at(14).x);
    expect(at(16).y).toBeLessThan(at(14).y);
  });

  it('marks that candidate, and the mark still lands on a sample', () => {
    const document = cantileverHollowSections(PUBLIC_CATALOGUES);
    expect(document?.marks).toEqual([{ at: { d_o: 80, t: 2 } }]);
    const analysis = analyse(document as NonNullable<typeof document>, PUBLIC_CATALOGUES);
    // A mark shipped with a sample must not arrive stale — it would tell every
    // reader the range had moved under a design nobody had touched.
    expect(analysis.warnings.filter((entry) => entry.kind === 'candidateStale')).toEqual([]);
  });
});
