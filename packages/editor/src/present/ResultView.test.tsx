// @vitest-environment jsdom

/**
 * A marked design's reading under a print or check result is the same kind of
 * number as the reading beside it, so it is formatted the same way: unit,
 * significant figures and — under the 'si' number format — its prefix. It
 * used to be formatted like a table cell, bare and in the authored unit.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Axis, AxisReadout, CheckResult, PrintResult } from '@joveworks/kernel';
import { PLAIN_NUMBER_FORMAT, parseUnit } from '@joveworks/units';

import { DEFAULT_DISPLAY, DisplayProvider, type NotebookDisplay } from './display';
import { readOnlyMarking } from './marks';
import { ResultView } from './ResultView';

const newton = parseUnit('N');
const force: Axis = { id: 'F', label: 'F', length: 2, order: 0 };
const series = { kind: 'numeric' as const, axes: [force], data: [500, 12500] };
const readouts = new Map<string, AxisReadout>([
  ['F', { axis: force, coordinates: { kind: 'numeric', axes: [force], data: [1, 2] }, unit: newton }],
]);
const markingOver = (axes: readonly Axis[]) => readOnlyMarking([{ at: { F: 2 } }], axes, readouts);

const display: NotebookDisplay = { ...DEFAULT_DISPLAY, format: { ...PLAIN_NUMBER_FORMAT, notation: 'si' } };

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('a marked design’s reading under the si number format', () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const reading = (result: PrintResult | CheckResult): string | null => {
    host = document.createElement('div');
    document.body.append(host);
    act(() => {
      root = createRoot(host);
      root.render(
        <DisplayProvider value={display}>
          <ResultView result={result} title="force" markingOver={markingOver} />
        </DisplayProvider>,
      );
    });
    return host.querySelector('.candidate-reading')?.textContent ?? null;
  };

  it('prints a print result’s marked reading with its prefix and unit', () => {
    expect(reading({ nodeId: 'p', kind: 'print', series, unit: newton, figures: 4 })).toBe('A12.50 kN');
  });

  it('prints a check result’s marked reading with its prefix and unit', () => {
    const check: CheckResult = {
      nodeId: 'c',
      kind: 'check',
      series,
      unit: newton,
      comparison: '<=',
      threshold: 20000,
      results: [true, true],
      passed: true,
    };
    expect(reading(check)).toMatch(/^A12\.50 kN/u);
  });
});
