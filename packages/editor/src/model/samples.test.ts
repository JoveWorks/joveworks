/**
 * The belt lab, opened the way the editor opens it.
 *
 * `test/belt-goldens.test.ts` proves the kernel reproduces the notebook. This
 * proves the *editor's* path to the same numbers — sample builder, analysis,
 * output results — which is the path a student actually takes, and the one that
 * could quietly diverge from the test's hand-built document.
 *
 * The catalogue is not in this repository and never will be (S45), so this skips
 * without `MDS_CATALOGUE`, exactly as the goldens test does. What is asserted
 * here is numbers and ids; no expression appears.
 */

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadCatalogue, type Catalogue } from '@mds/schema';
import { fromCanonical } from '@mds/units';

import { analyse } from './analysis';
import { baseCatalogue } from './catalogues';
import { beltLab, padPressure } from './samples';

const path = process.env['MDS_CATALOGUE'];
const present = path !== undefined && path.length > 0 && existsSync(path);

const CATALOGUES: readonly Catalogue[] = present
  ? [baseCatalogue(), loadCatalogue(readFileSync(path as string, 'utf8'))]
  : [baseCatalogue()];

describe('the samples the editor opens with', () => {
  it('offers the pad sweep with nothing but the base library loaded (S42)', () => {
    expect(padPressure([baseCatalogue()])).toBeDefined();
  });

  it('withholds the belt lab until its catalogue is loaded, rather than embedding it (S23)', () => {
    expect(beltLab([baseCatalogue()])).toBeUndefined();
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

    // PLAN.md's table, at rel=1e-3 because the stored outputs are 4 figures.
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
