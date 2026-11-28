/**
 * Evaluating the shafts domain (ROADMAP item 19): the Load, Distributed
 * load, Support and Shaft nodes, the `shaft:` formula evaluator that draws
 * diagrams and reports reactions, and the Shaft view output. Moved verbatim
 * from the core's `evaluate.ts`; `./index.ts` registers these with the
 * kernel's `domain.ts`.
 */

import { toCanonical, type Unit } from '@joveworks/units';
import {
  domainMember,
  type ClosureNode,
  type Edge,
  type Endpoint,
  type Formula,
  type FormulaNode,
  type GraphDocument,
  type OutputNode,
  type Port,
} from '@joveworks/schema';
import {
  ACTING_PORT,
  LOAD_FIELD_UNITS,
  SHAFT_PORT,
  loadFieldValue,
  shaftFieldValue,
  type DistributedLoadNode,
  type FormulaShaft,
  type LoadField,
  type LoadNode,
  type ShaftNode,
  type ShaftStep,
  type SupportNode,
} from '../schema.js';
import { packChannelIndices } from '@joveworks/kernel';
import { KernelError } from '@joveworks/kernel';
import { inputPortValue, valueAtEdge, type OutputBase } from '@joveworks/kernel';
import { endpointKey, type Resolution } from '@joveworks/kernel';
import {
  assertGridSize,
  broadcastSeries,
  gridSize,
  indexer,
  reader,
  scalarSeries,
  unionAxes,
  type CategoricalSeries,
  type NumericSeries,
  type PortValue,
} from '@joveworks/kernel';
import type { Warning } from '@joveworks/kernel';
import {
  deflection as shaftDeflection,
  moment as shaftMoment,
  pointTerms,
  shear as shaftShear,
  slope as shaftSlope,
  solve as solveShaft,
  spanTerms,
  torque as shaftTorque,
  type Restraint,
  type Solution,
  type Term,
} from './solver.js';
import { loadSeries, shaftSeries, type LoadValue, type ShaftValue } from './values.js';

/** One thing drawn on a shaft view, named by the node it comes from. Canonical values; `unit` is what to print them in. */
export interface ShaftViewMark {
  readonly label: string;
  readonly at: number;
  readonly value: number;
  readonly unit: Unit;
}

export interface ShaftViewSpan {
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly rate: number;
  readonly unit: Unit;
}

/** One transverse plane's loads, as a shaft view draws them. Zero entries are left out. */
export interface ShaftViewPlane {
  readonly forces: readonly ShaftViewMark[];
  readonly couples: readonly ShaftViewMark[];
  readonly spans: readonly ShaftViewSpan[];
}

export interface ShaftViewResult extends OutputBase {
  readonly kind: 'shaftView';
  /** The unit the shaft's positions and diameters were typed in. */
  readonly lengthUnit: Unit;
  readonly from: number;
  readonly to: number;
  /** The outline, step by step. `d` absent: a section given only by its I, drawn as a plain bar. */
  readonly sections: readonly { readonly start: number; readonly end: number; readonly d?: number; readonly d_i?: number }[];
  readonly supports: readonly { readonly label: string; readonly at: number; readonly support: SupportNode['support'] }[];
  readonly planes: { readonly x: ShaftViewPlane; readonly y: ShaftViewPlane };
  readonly torques: readonly ShaftViewMark[];
}

// --- shaft diagrams ---------------------------------------------------------

/** One load or support on an `acting` port, and the Load, Distributed load or Support node it came from. */
interface ActingEntry {
  readonly value: LoadValue;
  readonly from: Endpoint;
}

/** Where a value really comes from, through any waypoints it passed. */
function traceSource(document: GraphDocument, from: Endpoint): Endpoint {
  const node = document.nodes.find((candidate) => candidate.id === from.node);
  const match = /^out(\d+)$/u.exec(from.port);
  if (node?.kind !== 'waypoint' || match === null) return from;
  const edge = document.edges.find((candidate) => candidate.to.node === node.id && candidate.to.port === `in${match[1]}`);
  return edge === undefined ? from : traceSource(document, edge.from);
}

/**
 * Everything wired into an `acting` port, one entry per load or support: a
 * wire from a pack is opened up into the loads it holds, in channel order.
 */
function actingEntries(document: GraphDocument, key: string, edges: readonly Edge[], values: ReadonlyMap<string, PortValue>): readonly ActingEntry[] {
  return edges.flatMap((edge): ActingEntry[] => {
    const value = valueAtEdge(edge, key, values);
    const from = traceSource(document, edge.from);
    if (value.kind === 'load') return [{ value, from }];
    if (value.kind === 'bundle') {
      const channels = packChannelIndices(document, from.node);
      return value.values.map((channel, i) => {
        if (channel.kind !== 'load') throw new KernelError(`'${from.node}' bundles something that is not a load or a support`, key);
        const into = document.edges.find((candidate) => candidate.to.node === from.node && candidate.to.port === `in${channels[i]}`);
        return { value: channel, from: into === undefined ? from : traceSource(document, into.from) };
      });
    }
    throw new KernelError(`'${edge.from.node}.${edge.from.port}' is not a load or a support`, key);
  });
}

/**
 * A `shaft` record (`FormulaShaft`): everything wired into its acting port —
 * loads and supports — on the shaft wired into its shaft port, broadcast over
 * one grid with the positions, the plane and the shaft's own numbers, and
 * solved per cell by `shaft.ts`.
 */
export function evaluateShaft(
  node: FormulaNode | ClosureNode | { readonly id: string },
  formula: Formula,
  spec: FormulaShaft,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
  warnings: Warning[],
  largeGrid: number,
): ReadonlyMap<string, PortValue> {
  const nodeId = node.id;
  const declared = (name: string): Port => {
    const port = formula.inputs.find((candidate) => candidate.name === name);
    if (port === undefined) throw new KernelError(`'${name}' is not an input of '${formula.id}'`, nodeId);
    return port;
  };

  const actingKey = endpointKey(nodeId, spec.acting);
  const actingEdges = resolution.incoming.get(actingKey) ?? [];
  if (actingEdges.length === 0) throw new KernelError(`'${spec.acting}' has nothing wired to it`, actingKey);
  const entries = actingEntries(resolution.document, actingKey, actingEdges, values);
  const acting = entries.map((entry) => entry.value);

  const shaftKey = endpointKey(nodeId, spec.shaft);
  const shaftEdge = resolution.incoming.get(shaftKey)?.[0];
  if (shaftEdge === undefined) throw new KernelError(`wire a Shaft node into '${spec.shaft}'`, shaftKey);
  const shaft = valueAtEdge(shaftEdge, shaftKey, values);
  if (shaft.kind !== 'shaft') throw new KernelError(`'${spec.shaft}' needs a shaft`, shaftKey);

  // Which of the acting supports a reactions record reports: the one whose
  // wire also arrives at `support`.
  let reported: number | undefined;
  if (spec.support !== undefined) {
    const supportKey = endpointKey(nodeId, spec.support);
    const edge = resolution.incoming.get(supportKey)?.[0];
    if (edge === undefined) throw new KernelError(`wire the support to report into '${spec.support}'`, supportKey);
    const wanted = traceSource(resolution.document, edge.from);
    const index = entries.findIndex((entry) => entry.from.node === wanted.node && entry.from.port === wanted.port);
    if (index < 0 || acting[index]?.shape !== 'support') {
      throw new KernelError(`'${spec.support}' must be one of the supports wired into '${spec.acting}'`, supportKey);
    }
    reported = acting.slice(0, index).filter((value) => value.shape === 'support').length;
  }

  let z: NumericSeries | undefined;
  if (spec.answers === 'diagrams') {
    const axisPort = spec.axis === undefined ? undefined : declared(spec.axis);
    const typed = axisPort !== undefined && 'inputValues' in node && node.inputValues?.[axisPort.name] !== undefined;
    const wired = axisPort !== undefined && resolution.incoming.has(endpointKey(nodeId, axisPort.name));
    if (axisPort !== undefined && (typed || wired)) {
      const value = inputPortValue(node, axisPort, resolution, values);
      if (value.kind !== 'numeric') throw new KernelError(`'${axisPort.name}' needs a position`, endpointKey(nodeId, axisPort.name));
      z = value;
    } else {
      z = shaft.z;
    }
  }
  let plane: CategoricalSeries | undefined;
  if (spec.plane !== undefined) {
    const value = inputPortValue(node, declared(spec.plane), resolution, values);
    if (value.kind !== 'categorical') {
      throw new KernelError(`'${spec.plane}' needs a plane: x, y or resultant`, endpointKey(nodeId, spec.plane));
    }
    plane = value;
  }

  const axes = unionAxes(
    ...(z === undefined ? [] : [z.axes]),
    ...shaftSeries(shaft).map((series) => series.axes),
    ...acting.flatMap((value) => loadSeries(value).map((series) => series.axes)),
    ...(plane === undefined ? [] : [plane.axes]),
  );
  assertGridSize(axes, nodeId);
  const cells = gridSize(axes);
  if (cells >= largeGrid) {
    warnings.push({
      kind: 'largeGrid',
      nodeId,
      message: `this node evaluates ${cells} points (${axes.map((axis) => `${axis.label}: ${axis.length}`).join(' × ')}) — a sweep that large takes a moment`,
    });
  }
  if (acting.filter((value) => value.shape === 'support' && value.support === 'locating').length > 1) {
    warnings.push({
      kind: 'shaftSupports',
      nodeId,
      message: 'more than one bearing locates this shaft — axially that over-constrains it, though the diagrams here are unaffected',
    });
  }

  const read = (series: NumericSeries): ((cell: number) => number) => reader(series, axes);
  const readActing = acting.map((value) =>
    value.shape === 'point'
      ? {
          shape: 'point' as const,
          at: read(value.at),
          Fx: read(value.Fx),
          Fy: read(value.Fy),
          torque: read(value.torque),
          Cx: read(value.Cx),
          Cy: read(value.Cy),
        }
      : value.shape === 'span'
        ? { shape: 'span' as const, from: read(value.from), to: read(value.to), qx: read(value.qx), qy: read(value.qy) }
        : { shape: 'support' as const, at: read(value.at), fixed: value.support === 'fixed' },
  );
  const readFrom = read(shaft.from);
  const readE = read(shaft.E);
  const readSections = shaft.sections.map((section) => ({ start: section.start, I: read(section.I) }));
  const zRead = z === undefined ? undefined : read(z);
  const planeIndex = plane === undefined ? undefined : indexer(plane, axes);
  const planePort = spec.plane === undefined ? undefined : declared(spec.plane);
  const planeAt = (cell: number): 'x' | 'y' | 'resultant' => {
    if (plane === undefined || planeIndex === undefined || planePort?.kind !== 'categorical') return 'resultant';
    const written = plane.data[planeIndex(cell)] as string;
    const member = domainMember(planePort, written);
    if (member === 'x' || member === 'y' || member === 'resultant') return member;
    throw new KernelError(`'${written}' is not a plane — pick x, y or resultant`, endpointKey(nodeId, spec.plane ?? ''));
  };

  const solveAt = (cell: number, which: 'x' | 'y'): Solution => {
    const terms: Term[] = [];
    const restraints: Restraint[] = [];
    for (const entry of readActing) {
      if (entry.shape === 'point') {
        terms.push(...pointTerms(entry.at(cell), which === 'x' ? entry.Fx(cell) : entry.Fy(cell), which === 'x' ? entry.Cx(cell) : entry.Cy(cell)));
      } else if (entry.shape === 'span') {
        terms.push(...spanTerms(entry.from(cell), entry.to(cell), which === 'x' ? entry.qx(cell) : entry.qy(cell)));
      } else {
        restraints.push({ at: entry.at(cell), fixed: entry.fixed });
      }
    }
    const E = readE(cell);
    const segments = readSections.map((section) => {
      const stiffness = E * section.I(cell);
      if (!(stiffness > 0)) throw new KernelError("the shaft's E and I must both be above zero", nodeId);
      return { start: section.start, stiffness };
    });
    try {
      return solveShaft(terms, restraints, segments, readFrom(cell));
    } catch (error) {
      if (error instanceof KernelError) throw new KernelError(error.message, nodeId);
      throw error;
    }
  };
  const inPlane = (cell: number, measure: (solution: Solution) => number): number => {
    const chosen = planeAt(cell);
    if (chosen !== 'resultant') return measure(solveAt(cell, chosen));
    return Math.hypot(measure(solveAt(cell, 'x')), measure(solveAt(cell, 'y')));
  };

  const outputs = formula.outputs.map((output) => output.name);
  if (spec.answers === 'reactions') {
    const forces = new Array<number>(cells);
    const moments = new Array<number>(cells);
    for (let cell = 0; cell < cells; cell += 1) {
      forces[cell] = inPlane(cell, (solution) => solution.reactions[reported ?? 0]?.force ?? 0);
      moments[cell] = inPlane(cell, (solution) => solution.reactions[reported ?? 0]?.moment ?? 0);
    }
    return new Map<string, PortValue>([
      [outputs[0] as string, { kind: 'numeric', axes, data: forces }],
      [outputs[1] as string, { kind: 'numeric', axes, data: moments }],
    ]);
  }

  // One solve per plane per cell, shared by every quantity this record draws.
  const quantities = spec.quantities ?? [];
  const planar = quantities.some((quantity) => quantity !== 'torque');
  const columns = quantities.map(() => new Array<number>(cells));
  for (let cell = 0; cell < cells; cell += 1) {
    const at = (zRead as (cell: number) => number)(cell);
    const chosen = planar ? planeAt(cell) : 'x';
    const solutions = !planar ? [] : chosen === 'resultant' ? [solveAt(cell, 'x'), solveAt(cell, 'y')] : [solveAt(cell, chosen)];
    const measure = (of: (solution: Solution) => number): number =>
      solutions.length === 1 ? of(solutions[0] as Solution) : Math.hypot(of(solutions[0] as Solution), of(solutions[1] as Solution));
    quantities.forEach((quantity, i) => {
      (columns[i] as number[])[cell] =
        quantity === 'torque'
          ? shaftTorque(readActing.flatMap((entry) => (entry.shape === 'point' ? [{ at: entry.at(cell), torque: entry.torque(cell) }] : [])), at)
          : quantity === 'shear'
            ? measure((solution) => shaftShear(solution.terms, at))
            : quantity === 'moment'
              ? measure((solution) => shaftMoment(solution.terms, at))
              : quantity === 'slope'
                ? measure((solution) => shaftSlope(solution, at))
                : measure((solution) => shaftDeflection(solution, at));
    });
  }
  return new Map<string, PortValue>(outputs.map((name, i) => [name, { kind: 'numeric', axes, data: columns[i] as number[] }]));
}

// --- shaft views -------------------------------------------------------------

/**
 * What a shaft view draws: the shaft and what acts on it. A view is one
 * picture, so a load that varies across a sweep is drawn at its first point, with a warning that says so.
 */
export function shaftView(
  node: OutputNode,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
  warnings: Warning[],
): Omit<ShaftViewResult, keyof OutputBase> {
  const document = resolution.document;
  const shaftKey = endpointKey(node.id, SHAFT_PORT);
  const shaftEdge = resolution.incoming.get(shaftKey)?.[0];
  if (shaftEdge === undefined) throw new KernelError('wire a Shaft node into its shaft port', shaftKey);
  const shaft = valueAtEdge(shaftEdge, shaftKey, values);
  if (shaft.kind !== 'shaft') throw new KernelError('this port needs a shaft', shaftKey);
  const shaftNode = document.nodes.find((candidate) => candidate.id === shaftEdge.from.node);

  let swept = false;
  const first = (series: NumericSeries): number => {
    if (series.axes.length > 0) swept = true;
    return series.data[0] as number;
  };
  const from = first(shaft.from);
  const to = first(shaft.to);
  const lengthUnit = shaftNode?.kind === 'shaft' ? shaftNode.from.unit : LOAD_FIELD_UNITS.at;

  // The outline: diameters only where the Shaft node states them.
  let sections: { start: number; end: number; d?: number; d_i?: number }[];
  if (shaftNode?.kind === 'shaft' && shaftNode.section.kind === 'stepped') {
    const unit = shaftNode.section.unit;
    const steps = shaftNode.section.steps;
    sections = steps
      .map((step, i) => ({
        start: Math.max(from, toCanonical(step.start, unit)),
        end: Math.min(to, i + 1 < steps.length ? toCanonical((steps[i + 1] as ShaftStep).start, unit) : to),
        d: toCanonical(step.d, unit),
        ...(step.d_i === undefined ? {} : { d_i: toCanonical(step.d_i, unit) }),
      }))
      .filter((section) => section.end > section.start);
    if (sections.length > 0) (sections[0] as { start: number }).start = from;
  } else if (shaftNode?.kind === 'shaft' && shaftNode.section.kind === 'round') {
    const field = (name: 'd' | 'd_i'): number | undefined => {
      const key = endpointKey(shaftNode.id, name);
      const edge = resolution.incoming.get(key)?.[0];
      if (edge !== undefined) {
        const wired = values.get(endpointKey(edge.from.node, edge.from.port));
        return wired?.kind === 'numeric' ? first(wired) : undefined;
      }
      const typed = shaftFieldValue(shaftNode, name);
      return typed === undefined ? undefined : toCanonical(typed.value, typed.unit);
    };
    const d = field('d');
    const bore = field('d_i');
    sections = [{ start: from, end: to, ...(d === undefined ? {} : { d }), ...(bore === undefined ? {} : { d_i: bore }) }];
  } else {
    sections = [{ start: from, end: to }];
  }

  const actingKey = endpointKey(node.id, ACTING_PORT);
  const supports: { label: string; at: number; support: SupportNode['support'] }[] = [];
  const planes = {
    x: { forces: [] as ShaftViewMark[], couples: [] as ShaftViewMark[], spans: [] as ShaftViewSpan[] },
    y: { forces: [] as ShaftViewMark[], couples: [] as ShaftViewMark[], spans: [] as ShaftViewSpan[] },
  };
  const torques: ShaftViewMark[] = [];
  for (const { value, from: origin } of actingEntries(document, actingKey, resolution.incoming.get(actingKey) ?? [], values)) {
    const source = document.nodes.find((candidate) => candidate.id === origin.node);
    const label = source?.label ?? origin.node;
    // The unit a field was typed in, else its reference unit.
    const unitOf = (field: LoadField): Unit => {
      if (source?.kind === 'load' || source?.kind === 'distributedLoad') return loadFieldValue(source, field)?.unit ?? LOAD_FIELD_UNITS[field];
      return LOAD_FIELD_UNITS[field];
    };
    if (value.shape === 'support') {
      supports.push({ label, at: first(value.at), support: value.support });
    } else if (value.shape === 'point') {
      const at = first(value.at);
      for (const [plane, force, couple] of [['x', 'Fx', 'Cx'], ['y', 'Fy', 'Cy']] as const) {
        const F = first(value[force]);
        const C = first(value[couple]);
        if (F !== 0) planes[plane].forces.push({ label, at, value: F, unit: unitOf(force) });
        if (C !== 0) planes[plane].couples.push({ label, at, value: C, unit: unitOf(couple) });
      }
      const T = first(value.torque);
      if (T !== 0) torques.push({ label, at, value: T, unit: unitOf('torque') });
    } else {
      const spanFrom = first(value.from);
      const spanTo = first(value.to);
      for (const [plane, rate] of [['x', 'qx'], ['y', 'qy']] as const) {
        const q = first(value[rate]);
        if (q !== 0) planes[plane].spans.push({ label, from: spanFrom, to: spanTo, rate: q, unit: unitOf(rate) });
      }
    }
  }

  if (swept) {
    warnings.push({
      kind: 'shaftView',
      nodeId: node.id,
      message: 'something drawn here varies across a sweep — the view shows its first point',
    });
  }
  return { kind: 'shaftView', lengthUnit, from, to, sections, supports, planes, torques };
}

// --- shaft nodes -------------------------------------------------------------

/**
 * A round or stepped shaft's outer diameter at each of its own positions: a
 * step applies from its start, the first step also before it.
 */
export function shaftProfile(node: ShaftNode, shaft: ShaftValue, resolution: Resolution, values: ReadonlyMap<string, PortValue>): NumericSeries {
  const section = node.section;
  if (section.kind === 'stepped') {
    const steps = section.steps.map((step) => ({ start: toCanonical(step.start, section.unit), d: toCanonical(step.d, section.unit) }));
    return {
      kind: 'numeric',
      axes: shaft.z.axes,
      data: shaft.z.data.map((z) => [...steps].reverse().find((step) => step.start <= z)?.d ?? (steps[0] as { d: number }).d),
    };
  }
  const key = endpointKey(node.id, 'd');
  const edge = resolution.incoming.get(key)?.[0];
  const d = edge === undefined
    ? scalarSeries(section.kind === 'round' ? toCanonical(section.d.value, section.d.unit) : 0)
    : (valueAtEdge(edge, key, values) as NumericSeries);
  return broadcastSeries(d, unionAxes(shaft.z.axes, d.axes));
}

/** The second moment of area at each of a shaft's own positions: the section that starts at or before it. */
export function shaftSecondMoment(shaft: ShaftValue): NumericSeries {
  const axes = unionAxes(shaft.z.axes, ...shaft.sections.map((section) => section.I.axes));
  const readZ = reader(shaft.z, axes);
  const readI = shaft.sections.map((section) => reader(section.I, axes));
  const data = Array.from({ length: gridSize(axes) }, (_, cell) => {
    const z = readZ(cell);
    let index = 0;
    shaft.sections.forEach((section, i) => {
      if (section.start <= z) index = i;
    });
    return (readI[index] as (cell: number) => number)(cell);
  });
  return { kind: 'numeric', axes, data };
}

/**
 * A Shaft node's value and its positions along z. `from` and `to` set the
 * axis, so — like a range's bounds — they must be single values; `E` and the
 * section may vary across a sweep (a study over diameters), broadcasting like
 * any other value.
 */
export function evaluateShaftNode(node: ShaftNode, resolution: Resolution, values: ReadonlyMap<string, PortValue>): ShaftValue {
  const field = (name: 'from' | 'to' | 'E' | 'd' | 'd_i' | 'I'): NumericSeries | undefined => {
    const key = endpointKey(node.id, name);
    const edge = resolution.incoming.get(key)?.[0];
    if (edge === undefined) {
      const typed = shaftFieldValue(node, name);
      return typed === undefined ? undefined : scalarSeries(toCanonical(typed.value, typed.unit));
    }
    const wired = valueAtEdge(edge, key, values);
    if (wired.kind !== 'numeric') throw new KernelError(`'${name}' needs a number, not a ${wired.kind} value`, key);
    return wired;
  };
  const single = (name: 'from' | 'to'): number => {
    const series = field(name) as NumericSeries;
    if (series.data.length !== 1) {
      throw new KernelError(`'${name}' needs a single value — the shaft's extent sets its own z axis`, endpointKey(node.id, name));
    }
    return series.data[0] as number;
  };
  const from = single('from');
  const to = single('to');
  if (!(to > from)) throw new KernelError("'to' must lie after 'from'", endpointKey(node.id, 'to'));

  const axis = resolution.axes.get(node.id);
  const count = axis?.length ?? node.count;
  const positions =
    count <= 1 ? [(from + to) / 2] : Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
  const z: NumericSeries = { kind: 'numeric', axes: axis === undefined ? [] : [axis], data: positions };

  const section = node.section;
  let sections: { readonly start: number; readonly I: NumericSeries }[];
  if (section.kind === 'stepped') {
    sections = section.steps.map((step) => {
      const d = toCanonical(step.d, section.unit);
      const bore = step.d_i === undefined ? 0 : toCanonical(step.d_i, section.unit);
      return { start: toCanonical(step.start, section.unit), I: scalarSeries((Math.PI * (d ** 4 - bore ** 4)) / 64) };
    });
  } else if (section.kind === 'secondMoment') {
    sections = [{ start: from, I: field('I') as NumericSeries }];
  } else {
    const d = field('d') as NumericSeries;
    const bore = field('d_i') ?? scalarSeries(0);
    const axes = unionAxes(d.axes, bore.axes);
    const readD = reader(d, axes);
    const readBore = reader(bore, axes);
    const data = Array.from({ length: gridSize(axes) }, (_, cell) => {
      const outer = readD(cell);
      const inner = readBore(cell);
      if (!(outer > 0) || inner < 0 || inner >= outer) {
        throw new KernelError(`a bore of ${inner} mm does not fit a ${outer} mm shaft`, endpointKey(node.id, 'd_i'));
      }
      return (Math.PI * (outer ** 4 - inner ** 4)) / 64;
    });
    sections = [{ start: from, I: { kind: 'numeric', axes, data } }];
  }

  return { kind: 'shaft', from: scalarSeries(from), to: scalarSeries(to), E: field('E') as NumericSeries, sections, z };
}

// --- load nodes -------------------------------------------------------------

/**
 * A Load or Distributed load node's value: each field read off its wire, or
 * its typed value, or zero when the node leaves it out. A wired field keeps
 * whatever axes it varies along — a load swept along the shaft is one load
 * at many positions, and the diagrams it feeds broadcast over them.
 */
export function evaluateLoad(
  node: LoadNode | DistributedLoadNode | SupportNode,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): LoadValue {
  const field = (name: LoadField): NumericSeries => {
    const key = endpointKey(node.id, name);
    const edge = resolution.incoming.get(key)?.[0];
    if (edge === undefined) {
      const typed = node.kind === 'support' ? node.at : loadFieldValue(node, name);
      return scalarSeries(typed === undefined ? 0 : toCanonical(typed.value, typed.unit));
    }
    const wired = valueAtEdge(edge, key, values);
    if (wired.kind !== 'numeric') {
      throw new KernelError(`'${name}' needs a number, not a ${wired.kind} value`, key);
    }
    return wired;
  };

  if (node.kind === 'support') return { kind: 'load', shape: 'support', at: field('at'), support: node.support };

  if (node.kind === 'load') {
    return {
      kind: 'load',
      shape: 'point',
      at: field('at'),
      Fx: field('Fx'),
      Fy: field('Fy'),
      torque: field('torque'),
      Cx: field('Cx'),
      Cy: field('Cy'),
    };
  }

  const from = field('from');
  const to = field('to');
  const axes = unionAxes(from.axes, to.axes);
  const readFrom = reader(from, axes);
  const readTo = reader(to, axes);
  for (let cell = 0; cell < gridSize(axes); cell += 1) {
    if (readTo(cell) < readFrom(cell)) {
      throw new KernelError("'to' lies before 'from' — a distributed load runs from its start to its end", endpointKey(node.id, 'to'));
    }
  }
  return { kind: 'load', shape: 'span', from, to, qx: field('qx'), qy: field('qy') };
}
