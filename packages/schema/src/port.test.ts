import { describe, expect, it } from 'vitest';

import { FORCE, LENGTH, DIMENSIONLESS } from '@mds/units';

import { SchemaError } from './errors.js';
import {
  asInputPort,
  asOutputPort,
  isGenericPort,
  parsePort,
  portDimension,
  serializePort,
  withinRange,
} from './port.js';
import type { JsonValue } from './json.js';

const numeric: JsonValue = { kind: 'numeric', name: 'F_t', unit: 'N' };

describe('numeric ports', () => {
  it('takes its dimension from its display unit, not a second declaration', () => {
    expect(portDimension(parsePort(numeric, 'port'))).toEqual(FORCE);
    expect(portDimension(parsePort({ ...numeric, unit: 'kN' }, 'port'))).toEqual(FORCE);
  });

  it('keeps the unit as the author wrote it', () => {
    const port = parsePort({ kind: 'numeric', name: 'sigma', unit: 'N/mm²' }, 'port');
    expect(serializePort(port)['unit']).toBe('N/mm²');
  });

  it("treats '%' as dimensionless with a display scale (S21)", () => {
    const port = parsePort({ kind: 'numeric', name: 'eta', unit: '%' }, 'port');
    expect(portDimension(port)).toEqual(DIMENSIONLESS);
  });

  it('rejects an unknown unit rather than guessing (S5)', () => {
    expect(() => parsePort({ ...numeric, unit: 'furlong' }, 'port')).toThrow(
      /port\.unit:.*unknown unit symbol/,
    );
  });

  it('rejects an undeclared unit', () => {
    expect(() => parsePort({ kind: 'numeric', name: 'F_t' }, 'inputs[0]')).toThrow(
      'inputs[0].unit: is required',
    );
  });

  it('rejects a default outside the valid range', () => {
    const json = { ...numeric, default: 900, validRange: { min: 0, max: 500 } };
    expect(() => parsePort(json, 'port')).toThrow(/port\.default: 900 is outside/);
  });

  it('rejects a valid range that is inverted or empty', () => {
    expect(() => parsePort({ ...numeric, validRange: { min: 5, max: 1 } }, 'p')).toThrow(
      'p.validRange: min 5 is above max 1',
    );
    expect(() => parsePort({ ...numeric, validRange: {} }, 'p')).toThrow(/neither a min nor a max/);
  });

  it('carries the range and monotonicity hint S17 asks for', () => {
    const port = parsePort(
      { ...numeric, default: 100, validRange: { min: 10, max: 500 }, monotonic: 'increasing' },
      'port',
    );
    expect(port).toMatchObject({ default: 100, monotonic: 'increasing' });
    expect(withinRange(600, { min: 10, max: 500 })).toBe(false);
    expect(withinRange(10, { min: 10 })).toBe(true);
  });
});

describe('categorical ports (S38)', () => {
  const fit: JsonValue = { kind: 'categorical', name: 'fit', domain: ['H7', 'H8', 'K7'] };

  it('round-trips its domain', () => {
    expect(serializePort(parsePort(fit, 'port'))).toEqual(fit);
  });

  it('rejects a default outside the declared domain', () => {
    expect(() => parsePort({ ...fit, default: 'H07' }, 'port')).toThrow(
      "port.default: 'H07' is not in the declared domain",
    );
  });

  it('rejects an empty or duplicated domain', () => {
    expect(() => parsePort({ ...fit, domain: [] }, 'p')).toThrow(/p\.domain: is empty/);
    expect(() => parsePort({ ...fit, domain: ['H7', 'H7'] }, 'p')).toThrow(/lists 'H7' twice/);
  });
});

describe('spectrum ports (S36)', () => {
  const spectrum: JsonValue = { kind: 'spectrum', name: 'P_i', unit: 'kW' };

  it('is an input only — a formula cannot produce one', () => {
    expect(() => asOutputPort(parsePort(spectrum, 'output'), 'output')).toThrow(
      /output: a spectrum is an input only/,
    );
  });

  it('lets a numeric port through as an output', () => {
    const port = parsePort({ kind: 'numeric', name: 'l', unit: 'mm' }, 'output');
    expect(portDimension(asOutputPort(port, 'output'))).toEqual(LENGTH);
  });
});

it('reports the path of the field at fault', () => {
  try {
    parsePort({ kind: 'numeric', name: '  ' }, 'formulas[2].inputs[1]');
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaError);
    expect((error as SchemaError).path).toBe('formulas[2].inputs[1].name');
  }
});

describe('generic ports (S59)', () => {
  it('has no dimension until the wiring binds one', () => {
    const port = parsePort({ kind: 'numeric', name: 'a', unit: '$A' }, 'port');
    expect(portDimension(port)).toBeUndefined();
    expect(isGenericPort(port)).toBe(true);
    expect(isGenericPort(parsePort(numeric, 'port'))).toBe(false);
  });

  it('keeps the signature as written, so a record round-trips', () => {
    const port = parsePort({ kind: 'numeric', name: 'p', unit: '$A*$B' }, 'port');
    expect(serializePort(port)['unit']).toBe('$A*$B');
  });

  it('refuses a default or a valid range — there is no unit for one to be in', () => {
    expect(() => parsePort({ kind: 'numeric', name: 'a', unit: '$A', default: 3 }, 'port')).toThrow(
      /is generic, so there is no unit/,
    );
    expect(() =>
      parsePort({ kind: 'numeric', name: 'a', unit: '$A', validRange: { min: 0 } }, 'port'),
    ).toThrow(/is generic, so there is no unit/);
  });

  it('requires an input signature to be a bare variable', () => {
    const bare = parsePort({ kind: 'numeric', name: 'a', unit: '$A' }, 'inputs[0]');
    expect(asInputPort(bare, 'inputs[0]')).toBe(bare);
    const compound = parsePort({ kind: 'numeric', name: 'a', unit: '$A*$B' }, 'inputs[0]');
    expect(() => asInputPort(compound, 'inputs[0]')).toThrow(/not a bare variable/);
    const squared = parsePort({ kind: 'numeric', name: 'a', unit: '$A**2' }, 'inputs[0]');
    expect(() => asInputPort(squared, 'inputs[0]')).toThrow(/not a bare variable/);
  });

  it('lets a spectrum port be generic — sum consumes a series of anything (S36)', () => {
    const port = parsePort({ kind: 'spectrum', name: 'xs', unit: '$A' }, 'port');
    expect(isGenericPort(port)).toBe(true);
    expect(portDimension(port)).toBeUndefined();
  });

  it('reports a malformed signature at the field that carried it', () => {
    expect(() => parsePort({ kind: 'numeric', name: 'a', unit: '$A*mm' }, 'port')).toThrow(
      /port\.unit:.*cannot mix in a concrete unit/,
    );
  });
});
