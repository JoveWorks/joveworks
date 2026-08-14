import { describe, expect, it } from 'vitest';

import { axisLength, isRange, parseValueSpec, serializeValueSpec } from './value.js';
import { canonicalValue } from './quantity.js';
import type { JsonObject } from './json.js';

const roundTrip = (json: JsonObject) => serializeValueSpec(parseValueSpec(json, 'value'));

/** Parse something that must be a range, and report how long its axis is. */
const lengthOf = (json: JsonObject) => {
  const value = parseValueSpec(json, 'value');
  if (!isRange(value)) throw new Error(`${value.kind} is not a range`);
  return axisLength(value);
};

describe('single values', () => {
  it('keeps the number as authored, and converts only on request', () => {
    const value = parseValueSpec({ kind: 'scalar', value: 250, unit: 'kW' }, 'v');
    expect(serializeValueSpec(value)).toEqual({ kind: 'scalar', value: 250, unit: 'kW' });
    // 250 kW in canonical N·mm/s.
    expect(value.kind).toBe('scalar');
    if (value.kind === 'scalar') expect(canonicalValue(value)).toBeCloseTo(250e6, 6);
  });

  it('round-trips a 1450 rpm input exactly, rather than through the boundary', () => {
    const json = { kind: 'scalar', value: 1450, unit: 'rpm' } as const;
    expect(roundTrip(json)).toEqual(json);
  });

  it('introduces no axis', () => {
    expect(isRange(parseValueSpec({ kind: 'scalar', value: 1, unit: 'mm' }, 'v'))).toBe(false);
  });
});

describe('range kinds (S29)', () => {
  it('counts points, both endpoints included', () => {
    expect(lengthOf({ kind: 'linear', start: 20, stop: 60, points: 21, unit: 'mm' })).toBe(21);
  });

  it('requires at least two points', () => {
    const json = { kind: 'linear', start: 20, stop: 60, points: 1, unit: 'mm' };
    expect(() => parseValueSpec(json, 'v')).toThrow(/v\.points: expected an integer of at least 2/);
  });

  it('refuses a logarithmic range that touches zero', () => {
    const json = { kind: 'logarithmic', start: 0, stop: 1e8, points: 40, unit: '' };
    expect(() => parseValueSpec(json, 'v')).toThrow(/both endpoints above zero/);
  });

  it('carries an explicit list of standard sizes', () => {
    const json = { kind: 'list', values: [25, 30, 35, 40], unit: 'mm' } as const;
    expect(roundTrip(json)).toEqual(json);
    expect(lengthOf(json)).toBe(4);
  });

  it('sweeps categoricals by explicit list only (S38)', () => {
    const json = { kind: 'categoricalList', values: ['H7', 'H8', 'K7'] } as const;
    expect(roundTrip(json)).toEqual(json);
    expect(lengthOf(json)).toBe(3);
    // There is no spacing between H7 and K7, so a linear range over them is not
    // a thing the schema can express: its endpoints have to be numbers.
    expect(() =>
      parseValueSpec({ kind: 'linear', start: 'H7', stop: 'K7', points: 3, unit: '' }, 'v'),
    ).toThrow('v.start: expected a finite number, got a string');
  });

  it('leaves a table column length to the kernel', () => {
    const json = { kind: 'tableColumn', table: 'iso-fits', column: 'd' } as const;
    expect(roundTrip(json)).toEqual(json);
    expect(lengthOf(json)).toBeUndefined();
  });
});

describe('spectrum values (S36)', () => {
  it('is an explicit list and is not a range, so it introduces no axis', () => {
    const json = { kind: 'spectrum', values: [12, 30, 58], unit: 'kW' } as const;
    const value = parseValueSpec(json, 'v');
    expect(isRange(value)).toBe(false);
    expect(serializeValueSpec(value)).toEqual(json);
  });

  it('rejects an empty spectrum', () => {
    expect(() => parseValueSpec({ kind: 'spectrum', values: [], unit: 'kW' }, 'v')).toThrow(
      'v.values: is empty',
    );
  });
});
