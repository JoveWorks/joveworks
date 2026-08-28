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

  it('splits a fail→pass crossing into start, boundary, and end — the boundary is already the first passing point', () => {
    const four: Axis = { ...axis, length: 4 };
    const reading = { series: series([30, 13, 5, 1], [four]), unit: mpa };
    expect(summariseCheck(reading, [false, false, true, true])).toEqual([
      { text: '30 MPa', state: 'fail' },
      { text: '5 MPa', state: 'boundary' },
      { text: '1 MPa', state: 'pass' },
    ]);
  });

  it('splits a pass→fail crossing so the boundary names the last passing point, not the first failing one', () => {
    const four: Axis = { ...axis, length: 4 };
    const reading = { series: series([1, 5, 13, 30], [four]), unit: mpa };
    expect(summariseCheck(reading, [true, true, false, false])).toEqual([
      { text: '1 MPa', state: 'pass' },
      { text: '5 MPa', state: 'boundary' },
      { text: '30 MPa', state: 'fail' },
    ]);
  });

  it('splits two crossings into start, both boundaries, and end — a limit briefly exceeded', () => {
    const six: Axis = { ...axis, length: 6 };
    const reading = { series: series([5, 13, 40, 35, 20, 9], [six]), unit: mpa };
    expect(summariseCheck(reading, [true, true, false, false, true, true])).toEqual([
      { text: '5 MPa', state: 'pass' },
      { text: '13 MPa', state: 'boundary' },
      { text: '20 MPa', state: 'boundary' },
      { text: '9 MPa', state: 'pass' },
    ]);
  });

  it('collapses the start into the boundary when the crossing happens at the very first point', () => {
    const three: Axis = { ...axis, length: 3 };
    const reading = { series: series([5, 30, 32], [three]), unit: mpa };
    expect(summariseCheck(reading, [true, false, false])).toEqual([
      { text: '5 MPa', state: 'boundary' },
      { text: '32 MPa', state: 'fail' },
    ]);
  });

  it('collapses the end into the boundary when the crossing happens at the very last point', () => {
    const three: Axis = { ...axis, length: 3 };
    const reading = { series: series([32, 30, 5], [three]), unit: mpa };
    expect(summariseCheck(reading, [false, false, true])).toEqual([
      { text: '32 MPa', state: 'fail' },
      { text: '5 MPa', state: 'boundary' },
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
