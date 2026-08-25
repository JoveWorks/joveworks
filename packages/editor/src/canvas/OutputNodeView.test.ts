import { describe, expect, it } from 'vitest';

import { PLAIN_NUMBER_FORMAT, parseUnit } from '@joveworks/units';

import { thresholdFieldText } from './OutputNodeView';

const fallback = { value: 45, unit: parseUnit('mm') };
const supplied = {
  series: { kind: 'numeric' as const, data: [72], axes: [] },
  unit: parseUnit('mm'),
};

describe('check threshold field', () => {
  it('shows the stored fallback while unwired', () => {
    expect(thresholdFieldText(false, supplied, fallback, PLAIN_NUMBER_FORMAT)).toBe('45 mm');
  });

  it('shows the evaluated port value while wired', () => {
    expect(thresholdFieldText(true, supplied, fallback, PLAIN_NUMBER_FORMAT)).toBe('72 mm');
  });

  it('does not misrepresent the fallback as live while a wire is blocked', () => {
    expect(thresholdFieldText(true, undefined, fallback, PLAIN_NUMBER_FORMAT)).toBe('');
  });
});
