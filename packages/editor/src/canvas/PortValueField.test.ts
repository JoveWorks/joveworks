/**
 * What a value typed on a port row means — the reading and writing halves of
 * `PortValueField`, which is all of it that is not the shared `TextField`.
 */

import { describe, expect, it } from 'vitest';

import { PLAIN_NUMBER_FORMAT, UnitError, parseGenericDimension, parseUnit } from '@joveworks/units';
import type { Series } from '@joveworks/kernel';
import type { NumericPort } from '@joveworks/schema';

import { portFieldText, portFieldValue } from './PortValueField';
import { withInputValue } from '../model/document';

const format = PLAIN_NUMBER_FORMAT;
const millimetres: NumericPort = { kind: 'numeric', name: 'd', unit: parseUnit('mm') };
const withDefault: NumericPort = { ...millimetres, default: 45 };
const dimensionless: NumericPort = { kind: 'numeric', name: 'k', unit: parseUnit(''), default: 1500 };
const generic: NumericPort = { kind: 'numeric', name: 'a', unit: parseGenericDimension('$A') };

describe('what a port field shows', () => {
  it('shows nothing for a port with no value and no declared default', () => {
    expect(portFieldText(millimetres, undefined, format)).toBe('');
  });

  it('shows the catalogue default until something is typed over it', () => {
    expect(portFieldText(withDefault, undefined, format)).toBe('45 mm');
    expect(
      portFieldText(withDefault, { kind: 'scalar', value: 38, unit: parseUnit('mm') }, format),
    ).toBe('38 mm');
  });

  it('shows a generic port empty, since its declared default has no unit to be read in', () => {
    expect(portFieldText({ ...generic, default: 2 } as NumericPort, undefined, format)).toBe('');
  });

  it('reads a slider back as the number it currently holds', () => {
    const slider = { kind: 'slider' as const, value: 12, unit: parseUnit('mm'), min: 0, max: 20 };
    expect(portFieldText(millimetres, slider, format)).toBe('12 mm');
  });

  it('shows the value supplied by a wire instead of the stored default', () => {
    const supplied = {
      series: { kind: 'numeric', data: [72], axes: [] } as Series,
      unit: parseUnit('mm'),
    };
    expect(portFieldText(withDefault, undefined, format, supplied)).toBe('72 mm');
  });

  it('shows the extent supplied by a swept wire', () => {
    const supplied = {
      series: {
        kind: 'numeric',
        data: [20, 30, 40],
        axes: [{ id: 'd', label: 'diameter', values: [20, 30, 40], length: 3 }],
      } as Series,
      unit: parseUnit('mm'),
    };
    expect(portFieldText(withDefault, undefined, format, supplied)).toBe('20 mm … 40 mm');
  });
});

describe('what typing into a port field commits', () => {
  it('takes the port’s own unit for a bare number, so the field redraws carrying it', () => {
    const committed = portFieldValue('38', parseUnit('mm'), format);
    expect(committed).toMatchObject({ kind: 'scalar', value: 38 });
    expect(committed?.kind === 'scalar' && committed.unit.symbol).toBe('mm');
    expect(portFieldText(millimetres, committed, format)).toBe('38 mm');
  });

  it('never overrides a unit that was actually typed', () => {
    const committed = portFieldValue('2 cm', parseUnit('mm'), format);
    expect(committed?.kind === 'scalar' && committed.unit.symbol).toBe('cm');
  });

  it('leaves a bare number dimensionless where the port itself is', () => {
    const committed = portFieldValue('1730', parseUnit(''), format);
    expect(committed?.kind === 'scalar' && committed.unit.dimension).toEqual(parseUnit('').dimension);
  });

  it('leaves a bare number dimensionless on a generic port nothing has bound yet', () => {
    const committed = portFieldValue('5', undefined, format);
    expect(committed?.kind === 'scalar' && committed.unit.symbol).toBe('');
  });

  it('clears on an emptied field rather than committing a zero', () => {
    expect(portFieldValue('', parseUnit('mm'), format)).toBeUndefined();
    expect(portFieldValue('   ', parseUnit('mm'), format)).toBeUndefined();
  });

  it('still refuses text that is not a value at all — the field keeps it and says so', () => {
    expect(() => portFieldValue('about 40', parseUnit('mm'), format)).toThrow(UnitError);
  });
});

describe('storing it on the node', () => {
  const node = { kind: 'formula' as const, id: 'n', position: { x: 0, y: 0 }, formula: { id: 'f', version: 1, hash: 'a' } };
  const value = { kind: 'scalar' as const, value: 38, unit: parseUnit('mm') };

  it('keeps the other ports’ values when one changes', () => {
    const both = withInputValue(withInputValue(node, 'd', value), 'h', value);
    expect(Object.keys(both.inputValues ?? {})).toEqual(['d', 'h']);
  });

  it('drops the key on a clear, so the catalogue default applies again', () => {
    const cleared = withInputValue(withInputValue(node, 'd', value), 'd', undefined);
    expect(cleared.inputValues).toBeUndefined();
    expect('inputValues' in cleared).toBe(false);
  });

  it('drops only the cleared port, not the ones still typed', () => {
    const typed = withInputValue(withInputValue(node, 'd', value), 'h', value);
    expect(Object.keys(withInputValue(typed, 'd', undefined).inputValues ?? {})).toEqual(['h']);
  });
});
