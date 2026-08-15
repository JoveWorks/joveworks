import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadCatalogue, isEvaluable, type Catalogue, type Formula } from '@mds/schema';
import { KernelError, checkFormulaDimensions } from '@mds/kernel';

/**
 * The mechanical half of reviewing a migrated catalogue: parse it, then run the
 * dimension check over every record.
 *
 * PLAN.md asks this of every migrated formula, and it is why the kernel was
 * built before any extraction ran. It lives here rather than in `kernel`
 * because the catalogue it checks is **not in this repository** and never will
 * be (S45): the R&M content sits in a separate private repo, so this points at
 * a path given in `MDS_CATALOGUE` and skips when there is none. A public
 * checkout has nothing to check, and that is the boundary working rather than
 * a gap in the tests.
 *
 *     MDS_CATALOGUE=~/source/machine-design-catalogue/formulas/c16-belt.json pnpm test
 *
 * Failures are collected per formula rather than thrown one at a time, because
 * a scripted extraction fails systematically — seeing all of them at once is
 * what tells a parser bug apart from a defect in the source.
 */

const path = process.env['MDS_CATALOGUE'];
const present = path !== undefined && path.length > 0 && existsSync(path);

let loaded: Catalogue | undefined;
function catalogue(): Catalogue {
  loaded ??= loadCatalogue(readFileSync(path as string, 'utf8'));
  return loaded;
}

function check(formula: Formula): string | undefined {
  try {
    checkFormulaDimensions(formula);
    return undefined;
  } catch (error) {
    return error instanceof KernelError ? error.message : String(error);
  }
}

describe('a migrated catalogue', () => {
  it('is only checked when one is named — the restricted half is another repo (S45)', () => {
    expect(present || path === undefined).toBe(true);
  });

  it.runIf(present)('parses', () => {
    expect(catalogue().formulas.length).toBeGreaterThan(0);
  });

  it.runIf(present)('holds nothing evaluable that fails the dimension check', () => {
    const failures = catalogue()
      .formulas.filter(isEvaluable)
      .map((formula) => [formula.id, check(formula)] as const)
      .filter(([, message]) => message !== undefined);

    expect(Object.fromEntries(failures)).toEqual({});
  });

  it.runIf(present)('quarantines nothing that would pass', () => {
    // The other direction, and the one that keeps the quarantine list honest:
    // a record that checks out has no business being unusable, so a stale entry
    // surfaces here instead of silently costing a formula.
    const spurious = catalogue()
      .formulas.filter((formula) => !isEvaluable(formula))
      .filter((formula) => check(formula) === undefined)
      .map((formula) => formula.id);

    expect(spurious).toEqual([]);
  });

  it.runIf(present)('names every formula uniquely and under a namespace (S65)', () => {
    // A graph's reference carries no catalogue id, so these ids share one
    // namespace with `add` from the base library.
    const ids = catalogue().formulas.map((formula) => formula.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !id.includes('.'))).toEqual([]);
  });
});
