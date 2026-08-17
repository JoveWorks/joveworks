import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { compileFormula, checkFormulaDimensions } from '@mds/kernel';
import { loadCatalogue, type Formula } from '@mds/schema';
import { fromCanonical, parseUnit, toCanonical } from '@mds/units';

const catalogue = loadCatalogue(
  readFileSync(
    new URL('../packages/editor/src/catalogues/machining.json', import.meta.url),
    'utf8',
  ),
);

function formula(id: string): Formula {
  const found = catalogue.formulas.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no machining formula '${id}'`);
  return found;
}

function evaluate(id: string, inputs: Readonly<Record<string, number>>): number {
  return compileFormula(formula(id), new Map()).evaluate(inputs);
}

const canonical = (value: number, unit: string): number => toCanonical(value, parseUnit(unit));
const displayed = (value: number, unit: string): number => fromCanonical(value, parseUnit(unit));

describe('the bundled machining catalogue', () => {
  it('is public, namespaced, and mechanically valid', () => {
    expect(catalogue.id).toBe('public-machining');
    expect(catalogue.restricted).toBe(false);
    expect(catalogue.formulas).toHaveLength(17);

    for (const entry of catalogue.formulas) {
      expect(entry.id).toMatch(/^machining\./u);
      expect(entry.status).toBe('verified');
      expect(() => checkFormulaDimensions(entry), entry.id).not.toThrow();
    }
  });

  it('converts diameter and spindle speed to cutting speed and back', () => {
    const speed = evaluate('machining.speed.cutting-speed', {
      D: canonical(100, 'mm'),
      n: canonical(1200, 'rpm'),
    });
    expect(displayed(speed, 'm/min')).toBeCloseTo(376.991, 3);

    const spindleSpeed = evaluate('machining.speed.spindle-speed', {
      v_c: speed,
      D: canonical(100, 'mm'),
    });
    expect(displayed(spindleSpeed, 'rpm')).toBeCloseTo(1200, 9);
  });

  it('computes milling table feed and chip load as inverse forms', () => {
    const tableFeed = evaluate('machining.milling.table-feed', {
      f_z: canonical(0.1, 'mm'),
      z_c: 4,
      n: canonical(1500, 'rpm'),
    });
    expect(displayed(tableFeed, 'mm/min')).toBeCloseTo(600, 9);

    const chipLoad = evaluate('machining.milling.chip-load', {
      v_f: tableFeed,
      z_c: 4,
      n: canonical(1500, 'rpm'),
    });
    expect(displayed(chipLoad, 'mm')).toBeCloseTo(0.1, 9);
  });

  it('carries a milling study from removal rate through power and torque', () => {
    const removalRate = evaluate('machining.milling.removal-rate', {
      a_p: canonical(2, 'mm'),
      a_e: canonical(10, 'mm'),
      v_f: canonical(600, 'mm/min'),
    });
    expect(displayed(removalRate, 'cm³/min')).toBeCloseTo(12, 9);

    const power = evaluate('machining.power.from-removal-rate', {
      k_c: canonical(1800, 'N/mm²'),
      Q: removalRate,
    });
    expect(displayed(power, 'kW')).toBeCloseTo(0.36, 9);

    const torque = evaluate('machining.torque.from-power', {
      P_c: power,
      n: canonical(1500, 'rpm'),
    });
    expect(displayed(torque, 'Nm')).toBeCloseTo(2.29183, 5);
  });

  it('covers turning, drilling, force, time, and machine efficiency', () => {
    expect(
      displayed(
        evaluate('machining.turning.removal-rate', {
          v_c: canonical(120, 'm/min'),
          a_p: canonical(2, 'mm'),
          f_n: canonical(0.25, 'mm/rev'),
        }),
        'cm³/min',
      ),
    ).toBeCloseTo(60, 9);

    expect(
      displayed(
        evaluate('machining.drilling.removal-rate', {
          D: canonical(10, 'mm'),
          v_f: canonical(100, 'mm/min'),
        }),
        'cm³/min',
      ),
    ).toBeCloseTo(7.85398, 5);

    expect(
      displayed(
        evaluate('machining.force.cutting-force', {
          k_c: canonical(1800, 'N/mm²'),
          A_c: canonical(0.5, 'mm²'),
        }),
        'N',
      ),
    ).toBeCloseTo(900, 9);

    expect(
      displayed(
        evaluate('machining.time.in-cut', {
          L: canonical(150, 'mm'),
          v_f: canonical(600, 'mm/min'),
        }),
        'min',
      ),
    ).toBeCloseTo(0.25, 9);

    expect(
      displayed(
        evaluate('machining.power.machine-input', {
          P_c: canonical(4, 'kW'),
          eta: 0.8,
        }),
        'kW',
      ),
    ).toBeCloseTo(5, 9);
  });
});
