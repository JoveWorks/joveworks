// @vitest-environment jsdom

/**
 * Regression for the swatch-svg trap: Feasibility's `color.legend` makes
 * `Plot.plot` return a `<figure>` with the legend — built from swatches that
 * are themselves tiny `<svg>` elements — placed *before* the chart's own
 * `<svg>` in document order. An unscoped `chart.querySelector('svg')` finds a
 * swatch first and hands `typesetChartLabels` an element with no axis labels
 * on it, so it silently does nothing. `FeasibilityFigure.tsx` must resolve
 * the chart's own `<svg>` (`:scope > svg`), not just the first one anywhere
 * inside the figure.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Axis, FeasibilityResult } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';

import { SettingsContext, type SettingsContextValue } from '../settings-context';
import { FeasibilityFigure } from './FeasibilityFigure';

const mm = parseUnit('mm');

// `_{...}` is an unmistakable TeX marker (MATH_TOKEN, TitleField.tsx) — this
// is never a real Roloff & Matek label, just something typesetting has to
// react to.
const xAxis: Axis = { id: 'x', label: 'd_{outer}', length: 2, order: 0 };

const result: FeasibilityResult = {
  nodeId: 'feas',
  kind: 'feasibility',
  checks: ['check1'],
  axes: [xAxis],
  mask: [true, false],
  perCheck: [[true, false]],
  x: { axis: xAxis, coordinates: { kind: 'numeric', axes: [xAxis], data: [10, 20] }, unit: mm },
};

const settings: SettingsContextValue = {
  locale: 'en',
  setLocale: () => {},
  numberFormat: { style: 'plain', notation: 'si' },
  setNumberFormat: () => {},
  minimapVisible: false,
  setMinimapVisible: () => {},
  snapToGrid: false,
  setSnapToGrid: () => {},
  titleMathRendering: true,
  setTitleMathRendering: () => {},
  themePreference: 'system',
  setThemePreference: () => {},
  contourPalette: 'viridis',
  setContourPalette: () => {},
  advancedNodesEnabled: false,
  setAdvancedNodesEnabled: () => {},
};

beforeAll(() => {
  // jsdom implements no SVG geometry at all; `typesetChartLabels` only needs
  // a stable box to size the `<foreignObject>` it swaps each label into.
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 40, height: 12 }),
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('FeasibilityFigure axis label typesetting', () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('typesets the x axis label on the chart\'s own svg, not a legend swatch', () => {
    host = document.createElement('div');
    document.body.append(host);
    act(() => {
      root = createRoot(host);
      root.render(
        <SettingsContext.Provider value={settings}>
          <FeasibilityFigure result={result} checkLabels={{ check1: 'ok' }} />
        </SettingsContext.Provider>,
      );
    });

    // The legend renders first, and each swatch is its own <svg> — confirm
    // this case genuinely has a swatch to trip on, or the assertion below
    // proves nothing.
    const legendSwatchSvgs = host.querySelectorAll('.feasibility-plot-swatch svg');
    expect(legendSwatchSvgs.length).toBeGreaterThan(0);

    // typesetChartLabels replaces a matched <text> with a <foreignObject>
    // holding KaTeX markup. Under the pre-fix selector this list is empty.
    const foreignObjects = host.querySelectorAll('foreignObject');
    expect(foreignObjects.length).toBeGreaterThan(0);
    expect(Array.from(foreignObjects).some((node) => node.innerHTML.includes('katex'))).toBe(true);

    // The hatch <defs> must land in the same, correct svg — not silently
    // "work" only via document-wide id lookup from inside a swatch. Observable
    // appends the chart's own <svg> as a direct child of its <figure>
    // wrapper, one level below every legend swatch <svg>.
    const chartSvg = host.querySelector('figure > svg');
    expect(chartSvg?.querySelector('defs pattern')).not.toBeNull();
  });
});
