import { describe, expect, it } from 'vitest';

import type { Axis, NumericSeries } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';

import { summariseCheck } from './values';

const axis: Axis = { id: 'x', label: 'x', length: 3, order: 0 };
const mpa = parseUnit('MPa');

const series = (data: readonly number[], axes: readonly Axis[] = [axis]): NumericSeries => ({
  kind: 'numeric',
  axes,
  data,
});

describe('summariseCheck', () => {
  it('colours a scalar reading by its single verdict', () => {
    const reading = { series: series([5], []), unit: mpa };
    expect(summariseCheck(reading, [true])).toEqual([{ text: '5 MPa', state: 'pass' }]);
    expect(summariseCheck(reading, [false])).toEqual([{ text: '5 MPa', state: 'fail' }]);
  });

  it('collapses a fully passing sweep to one green range', () => {
    const reading = { series: series([5, 13, 20]), unit: mpa };
    expect(summariseCheck(reading, [true, true, true])).toEqual([
      { text: '5 MPa … 20 MPa', state: 'pass' },
    ]);
  });

  it('collapses a fully failing sweep to one red range', () => {
    const reading = { series: series([5, 13, 20]), unit: mpa };
    expect(summariseCheck(reading, [false, false, false])).toEqual([
      { text: '5 MPa … 20 MPa', state: 'fail' },
    ]);
  });

  it('splits a single crossing into start, boundary, and end segments — the boundary is the first failing point', () => {
    const reading = { series: series([5, 13, 30]), unit: mpa };
    expect(summariseCheck(reading, [true, false, false])).toEqual([
      { text: '5 MPa', state: 'pass' },
      { text: '13 MPa', state: 'boundary' },
      { text: '30 MPa', state: 'fail' },
    ]);
  });

  it('finds the boundary at the first crossing when there is more than one point on either side', () => {
    const four: Axis = { ...axis, length: 4 };
    const reading = { series: series([1, 5, 13, 30], [four]), unit: mpa };
    expect(summariseCheck(reading, [true, true, false, false])).toEqual([
      { text: '1 MPa', state: 'pass' },
      { text: '13 MPa', state: 'boundary' },
      { text: '30 MPa', state: 'fail' },
    ]);
  });

  it('splits two crossings into start, both boundaries, and end — a limit briefly exceeded', () => {
    const six: Axis = { ...axis, length: 6 };
    const reading = { series: series([5, 13, 40, 38, 13, 5], [six]), unit: mpa };
    expect(summariseCheck(reading, [true, true, false, false, true, true])).toEqual([
      { text: '5 MPa', state: 'pass' },
      { text: '40 MPa', state: 'boundary' },
      { text: '13 MPa', state: 'boundary' },
      { text: '5 MPa', state: 'pass' },
    ]);
  });

  it('falls back to the plain range when a sweep crosses more than twice', () => {
    const four: Axis = { ...axis, length: 4 };
    const reading = { series: series([5, 30, 5, 30], [four]), unit: mpa };
    expect(summariseCheck(reading, [true, false, true, false])).toEqual([
      { text: '5 MPa … 30 MPa', state: 'mixed' },
    ]);
  });

  it('returns nothing for an empty series', () => {
    const reading = { series: series([], []), unit: mpa };
    expect(summariseCheck(reading, [])).toEqual([]);
  });
});
