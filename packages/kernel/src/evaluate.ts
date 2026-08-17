/**
 * Running a graph.
 *
 * Everything the other files established meets here: the graph is resolved and
 * ordered, each formula is compiled once, values carry labelled axes
 * so a second range turns a curve into a grid without rewiring, and the
 * quarantine gate refuses anything not signed off.
 *
 * Two boundaries are crossed in this file and nowhere else:
 *
 * - **Units.** A document stores what its author typed — `250 kW` — and the
 *   kernel computes in mm-N-s-rad-K. Conversion happens here, when a value
 *   enters, and again when an output declares what to display in. Inside, there
 *   are no display units at all, which is what makes the density trap a
 *   transcription question rather than a live hazard.
 * - **Sweeps.** A range becomes a series with an axis; a scalar is the same
 *   thing with no axes. There is no second code path for the swept case, which
 *   is the economy that was chosen for.
 */

import { DIMENSIONLESS, isDimensionless, toCanonical, type Unit } from '@joveworks/units';
import {
  VALUE_PORT,
  THRESHOLD_PORT,
  VERDICT_PORT,
  isRange,
  renardValues,
  type Catalogue,
  type CompareNode,
  type Edge,
  type GraphDocument,
  type InputNode,
  type OutputNode,
  type Comparison,
  type Formula,
  type Port,
  type SpectrumPort,
} from '@joveworks/schema';

import { packChannelIndices, waypointChannelIndices } from './bundle.js';
import { comparator } from './compile.js';
import { KernelError } from './errors.js';
import { assertEvaluable, compileClosureFormula, compileFormula } from './formula.js';
import { canonicalUnit, endpointKey, resolveGraph, type PortType, type Resolution } from './graph.js';
import {
  LARGE_GRID,
  broadcastSeries,
  gridSize,
  reader,
  scalarSeries,
  categoricalScalar,
  unionAxes,
  type Axis,
  type CategoricalSeries,
  type NumericSeries,
  type PortValue,
  type Series,
  type Spectrum,
} from './series.js';
import type { Warning } from './warnings.js';

export interface EvaluationOptions {
  /** Cell count at which the large-grid guard warns. */
  readonly largeGrid?: number;
}

interface OutputBase {
  readonly nodeId: string;
  readonly label?: string;
  readonly caption?: string;
  readonly frameId?: string;
}

export interface PrintResult extends OutputBase {
  readonly kind: 'print';
  readonly series: Series;
  /** What to display in. Canonical when the source port has no unit of its own. */
  readonly unit: Unit;
  readonly figures: number;
}

/** The assertion that makes a notebook a dimensioning report. */
export interface CheckResult extends OutputBase {
  readonly kind: 'check';
  readonly series: NumericSeries;
  readonly comparison: Comparison;
  /** In canonical units — from a wire if one is connected, else the typed default. */
  readonly threshold: number;
  /** The typed default's unit, or the value's own display unit for a bare unitless default. */
  readonly unit: Unit;
  /** One verdict per cell of the swept grid. */
  readonly results: readonly boolean[];
  /** Whether every cell passes — the badge a scalar check shows. */
  readonly passed: boolean;
}

export interface PlotAxis {
  readonly axis: Axis;
  /** The coordinates along it: the range node's own values. */
  readonly coordinates: Series;
  readonly unit: Unit;
}

export interface PlotResult extends OutputBase {
  readonly kind: 'plot';
  readonly series: NumericSeries;
  readonly unit: Unit;
  readonly x: PlotAxis;
  readonly series2?: PlotAxis;
  readonly facet?: PlotAxis;
  readonly contour: boolean;
  readonly threshold?: number;
}

export interface TableColumnResult {
  readonly name: string;
  readonly series: Series;
  readonly unit: Unit;
}

export interface TableResult extends OutputBase {
  readonly kind: 'table';
  readonly columns: readonly TableColumnResult[];
  readonly axes: readonly Axis[];
}

/** Shows the wired formula's own expression, typeset — not its value. */
export interface EquationResult extends OutputBase {
  readonly kind: 'equation';
  readonly expression: string;
  readonly citation?: string;
}

export type OutputResult = PrintResult | CheckResult | PlotResult | TableResult | EquationResult;

export interface Evaluation {
  readonly document: GraphDocument;
  readonly resolution: Resolution;
  /** `node.port` → the value it produced. */
  readonly values: ReadonlyMap<string, PortValue>;
  readonly outputs: readonly OutputResult[];
  readonly warnings: readonly Warning[];
}

/** The value on a port after evaluation, by node and port name. */
export function valueAt(
  evaluation: Evaluation,
  node: string,
  port: string,
): PortValue | undefined {
  return evaluation.values.get(endpointKey(node, port));
}

export function evaluateDocument(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  options: EvaluationOptions = {},
): Evaluation {
  const resolution = resolveGraph(document, catalogues);
  const warnings: Warning[] = [...resolution.warnings];
  const values = new Map<string, PortValue>();
  const outputs: OutputResult[] = [];
  const axisById = new Map(resolution.axes.map((axis) => [axis.id, axis] as const));
  const largeGrid = options.largeGrid ?? LARGE_GRID;

  for (const node of resolution.order) {
    switch (node.kind) {
      case 'input':
        values.set(endpointKey(node.id, VALUE_PORT), inputValue(node, axisById));
        break;

      case 'formula': {
        const formula = resolution.formulas.get(node.id) as Formula;
        const output = evaluateFormula(node.id, formula, resolution, values, warnings, largeGrid);
        values.set(endpointKey(node.id, formula.output.name), output);
        break;
      }

      case 'closure': {
        const formula = resolution.formulas.get(node.id) as Formula;
        const output = evaluateFormula(
          node.id,
          formula,
          resolution,
          values,
          warnings,
          largeGrid,
          /* closure */ true,
        );
        values.set(endpointKey(node.id, formula.output.name), output);
        break;
      }

      case 'compare':
        values.set(endpointKey(node.id, VERDICT_PORT), evaluateCompare(node, resolution, values));
        break;

      case 'waypoint':
        evaluateWaypoint(node.id, resolution, values, values);
        break;

      case 'pack':
        values.set(endpointKey(node.id, 'bundle'), evaluatePack(node.id, resolution, values));
        break;

      case 'unpack':
        evaluateUnpack(node.id, resolution, values, values);
        break;

      case 'output':
        outputs.push(outputResult(node, resolution, values, axisById, warnings));
        break;
    }
  }

  return { document, resolution, values, outputs, warnings };
}

// --- input nodes ------------------------------------------------------------

/**
 * A literal, a categorical choice, a spectrum or a range, converted into
 * canonical units on the way in. This is the boundary.
 */
function inputValue(node: InputNode, axes: ReadonlyMap<string, Axis>): PortValue {
  const spec = node.value;
  const axis = isRange(spec) ? axes.get(node.id) : undefined;
  if (isRange(spec) && axis === undefined) {
    throw new KernelError('a range node introduces an axis, and this one has none', node.id);
  }

  switch (spec.kind) {
    case 'scalar':
    case 'slider':
      return scalarSeries(toCanonical(spec.value, spec.unit));

    case 'categorical':
      return categoricalScalar(spec.value);

    case 'spectrum':
      return {
        kind: 'spectrum',
        values: spec.values.map((value) => toCanonical(value, spec.unit)),
      };

    case 'list':
      return {
        kind: 'numeric',
        axes: [axis as Axis],
        data: spec.values.map((value) => toCanonical(value, spec.unit)),
      };

    case 'categoricalList':
      return { kind: 'categorical', axes: [axis as Axis], data: [...spec.values] };

    case 'linear': {
      const start = toCanonical(spec.start, spec.unit);
      const stop = toCanonical(spec.stop, spec.unit);
      const last = spec.points - 1;
      return {
        kind: 'numeric',
        axes: [axis as Axis],
        // Both endpoints included, and the last point is `stop` exactly rather
        // than the accumulation of `points - 1` additions.
        data: Array.from({ length: spec.points }, (_, i) => start + ((stop - start) * i) / last),
      };
    }

    case 'logarithmic': {
      // Geometric spacing. The schema has already refused endpoints at or below
      // zero, which is where this would otherwise produce NaN halfway down a
      // sweep instead of a message.
      const start = toCanonical(spec.start, spec.unit);
      const stop = toCanonical(spec.stop, spec.unit);
      const last = spec.points - 1;
      const ratio = Math.log(stop / start);
      return {
        kind: 'numeric',
        axes: [axis as Axis],
        data: Array.from({ length: spec.points }, (_, i) => start * Math.exp((ratio * i) / last)),
      };
    }

    case 'renard':
      return {
        kind: 'numeric',
        axes: [axis as Axis],
        data: renardValues(spec.series, spec.start, spec.stop).map((value) =>
          toCanonical(value, spec.unit),
        ),
      };

    case 'tableColumn':
      throw new KernelError(
        'a table column needs a table, and tables arrive with the second slice',
        node.id,
      );
  }
}

// --- formula nodes ----------------------------------------------------------

function valueAtEdge(edge: Edge, key: string, values: ReadonlyMap<string, PortValue>): PortValue {
  const value = values.get(endpointKey(edge.from.node, edge.from.port));
  if (value === undefined) {
    throw new KernelError(`nothing was computed for '${edge.from.node}.${edge.from.port}'`, key);
  }
  return value;
}

/** A non-spectrum port takes exactly one edge (`oneEdge` in graph.ts already refused a second). */
function inputPortValue(
  nodeId: string,
  port: Port,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): PortValue {
  const key = endpointKey(nodeId, port.name);
  const edge = resolution.incoming.get(key)?.[0];
  if (edge !== undefined) return valueAtEdge(edge, key, values);

  // Not wired: a declared default stands in, in the unit it was declared in.
  // Anything else is an incomplete graph, which the editor marks on the
  // node — this is the same fact, said in an error.
  if (port.kind === 'numeric' && port.default !== undefined && !('variables' in port.unit)) {
    return scalarSeries(toCanonical(port.default, port.unit as Unit));
  }
  if (port.kind === 'categorical' && port.default !== undefined) {
    return categoricalScalar(port.default);
  }
  throw new KernelError(`'${port.name}' is not connected and has no default`, key);
}

/**
 * Every edge wired to a spectrum port, each keeping its own value —
 * and so its own axes — rather than flattened into one collection up front.
 *
 * A swept edge is broadcast per source, not flattened across edges: two
 * ranges wired into `minimum` used to broadcast pointwise when it was an
 * ordinary two-port generic node ("two ranges give an n × m grid" applies
 * here exactly as it does to `add`), and
 * flattening across edges silently lost that — collapsing the whole grid to
 * one scalar instead of a grid of pointwise reductions. `evaluateFormula`
 * broadcasts each edge against the node's own axes and collects one value
 * per edge per cell; only an authored spectrum list — invariant by
 * definition — still contributes every one of its values at every cell.
 */
function spectrumEdgeValues(
  nodeId: string,
  port: Port,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): readonly (NumericSeries | Spectrum)[] {
  const key = endpointKey(nodeId, port.name);
  const edges = resolution.incoming.get(key) ?? [];
  if (edges.length === 0) throw new KernelError(`'${port.name}' is not connected and has no default`, key);
  return edges.map((edge) => {
    const value = valueAtEdge(edge, key, values);
    if (value.kind === 'categorical' || value.kind === 'bundle') {
      throw new KernelError(
        `'${edge.from.node}.${edge.from.port}' is a ${value.kind} value, and this port needs a number`,
        key,
      );
    }
    return value;
  });
}

function evaluateFormula(
  nodeId: string,
  formula: Formula,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
  warnings: Warning[],
  largeGrid: number,
  closure = false,
): NumericSeries {
  assertEvaluable(formula, nodeId);
  if (formula.output.kind === 'categorical') {
    throw new KernelError(
      `'${formula.id}' produces a categorical value, which needs a table`,
      nodeId,
    );
  }

  // A closure's declared output has nothing real to check the expression
  // against (closure.ts, formula.ts's compileClosureFormula) — its
  // dimension was already proven live, during resolution, against this
  // node's actual wiring.
  const compiled = closure
    ? compileClosureFormula(formula, nodeId)
    : compileFormula(formula, resolution.bindings.get(nodeId) ?? new Map(), nodeId);

  const regularPorts = formula.inputs.filter((port) => port.kind !== 'spectrum');
  const regularInputs = regularPorts.map((port) => {
    const value = inputPortValue(nodeId, port, resolution, values);
    // An ordinary port's own source is never spectrum- or bundle-kind — a
    // formula cannot produce either — so this is a defensive check, not a
    // real case, but it is what lets everything below see NumericSeries |
    // CategoricalSeries instead of the full PortValue union.
    if (value.kind === 'spectrum' || value.kind === 'bundle') {
      throw new KernelError(`'${port.name}' cannot hold a ${value.kind} — only a matching port can`, nodeId);
    }
    return { port, value };
  });
  const spectrumPorts = formula.inputs.filter(
    (port): port is SpectrumPort => port.kind === 'spectrum',
  );
  const spectrumInputs = spectrumPorts.map((port) => ({
    port,
    edgeValues: spectrumEdgeValues(nodeId, port, resolution, values),
  }));

  // Every axis actually in play — a regular port's own, and each spectrum
  // edge's own, broadcast per source, not flattened across them; an
  // authored list contributes no axis, invariant.
  const axes = unionAxes(
    ...regularInputs.map(({ value }) => value.axes),
    ...spectrumInputs.flatMap(({ edgeValues }) =>
      edgeValues.map((value) => (value.kind === 'spectrum' ? [] : value.axes)),
    ),
  );
  const cells = gridSize(axes);
  if (cells >= largeGrid) {
    warnings.push({
      kind: 'largeGrid',
      nodeId,
      message:
        `this node evaluates ${cells} points (${axes
          .map((axis) => `${axis.label}: ${axis.length}`)
          .join(' × ')}) — a sweep that large takes a moment`,
    });
  }

  const env: Record<string, number | readonly number[]> = {};
  const readers: Array<{ readonly name: string; readonly read: (cell: number) => number }> = [];
  for (const { port, value } of regularInputs) {
    if (value.kind === 'categorical') {
      throw new KernelError(
        `'${port.name}' is a categorical value, and using one in an expression needs a ` +
          'table',
        endpointKey(nodeId, port.name),
      );
    }
    readers.push({ name: port.name, read: reader(value, axes) });
  }

  // One reader per spectrum edge — a swept edge contributes one broadcast
  // value per cell, an authored list contributes all of its values at every
  // cell — collected into one array per spectrum port, per cell.
  type EdgeContribution =
    | { readonly kind: 'reader'; readonly read: (cell: number) => number }
    | { readonly kind: 'fixed'; readonly values: readonly number[] };
  const spectrumReaders: Array<{
    readonly name: string;
    readonly perEdge: readonly EdgeContribution[];
  }> = spectrumInputs.map(({ port, edgeValues }) => ({
    name: port.name,
    perEdge: edgeValues.map((value): EdgeContribution =>
      value.kind === 'spectrum'
        ? { kind: 'fixed', values: value.values }
        : { kind: 'reader', read: reader(value, axes) },
    ),
  }));

  const data = new Array<number>(cells);
  let outside = 0;
  for (let cell = 0; cell < cells; cell += 1) {
    for (const { name, read } of readers) env[name] = read(cell);
    for (const { name, perEdge } of spectrumReaders) {
      env[name] = perEdge.flatMap((contribution) =>
        contribution.kind === 'reader' ? [contribution.read(cell)] : contribution.values,
      );
    }
    if (compiled.appliesWhen !== undefined && !compiled.appliesWhen(env)) outside += 1;
    data[cell] = compiled.evaluate(env);
  }

  // Using a formula outside the condition R&M states for it warns. It does
  // not block — the predecessor library never read these conditions at all, and
  // a student who does not know one exists is exactly who this is for.
  if (outside > 0) {
    warnings.push({
      kind: 'appliesWhen',
      nodeId,
      message:
        `'${formula.id}' applies when ${formula.appliesWhen as string}, which does not hold ` +
        (cells === 1 ? 'here' : `at ${outside} of ${cells} points`),
    });
  }

  return { kind: 'numeric', axes, data };
}

// --- compare nodes -----------------------------------------------------------

/**
 * `value` compared against `threshold`, cell for cell. `threshold` falls
 * back to the node's own typed quantity — a port default — when nothing is
 * wired to it, and broadcasts as a scalar the same way a bare
 * number would; wired to a swept series of its own, it lines up
 * positionally against `value`'s cells rather than gridding with it the way
 * two different formula inputs would — a per-point bound naming its
 * own axis (a second sweep unrelated to `value`'s) is not what a threshold
 * means, so this is deliberately a length match, not an axis-identity one.
 */
function evaluateCompare(
  node: CompareNode,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): CategoricalSeries {
  const valueKey = endpointKey(node.id, VALUE_PORT);
  const valueEdge = resolution.incoming.get(valueKey)?.[0];
  if (valueEdge === undefined) {
    throw new KernelError("'value' is not connected and has no default", valueKey);
  }
  const value = valueAtEdge(valueEdge, valueKey, values);
  if (value.kind !== 'numeric') {
    throw new KernelError('a comparison needs a numeric value, not a categorical one', valueKey);
  }

  const thresholdKey = endpointKey(node.id, THRESHOLD_PORT);
  const thresholdEdge = resolution.incoming.get(thresholdKey)?.[0];
  // A bare, unitless default is read in `value`'s own *display* unit, not its
  // canonical one — a student comparing a Pa-displayed value never sees
  // canonical N/mm² anywhere else on screen, so a typed `6` has to mean
  // 6 of whatever unit is shown, not 6 of a unit the app never shows at all.
  // An explicit unit the student did type is never overridden by this.
  // `value` is a target port here, not a source — its resolved type (with
  // the wired source's own display unit) lives in `targets`, propagated
  // there verbatim by resolveGraph's compare-node branch (graph.ts).
  const valueDimension = resolution.targets.get(valueKey)?.dimension;
  const thresholdUnit =
    isDimensionless(node.threshold.unit.dimension) &&
    valueDimension !== undefined &&
    !isDimensionless(valueDimension)
      ? displayUnit(resolution.targets.get(valueKey))
      : node.threshold.unit;
  const threshold =
    thresholdEdge === undefined
      ? scalarSeries(toCanonical(node.threshold.value, thresholdUnit))
      : valueAtEdge(thresholdEdge, thresholdKey, values);
  if (threshold.kind !== 'numeric') {
    throw new KernelError('a comparison needs a numeric threshold, not a categorical one', thresholdKey);
  }
  if (threshold.data.length !== 1 && threshold.data.length !== value.data.length) {
    throw new KernelError(
      `the threshold has ${threshold.data.length} values, but the value it compares against has ` +
        `${value.data.length} — a swept threshold needs one bound per point`,
      thresholdKey,
    );
  }

  const compare = comparator(node.comparison);
  const data = value.data.map((cell, i) =>
    compare(cell, threshold.data[threshold.data.length === 1 ? 0 : i] as number) ? 'pass' : 'fail',
  );
  return { kind: 'categorical', axes: value.axes, data };
}

// --- waypoint, pack, unpack ---------------------------------------------

/** Literal passthrough of the first wired input — not a reduction, unlike `minimum`/`sum`. */
function evaluateWaypoint(
  nodeId: string,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
  out: Map<string, PortValue>,
): void {
  for (const n of waypointChannelIndices(resolution.document, nodeId)) {
    const key = endpointKey(nodeId, `in${n}`);
    const edge = resolution.incoming.get(key)?.[0];
    if (edge !== undefined) out.set(endpointKey(nodeId, `out${n}`), valueAtEdge(edge, key, values));
  }
}

/** Collects each currently-wired channel's value, in index order, into one bundle. */
function evaluatePack(
  nodeId: string,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): PortValue {
  const indices = packChannelIndices(resolution.document, nodeId);
  const collected = indices.map((n) => {
    const key = endpointKey(nodeId, `in${n}`);
    const edge = resolution.incoming.get(key)?.[0];
    if (edge === undefined) throw new KernelError(`'in${n}' is not connected`, key);
    return valueAtEdge(edge, key, values);
  });
  return { kind: 'bundle', values: collected };
}

/**
 * Spreads a wired bundle's values back out onto `out0..outN`. Writes
 * nothing when `bundle` is unwired — no outputs exist to write to, the same
 * "just disappears" every other unwired ghost-slot port follows.
 */
function evaluateUnpack(
  nodeId: string,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
  out: Map<string, PortValue>,
): void {
  const key = endpointKey(nodeId, 'bundle');
  const edge = resolution.incoming.get(key)?.[0];
  if (edge === undefined) return;
  const bundle = valueAtEdge(edge, key, values);
  if (bundle.kind !== 'bundle') {
    throw new KernelError("'bundle' is not a bundle value", key);
  }
  bundle.values.forEach((value, i) => out.set(endpointKey(nodeId, `out${i}`), value));
}

// --- output nodes -----------------------------------------------------------

function sourceOf(
  node: OutputNode,
  port: string,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): { readonly value: Series; readonly unit: Unit } {
  const key = endpointKey(node.id, port);
  const value = (() => {
    // An output's own port is never spectrum-kind — only a
    // formula's input can be widened that way — so resolveGraph has already refused a second edge.
    const edge = resolution.incoming.get(key)?.[0];
    if (edge === undefined) throw new KernelError(`'${port}' is not connected`, key);
    const found = values.get(endpointKey(edge.from.node, edge.from.port));
    if (found === undefined) {
      throw new KernelError(`nothing was computed for '${edge.from.node}.${edge.from.port}'`, key);
    }
    return found;
  })();

  if (value.kind === 'spectrum' || value.kind === 'bundle') {
    throw new KernelError(`'${port}' is a ${value.kind}, which an output node cannot render`, key);
  }
  return { value, unit: displayUnit(resolution.targets.get(key)) };
}

/**
 * What an output displays in: the unit the student chose, else the unit the
 * source port declares, else the canonical unit of its dimension — which is
 * where a generic node lands, since it has no display unit of its own.
 */
function displayUnit(type: PortType | undefined): Unit {
  if (type?.unit !== undefined) return type.unit;
  return canonicalUnit(type?.dimension ?? DIMENSIONLESS);
}

function outputResult(
  node: OutputNode,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
  axes: ReadonlyMap<string, Axis>,
  warnings: Warning[],
): OutputResult {
  const base: OutputBase = {
    nodeId: node.id,
    ...(node.label === undefined ? {} : { label: node.label }),
    ...(node.caption === undefined ? {} : { caption: node.caption }),
    ...(node.frameId === undefined ? {} : { frameId: node.frameId }),
  };
  const output = node.output;

  if (output.kind === 'equation') {
    const key = endpointKey(node.id, VALUE_PORT);
    const edge = resolution.incoming.get(key)?.[0];
    if (edge === undefined) throw new KernelError("'value' is not connected", key);
    // Guaranteed defined: resolveGraph already refused any wire whose
    // source is not a formula or closure node (graph.ts).
    const formula = resolution.formulas.get(edge.from.node) as Formula;
    return {
      ...base,
      kind: 'equation',
      expression: formula.expression,
      ...(formula.citation === undefined ? {} : { citation: formula.citation }),
    };
  }

  if (output.kind === 'table') {
    const sources = output.columns.map((name) => {
      const { value, unit } = sourceOf(node, name, resolution, values);
      return { name, series: value, unit };
    });
    const tableAxes = unionAxes(...sources.map((column) => column.series.axes));
    const columns = sources.map((column) => ({
      ...column,
      series: broadcastSeries(column.series, tableAxes),
    }));
    return {
      ...base,
      kind: 'table',
      columns,
      axes: tableAxes,
    };
  }

  const { value, unit: portUnit } = sourceOf(node, VALUE_PORT, resolution, values);

  if (output.kind === 'print') {
    return {
      ...base,
      kind: 'print',
      series: value,
      unit: output.unit ?? portUnit,
      figures: output.figures ?? 4,
    };
  }

  if (value.kind !== 'numeric') {
    throw new KernelError(
      `a ${output.kind} output needs a numeric value, not a categorical one`,
      node.id,
    );
  }

  if (output.kind === 'check') {
    // A bare, unitless default is read in the value's own display unit, not
    // its canonical one — same reasoning as `evaluateCompare`'s
    // `thresholdUnit` above. An explicit unit the student did type is never
    // overridden by this.
    const thresholdUnit =
      isDimensionless(output.threshold.unit.dimension) && !isDimensionless(portUnit.dimension)
        ? portUnit
        : output.threshold.unit;

    // `threshold` follows `CompareNode.threshold`'s rule — wired wins, else
    // the typed default — but resolves to a single value, not a per-point
    // bound: a check's badge is one line crossed or not, the scalar
    // counterpart of the reference line a plot draws (mirrors plot's own
    // threshold resolution below).
    const thresholdKey = endpointKey(node.id, THRESHOLD_PORT);
    const thresholdEdge = resolution.incoming.get(thresholdKey)?.[0];
    const threshold =
      thresholdEdge === undefined
        ? toCanonical(output.threshold.value, thresholdUnit)
        : (() => {
            const series = valueAtEdge(thresholdEdge, thresholdKey, values);
            if (series.kind !== 'numeric') {
              throw new KernelError(
                "a check's threshold needs a numeric value, not a categorical one",
                thresholdKey,
              );
            }
            if (series.data.length !== 1) {
              throw new KernelError(
                "a check's threshold needs a single value — it is one bound, not one per point",
                thresholdKey,
              );
            }
            return series.data[0] as number;
          })();

    const compare = comparator(output.comparison);
    const results = value.data.map((cell) => compare(cell, threshold));
    return {
      ...base,
      kind: 'check',
      series: value,
      comparison: output.comparison,
      threshold,
      unit: thresholdUnit,
      results,
      passed: results.every(Boolean),
    };
  }

  const plotAxis = (id: string): PlotAxis => {
    const axis = axes.get(id);
    if (axis === undefined) {
      throw new KernelError(`'${id}' is not a range input node, so it introduces no axis`, node.id);
    }
    const coordinates = values.get(endpointKey(id, VALUE_PORT));
    if (coordinates === undefined || coordinates.kind === 'spectrum' || coordinates.kind === 'bundle') {
      throw new KernelError(`'${id}' produced no coordinates to plot against`, node.id);
    }
    if (!value.axes.some((own) => own.id === id)) {
      warnings.push({
        kind: 'plotAxis',
        nodeId: node.id,
        message: `the plotted value does not vary along '${axis.label}' — the curve will be flat`,
      });
    }
    return {
      axis,
      coordinates,
      unit: displayUnit(resolution.sources.get(endpointKey(id, VALUE_PORT))),
    };
  };

  // Up to three slots — x, series (color), facet (small multiples) — each
  // either pinned by the student or filled automatically from axes the
  // plotted value varies along, in document order. A pinned slot is
  // never touched, and never double-filled by autofill.
  const pinned = new Set(
    [output.x, output.series, output.facet].filter((id): id is string => id !== undefined),
  );
  const autofill = [...value.axes]
    .filter((axis) => !pinned.has(axis.id))
    .sort((a, b) => a.order - b.order);
  let cursor = 0;
  const nextAuto = (): string | undefined => autofill[cursor++]?.id;

  const xId =
    output.x ??
    nextAuto() ??
    [...axes.values()].sort((a, b) => a.order - b.order)[0]?.id;
  if (xId === undefined) {
    throw new KernelError('a plot needs at least one range input node in the document', node.id);
  }
  const seriesId = output.series ?? nextAuto();
  const facetId = output.facet ?? nextAuto();

  for (; cursor < autofill.length; cursor += 1) {
    const axis = autofill[cursor] as Axis;
    warnings.push({
      kind: 'plotAxisDropped',
      nodeId: node.id,
      message: `the plotted value also varies along '${axis.label}', which this plot has no room to show`,
    });
  }

  const contour = output.contour ?? false;
  if (contour && facetId !== undefined) {
    warnings.push({
      kind: 'plotContourFacet',
      nodeId: node.id,
      message: `the facet axis is ignored while contour is on — a contour plot only draws x and series`,
    });
  }

  // `threshold` follows `CompareNode.threshold`'s rule — wired wins, else the
  // typed default, else (unlike compare, whose threshold is mandatory) no
  // line at all. A plot's threshold is one reference line, not a per-point
  // bound the way compare's can be, so a wired series has to resolve to a
  // single value.
  const thresholdKey = endpointKey(node.id, THRESHOLD_PORT);
  const thresholdEdge = resolution.incoming.get(thresholdKey)?.[0];
  const threshold =
    thresholdEdge === undefined
      ? output.threshold === undefined
        ? undefined
        : toCanonical(output.threshold.value, output.threshold.unit)
      : (() => {
          const series = valueAtEdge(thresholdEdge, thresholdKey, values);
          if (series.kind !== 'numeric') {
            throw new KernelError(
              "a plot's threshold needs a numeric value, not a categorical one",
              thresholdKey,
            );
          }
          if (series.data.length !== 1) {
            throw new KernelError(
              "a plot's threshold needs a single value — it draws one reference line, not one per point",
              thresholdKey,
            );
          }
          return series.data[0] as number;
        })();

  return {
    ...base,
    kind: 'plot',
    series: value,
    unit: output.unit ?? portUnit,
    x: plotAxis(xId),
    ...(seriesId === undefined ? {} : { series2: plotAxis(seriesId) }),
    ...(facetId === undefined || contour ? {} : { facet: plotAxis(facetId) }),
    contour,
    ...(threshold === undefined ? {} : { threshold }),
  };
}
