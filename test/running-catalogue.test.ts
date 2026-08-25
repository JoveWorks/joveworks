import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { checkFormulaDimensions, compileFormula } from '@joveworks/kernel';
import { loadCatalogue, type Formula, type OutputPort } from '@joveworks/schema';
import { fromCanonical, parseUnit, toCanonical } from '@joveworks/units';

const catalogue = loadCatalogue(
  readFileSync(
    new URL('../packages/editor/src/catalogues/running.yaml', import.meta.url),
    'utf8',
  ),
  'yaml',
);

function formula(id: string): Formula {
  const found = catalogue.formulas.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no running formula '${id}'`);
  return found;
}

function evaluate(id: string, inputs: Readonly<Record<string, number>>): number {
  const record = formula(id);
  const only = record.outputs[0] as OutputPort;
  const compiled = compileFormula(record, new Map()).evaluate.get(only.name);
  if (compiled === undefined) throw new Error(`no expression for '${id}'`);
  return compiled(inputs);
}

const canonical = (value: number, unit: string): number => toCanonical(value, parseUnit(unit));
const displayed = (value: number, unit: string): number => fromCanonical(value, parseUnit(unit));

describe('the bundled YAML running catalogue', () => {
  it('is public, namespaced, and mechanically valid', () => {
    expect(catalogue.id).toBe('public-running');
    expect(catalogue.restricted).toBe(false);
    expect(catalogue.formulas).toHaveLength(8);

    for (const entry of catalogue.formulas) {
      expect(entry.id).toMatch(/^running\./u);
      expect(entry.status).toBe('verified');
      expect(() => checkFormulaDimensions(entry), entry.id).not.toThrow();
    }
  });

  it('converts elapsed time to pace and back', () => {
    const pace = evaluate('running.pace.from-time', {
      t: canonical(50, 'min'),
      d: canonical(10, 'km'),
    });
    expect(displayed(pace, 'min/km')).toBeCloseTo(5, 9);

    const time = evaluate('running.time.from-pace', {
      p: pace,
      d: canonical(21.0975, 'km'),
    });
    expect(displayed(time, 'min')).toBeCloseTo(105.4875, 9);
  });

  it('converts pace to speed and back', () => {
    const speed = evaluate('running.speed.from-pace', {
      p: canonical(5, 'min/km'),
    });
    expect(displayed(speed, 'km/h')).toBeCloseTo(12, 9);

    const pace = evaluate('running.pace.from-speed', { v: speed });
    expect(displayed(pace, 'min/km')).toBeCloseTo(5, 9);
  });

  it('projects a race result with an explicit fatigue exponent', () => {
    const projected = evaluate('running.race.project-time', {
      t_1: canonical(25, 'min'),
      d_1: canonical(5, 'km'),
      d_2: canonical(10, 'km'),
      k: 1.06,
    });
    expect(displayed(projected, 'min')).toBeCloseTo(52.1233, 4);
  });

  it('estimates a hilly route and reports grade and climbing rate', () => {
    const time = evaluate('running.route.adjusted-time', {
      d: canonical(10, 'km'),
      p_flat: canonical(5, 'min/km'),
      ascent: canonical(500, 'm'),
      p_climb: canonical(10, 'min/km'),
    });
    expect(displayed(time, 'min')).toBeCloseTo(55, 9);

    const grade = evaluate('running.route.average-grade', {
      rise: canonical(500, 'm'),
      run: canonical(10, 'km'),
    });
    expect(displayed(grade, '%')).toBeCloseTo(5, 9);

    const verticalSpeed = evaluate('running.route.vertical-speed', {
      ascent: canonical(500, 'm'),
      t: canonical(1, 'h'),
    });
    expect(displayed(verticalSpeed, 'm/h')).toBeCloseTo(500, 9);
  });
});
