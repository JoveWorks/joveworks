// @vitest-environment jsdom

/**
 * Regression for the vanishing primary axis: Observable Plot drops its
 * *implicit* axis for a scale the moment any explicit axis mark claims that
 * scale. A panel whose measures differ in dimension draws each extra measure
 * as a right-anchored `Plot.axisY`, so before the fix those marks took the
 * chart's own left-hand y axis away with them and the primary measure was
 * left with numbers nobody could read.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Axis, PlotAxis, PlotMeasureResult, PlotResult } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';

import { IntelligentPlotFigure } from './IntelligentPlotFigure';

const mm = parseUnit('mm');
const newton = parseUnit('N');

const width: Axis = { id: 'width', label: 'width', length: 3, order: 0 };
const widthReadout: PlotAxis = {
  axis: width,
  coordinates: { kind: 'numeric', axes: [width], data: [10, 20, 30] },
  unit: mm,
};

function measure(id: string, label: string, data: readonly number[], unit: typeof mm): PlotMeasureResult {
  return {
    id,
    label,
    series: { kind: 'numeric', axes: [width], data },
    unit,
    axes: [widthReadout],
  };
}

/** A deflection in mm and a load in N: two dimensions, so two value axes. */
const twoDimensions: PlotResult = {
  nodeId: 'plot',
  kind: 'plot',
  measures: [
    measure('deflection', 'deflection', [1, 2, 3], mm),
    measure('load', 'load', [400, 500, 600], newton),
  ],
  series: { kind: 'numeric', axes: [width], data: [1, 2, 3] },
  unit: mm,
  x: widthReadout,
  contour: false,
};

/** The same panel with one dimension, to prove the axis was ever there. */
const oneDimension: PlotResult = {
  ...twoDimensions,
  measures: [
    measure('deflection', 'deflection', [1, 2, 3], mm),
    measure('clearance', 'clearance', [4, 5, 6], mm),
  ],
};

function yAxisAnchors(host: HTMLElement): readonly string[] {
  // Plot marks each axis group `aria-label="y-axis tick"`; the left axis is
  // the one whose ticks sit outside the frame's left edge (negative dx), the
  // right-anchored ones translate positively.
  return Array.from(host.querySelectorAll('g[aria-label="y-axis tick label"]'))
    .map((group) => {
      const match = /translate\((-?[\d.]+)/.exec(group.getAttribute('transform') ?? '');
      return match === null || Number(match[1]) < 0 ? 'left' : 'right';
    });
}

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 40, height: 12 }),
  });
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('a plot panel with a secondary value axis', () => {
  let host: HTMLDivElement;
  let root: Root;

  function render(result: PlotResult): void {
    host = document.createElement('div');
    document.body.append(host);
    act(() => {
      root = createRoot(host);
      root.render(<IntelligentPlotFigure result={result} />);
    });
  }

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('keeps the primary y axis when a second one is added', () => {
    render(twoDimensions);
    const anchors = yAxisAnchors(host);
    // The case has to genuinely have a second axis, or the assertion below
    // passes for the wrong reason.
    expect(anchors).toContain('right');
    expect(anchors).toContain('left');
  });

  it('draws exactly one y axis when every measure shares a dimension', () => {
    render(oneDimension);
    expect(yAxisAnchors(host)).toEqual(['left']);
  });
});
