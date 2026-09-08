import { describe, expect, it } from 'vitest';

import type { TableColumnResult } from '@joveworks/kernel';
import { parseUnit, type NumberFormat } from '@joveworks/units';

import { csvSeparator, tableCsv } from './csv';

const PLAIN: NumberFormat = { notation: 'auto', thousands: '', decimal: '.' };
// Dutch-style punctuation: the app's own `dot-thousands` preset.
const DUTCH: NumberFormat = { notation: 'auto', thousands: '.', decimal: ',' };
// `comma-thousands`: decimal stays `.`, but grouping itself is a `,` — the
// case that forces quoting even when the separator is a plain `,`.
const US_GROUPED: NumberFormat = { notation: 'auto', thousands: ',', decimal: '.' };

const load: TableColumnResult = {
  name: 'load',
  unit: parseUnit('N'),
  series: { kind: 'numeric', axes: [], data: [10, 1234.5] },
};

const grade: TableColumnResult = {
  name: 'grade',
  unit: parseUnit(''),
  series: { kind: 'categorical', axes: [], data: ['S235', 'S355'] },
};

describe('csvSeparator', () => {
  it('uses a plain comma when the decimal separator is a dot', () => {
    expect(csvSeparator(PLAIN)).toBe(',');
    expect(csvSeparator(US_GROUPED)).toBe(',');
  });

  it('switches to a semicolon when the decimal separator is a comma, so a comma-decimal file still opens into columns', () => {
    expect(csvSeparator(DUTCH)).toBe(';');
  });
});

describe('tableCsv', () => {
  it('headers each column with its name and unit, the same reading as the table heading', () => {
    const csv = tableCsv([load], undefined, PLAIN);
    expect(csv.split('\r\n')[0]).toBe('load (N)');
  });

  it('marks a dimensionless column the same way the table heading does', () => {
    const csv = tableCsv([grade], undefined, PLAIN);
    expect(csv.split('\r\n')[0]).toBe('grade (—)');
  });

  it('renders values at the default column figures when the author set none', () => {
    const csv = tableCsv([load], undefined, PLAIN);
    expect(csv.split('\r\n')).toEqual(['load (N)', '10.0000', '1234.5000']);
  });

  it('renders values at the author-chosen per-column figures', () => {
    const csv = tableCsv([load], { load: 1 }, PLAIN);
    expect(csv.split('\r\n')).toEqual(['load (N)', '10.0', '1234.5']);
  });

  it('passes a categorical cell through unchanged, not through number formatting', () => {
    const csv = tableCsv([grade], undefined, PLAIN);
    expect(csv.split('\r\n')).toEqual(['grade (—)', 'S235', 'S355']);
  });

  it('leaves a missing cell (a shorter column broadcast against a longer one) blank', () => {
    const short: TableColumnResult = { ...load, series: { kind: 'numeric', axes: [], data: [10] } };
    const csv = tableCsv([short, grade], undefined, PLAIN);
    expect(csv.split('\r\n')).toEqual(['load (N),grade (—)', '10.0000,S235', ',S355']);
  });

  it('writes a comma-decimal table with a semicolon separator, so the comma decimal is not mistaken for a field boundary', () => {
    const csv = tableCsv([load], { load: 1 }, DUTCH);
    expect(csv.split('\r\n')).toEqual(['load (N)', '10,0', '1.234,5']);
  });

  it('quotes a numeric field whose thousands grouping collides with a plain-comma separator', () => {
    const csv = tableCsv([load], { load: 1 }, US_GROUPED);
    expect(csv.split('\r\n')).toEqual(['load (N)', '10.0', '"1,234.5"']);
  });

  it('quotes a header or cell that itself contains the separator, doubling any embedded quote', () => {
    const weird: TableColumnResult = {
      name: 'a,b',
      unit: parseUnit(''),
      series: { kind: 'categorical', axes: [], data: ['has "quotes", too'] },
    };
    const csv = tableCsv([weird], undefined, PLAIN);
    expect(csv.split('\r\n')).toEqual(['"a,b (—)"', '"has ""quotes"", too"']);
  });
});
