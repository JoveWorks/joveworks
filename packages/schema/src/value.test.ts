import { describe, expect, it } from 'vitest';

import { axisLength, isRange, parseValueSpec, renardValues, serializeValueSpec } from './value.js';
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

describe('slider values', () => {
  it('round-trips a value with its own travel bounds, and introduces no axis', () => {
    const json = { kind: 'slider', value: 20, min: 0, max: 60, unit: 'mm' } as const;
    const value = parseValueSpec(json, 'v');
    expect(isRange(value)).toBe(false);
    expect(roundTrip(json)).toEqual(json);
  });

  it('allows a value outside its own bounds — typed in, not clamped away', () => {
    const json = { kind: 'slider', value: 90, min: 0, max: 60, unit: 'mm' } as const;
    expect(roundTrip(json)).toEqual(json);
  });

  it('refuses a low end at or above the high end', () => {
    const json = { kind: 'slider', value: 20, min: 60, max: 60, unit: 'mm' };
    expect(() => parseValueSpec(json, 'v')).toThrow(/low end below its high end/);
  });
});

describe('range kinds', () => {
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

  it('sweeps categoricals by explicit list only', () => {
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

  it('expands a Renard series (ISO 3) to its standard numbers in range', () => {
    const json = { kind: 'renard', series: 'R20', start: 10, stop: 100, unit: 'mm' } as const;
    expect(roundTrip(json)).toEqual(json);
    // R20 puts twenty preferred numbers per decade, both endpoints included:
    // 10, 11.2, 12.5, ... 90, 100.
    expect(lengthOf(json)).toBe(21);
  });

  it('gives R5, R10, R20 and R40 the textbook preferred numbers for one decade', () => {
    expect(renardValues('R5', 1, 10)).toEqual([1.0, 1.6, 2.5, 4.0, 6.3, 10]);
    expect(renardValues('R10', 1, 10)).toEqual([1.0, 1.25, 1.6, 2.0, 2.5, 3.15, 4.0, 5.0, 6.3, 8.0, 10]);
  });

  it('refuses a Renard range that touches zero, same as a logarithmic one', () => {
    const json = { kind: 'renard', series: 'R20', start: 0, stop: 100, unit: 'mm' };
    expect(() => parseValueSpec(json, 'v')).toThrow(/both endpoints above zero/);
  });

  it('refuses a high end below the low end', () => {
    const json = { kind: 'renard', series: 'R20', start: 100, stop: 10, unit: 'mm' };
    expect(() => parseValueSpec(json, 'v')).toThrow(/high end must not be below/);
  });
});

describe('spectrum values', () => {
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
