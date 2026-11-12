import type { OutputResult, PlotAxis, PlotMeasureResult } from '@joveworks/kernel';
import {
  PLOT_STRUCTURAL_FIELDS,
  plotViewChanged,
  type GraphDocument,
  type GraphNode,
  type PlotMeasure,
  type PlotScale,
  type PlotType,
  type PlotViewOverride,
} from '@joveworks/schema';
import { dimensionsEqual } from '@joveworks/units';

import { axisNature, type AxisNatures } from '../present/display';

export interface PlotRoles {
  readonly x?: string;
  readonly y?: string;
  readonly series?: string;
  readonly facet?: string;
}

/**
 * One y axis of a panel's shared chart: every measure in it is the same
 * physical dimension, so they can share a scale. `index` is drawing order,
 * not a fixed identity — 0 is the primary (left) axis, 1 is drawn on the
 * right, 2+ is a further axis offset outward from it. The figure
 * (`IntelligentPlotFigure.tsx`) is what actually draws a non-zero index by
 * rescaling; this module only decides the grouping.
 */
export interface PlotValueAxis {
  readonly index: number;
  readonly measures: readonly PlotMeasureResult[];
}

export interface PlotPanel {
  readonly id: string;
  readonly measures: readonly PlotMeasureResult[];
  readonly axes: readonly PlotAxis[];
  readonly type: PlotType;
  readonly roles: PlotRoles;
  readonly scales: Readonly<Record<string, PlotScale>>;
  readonly valueScale: PlotScale;
  /** This panel's measures, grouped into y axes by dimension. Always at
   * least one entry when `measures` is non-empty. */
  readonly valueAxes: readonly PlotValueAxis[];
  readonly height: number;
  readonly reason: string;
  readonly error?: string;
}

/**
 * A signature for a set of swept-axis ids, order independent — two measures
 * (or readings) with the same signature vary along the same axes. Shared
 * with the editor's connect-time check (`Canvas.tsx`'s `plotAxisMismatch`),
 * so both answer "do these sweep the same axes" identically.
 */
export function axisIdSetSignature(ids: readonly string[]): string {
  return [...new Set(ids)].sort().join('|');
}

function signature(measure: PlotMeasureResult): string {
  return axisIdSetSignature(measure.axes.map(({ axis }) => axis.id));
}

function sameDimension(a: PlotMeasureResult, b: PlotMeasureResult): boolean {
  return dimensionsEqual(a.unit.dimension, b.unit.dimension);
}

function numeric(axis: PlotAxis): boolean {
  return axis.coordinates.kind === 'numeric';
}

function continuous(axes: AxisNatures, axis: PlotAxis): boolean {
  return axisNature(axes, axis.axis.id).continuous;
}

/** Prefer numeric/continuous/high-cardinality axes for position, then document order. */
function positional(natures: AxisNatures, axes: readonly PlotAxis[]): readonly PlotAxis[] {
  return [...axes].sort((a, b) => {
    const numericDifference = Number(numeric(b)) - Number(numeric(a));
    if (numericDifference !== 0) return numericDifference;
    const continuousDifference = Number(continuous(natures, b)) - Number(continuous(natures, a));
    if (continuousDifference !== 0) return continuousDifference;
    if (a.axis.length !== b.axis.length) return b.axis.length - a.axis.length;
    return a.axis.order - b.axis.order;
  });
}

function autoType(natures: AxisNatures, axes: readonly PlotAxis[]): PlotType {
  if (axes.length === 0) return 'dot';
  if (axes.length === 1) return numeric(axes[0] as PlotAxis) ? 'line' : 'dot';
  const [first, second] = positional(natures, axes);
  if (first !== undefined && second !== undefined && numeric(first) !== numeric(second)) return 'line';
  if (
    first !== undefined && second !== undefined &&
    numeric(first) && numeric(second) && continuous(natures, first) && continuous(natures, second)
  ) return 'contour';
  return 'heatmap';
}

function rolesFor(
  natures: AxisNatures,
  axes: readonly PlotAxis[],
  type: PlotType,
  override: PlotMeasureResult['view'],
): PlotRoles {
  const ordered = positional(natures, axes);
  if (type === 'line' || type === 'dot') {
    const x = override?.x ?? ordered[0]?.axis.id;
    const remaining = ordered.filter((axis) => axis.axis.id !== x);
    const series = override?.series ?? remaining[0]?.axis.id;
    const facet = override?.facet ?? remaining[1]?.axis.id;
    return {
      ...(x === undefined ? {} : { x }),
      ...(series === undefined ? {} : { series }),
      ...(facet === undefined ? {} : { facet }),
    };
  }

  const x = override?.x ?? ordered[0]?.axis.id;
  const remaining = ordered.filter((axis) => axis.axis.id !== x);
  const y = override?.y ?? remaining[0]?.axis.id;
  const rest = remaining.filter((axis) => axis.axis.id !== y);
  const facet = override?.facet ?? rest[0]?.axis.id;
  return {
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    ...(facet === undefined ? {} : { facet }),
  };
}

function invalidReason(
  axes: readonly PlotAxis[],
  type: PlotType,
  roles: PlotRoles,
  explicit: boolean,
): string | undefined {
  if (axes.length > 3) return `varies along ${axes.length} axes; Plot supports at most three`;
  if (axes.length === 0) return undefined;
  const available = new Set(axes.map(({ axis }) => axis.id));
  const assigned = [roles.x, roles.y, roles.series, roles.facet].filter((id): id is string => id !== undefined);
  const unknown = assigned.find((id) => !available.has(id));
  if (unknown !== undefined) return `the pinned axis '${unknown}' is no longer part of this measure`;
  if (new Set(assigned).size !== assigned.length) return 'one swept axis is assigned to more than one role';
  if ((type === 'heatmap' || type === 'contour') && (roles.x === undefined || roles.y === undefined)) {
    return `${type} needs two positional axes`;
  }
  if (type === 'contour') {
    const byId = new Map(axes.map((axis) => [axis.axis.id, axis]));
    if (!numeric(byId.get(roles.x as string) as PlotAxis) || !numeric(byId.get(roles.y as string) as PlotAxis)) {
      return 'contour needs two numeric axes';
    }
  }
  if (explicit && axes.length === 0 && type !== 'dot') return `${type} needs a swept axis`;
  return undefined;
}

const MAX_VALUE_AXES = 3;

/**
 * Group a panel's measures into y axes by physical dimension, in
 * first-appearance order — a force and a length wired into the same panel
 * become two value axes rather than two panels. `heatmap`/`contour` reach
 * this too, but `inferPlotPanels` never gives them more than one measure, so
 * they always come back with exactly one axis.
 */
function valueAxesFor(measures: readonly PlotMeasureResult[]): readonly PlotValueAxis[] {
  const groups: PlotMeasureResult[][] = [];
  for (const measure of measures) {
    const group = groups.find((candidate) => sameDimension(candidate[0] as PlotMeasureResult, measure));
    if (group === undefined) groups.push([measure]);
    else group.push(measure);
  }
  return groups.map((group, index) => ({ index, measures: group }));
}

function valueAxisReason(valueAxes: readonly PlotValueAxis[]): string | undefined {
  if (valueAxes.length > MAX_VALUE_AXES) {
    return `varies across ${valueAxes.length} value units; Plot supports at most ${MAX_VALUE_AXES} y axes`;
  }
  return undefined;
}

function scaleReason(measure: PlotMeasureResult, axes: readonly PlotAxis[]): string | undefined {
  if (measure.view?.valueScale === 'log' && measure.series.data.some((value) => !Number.isFinite(value) || value <= 0)) {
    return 'a logarithmic value scale needs every plotted value above zero';
  }
  for (const [axisId, scale] of Object.entries(measure.view?.scales ?? {})) {
    if (scale !== 'log') continue;
    const axis = axes.find((candidate) => candidate.axis.id === axisId);
    if (axis?.coordinates.kind !== 'numeric' || axis.coordinates.data.some((value) => !Number.isFinite(value) || value <= 0)) {
      return `a logarithmic scale for '${axis?.axis.label ?? axisId}' needs numeric coordinates above zero`;
    }
  }
  return undefined;
}

function panelFor(
  natures: AxisNatures,
  measures: readonly PlotMeasureResult[],
  index: number,
): PlotPanel {
  const lead = measures[0] as PlotMeasureResult;
  const axes = [...lead.axes].sort((a, b) => a.axis.order - b.axis.order);
  const type = lead.view?.type ?? autoType(natures, axes);
  const roles = rolesFor(natures, axes, type, lead.view);
  const explicit = lead.view?.type !== undefined;
  const valueAxes = valueAxesFor(measures);
  const error = invalidReason(axes, type, roles, explicit) ?? valueAxisReason(valueAxes) ??
    measures.map((measure) => scaleReason(measure, axes)).find((reason) => reason !== undefined) ??
    (axes.length === 0 && measures.length < 2 ? 'a single scalar belongs in a Value output' : undefined);
  const reason = lead.viewInferred === true
    ? inferredReason(natures, measures, axes, type, roles, lead.view?.valueScale ?? 'linear')
    : lead.view?.type !== undefined
    ? `Pinned · ${type}`
    : axes.length === 0
      ? 'Auto · dot comparison for scalar values'
      : type === 'contour'
        ? 'Auto · contour for two continuous numeric ranges'
        : type === 'heatmap'
          ? 'Auto · heatmap for a discrete or categorical grid'
          : type === 'line'
            ? 'Auto · line for a numeric sweep'
            : 'Auto · dot comparison for categories';
  return {
    id: `${index}:${measures.map((measure) => measure.id).join('+')}`,
    measures,
    axes,
    type,
    roles,
    scales: lead.view?.scales ?? {},
    valueScale: lead.view?.valueScale ?? 'linear',
    valueAxes,
    height: lead.view?.height ?? 240,
    reason,
    ...(error === undefined ? {} : { error }),
  };
}

function decades(measures: readonly PlotMeasureResult[]): number {
  const values = measures.flatMap((measure) => measure.series.data);
  return Math.log10(Math.max(...values) / Math.min(...values));
}

/** The `Auto · …` sentence for a measure drawn from a stored inference. */
function inferredReason(
  natures: AxisNatures,
  measures: readonly PlotMeasureResult[],
  axes: readonly PlotAxis[],
  type: PlotType,
  roles: PlotRoles,
  valueScale: PlotScale,
): string {
  const byId = new Map(axes.map((axis) => [axis.axis.id, axis]));
  const ranges = [roles.x, roles.y].every((id) => id !== undefined && continuous(natures, byId.get(id) as PlotAxis));
  const base = axes.length === 0
    ? 'Auto · dot comparison for scalar values'
    : type === 'contour'
      ? ranges ? 'Auto · contour for two continuous numeric ranges' : 'Auto · contour for a numeric grid'
      : type === 'heatmap'
        ? 'Auto · heatmap for a discrete or categorical grid'
        : type === 'line'
          ? 'Auto · line for a numeric sweep'
          : 'Auto · dot comparison for categories';
  return valueScale === 'log'
    ? `${base} · log scale, values span ${Math.floor(decades(measures))} decades`
    : base;
}

/**
 * Turn evaluated measures into a deterministic dashboard. The result is pure
 * and contains no drawing concerns, so inference can be tested independently.
 *
 * One panel per axis signature — a student who wants two plots wires two
 * Plot nodes; this never splits one axis signature into several panels
 * itself. Dimension used to be exactly that second split (a force and a
 * length sharing one signature became two stacked panels); now it only
 * decides which measures share a y axis within the one panel
 * (`valueAxesFor`, in `panelFor`), 0 primary and 1+ layered outward. `view`
 * JSON still splits: two measures with genuinely different pinned choices
 * (type, roles, labels) cannot share one chart's marks, so they still land
 * in separate panels.
 */
export function inferPlotPanels(
  natures: AxisNatures,
  measures: readonly PlotMeasureResult[],
): readonly PlotPanel[] {
  const bySignature = new Map<string, PlotMeasureResult[]>();
  for (const measure of measures) {
    const key = signature(measure);
    bySignature.set(key, [...(bySignature.get(key) ?? []), measure]);
  }

  const groups: PlotMeasureResult[][] = [];
  for (const sameAxes of bySignature.values()) {
    const inferred = autoType(natures, sameAxes[0]?.axes ?? []);
    const surfaces = inferred === 'heatmap' || inferred === 'contour';
    if (surfaces) {
      groups.push(...sameAxes.map((measure) => [measure]));
      continue;
    }
    for (const measure of sameAxes) {
      const viewKey = JSON.stringify(measure.view ?? {});
      const compatible = groups.find((group) =>
        signature(group[0] as PlotMeasureResult) === signature(measure) &&
        JSON.stringify((group[0] as PlotMeasureResult).view ?? {}) === viewKey,
      );
      if (compatible === undefined) groups.push([measure]);
      else compatible.push(measure);
    }
  }
  return groups.map((group, index) => panelFor(natures, group, index));
}

export function plotAxisFor(panel: PlotPanel, id: string | undefined): PlotAxis | undefined {
  return id === undefined ? undefined : panel.axes.find(({ axis }) => axis.id === id);
}

/**
 * How each swept axis of a document was authored, in the form the figures
 * take it: the one place the graph is read for a drawing decision, so that
 * everything downstream of it is presentation-only (`present/display.ts`).
 */
export function axisNaturesOf(document: GraphDocument): AxisNatures {
  return Object.fromEntries(document.nodes.flatMap((node) => {
    if (node.kind === 'range') {
      return [[node.id, { continuous: true, logarithmic: node.spacing === 'logarithmic' }] as const];
    }
    if (node.kind !== 'input') return [];
    const continuous = node.value.kind === 'linear' || node.value.kind === 'logarithmic';
    return [[node.id, { continuous, logarithmic: node.value.kind === 'logarithmic' }] as const];
  }));
}

// --- stored inference --------------------------------------------------------

/** Both axes of a grid need this many points before it defaults to a contour. */
const CONTOUR_MIN_POINTS = 4;
/** A value spanning this ratio (three decades) defaults to a log value scale. */
const LOG_VALUE_RATIO = 1000;

/**
 * The `seen` entry for a measure that was in the document when it was loaded
 * but had no result yet (its catalogue had not arrived, or its node was in
 * error). Its first result is recorded, not inferred: decision 8, a document
 * that was opened does not redraw.
 */
export const UNEVALUATED = '\u0000unevaluated';

/** Order-independent identity of what is wired into one panel: its swept axes, then its measures. */
export function plotWiringSignature(measure: PlotMeasureResult, group: readonly PlotMeasureResult[]): string {
  return `${signature(measure)}#${group.map(({ id }) => id).sort().join('|')}`;
}

/** The labels and height of a view, without its type, roles or scales. */
export function cosmeticOf(view: PlotViewOverride | undefined): PlotViewOverride {
  if (view === undefined) return {};
  const cosmetic: Record<string, unknown> = { ...view };
  for (const field of PLOT_STRUCTURAL_FIELDS) delete cosmetic[field];
  return cosmetic as PlotViewOverride;
}

/** The structural fields of a view, and nothing else. */
export function structuralOf(view: PlotViewOverride | undefined): PlotViewOverride {
  if (view === undefined) return {};
  const structural: Record<string, unknown> = {};
  for (const field of PLOT_STRUCTURAL_FIELDS) if (view[field] !== undefined) structural[field] = view[field];
  return structural as PlotViewOverride;
}

function numericScales(natures: AxisNatures, axes: readonly PlotAxis[], chosen: Readonly<Record<string, PlotScale>>): Readonly<Record<string, PlotScale>> {
  return Object.fromEntries(axes.filter(numeric).map(({ axis }) => [
    axis.id,
    chosen[axis.id] ?? (axisNature(natures, axis.id).logarithmic ? 'log' : 'linear'),
  ]));
}

function structuralView(
  type: PlotType,
  roles: PlotRoles,
  scales: Readonly<Record<string, PlotScale>>,
  valueScale: PlotScale,
): PlotViewOverride {
  return {
    type,
    ...roles,
    ...(Object.keys(scales).length === 0 ? {} : { scales }),
    valueScale,
  };
}

/**
 * The complete structural view for a group of measures that share swept
 * axes: the shape-based rule, upgraded to a contour on a numeric grid of at
 * least four by four, with every axis scale and the value scale written down.
 */
export function inferPlotView(natures: AxisNatures, group: readonly PlotMeasureResult[]): PlotViewOverride {
  const lead = group[0] as PlotMeasureResult;
  const axes = [...lead.axes].sort((a, b) => a.axis.order - b.axis.order);
  let type = autoType(natures, axes);
  const roles = rolesFor(natures, axes, type, undefined);
  if (type === 'heatmap') {
    const byId = new Map(axes.map((axis) => [axis.axis.id, axis]));
    const grid = [roles.x, roles.y].map((id) => (id === undefined ? undefined : byId.get(id)));
    if (grid.every((axis) => axis !== undefined && numeric(axis) && axis.axis.length >= CONTOUR_MIN_POINTS)) type = 'contour';
  }
  const values = group.map((measure) => measure.series.data);
  const positive = values.every((data) => data.length > 0 && data.every((value) => Number.isFinite(value) && value > 0));
  const wide = values.some((data) => Math.max(...data) / Math.min(...data) >= LOG_VALUE_RATIO);
  return structuralView(type, roles, numericScales(natures, axes, {}), positive && wide ? 'log' : 'linear');
}

/** The structural settings a panel is currently drawn with, for freezing. */
export function structuralViewOf(natures: AxisNatures, panel: PlotPanel): PlotViewOverride {
  return structuralView(panel.type, panel.roles, numericScales(natures, panel.axes, panel.scales), panel.valueScale);
}

/** A stable rendering of a measure, so that equal settings never count as a change. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : entry,
  );
}

function withState(
  measure: PlotMeasure,
  view: PlotViewOverride | undefined,
  inferred: PlotMeasure['inferred'],
): PlotMeasure {
  const { view: _view, inferred: _inferred, ...rest } = measure;
  const next: PlotMeasure = {
    ...rest,
    ...(view === undefined || Object.keys(view).length === 0 ? {} : { view }),
    ...(inferred === undefined ? {} : { inferred }),
  };
  return canonical(next) === canonical(measure) ? measure : next;
}

function settleMeasures(
  measures: readonly PlotMeasure[],
  results: readonly PlotMeasureResult[],
  natures: AxisNatures,
  key: (measureId: string) => string,
  previous: ReadonlyMap<string, string> | undefined,
  seen: Map<string, string>,
): readonly PlotMeasure[] {
  const resultOf = new Map(results.map((result) => [result.id, result]));
  const groups = new Map<string, PlotMeasureResult[]>();
  for (const result of results) {
    const group = signature(result);
    groups.set(group, [...(groups.get(group) ?? []), result]);
  }
  const stored = new Map(measures.map((measure) => [measure.id, measure]));
  const inferredFor = new Map<string, PlotViewOverride>();
  const inferOnce = (group: readonly PlotMeasureResult[]): PlotViewOverride => {
    const id = signature(group[0] as PlotMeasureResult);
    const known = inferredFor.get(id);
    if (known !== undefined) return known;
    const view = inferPlotView(natures, group);
    inferredFor.set(id, view);
    return view;
  };

  return measures.map((measure) => {
    const result = resultOf.get(measure.id);
    if (result === undefined) {
      const entry = previous === undefined ? UNEVALUATED : previous.get(key(measure.id));
      if (entry !== undefined) seen.set(key(measure.id), entry);
      return measure;
    }
    const group = groups.get(signature(result)) as PlotMeasureResult[];
    const current = plotWiringSignature(result, group);
    const before = previous?.get(key(measure.id));
    seen.set(key(measure.id), current);
    const infer = (): PlotMeasure =>
      withState(measure, cosmeticOf(measure.view), { signature: current, view: inferOnce(group) });

    // 1. The student chose this measure's settings: never touch them.
    if (plotViewChanged(measure.view)) {
      return measure.inferred === undefined ? measure : withState(measure, measure.view, undefined);
    }
    // 2. A new connection onto a chart the student configured joins it as configured.
    if (previous !== undefined && before === undefined) {
      const configured = group
        .map((other) => stored.get(other.id))
        .find((other) => other !== undefined && other.id !== measure.id && plotViewChanged(other.view));
      if (configured !== undefined) {
        return withState(measure, { ...structuralOf(configured.view), ...cosmeticOf(measure.view) }, undefined);
      }
    }
    // 3. Inferred: again when the wiring changed, or when a value left its log scale undrawable.
    if (measure.inferred !== undefined) {
      const undrawable = group.some((other) => scaleReason(other, other.axes) !== undefined);
      return measure.inferred.signature !== current || undrawable ? infer() : measure;
    }
    // 4. Legacy: inferred only once wired anew during this session.
    if (previous === undefined || before === UNEVALUATED || before === current) return measure;
    return infer();
  });
}

/**
 * Bring every plot in the document up to date with its wiring (the state
 * table in `docs/plot-inference-plan.md`). `seen` is what the previous call
 * returned, or undefined for the first call after a document was opened (or
 * an undo or redo), which records the wiring and writes nothing for a plot
 * that predates inference. Returns the same document reference when nothing
 * changes, so a second call on its own output is always a no-op.
 */
export function settlePlots(
  document: GraphDocument,
  outputs: readonly OutputResult[],
  natures: AxisNatures,
  seen: ReadonlyMap<string, string> | undefined,
): { readonly document: GraphDocument; readonly seen: Map<string, string> } {
  const next = new Map<string, string>();
  let changed = false;
  const nodes = document.nodes.map((node): GraphNode => {
    // A legacy one-value plot (no `measures`) is left as authored.
    if (node.kind !== 'output' || node.output.kind !== 'plot' || node.output.measures === undefined) return node;
    const stored = node.output.measures;
    const result = outputs.find((output) => output.nodeId === node.id);
    const results = result?.kind === 'plot' ? result.measures ?? [] : [];
    const measures = settleMeasures(stored, results, natures, (id) => `${node.id}:${id}`, seen, next);
    if (measures.every((measure, index) => measure === stored[index])) return node;
    changed = true;
    return { ...node, output: { ...node.output, measures } };
  });
  return { document: changed ? { ...document, nodes } : document, seen: next };
}

// --- editing a frozen view ---------------------------------------------------

export type PlotRole = keyof PlotRoles;
const ROLES: readonly PlotRole[] = ['x', 'y', 'series', 'facet'];

/**
 * Give `role` the axis `axis`. With every role written down, the axis may
 * already hold another one; that role takes over the axis being displaced,
 * so no axis ever ends up in two roles.
 */
export function assignRole(view: PlotViewOverride, role: PlotRole, axis: string | undefined): PlotViewOverride {
  const next: Record<string, unknown> = { ...view };
  const holder = axis === undefined ? undefined : ROLES.find((other) => other !== role && view[other] === axis);
  if (holder !== undefined) next[holder] = view[role];
  next[role] = axis;
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  return next as PlotViewOverride;
}

/** A line or dot chart has a series where a heatmap or contour has a y axis. */
export function retype(view: PlotViewOverride, type: PlotType): PlotViewOverride {
  const surface = type === 'heatmap' || type === 'contour';
  const { y, series, ...rest } = view;
  const second = surface ? (y ?? series) : (series ?? y);
  return { ...rest, type, ...(second === undefined ? {} : surface ? { y: second } : { series: second }) };
}
