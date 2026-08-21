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

import { loadCatalogue, type Catalogue, type GraphDocument } from '@joveworks/schema';
import { fromCanonical, parseUnit } from '@joveworks/units';

import { analyse } from './analysis';
import { baseCatalogue, bundledCatalogues } from './catalogues';
import { GAP } from './layout-constants';
import { beltLab, millingPowerEnvelope, monteCarloClearance, padPressure, pressfitLab } from './samples';

const path = process.env['JOVEWORKS_CATALOGUE'];
const present = path !== undefined && path.length > 0 && existsSync(path);

const PUBLIC_CATALOGUES: readonly Catalogue[] = [baseCatalogue(), ...bundledCatalogues()];
const CATALOGUES: readonly Catalogue[] = present
  ? [...PUBLIC_CATALOGUES, loadCatalogue(readFileSync(path as string, 'utf8'))]
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

  it('offers the milling power-envelope study from the bundled public catalogue', () => {
    expect(millingPowerEnvelope(PUBLIC_CATALOGUES)).toBeDefined();
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

    // docs/PLAN.md's table, at rel=1e-3 because the stored outputs are 4 figures.
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
