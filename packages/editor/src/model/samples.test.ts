/**
 * The belt lab, opened the way the editor opens it.
 *
 * `test/belt-goldens.test.ts` proves the kernel reproduces the notebook. This
 * proves the *editor's* path to the same numbers — sample builder, analysis,
 * output results — which is the path a student actually takes, and the one that
 * could quietly diverge from the test's hand-built document.
 *
 * The catalogue is not in this repository and never will be, so this skips
 * without `MDS_CATALOGUE`, exactly as the goldens test does. What is asserted
 * here is numbers and ids; no expression appears.
 */

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadCatalogue, type Catalogue } from '@mds/schema';
import { fromCanonical, parseUnit } from '@mds/units';

import { analyse } from './analysis';
import { baseCatalogue, bundledCatalogues } from './catalogues';
import { beltLab, millingPowerEnvelope, padPressure } from './samples';

const path = process.env['MDS_CATALOGUE'];
const present = path !== undefined && path.length > 0 && existsSync(path);

const PUBLIC_CATALOGUES: readonly Catalogue[] = [baseCatalogue(), ...bundledCatalogues()];
const CATALOGUES: readonly Catalogue[] = present
  ? [...PUBLIC_CATALOGUES, loadCatalogue(readFileSync(path as string, 'utf8'))]
  : PUBLIC_CATALOGUES;

describe('the samples the editor opens with', () => {
  it('offers the pad sweep with nothing but the base library loaded', () => {
    expect(padPressure([baseCatalogue()])).toBeDefined();
  });

  it('withholds the belt lab until its catalogue is loaded, rather than embedding it', () => {
    expect(beltLab([baseCatalogue()])).toBeUndefined();
  });

  it('offers the milling power-envelope study from the bundled public catalogue', () => {
    expect(millingPowerEnvelope(PUBLIC_CATALOGUES)).toBeDefined();
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
  });
});

describe.runIf(present)('the belt lab through the editor', () => {
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
