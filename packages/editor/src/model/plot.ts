import type { PlotAxis, PlotMeasureResult } from '@joveworks/kernel';
import type { GraphDocument, PlotScale, PlotType } from '@joveworks/schema';
import { dimensionsEqual } from '@joveworks/units';

import { axisNature, type AxisNatures } from '../present/display';

export interface PlotRoles {
  readonly x?: string;
  readonly y?: string;
  readonly series?: string;
  readonly facet?: string;
}

export interface PlotPanel {
  readonly id: string;
  readonly measures: readonly PlotMeasureResult[];
  readonly axes: readonly PlotAxis[];
  readonly type: PlotType;
  readonly roles: PlotRoles;
  readonly scales: Readonly<Record<string, PlotScale>>;
  readonly valueScale: PlotScale;
  readonly height: number;
  readonly reason: string;
  readonly error?: string;
}

function signature(measure: PlotMeasureResult): string {
  return measure.axes.map(({ axis }) => axis.id).sort().join('|');
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
  const error = invalidReason(axes, type, roles, explicit) ?? scaleReason(lead, axes) ??
    (axes.length === 0 && measures.length < 2 ? 'a single scalar belongs in a Value output' : undefined);
  const reason = lead.view?.type !== undefined
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
    height: lead.view?.height ?? 240,
    reason,
    ...(error === undefined ? {} : { error }),
  };
}

/**
 * Turn evaluated measures into a deterministic dashboard. The result is pure
 * and contains no drawing concerns, so inference can be tested independently.
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
        sameDimension(group[0] as PlotMeasureResult, measure) &&
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
