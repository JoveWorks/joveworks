import { describe, expect, it } from 'vitest';

import type { Axis, OutputResult, PlotAxis, PlotMeasureResult } from '@joveworks/kernel';
import {
  DOCUMENT_SCHEMA_VERSION,
  effectivePlotView,
  plotViewChanged,
  type GraphDocument,
  type GraphNode,
  type PlotMeasure,
} from '@joveworks/schema';
import { parseUnit } from '@joveworks/units';

import type { AxisNatures } from '../present/display';
import {
  assignRole,
  axisIdSetSignature,
  axisNaturesOf,
  inferPlotPanels,
  inferPlotView,
  retype,
  settlePlots,
  structuralViewOf,
} from './plot';

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

  it('overlays measures sharing a dimension on one value axis, and gives a different dimension a second axis rather than a second panel', () => {
    const x = axis('x', 0, [1, 2, 3]);
    const panels = inferPlotPanels(documentWith([range('x', 'linear')]), [
      measure('stressA', [x]),
      measure('stressB', [x]),
      measure('mass', [x], mass),
    ]);
    expect(panels).toHaveLength(1);
    expect(panels[0]?.measures.map((entry) => entry.id)).toEqual(['stressA', 'stressB', 'mass']);
    expect(panels[0]?.valueAxes.map((valueAxis) => valueAxis.measures.map((entry) => entry.id))).toEqual([
      ['stressA', 'stressB'],
      ['mass'],
    ]);
    expect(panels[0]?.error).toBeUndefined();
  });

  it('refuses a panel that would need a fourth value axis, without dropping any measure', () => {
    const x = axis('x', 0, [1, 2, 3]);
    const seconds = parseUnit('s');
    const kelvin = parseUnit('K');
    const panels = inferPlotPanels(documentWith([range('x', 'linear')]), [
      measure('stress', [x], stress),
      measure('mass', [x], mass),
      measure('time', [x], seconds),
      measure('temperature', [x], kelvin),
    ]);
    expect(panels).toHaveLength(1);
    expect(panels[0]?.measures).toHaveLength(4);
    expect(panels[0]?.valueAxes).toHaveLength(4);
    expect(panels[0]?.error).toMatch(/at most 3 y axes/u);
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

describe('axis signature (shared with the editor connect-time check)', () => {
  it('is order-independent and de-duplicates', () => {
    expect(axisIdSetSignature(['x', 'y'])).toBe(axisIdSetSignature(['y', 'x']));
    expect(axisIdSetSignature(['x', 'x', 'y'])).toBe(axisIdSetSignature(['x', 'y']));
  });

  it('tells apart two different swept-axis sets', () => {
    expect(axisIdSetSignature(['x'])).not.toBe(axisIdSetSignature(['y']));
    expect(axisIdSetSignature([])).not.toBe(axisIdSetSignature(['x']));
  });
});

function values(entry: PlotMeasureResult, data: readonly number[]): PlotMeasureResult {
  return { ...entry, series: { ...entry.series, data } };
}

describe('inferring a complete view', () => {
  const lists = documentWith([range('x', 'list'), range('y', 'list')]);

  it('draws a numeric grid of four by four or more as a contour, and a smaller one as a heatmap', () => {
    expect(inferPlotView(lists, [measure('z', [axis('x', 0, [1, 2, 3, 4, 5]), axis('y', 1, [1, 2, 3, 4])])]).type).toBe('contour');
    expect(inferPlotView(lists, [measure('z', [axis('x', 0, [1, 2, 3]), axis('y', 1, [1, 2, 3, 4, 5])])]).type).toBe('heatmap');
  });

  it('leaves a numeric × categorical grid as it was', () => {
    const natures = documentWith([range('x', 'list'), range('grade', 'categoricalList')]);
    const view = inferPlotView(natures, [measure('z', [axis('x', 0, [1, 2, 3, 4]), axis('grade', 1, ['A', 'B', 'C', 'D'])])]);
    expect(view).toMatchObject({ type: 'line', x: 'x', series: 'grade' });
  });

  it('keeps short continuous ranges a contour, as today', () => {
    const natures = documentWith([range('x', 'linear'), range('y', 'linear')]);
    expect(inferPlotView(natures, [measure('z', [axis('x', 0, [1, 2, 3]), axis('y', 1, [4, 5])])]).type).toBe('contour');
  });

  it('chooses a log value scale at three decades of positive values', () => {
    const x = axis('x', 0, [1, 2, 3, 4]);
    const natures = documentWith([range('x', 'linear')]);
    expect(inferPlotView(natures, [values(measure('z', [x]), [1, 10, 100, 10_000])]).valueScale).toBe('log');
    expect(inferPlotView(natures, [values(measure('z', [x]), [1, 10, 100, 500])]).valueScale).toBe('linear');
    expect(inferPlotView(natures, [values(measure('z', [x]), [0, 10, 100, 10_000])]).valueScale).toBe('linear');
    expect(inferPlotView(natures, [values(measure('z', [x]), [-1, 10, 100, 10_000])]).valueScale).toBe('linear');
  });

  it('writes every numeric axis scale down, log for a log-spaced range', () => {
    const view = inferPlotView(documentWith([range('x', 'logarithmic')]), [measure('z', [axis('x', 0, [1, 10, 100])])]);
    expect(view).toEqual({ type: 'line', x: 'x', scales: { x: 'log' }, valueScale: 'linear' });
  });

  it('reads the same shape back off a drawn panel', () => {
    const natures = documentWith([range('x', 'logarithmic')]);
    const entry = measure('z', [axis('x', 0, [1, 10, 100])]);
    const panel = inferPlotPanels(natures, [entry])[0];
    expect(panel === undefined ? undefined : structuralViewOf(natures, panel)).toEqual(inferPlotView(natures, [entry]));
  });
});

describe('settling plots', () => {
  const x = axis('x', 0, [1, 2, 3, 4, 5]);
  const y = axis('y', 1, [1, 2, 3, 4]);
  const natures = documentWith([range('x', 'list'), range('y', 'list')]);

  function plotDocument(measures: readonly PlotMeasure[]): GraphDocument {
    return {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      id: 'plot',
      title: 'Plot',
      nodes: [
        { kind: 'output', id: 'plot', position: { x: 0, y: 0 }, output: { kind: 'plot', measures } } as GraphNode,
      ],
      edges: [],
      frames: [],
    };
  }

  function storedMeasures(document: GraphDocument): readonly PlotMeasure[] {
    const node = document.nodes[0];
    return node?.kind === 'output' && node.output.kind === 'plot' ? node.output.measures ?? [] : [];
  }

  /** What the kernel would hand back: each base result with the stored measure's effective view. */
  function evaluate(document: GraphDocument, base: readonly PlotMeasureResult[]): readonly OutputResult[] {
    const stored = new Map(storedMeasures(document).map((entry) => [entry.id, entry]));
    const measures = base.flatMap((result) => {
      const entry = stored.get(result.id);
      if (entry === undefined) return [];
      const view = effectivePlotView(entry);
      const inferred = !plotViewChanged(entry.view) && entry.inferred !== undefined;
      const { view: _view, ...rest } = result;
      return [{ ...rest, ...(view === undefined ? {} : { view }), ...(inferred ? { viewInferred: true as const } : {}) }];
    });
    return [{ kind: 'plot', nodeId: 'plot', measures } as unknown as OutputResult];
  }

  /** Settle until nothing changes, failing on a loop. */
  function settle(
    document: GraphDocument,
    base: readonly PlotMeasureResult[],
    seen: Map<string, string> | undefined,
  ): { readonly document: GraphDocument; readonly seen: Map<string, string> } {
    const first = settlePlots(document, evaluate(document, base), natures, seen);
    const second = settlePlots(first.document, evaluate(first.document, base), natures, first.seen);
    expect(second.document).toBe(first.document);
    return second;
  }

  const grid = [measure('value', [x, y])];

  it('writes nothing for a legacy plot on the first settle after opening', () => {
    const document = plotDocument([{ id: 'value' }]);
    const settled = settlePlots(document, evaluate(document, grid), natures, undefined);
    expect(settled.document).toBe(document);
    expect(settled.seen.get('plot:value')).toBe('x|y#value');
  });

  it('infers a legacy plot once it is rewired, and then reaches a fixed point', () => {
    const document = plotDocument([{ id: 'value' }]);
    const settled = settle(document, grid, new Map([['plot:value', 'x#value']]));
    expect(storedMeasures(settled.document)[0]?.inferred).toEqual({
      signature: 'x|y#value',
      view: { type: 'contour', x: 'x', y: 'y', scales: { x: 'linear', y: 'linear' }, valueScale: 'linear' },
    });
  });

  it('infers a plot wired during this session', () => {
    const settled = settle(plotDocument([{ id: 'value' }]), grid, new Map());
    expect(storedMeasures(settled.document)[0]?.inferred?.view.type).toBe('contour');
  });

  it('never modifies a changed measure, whatever its signature', () => {
    const document = plotDocument([{ id: 'value', view: { type: 'heatmap', valueLabel: 'stress' } }]);
    expect(settle(document, grid, new Map([['plot:value', 'other']])).document).toBe(document);
  });

  it('keeps a cosmetic-only view through re-inference', () => {
    const document = plotDocument([{ id: 'value', view: { valueLabel: 'stress', height: 300 }, inferred: { signature: 'x#value', view: { type: 'line', x: 'x' } } }]);
    const settled = settle(document, grid, new Map([['plot:value', 'x#value']]));
    const stored = storedMeasures(settled.document)[0];
    expect(stored?.view).toEqual({ valueLabel: 'stress', height: 300 });
    expect(stored?.inferred?.view.type).toBe('contour');
  });

  it('replaces an inferred log scale once a value reaches zero', () => {
    const line = [values(measure('value', [x]), [1, 10, 100, 1000, 10_000])];
    const start = settle(plotDocument([{ id: 'value' }]), line, new Map());
    expect(storedMeasures(start.document)[0]?.inferred?.view.valueScale).toBe('log');
    const zero = [values(measure('value', [x]), [0, 10, 100, 1000, 10_000])];
    const settled = settle(start.document, zero, start.seen);
    expect(storedMeasures(settled.document)[0]?.inferred?.view.valueScale).toBe('linear');
  });

  it('does not rewrite a plot whose error inference cannot fix', () => {
    const four = [measure('value', [x, y, axis('p', 2, [1, 2]), axis('q', 3, [1, 2])])];
    const start = settle(plotDocument([{ id: 'value' }]), four, new Map());
    expect(settle(start.document, four, start.seen).document).toBe(start.document);
  });

  it('records but does not infer a plot whose result arrives after opening', () => {
    const document = plotDocument([{ id: 'value' }]);
    const opened = settlePlots(document, evaluate(document, []), natures, undefined);
    expect(opened.document).toBe(document);
    const loaded = settle(document, grid, opened.seen);
    expect(loaded.document).toBe(document);
    expect(loaded.seen.get('plot:value')).toBe('x|y#value');
  });

  it('joins a new measure to a group the student configured', () => {
    const configured = { type: 'heatmap' as const, x: 'y', y: 'x' };
    const document = plotDocument([{ id: 'value', view: configured }, { id: 'value2', view: { valueLabel: 'mass' } }]);
    const both = [measure('value', [x, y]), measure('value2', [x, y], mass)];
    const settled = settle(document, both, new Map([['plot:value', 'x|y#value']]));
    expect(storedMeasures(settled.document)[1]).toEqual({ id: 'value2', view: { ...configured, valueLabel: 'mass' } });
  });

  it('leaves an existing inferred measure alone beside a configured sibling', () => {
    const line = [measure('value', [x]), measure('value2', [x])];
    const start = settle(plotDocument([{ id: 'value' }, { id: 'value2' }]), line, new Map());
    const [first, second] = storedMeasures(start.document);
    const changed = plotDocument([{ ...(first as PlotMeasure), view: { type: 'dot' } }, second as PlotMeasure]);
    const settled = settle(changed, line, start.seen);
    expect(storedMeasures(settled.document)[1]).toEqual(second);
  });

  it('gives every measure of a group the same snapshot, and so one panel', () => {
    const line = [measure('value', [x]), measure('value2', [x])];
    const settled = settle(plotDocument([{ id: 'value' }, { id: 'value2' }]), line, new Map());
    const [first, second] = storedMeasures(settled.document);
    expect(first?.inferred).toEqual(second?.inferred);
    expect(first?.inferred?.signature).toBe('x#value|value2');
    const outputs = evaluate(settled.document, line)[0] as unknown as { measures: readonly PlotMeasureResult[] };
    expect(inferPlotPanels(natures, outputs.measures)).toHaveLength(1);
  });

  it('explains an inferred contour on a list grid and an inferred log scale', () => {
    const settled = settle(plotDocument([{ id: 'value' }]), grid, new Map());
    const outputs = evaluate(settled.document, grid)[0] as unknown as { measures: readonly PlotMeasureResult[] };
    expect(inferPlotPanels(natures, outputs.measures)[0]?.reason).toBe('Auto · contour for a numeric grid');
    const line = [values(measure('value', [x]), [1, 10, 100, 1000, 10_000])];
    const logged = settle(plotDocument([{ id: 'value' }]), line, new Map());
    const drawn = evaluate(logged.document, line)[0] as unknown as { measures: readonly PlotMeasureResult[] };
    expect(inferPlotPanels(natures, drawn.measures)[0]?.reason).toBe('Auto · line for a numeric sweep · log scale, values span 4 decades');
  });
});

describe('editing a frozen view', () => {
  it('swaps roles rather than putting one axis in two', () => {
    expect(assignRole({ type: 'line', x: 'd', series: 'grade' }, 'x', 'grade')).toEqual({ type: 'line', x: 'grade', series: 'd' });
    expect(assignRole({ type: 'line', x: 'd', series: 'grade' }, 'series', 'load')).toEqual({ type: 'line', x: 'd', series: 'load' });
  });

  it('moves the second axis between series and y with the chart type', () => {
    expect(retype({ type: 'line', x: 'd', series: 'e', valueScale: 'linear' }, 'contour'))
      .toEqual({ type: 'contour', x: 'd', y: 'e', valueScale: 'linear' });
    expect(retype({ type: 'heatmap', x: 'd', y: 'e' }, 'dot')).toEqual({ type: 'dot', x: 'd', series: 'e' });
    expect(retype({ type: 'line', x: 'd' }, 'dot')).toEqual({ type: 'dot', x: 'd' });
  });
});
