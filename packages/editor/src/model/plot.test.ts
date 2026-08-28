import { describe, expect, it } from 'vitest';

import type { Axis, PlotAxis, PlotMeasureResult } from '@joveworks/kernel';
import { DOCUMENT_SCHEMA_VERSION, type GraphDocument, type GraphNode } from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import type { AxisNatures } from '../present/display';
import { axisNaturesOf, inferPlotPanels } from './plot';

const mm = parseUnit('mm');
const stress = parseUnit('MPa');
const mass = parseUnit('kg');

function axis(id: string, order: number, coordinates: readonly number[] | readonly string[]): PlotAxis {
  const definition: Axis = { id, label: id, length: coordinates.length, order };
  return {
    axis: definition,
    coordinates: typeof coordinates[0] === 'string'
      ? { kind: 'categorical', axes: [definition], data: coordinates as readonly string[] }
      : { kind: 'numeric', axes: [definition], data: coordinates as readonly number[] },
    unit: typeof coordinates[0] === 'string' ? parseUnit('') : mm,
  };
}

function measure(
  id: string,
  axes: readonly PlotAxis[],
  unit = stress,
  view?: PlotMeasureResult['view'],
): PlotMeasureResult {
  const length = axes.reduce((total, entry) => total * entry.axis.length, 1);
  return {
    id,
    label: id,
    series: { kind: 'numeric', axes: axes.map((entry) => entry.axis), data: Array.from({ length }, (_, i) => i + 1) },
    unit,
    axes,
    ...(view === undefined ? {} : { view }),
  };
}

/**
 * Inference takes resolved axis natures, not a graph — so these cases go
 * through the resolver that produces them, which is the only place the
 * document's range semantics are read.
 */
function documentWith(nodes: readonly GraphNode[]): AxisNatures {
  return axisNaturesOf({ schemaVersion: DOCUMENT_SCHEMA_VERSION, id: 'plot', title: 'Plot', nodes, edges: [], frames: [] });
}

function range(id: string, kind: 'linear' | 'logarithmic' | 'list' | 'categoricalList'): GraphNode {
  const value = kind === 'linear' || kind === 'logarithmic'
    ? { kind, start: 1, stop: 10, points: 3, unit: mm }
    : kind === 'list'
      ? { kind, values: [1, 2, 3], unit: mm }
      : { kind, values: ['A', 'B'] };
  return { kind: 'input', id, position: { x: 0, y: 0 }, value } as GraphNode;
}

describe('intelligent plot inference', () => {
  it('uses a line for one numeric sweep and dots for categories', () => {
    const x = axis('x', 0, [1, 2, 3]);
    const category = axis('grade', 0, ['A', 'B']);
    expect(inferPlotPanels(documentWith([range('x', 'linear')]), [measure('stress', [x])])[0]?.type).toBe('line');
    expect(inferPlotPanels(documentWith([range('grade', 'categoricalList')]), [measure('stress', [category])])[0]?.type).toBe('dot');
  });

  it('uses range semantics to choose contour versus heatmap', () => {
    const x = axis('x', 0, [1, 2, 3]);
    const y = axis('y', 1, [4, 5]);
    expect(inferPlotPanels(documentWith([range('x', 'linear'), range('y', 'logarithmic')]), [measure('z', [x, y])])[0]?.type).toBe('contour');
    expect(inferPlotPanels(documentWith([range('x', 'linear'), range('y', 'list')]), [measure('z', [x, y])])[0]?.type).toBe('heatmap');
  });

  it('puts a numeric axis on x and a categorical axis in series', () => {
    const x = axis('x', 0, [1, 2, 3]);
    const grade = axis('grade', 1, ['A', 'B']);
    const panel = inferPlotPanels(documentWith([range('x', 'linear'), range('grade', 'categoricalList')]), [measure('z', [grade, x])])[0];
    expect(panel?.type).toBe('line');
    expect(panel?.roles).toMatchObject({ x: 'x', series: 'grade' });
  });

  it('overlays compatible measures and stacks incompatible dimensions', () => {
    const x = axis('x', 0, [1, 2, 3]);
    const panels = inferPlotPanels(documentWith([range('x', 'linear')]), [
      measure('stressA', [x]),
      measure('stressB', [x]),
      measure('mass', [x], mass),
    ]);
    expect(panels.map((panel) => panel.measures.map((entry) => entry.id))).toEqual([
      ['stressA', 'stressB'],
      ['mass'],
    ]);
  });

  it('builds independent dashboard panels for different sweep signatures', () => {
    const x = axis('x', 0, [1, 2, 3]);
    const y = axis('y', 1, [4, 5]);
    const panels = inferPlotPanels(documentWith([range('x', 'linear'), range('y', 'linear')]), [
      measure('overX', [x]),
      measure('overY', [y]),
    ]);
    expect(panels).toHaveLength(2);
    expect(panels.map((panel) => panel.roles.x)).toEqual(['x', 'y']);
  });

  it('turns compatible scalars into one dot comparison', () => {
    const panels = inferPlotPanels(documentWith([]), [measure('a', [], mm), measure('b', [], mm)]);
    expect(panels).toHaveLength(1);
    expect(panels[0]?.type).toBe('dot');
    expect(panels[0]?.error).toBeUndefined();
    expect(inferPlotPanels(documentWith([]), [measure('only', [], mm)])[0]?.error).toMatch(/Value output/u);
  });

  it('facets a third axis and refuses a fourth without dropping it', () => {
    const axes = [
      axis('x', 0, [1, 2, 3]),
      axis('y', 1, [1, 2, 3]),
      axis('grade', 2, ['A', 'B']),
      axis('load', 3, [1, 2]),
    ];
    const document = documentWith([
      range('x', 'linear'), range('y', 'linear'), range('grade', 'categoricalList'), range('load', 'list'),
    ]);
    expect(inferPlotPanels(document, [measure('three', axes.slice(0, 3))])[0]?.roles.facet).toBe('grade');
    expect(inferPlotPanels(document, [measure('four', axes)])[0]?.error).toMatch(/at most three/u);
  });

  it('keeps explicit choices fixed and reports stale ones', () => {
    const x = axis('x', 0, [1, 2, 3]);
    const document = documentWith([range('x', 'linear')]);
    expect(inferPlotPanels(document, [measure('z', [x], stress, { type: 'dot' })])[0]?.reason).toBe('Pinned · dot');
    expect(inferPlotPanels(document, [measure('z', [x], stress, { x: 'gone' })])[0]?.error).toMatch(/no longer part/u);
  });

  it('refuses logarithmic overrides that cannot be drawn', () => {
    const category = axis('grade', 0, ['A', 'B']);
    const document = documentWith([range('grade', 'categoricalList')]);
    expect(inferPlotPanels(document, [measure('z', [category], stress, { scales: { grade: 'log' } })])[0]?.error)
      .toMatch(/numeric coordinates above zero/u);
    const negative = { ...measure('z', [], stress, { valueScale: 'log' }), series: { kind: 'numeric' as const, axes: [], data: [-1] } };
    expect(inferPlotPanels(documentWith([]), [negative])[0]?.error).toMatch(/above zero/u);
  });
});
