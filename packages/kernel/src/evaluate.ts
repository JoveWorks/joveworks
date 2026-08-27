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

import { DIMENSIONLESS, DIMENSIONLESS_UNIT, isDimensionless, isGenericDimension, toCanonical, type Unit } from '@joveworks/units';
import {
  VALUE_PORT,
  THRESHOLD_PORT,
  VERDICT_PORT,
  ALONG_PORT,
  AT_PORT,
  BEST_PORT,
  OBJECTIVE_PORT,
  X_PORT,
  Y_PORT,
  MONTE_CARLO_SAMPLE_PORT,
  MIN_PORT,
  MAX_PORT,
  MEAN_PORT,
  STDDEV_PORT,
  MODE_PORT,
  VALUES_PORT,
  WEIGHTS_PORT,
  PERCENTILE_PORT,
  STATISTIC_RESULT_PORT,
  START_PORT,
  STOP_PORT,
  COUNT_PORT,
  appliesWhenOf,
  domainMember,
  expressionOf,
  isRange,
  renardValues,
  plotMeasures,
  plotThresholdPort,
  type Candidate,
  type Catalogue,
  type CompareNode,
  type SelectNode,
  type StatisticNode,
  type Edge,
  type FileNode,
  type GraphDocument,
  type InputNode,
  type MonteCarloGeneratorNode,
  type MonteCarloReceiverNode,
  type OutputNode,
  type ClosureNode,
  type Comparison,
  type Formula,
  type FormulaNode,
  type NumericPort,
  type ObjectiveDirection,
  type Port,
  type RangeNode,
  type PlotViewOverride,
  type SpectrumPort,
} from '@joveworks/schema';
import {
  candidateAt,
  candidateMask,
  coordinatesAt,
  type AxisCoordinate,
  type AxisReadout,
} from './candidates.js';
import { paretoFront } from './pareto.js';
import { monteCarloSamples } from './random.js';

import { packChannelIndices, waypointChannelIndices } from './bundle.js';
import { comparator } from './compile.js';
import { KernelError } from './errors.js';
import { assertEvaluable, compileClosureFormula, compileFormula } from './formula.js';
import { canonicalUnit, endpointKey, resolveGraph, type PortType, type Resolution } from './graph.js';
import { evaluateSensitivity, type SensitivityRankingResult } from './sensitivity.js';
import { select, type SelectResult } from './select.js';
import { reduceAlong } from './statistics.js';
import { buildDistribution, type DistributionPanel } from './distribution.js';
import { inverseNormal, wilsonInterval } from './normal.js';
import {
  LARGE_GRID,
  broadcastBoolean,
  broadcastSeries,
  gridSize,
  indexer,
  isSeries,
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
  /**
   * Node ids whose computation is skipped entirely — `seed` stands in for
   * whatever they would have produced. Nothing here changes what a fresh
   * `evaluateDocument(document, catalogues)` call computes; it only lets a
   * caller who already knows part of the graph cannot have changed (a
   * Monte Carlo playback tick, most usefully — a generator's revealed count
   * is the only thing that differs between ticks, so everything not
   * downstream of a generator is invariant across them) skip redoing that
   * part's work. A node skipped without every one of its output ports
   * present in `seed` fails exactly the way an unwired required input does,
   * once something downstream tries to read it.
   */
  readonly skip?: ReadonlySet<string>;
  /** Prior port values, read for any node id in `skip` instead of recomputed. */
  readonly seed?: ReadonlyMap<string, PortValue>;
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

/**
 * An axis, its coordinates and its unit. Defined in `candidates.ts` as
 * `AxisReadout` because a figure and a marked candidate want exactly the same
 * three things about an axis; kept under this name because that is what every
 * plot result has always called it.
 */
export type PlotAxis = AxisReadout;

export interface PlotMeasureResult {
  readonly id: string;
  readonly label: string;
  readonly series: NumericSeries;
  readonly unit: Unit;
  readonly axes: readonly PlotAxis[];
  readonly threshold?: number;
  readonly view?: PlotViewOverride;
}

export interface PlotResult extends OutputBase {
  readonly kind: 'plot';
  /** New multi-measure result. Optional only for source compatibility with older fixtures. */
  readonly measures?: readonly PlotMeasureResult[];
  /** Legacy primary-measure projection retained while version-1 documents are accepted. */
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

/** Shades where every referenced Check node's verdict passes at once. */
export interface FeasibilityResult extends OutputBase {
  readonly kind: 'feasibility';
  readonly checks: readonly string[];
  /** The union of every referenced check's own axes. */
  readonly axes: readonly Axis[];
  /** One AND'd verdict per cell of `axes`. */
  readonly mask: readonly boolean[];
  /** One verdict grid per entry of `checks`, same order — the inputs `mask` was AND'd from. */
  readonly perCheck: readonly (readonly boolean[])[];
  readonly x: PlotAxis;
  readonly series2?: PlotAxis;
  readonly facet?: PlotAxis;
}

/** A tornado: every candidate input, ranked by how much the target moves across its bracket. */
export interface SensitivityResult extends OutputBase {
  readonly kind: 'sensitivity';
  readonly targetUnit: Unit;
  readonly rankings: readonly SensitivityRankingResult[];
}

/** One axis of the study, and the coordinate the winning cell sits at on it. */
/**
 * One axis of the winner's position. `AxisCoordinate` from `candidates.ts` —
 * the same "where is this cell" question a marked candidate asks, so the same
 * shape answers both.
 */
export type BestDesignCoordinate = AxisCoordinate;

/**
 * How much room a check still had at the winner, as a fraction of its own
 * bound — the number the checks are ranked by to name the governing one.
 */
export interface BestDesignMargin {
  readonly checkId: string;
  readonly margin: number;
}

/**
 * The decision: the feasible point where a wired objective is smallest (or
 * largest), the coordinates it sits at, and which constraint is the reason it
 * cannot go further.
 */
export interface BestDesignResult extends OutputBase {
  readonly kind: 'bestDesign';
  readonly checks: readonly string[];
  readonly direction: 'minimize' | 'maximize';
  /** The union of the objective's axes and every referenced check's. */
  readonly axes: readonly Axis[];
  /** One AND'd verdict per cell of `axes` — all true when `checks` is empty. */
  readonly feasible: readonly boolean[];
  /** The objective, broadcast onto `axes`. */
  readonly objective: NumericSeries;
  readonly unit: Unit;
  /** Absent exactly when no cell is feasible — a first-class answer, not a failure. */
  readonly winner?: {
    readonly cell: number;
    readonly objective: number;
    readonly at: readonly BestDesignCoordinate[];
    /** The least-margin check at the winner, where any check could be ranked. */
    readonly governing?: BestDesignMargin;
    /** Every rankable check's margin at the winner, least first. */
    readonly margins: readonly BestDesignMargin[];
  };
  /** With nothing feasible: the check that fails at the most candidates. */
  readonly blocking?: { readonly checkId: string; readonly failures: number };
  readonly feasibleCount: number;
}

/** One candidate on a Pareto chart: its scores, its standing, and where it sits. */
export interface ParetoPoint {
  readonly cell: number;
  /** Canonical, in the objective's own direction — not normalised. */
  readonly x: number;
  readonly y: number;
  readonly feasible: boolean;
  /** Feasible, and beaten by nothing on both objectives at once. */
  readonly onFront: boolean;
  /**
   * The design this point *is*, ready to become a mark.
   *
   * Carried on the result rather than looked up when a point is clicked: the
   * scatter already knows every axis of the union grid, so resolving it here
   * once is both cheaper and the only place with the coordinates to hand.
   */
  readonly candidate: Candidate;
  /** Its position on every axis of the study, ready to print in a tip. */
  readonly at: readonly AxisCoordinate[];
}

/**
 * The candidates worth arguing about, and the ones that were beaten.
 *
 * Every cell is returned, not just the front: an infeasible or dominated point
 * is still drawn — muted, or hollow — because seeing *why* the front stops
 * where it does is most of what the chart is for.
 */
export interface ParetoResult extends OutputBase {
  readonly kind: 'pareto';
  readonly checks: readonly string[];
  /** The union of both objectives' axes and every referenced check's. */
  readonly axes: readonly Axis[];
  readonly points: readonly ParetoPoint[];
  readonly xUnit: Unit;
  readonly yUnit: Unit;
  readonly xDirection: ObjectiveDirection;
  readonly yDirection: ObjectiveDirection;
  /** What to write on each axis: the wired source node's own label. */
  readonly xLabel: string;
  readonly yLabel: string;
  readonly frontCount: number;
  readonly feasibleCount: number;
}

export interface DistributionResult extends OutputBase {
  readonly kind: 'distribution';
  readonly view: 'histogram' | 'cdf';
  readonly unit: Unit;
  readonly over: Axis;
  readonly facet?: Axis;
  readonly panels: readonly DistributionPanel[];
}

export interface ReliabilityEstimate {
  readonly checkId: string;
  readonly trials: number;
  readonly failures: number;
  readonly probability: number;
  readonly interval: readonly [number, number];
  readonly beta: number;
  readonly unresolved: boolean;
  readonly converged: boolean;
}

export interface ReliabilityResult extends OutputBase {
  readonly kind: 'reliability';
  readonly confidence: number;
  readonly checks: readonly ReliabilityEstimate[];
  readonly combined?: ReliabilityEstimate;
}

export type OutputResult =
  | PrintResult
  | CheckResult
  | PlotResult
  | TableResult
  | EquationResult
  | FeasibilityResult
  | SensitivityResult
  | BestDesignResult
  | ParetoResult
  | DistributionResult
  | ReliabilityResult;

export interface Evaluation {
  readonly document: GraphDocument;
  readonly resolution: Resolution;
  /** `node.port` → the value it produced. */
  readonly values: ReadonlyMap<string, PortValue>;
  readonly outputs: readonly OutputResult[];
  /**
   * What each Select node found, by node id — the wired `at`/`best` values
   * are in `values` like any other port, but the full crossing list has no
   * port to live on (a series has a fixed shape; a variable number of roots
   * per cell does not fit one), and the canvas readout wants it.
   */
  readonly selections: ReadonlyMap<string, SelectResult>;
  /**
   * Every axis in the document, keyed by axis id, with the coordinates and unit
   * to read a position off it.
   *
   * Exposed because a marked candidate is a document-wide identity: the
   * notebook has to resolve one against a table, which carries axes but no
   * coordinates of its own, and against figures that each carry only the axes
   * they happen to draw. One map, built once, is what lets every surface answer
   * the same question the same way.
   */
  readonly axisReadouts: ReadonlyMap<string, AxisReadout>;
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
  const largeGrid = options.largeGrid ?? LARGE_GRID;
  const rangeLengths = resolveWiredRangeLengths(document, catalogues, largeGrid);
  const resolution = resolveGraph(document, catalogues, rangeLengths);
  return runEvaluation(document, catalogues, resolution, options);
}

/**
 * A wired `RangeNode`'s resolved point count, by node id — `undefined` (not
 * an empty map) when the document has none, so `resolveGraph`'s own
 * literal-fallback default (`axisOf`'s comment) is what every ordinary
 * document still gets, with zero extra work.
 *
 * `count` is the one `RangeNode` port that cannot simply be read during the
 * real evaluation pass the way `start`/`stop` are (`rangeParam`, used from
 * `rangeValue` below): it *is* the axis length, and `resolution.axes` has to
 * be complete before that pass starts, not partway through it. So this runs
 * a self-contained evaluation first, restricted (via the existing `skip`
 * option) to exactly the nodes upstream of every wired `count` port — which,
 * being upstream, need no axis-length knowledge of their own to resolve
 * (or, if one of them is itself axis-introducing, resolves anyway, just
 * tagged as swept, which is exactly the signal the refusal below reads).
 */
function resolveWiredRangeLengths(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  largeGrid: number,
): ReadonlyMap<string, number> | undefined {
  const wired = document.nodes.filter(
    (node): node is RangeNode =>
      node.kind === 'range' &&
      document.edges.some((edge) => edge.to.node === node.id && edge.to.port === COUNT_PORT),
  );
  if (wired.length === 0) return undefined;

  const incomingByTarget = new Map<string, Edge[]>();
  for (const edge of document.edges) {
    const list = incomingByTarget.get(edge.to.node);
    if (list === undefined) incomingByTarget.set(edge.to.node, [edge]);
    else list.push(edge);
  }
  const ancestors = new Set<string>();
  const queue = wired.map((node) => node.id);
  while (queue.length > 0) {
    const id = queue.pop() as string;
    for (const edge of incomingByTarget.get(id) ?? []) {
      if (ancestors.has(edge.from.node)) continue;
      ancestors.add(edge.from.node);
      queue.push(edge.from.node);
    }
  }
  const skip = new Set(document.nodes.map((node) => node.id).filter((id) => !ancestors.has(id)));

  const preResolution = resolveGraph(document, catalogues);
  const pre = runEvaluation(document, catalogues, preResolution, { largeGrid, skip });

  const lengths = new Map<string, number>();
  for (const node of wired) {
    const key = endpointKey(node.id, COUNT_PORT);
    const edge = preResolution.incoming.get(key)?.[0] as Edge;
    const wire = pre.values.get(endpointKey(edge.from.node, edge.from.port));
    if (wire === undefined) throw new KernelError("this range's point count could not be resolved", key);
    if (wire.kind !== 'numeric') {
      throw new KernelError("'count' needs a numeric value, not a categorical one", key);
    }
    if (wire.axes.length > 0) {
      throw new KernelError(
        "a range's point count cannot depend on something that itself varies across a sweep — " +
          'the axis being sized cannot size itself',
        key,
      );
    }
    if (wire.data.length !== 1) {
      throw new KernelError("'count' needs a single value", key);
    }
    const raw = wire.data[0] as number;
    if (!Number.isInteger(raw) || raw < 2) {
      throw new KernelError(`a range needs at least 2 points, not ${raw}`, key);
    }
    lengths.set(node.id, raw);
  }
  return lengths;
}

function runEvaluation(
  document: GraphDocument,
  catalogues: readonly Catalogue[],
  resolution: Resolution,
  options: EvaluationOptions,
): Evaluation {
  const warnings: Warning[] = [...resolution.warnings];
  const values = new Map<string, PortValue>(options.seed ?? []);
  const outputs: OutputResult[] = [];
  const axisByNode = resolution.axes;
  const largeGrid = options.largeGrid ?? LARGE_GRID;
  const skip = options.skip;

  // Output nodes are always sinks — `resolveGraph` never records an edge
  // *from* an output port — so a Feasibility or Best Design node's position
  // in `resolution.order` relative to the Check nodes it references is
  // incidental to node-array/insertion order, not semantic. Deferring both
  // kinds to a second pass, after every other output (including every Check)
  // has been computed, is what makes referencing them by id safe regardless
  // of where either node sits on the canvas.
  //
  // One deferred pass suffices because both kinds reference only *checks*,
  // and a check is never itself deferred: there is no chain to iterate.
  const deferredOutputs: OutputNode[] = [];
  const selections = new Map<string, SelectResult>();

  for (const node of resolution.order) {
    if (skip?.has(node.id)) continue;
    switch (node.kind) {
      case 'input':
        values.set(endpointKey(node.id, VALUE_PORT), inputValue(node, axisByNode, resolution));
        break;

      case 'range':
        values.set(endpointKey(node.id, VALUE_PORT), rangeValue(node, axisByNode, resolution, values));
        break;

      case 'file':
        for (const [name, value] of fileValues(node, axisByNode)) {
          values.set(endpointKey(node.id, name), value);
        }
        break;

      case 'monteCarloGenerator':
        values.set(
          endpointKey(node.id, VALUE_PORT),
          generatorValue(node, axisByNode, resolution.document.id, resolution, values, warnings),
        );
        break;

      case 'monteCarloReceiver':
        // A sink, not a source: nothing to store under its own id. Whatever
        // is wired to its `sample` port stays exactly where it already is in
        // `values`, under the wire's own node — `receiverSampleValue` below
        // is how a caller (the editor's playback, the notebook export) reads
        // it back out.
        break;

      case 'formula': {
        const formula = resolution.formulas.get(node.id) as Formula;
        const produced = evaluateFormula(node, formula, resolution, values, warnings, largeGrid);
        for (const [name, series] of produced) values.set(endpointKey(node.id, name), series);
        break;
      }

      case 'closure': {
        const formula = resolution.formulas.get(node.id) as Formula;
        const produced = evaluateFormula(
          node,
          formula,
          resolution,
          values,
          warnings,
          largeGrid,
          /* closure */ true,
        );
        for (const [name, series] of produced) values.set(endpointKey(node.id, name), series);
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

      case 'select': {
        const found = evaluateSelect(node, resolution, values);
        selections.set(node.id, found);
        values.set(endpointKey(node.id, AT_PORT), found.at);
        if (found.best !== undefined) values.set(endpointKey(node.id, BEST_PORT), found.best);
        warnings.push(...found.warnings);
        break;
      }

      case 'statistic': {
        const found = evaluateStatistic(node, resolution, values);
        values.set(endpointKey(node.id, STATISTIC_RESULT_PORT), found.result);
        warnings.push(...found.warnings);
        break;
      }

      case 'output':
        // Every kind that references Check nodes by id: they read other
        // outputs' results, so they wait until every check has been computed.
        if (
          node.output.kind === 'feasibility' ||
          node.output.kind === 'bestDesign' ||
          node.output.kind === 'pareto' ||
          node.output.kind === 'reliability'
        ) {
          deferredOutputs.push(node);
          break;
        }
        outputs.push(outputResult(node, resolution, values, axisByNode, warnings, catalogues, outputs));
        break;
    }
  }

  const axisReadouts = readAxisReadouts(resolution, values);

  for (const node of deferredOutputs) {
    outputs.push(outputResult(node, resolution, values, axisByNode, warnings, catalogues, outputs));
  }

  warnings.push(...staleMarkWarnings(document, axisReadouts));

  return { document, resolution, values, outputs, selections, axisReadouts, warnings };
}

/**
 * Every axis's coordinates and unit, keyed by axis id.
 *
 * Keyed by *axis* id rather than node id because that is what a figure and a
 * marked candidate both name. The two normally coincide; they do not for Monte
 * Carlo generators, which deliberately share one trial axis (`graph.ts`'s
 * `mcTrialId`), so several nodes can map to one id. The first in document order
 * wins, which is the same node `graph.ts` took the axis from.
 *
 * An axis whose node produced no plottable value is skipped rather than guessed
 * at — that is already an error reported where it happened, and a fabricated
 * coordinate here would turn it into a wrong answer.
 */
function readAxisReadouts(
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): ReadonlyMap<string, AxisReadout> {
  const readouts = new Map<string, AxisReadout>();
  for (const [nodeId, axis] of resolution.axes) {
    if (readouts.has(axis.id)) continue;
    const coordinates = values.get(endpointKey(nodeId, VALUE_PORT));
    if (coordinates === undefined || !isSeries(coordinates)) continue;
    readouts.set(axis.id, {
      axis,
      coordinates,
      unit: displayUnit(resolution.sources.get(endpointKey(nodeId, VALUE_PORT))),
    });
  }
  return readouts;
}

/**
 * Marks that no longer land where they were set.
 *
 * A mark is a claim about one specific design. When the range under it moves,
 * the honest options are to say the coordinate was snapped to a neighbour, or to
 * say it has stopped describing anything — never to redraw it somewhere new and
 * let it keep looking authoritative. Marks are named by their A/B/C letter,
 * which is what the notebook draws.
 */
function staleMarkWarnings(
  document: GraphDocument,
  readouts: ReadonlyMap<string, AxisReadout>,
): readonly Warning[] {
  const warnings: Warning[] = [];
  for (const [index, candidate] of (document.marks ?? []).entries()) {
    const letter = markLetter(index);
    const named = Object.keys(candidate.at);
    const axes = named.flatMap((axisId) => {
      const readout = readouts.get(axisId);
      return readout === undefined ? [] : [readout.axis];
    });
    if (axes.length < named.length) {
      warnings.push({
        kind: 'candidateStale',
        message:
          `candidate ${letter} was marked on ${named.length - axes.length === 1 ? 'an axis' : 'axes'} ` +
          'this document no longer has, so it is drawn against whatever axes remain',
      });
    }
    if (axes.length === 0) continue;

    const { approximate, missing } = candidateMask(axes, candidate, readouts);
    const label = (id: string): string => `'${readouts.get(id)?.axis.label ?? id}'`;
    if (missing.length > 0) {
      warnings.push({
        kind: 'candidateStale',
        message:
          `candidate ${letter} no longer sits on any sampled point of ${missing.map(label).join(', ')} — ` +
          'the range moved under it, so it is not drawn',
      });
    } else if (approximate.length > 0) {
      warnings.push({
        kind: 'candidateStale',
        message:
          `candidate ${letter} was snapped to the nearest sample on ${approximate.map(label).join(', ')} — ` +
          'the range changed since it was marked',
      });
    }
  }
  return warnings;
}

/**
 * A mark's label: A, B, … Z, then AA. Position in `document.marks` is the
 * identity a reader uses, so the letter is derived from it rather than stored.
 */
export function markLetter(index: number): string {
  let letter = '';
  let remaining = index;
  do {
    letter = String.fromCharCode(65 + (remaining % 26)) + letter;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return letter;
}

/**
 * The value wired into a Monte Carlo receiver's `sample` port — a sink has
 * nothing of its own in `values`, so a caller (the editor's playback loop,
 * the notebook's export) reads through to whatever is wired in, the same way
 * `valueAt` reads any other node's output. `undefined` when nothing is
 * wired, which the editor treats as "incomplete", the same as any other
 * unwired required input.
 */
export function receiverSampleValue(
  node: MonteCarloReceiverNode,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): PortValue | undefined {
  const edge = resolution.incoming.get(endpointKey(node.id, MONTE_CARLO_SAMPLE_PORT))?.[0];
  if (edge === undefined) return undefined;
  return values.get(endpointKey(edge.from.node, edge.from.port));
}

// --- input nodes ------------------------------------------------------------

/**
 * One distribution parameter's value: the wired edge if `name`'s port has
 * one — already canonical, like every resolved value — else the node's own
 * typed field, converted in here the same way `inputValue` converts a bare
 * literal. `CompareNode.threshold`'s pattern, minus the dimension inference
 * `evaluateCompare` needs (`resolveGraph`'s `monteCarloGenerator` branch
 * already pins every one of these ports to `node.unit`'s dimension, since
 * there is no `value` port here to infer it from).
 *
 * A wired source has to collapse to one number: unlike `threshold`, which is
 * allowed to line up one bound per point against the value it bounds, a
 * distribution parameter has nothing on this node's own axis to line up
 * against — the generator is what introduces that axis in the first place.
 */
function generatorParam(
  node: MonteCarloGeneratorNode,
  name: string,
  literal: number,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): number {
  const key = endpointKey(node.id, name);
  const edge = resolution.incoming.get(key)?.[0];
  if (edge === undefined) return toCanonical(literal, node.unit);
  const wired = valueAtEdge(edge, key, values);
  if (wired.kind !== 'numeric') {
    throw new KernelError(`'${name}' needs a numeric value, not a categorical one`, key);
  }
  if (wired.data.length !== 1) {
    throw new KernelError(
      `'${name}' needs a single value, not a swept series of ${wired.data.length} — ` +
        'nothing on the axis this generator introduces exists yet to line up against',
      key,
    );
  }
  return wired.data[0] as number;
}

/** A generator's draws, converted into canonical units — the same boundary `inputValue` crosses. */
function generatorValue(
  node: MonteCarloGeneratorNode,
  axes: ReadonlyMap<string, Axis>,
  documentId: string,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
  warnings: Warning[],
): NumericSeries {
  const axis = axes.get(node.id);
  if (axis === undefined) {
    throw new KernelError('a generator node introduces an axis, and this one has none', node.id);
  }
  const draw =
    node.distribution === 'uniform'
      ? {
          distribution: 'uniform' as const,
          min: generatorParam(node, MIN_PORT, node.min, resolution, values),
          max: generatorParam(node, MAX_PORT, node.max, resolution, values),
        }
      : node.distribution === 'triangular'
        ? {
            distribution: 'triangular' as const,
            min: generatorParam(node, MIN_PORT, node.min, resolution, values),
            mode: generatorParam(node, MODE_PORT, node.mode, resolution, values),
            max: generatorParam(node, MAX_PORT, node.max, resolution, values),
          }
      : node.distribution === 'discrete'
        ? (() => {
            const valuesKey = endpointKey(node.id, VALUES_PORT);
            const valueEdge = resolution.incoming.get(valuesKey)?.[0];
            if (valueEdge === undefined) throw new KernelError("'values' is not connected", valuesKey);
            const choices = valueAtEdge(valueEdge, valuesKey, values);
            if (choices.kind !== 'spectrum' || choices.values.length === 0) throw new KernelError("'values' needs a non-empty spectrum", valuesKey);
            const weightsKey = endpointKey(node.id, WEIGHTS_PORT);
            const weightEdge = resolution.incoming.get(weightsKey)?.[0];
            const weights = weightEdge === undefined ? undefined : valueAtEdge(weightEdge, weightsKey, values);
            if (weights !== undefined && weights.kind !== 'spectrum') throw new KernelError("'weights' needs a spectrum", weightsKey);
            const invalid = weights !== undefined && (weights.values.length !== choices.values.length || weights.values.some((value) => value < 0) || weights.values.every((value) => value === 0));
            if (invalid) warnings.push({
              kind: 'monteCarloDiscreteWeights',
              nodeId: node.id,
              message: 'discrete weights must match values, be non-negative, and contain a positive weight — equal weights were used',
            });
            return { distribution: 'discrete' as const, values: choices.values, ...(weights === undefined || invalid ? {} : { weights: weights.values }) };
          })()
      : {
          distribution: node.distribution,
          mean: generatorParam(node, MEAN_PORT, node.mean, resolution, values),
          // `toCanonical` is a pure scale factor (`convert.ts`) — every
          // internal unit is a plain multiple, never an offset scale — so
          // converting the spread this way is exactly as valid as
          // converting the mean.
          stddev: generatorParam(node, STDDEV_PORT, node.stddev, resolution, values),
        };
  if (draw.distribution === 'uniform' && draw.min >= draw.max) {
    throw new KernelError('a uniform generator needs min below max', node.id);
  }
  if (draw.distribution === 'triangular' && (draw.min >= draw.max || draw.mode < draw.min || draw.mode > draw.max)) {
    throw new KernelError('a triangular generator needs min ≤ mode ≤ max, with min below max', node.id);
  }
  if ((draw.distribution === 'normal' || draw.distribution === 'lognormal') && draw.stddev <= 0) {
    throw new KernelError('a distribution standard deviation must be above zero', node.id);
  }
  if (draw.distribution === 'lognormal' && draw.mean <= 0) {
    throw new KernelError('a lognormal mean must be above zero', node.id);
  }
  return {
    kind: 'numeric',
    axes: [axis],
    data: monteCarloSamples(documentId, node.id, draw, axis.length),
  };
}

/**
 * One `RangeNode` bound's value — `generatorParam`'s pattern exactly, just
 * worded for a range rather than a generator, since a Monte Carlo draw and a
 * linear/logarithmic sweep are not the same kind of "axis" to a student
 * reading a refusal about one.
 */
function rangeParam(
  node: RangeNode,
  name: string,
  literal: number,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): number {
  const key = endpointKey(node.id, name);
  const edge = resolution.incoming.get(key)?.[0];
  if (edge === undefined) {
    // The port's own resolved unit, not necessarily `node.unit` — the
    // *other* bound may be wired and have pinned the dimension this one's
    // bare literal is read in, `resolveGraph`'s `range` branch's own
    // "bare default adopts the wired dimension" rule (`evaluateCompare`'s
    // threshold does the same from `value`).
    return toCanonical(literal, resolution.targets.get(key)?.unit ?? node.unit);
  }
  const wired = valueAtEdge(edge, key, values);
  if (wired.kind !== 'numeric') {
    throw new KernelError(`'${name}' needs a numeric value, not a categorical one`, key);
  }
  if (wired.data.length !== 1) {
    throw new KernelError(
      `'${name}' needs a single value, not a swept series of ${wired.data.length} — ` +
        'nothing on the axis this range introduces exists yet to line up against',
      key,
    );
  }
  return wired.data[0] as number;
}

/**
 * A wired range's points, converted into canonical units — `inputValue`'s
 * own `'linear'`/`'logarithmic'` cases, just reading `start`/`stop` off
 * wired ports (`rangeParam`) instead of a literal `ValueSpec`, and reading
 * `count` off `axis.length`, already resolved by the pre-pass in
 * `resolveWiredRangeLengths` (or, unwired, by `axisOf`'s own literal
 * fallback — the same axis either way).
 */
function rangeValue(
  node: RangeNode,
  axes: ReadonlyMap<string, Axis>,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): NumericSeries {
  const axis = axes.get(node.id);
  if (axis === undefined) {
    throw new KernelError('a range node introduces an axis, and this one has none', node.id);
  }
  const start = rangeParam(node, START_PORT, node.start, resolution, values);
  const stop = rangeParam(node, STOP_PORT, node.stop, resolution, values);
  if (node.spacing === 'logarithmic' && (start <= 0 || stop <= 0)) {
    throw new KernelError('a logarithmic range needs both endpoints above zero', node.id);
  }
  const last = axis.length - 1;
  const data =
    node.spacing === 'logarithmic'
      ? Array.from({ length: axis.length }, (_, i) => start * Math.exp((Math.log(stop / start) * i) / last))
      : // Both endpoints included, and the last point is `stop` exactly rather
        // than the accumulation of `points - 1` additions.
        Array.from({ length: axis.length }, (_, i) => start + ((stop - start) * i) / last);
  return { kind: 'numeric', axes: [axis], data };
}

/**
 * What a file node's ports carry: each field's stored values, converted into
 * canonical units on the way in — the same boundary `inputValue` is.
 *
 * A field the file did not record is skipped rather than emitted as a hole:
 * its port still resolves, so the node keeps its shape and the rest of it
 * keeps working, and only a wire that actually asks for the missing field
 * fails. One file gives a scalar; several give a series over the node's own
 * axis, exactly as a list range does.
 */
function fileValues(
  node: FileNode,
  axes: ReadonlyMap<string, Axis>,
): readonly (readonly [string, PortValue])[] {
  const axis = node.sources.length > 1 ? axes.get(node.id) : undefined;
  if (node.sources.length > 1 && axis === undefined) {
    throw new KernelError('several files introduce an axis, and this node has none', node.id);
  }
  const emitted: (readonly [string, PortValue])[] = [];
  for (const field of node.fields) {
    if (field.values.some((value) => value === null)) continue;
    const unit = field.unit;
    if (unit === undefined) {
      const data = field.values as readonly string[];
      emitted.push([
        field.name,
        axis === undefined
          ? categoricalScalar(data[0] as string)
          : { kind: 'categorical', axes: [axis], data: [...data] },
      ]);
      continue;
    }
    const data = (field.values as readonly number[]).map((value) => toCanonical(value, unit));
    emitted.push([
      field.name,
      axis === undefined ? scalarSeries(data[0] as number) : { kind: 'numeric', axes: [axis], data },
    ]);
  }
  return emitted;
}

/**
 * A literal, a categorical choice, a spectrum or a range, converted into
 * canonical units on the way in. This is the boundary.
 */
function inputValue(node: InputNode, axes: ReadonlyMap<string, Axis>, resolution: Resolution): PortValue {
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
      {
        const column = resolution.tableColumns.get(node.id);
        if (column === undefined) throw new KernelError('this table column could not be resolved', node.id);
        return column.kind === 'categorical'
          ? { kind: 'categorical', axes: [axis as Axis], data: [...column.values] }
          : {
              kind: 'numeric',
              axes: [axis as Axis],
              data: column.values.map((value) => toCanonical(value, column.unit)),
            };
      }
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
  node: FormulaNode | ClosureNode | { readonly id: string },
  port: Port,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): PortValue {
  const nodeId = node.id;
  const key = endpointKey(nodeId, port.name);
  const edge = resolution.incoming.get(key)?.[0];
  if (edge !== undefined) return valueAtEdge(edge, key, values);

  if ('inputValues' in node) {
    const authored = node.inputValues?.[port.name];
    if (authored?.kind === 'scalar' || authored?.kind === 'slider') {
      return scalarSeries(toCanonical(authored.value, authored.unit));
    }
    if (authored?.kind === 'categorical') return categoricalScalar(authored.value);
    if (authored !== undefined) {
      throw new KernelError(`an inline fallback for '${port.name}' must be a scalar or categorical value`, key);
    }
  }

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
  node: FormulaNode | ClosureNode | { readonly id: string },
  formula: Formula,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
  warnings: Warning[],
  largeGrid: number,
  closure = false,
): ReadonlyMap<string, NumericSeries> {
  const nodeId = node.id;
  assertEvaluable(formula, nodeId);
  for (const output of formula.outputs) {
    if (output.kind === 'categorical') {
      throw new KernelError(
        `'${formula.id}' produces a categorical value, which needs a table`,
        nodeId,
      );
    }
  }
  // Every branch but the lookup answers with one series, for the one output
  // such a formula declares.
  const only = formula.outputs[0] as NumericPort;
  const single = (series: NumericSeries): ReadonlyMap<string, NumericSeries> =>
    new Map([[only.name, series]]);

  // A closure's declared output has nothing real to check the expression
  // against (closure.ts, formula.ts's compileClosureFormula) — its
  // dimension was already proven live, during resolution, against this
  // node's actual wiring.
  const compiled = closure
    ? compileClosureFormula(formula, nodeId)
    : compileFormula(formula, resolution.bindings.get(nodeId) ?? new Map(), nodeId);

  const regularPorts = formula.inputs.filter((port) => port.kind !== 'spectrum');
  const regularInputs = regularPorts.map((port) => {
    const value = inputPortValue(node, port, resolution, values);
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

  // Each declared name contributes one reader per cell — a spectrum port's
  // every value (`fixed`, an authored list, or `reader` if it is itself
  // wired to something swept) or a plain numeric port's single value —
  // concatenated across names in the order a `piecewise`/`deflection` field
  // lists them, never by wire order (see the schema docstring: a support's
  // reaction joins a load spectrum this way, as one more single-valued
  // entry). Shared by both computation kinds — a deflection curve's
  // breakpoints/values are the exact same shape as a `cumulativeCubic`
  // formula's.
  type EdgeContribution =
    | { readonly kind: 'fixed'; readonly values: readonly number[] }
    | { readonly kind: 'reader'; readonly read: (cell: number) => number };
  const namedContributions = (names: readonly string[] | undefined): readonly EdgeContribution[] =>
    (names ?? []).flatMap((name): readonly EdgeContribution[] => {
      const spectrumEntry = spectrumInputs.find(({ port }) => port.name === name);
      if (spectrumEntry !== undefined) {
        return spectrumEntry.edgeValues.map((value): EdgeContribution =>
          value.kind === 'spectrum'
            ? { kind: 'fixed', values: value.values }
            : { kind: 'reader', read: reader(value, axes) },
        );
      }
      const regularEntry = regularInputs.find(({ port }) => port.name === name);
      if (regularEntry !== undefined && regularEntry.value.kind === 'numeric') {
        return [{ kind: 'reader', read: reader(regularEntry.value, axes) }];
      }
      throw new KernelError(`'${name}' must be a declared spectrum or numeric input`, nodeId);
    });
  const namesAt = (cell: number, contributions: readonly EdgeContribution[]): readonly number[] =>
    contributions.flatMap((edge) => (edge.kind === 'fixed' ? edge.values : [edge.read(cell)]));

  if (formula.piecewise !== undefined) {
    if (isGenericDimension(only.unit)) {
      throw new KernelError('a piecewise output must declare a concrete unit', nodeId);
    }
    const { kind: piecewiseKind, axis, breakpoints, values: valueNames, distributedStart, distributedEnd, distributedRate } =
      formula.piecewise;
    const axisEntry = regularInputs.find(({ port }) => port.name === axis);
    if (axisEntry === undefined || axisEntry.value.kind !== 'numeric') {
      throw new KernelError(`piecewise axis '${axis}' must be a numeric input`, nodeId);
    }
    const axisRead = reader(axisEntry.value, axes);

    const breakpointContributions = namedContributions(breakpoints);
    const valueContributions = namedContributions(valueNames);
    const startContributions = namedContributions(distributedStart);
    const endContributions = namedContributions(distributedEnd);
    const rateContributions = namedContributions(distributedRate);

    // Closed-form at every sampled `z`, not a numeric cumulative sum over the
    // sweep — accuracy never depends on how densely `z` happens to be swept.
    const data = new Array<number>(cells);
    for (let cell = 0; cell < cells; cell += 1) {
      const z = axisRead(cell);
      const positions = namesAt(cell, breakpointContributions);
      const magnitudes = namesAt(cell, valueContributions);
      if (positions.length !== magnitudes.length) {
        throw new KernelError(
          `'${(breakpoints ?? []).join('+')}' has ${positions.length} values but '${(valueNames ?? []).join('+')}' has ${magnitudes.length}`,
          nodeId,
        );
      }
      let total = 0;
      for (let i = 0; i < positions.length; i += 1) {
        const position = positions[i] as number;
        if (position > z) continue;
        total +=
          piecewiseKind === 'cumulativeMoment'
            ? (magnitudes[i] as number) * (z - position)
            : piecewiseKind === 'cumulativeCubic'
              ? (magnitudes[i] as number) * (z - position) ** 3
              : (magnitudes[i] as number);
      }

      const starts = namesAt(cell, startContributions);
      const ends = namesAt(cell, endContributions);
      const rates = namesAt(cell, rateContributions);
      if (starts.length !== ends.length || starts.length !== rates.length) {
        throw new KernelError(
          `'${(distributedStart ?? []).join('+')}' has ${starts.length} values, ` +
            `'${(distributedEnd ?? []).join('+')}' has ${ends.length}, ` +
            `'${(distributedRate ?? []).join('+')}' has ${rates.length} — they must match`,
          nodeId,
        );
      }
      for (let i = 0; i < starts.length; i += 1) {
        const start = starts[i] as number;
        const end = ends[i] as number;
        const rate = rates[i] as number;
        if (end < start) {
          throw new KernelError(`a distributed load's end (${end}) is before its start (${start})`, nodeId);
        }
        // a = how far z has advanced into [start, end] — 0 before it starts,
        // (end − start) once past it. rate·a integrates the rectangle up to
        // z; cumulativeMoment integrates that again, about z, splitting the
        // already-swept portion at its own centroid (start + a/2).
        const a = Math.min(Math.max(z - start, 0), end - start);
        total += piecewiseKind === 'cumulativeMoment' ? rate * a * (z - start - a / 2) : rate * a;
      }
      data[cell] = total;
    }
    return single({ kind: 'numeric', axes, data });
  }

  if (formula.deflection !== undefined) {
    if (isGenericDimension(only.unit)) {
      throw new KernelError('a deflection output must declare a concrete unit', nodeId);
    }
    const { axis, breakpoints, values: valueNames, zeroAt, modulus, secondMomentOfArea } = formula.deflection;
    const axisEntry = regularInputs.find(({ port }) => port.name === axis);
    if (axisEntry === undefined || axisEntry.value.kind !== 'numeric') {
      throw new KernelError(`deflection axis '${axis}' must be a numeric input`, nodeId);
    }
    const axisRead = reader(axisEntry.value, axes);

    const namedScalarReader = (name: string): ((cell: number) => number) => {
      const entry = regularInputs.find(({ port }) => port.name === name);
      if (entry === undefined || entry.value.kind !== 'numeric') {
        throw new KernelError(`deflection input '${name}' must be a numeric input`, nodeId);
      }
      return reader(entry.value, axes);
    };
    const [zeroAtAName, zeroAtBName] = zeroAt;
    const zeroAtARead = namedScalarReader(zeroAtAName);
    const zeroAtBRead = namedScalarReader(zeroAtBName);
    const modulusRead = namedScalarReader(modulus);
    const secondMomentRead = namedScalarReader(secondMomentOfArea);

    const breakpointContributions = namedContributions(breakpoints);
    const valueContributions = namedContributions(valueNames);

    const data = new Array<number>(cells);
    for (let cell = 0; cell < cells; cell += 1) {
      const positions = namesAt(cell, breakpointContributions);
      const magnitudes = namesAt(cell, valueContributions);
      if (positions.length !== magnitudes.length) {
        throw new KernelError(
          `'${breakpoints.join('+')}' has ${positions.length} values but '${valueNames.join('+')}' has ${magnitudes.length}`,
          nodeId,
        );
      }
      // Σ value·(w − breakpoint)³ over breakpoints at or before w — the same
      // closed form `cumulativeCubic` uses, evaluated at whichever w this
      // cell needs (a support, or the swept axis).
      const cubicSum = (w: number): number => {
        let total = 0;
        for (let i = 0; i < positions.length; i += 1) {
          const position = positions[i] as number;
          if (position > w) continue;
          total += (magnitudes[i] as number) * (w - position) ** 3;
        }
        return total;
      };

      const a = zeroAtARead(cell);
      const b = zeroAtBRead(cell);
      if (a === b) {
        throw new KernelError(
          `'${zeroAtAName}' and '${zeroAtBName}' are both at ${a} — two different support positions are needed`,
          nodeId,
        );
      }
      // Two equations — S(a)/6 + C₁·a + C₂ = 0, S(b)/6 + C₁·b + C₂ = 0,
      // from `y = 0` at each support — in the two constants of integration.
      const sA = cubicSum(a) / 6;
      const sB = cubicSum(b) / 6;
      const c1 = (sA - sB) / (b - a);
      const c2 = -(sA + c1 * a);

      const z = axisRead(cell);
      const sZ = cubicSum(z) / 6;
      const ei = modulusRead(cell) * secondMomentRead(cell);
      data[cell] = (sZ + c1 * z + c2) / ei;
    }
    return single({ kind: 'numeric', axes, data });
  }

  if (formula.lookup !== undefined) {
    const lookup = formula.lookup;
    const byName = new Map(regularInputs.map((entry) => [entry.port.name, entry] as const));
    const strides = lookup.axes.map((_axis, i) =>
      lookup.axes.slice(i + 1).reduce((size, axis) => size * axis.values.length, 1),
    );
    // The axes pick one row; every output then reads its own column of it, so
    // a camera chosen once answers with all of its properties at that cell.
    const columns = formula.outputs.map((output) => {
      const unit = (output as NumericPort).unit;
      if (isGenericDimension(unit)) {
        throw new KernelError('a lookup output must declare a concrete unit', nodeId);
      }
      return {
        name: output.name,
        unit,
        cells: lookup.columns[output.name] as readonly (number | null)[],
        data: new Array<number>(cells),
      };
    });
    for (let cell = 0; cell < cells; cell += 1) {
      let flat = 0;
      for (const [axisIndex, lookupAxis] of lookup.axes.entries()) {
        const entry = byName.get(lookupAxis.input);
        if (entry === undefined) throw new KernelError(`lookup input '${lookupAxis.input}' is not declared`, nodeId);
        const valueIndex = indexer(entry.value, axes)(cell);
        let selected = -1;
        /** The spelling that missed, named in the error a miss raises. */
        let missed: string | undefined;
        if (lookupAxis.kind === 'categorical') {
          if (entry.value.kind !== 'categorical') throw new KernelError(`lookup input '${lookupAxis.input}' must be categorical`, nodeId);
          // A wire carries whatever spelling its source produced — a camera
          // names itself 'Canon EOS R6m3' in its own files — so the port's
          // domain gets to say which entry that is before the axis, whose
          // values are domain members by construction, matches exactly.
          const spelling = entry.value.data[valueIndex] as string;
          const member =
            entry.port.kind === 'categorical' ? domainMember(entry.port, spelling) : undefined;
          selected = member === undefined ? -1 : lookupAxis.values.indexOf(member);
          missed = spelling;
        } else {
          if (entry.value.kind !== 'numeric' || entry.port.kind !== 'numeric' || isGenericDimension(entry.port.unit)) {
            throw new KernelError(`lookup input '${lookupAxis.input}' must have a concrete numeric unit`, nodeId);
          }
          const inputUnit = entry.port.unit;
          const coordinate = entry.value.data[valueIndex] as number;
          const below = lookupAxis.lowerExclusive !== undefined &&
            coordinate <= toCanonical(lookupAxis.lowerExclusive, inputUnit);
          selected = below ? -1 : lookupAxis.values.findIndex((bound) => coordinate <= toCanonical(bound as number, inputUnit));
        }
        if (selected < 0) {
          throw new KernelError(
            missed === undefined
              ? `no lookup entry for '${lookupAxis.input}'`
              : `no lookup entry for '${lookupAxis.input}': nothing here is called '${missed}'`,
            endpointKey(nodeId, lookupAxis.input),
          );
        }
        flat += selected * (strides[axisIndex] as number);
      }
      for (const column of columns) {
        const lookedUp = column.cells[flat];
        if (lookedUp === null || lookedUp === undefined) {
          throw new KernelError(
            formula.outputs.length === 1
              ? 'this combination is not defined in the table'
              : `the table defines no '${column.name}' for this combination`,
            nodeId,
          );
        }
        column.data[cell] = toCanonical(lookedUp, column.unit);
      }
    }
    return new Map(
      columns.map((column) => [column.name, { kind: 'numeric', axes, data: column.data } as NumericSeries]),
    );
  }

  // Nothing table-backed answered, so an expression must — the schema only
  // lets one be omitted when a lookup covers every output.
  const produced = formula.outputs.map((output) => {
    const evaluate = compiled.evaluate.get(output.name);
    if (evaluate === undefined) {
      throw new KernelError(
        `'${formula.id}' has neither an expression nor a table to compute '${output.name}'`,
        nodeId,
      );
    }
    return {
      name: output.name,
      evaluate,
      appliesWhen: compiled.appliesWhen.get(output.name),
      data: new Array<number>(cells),
      outside: 0,
    };
  });

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
  // cell — collected into one array per spectrum port, per cell. Same
  // `EdgeContribution` shape as the piecewise/deflection branches above,
  // hoisted to this function's top.
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

  for (let cell = 0; cell < cells; cell += 1) {
    for (const { name, read } of readers) env[name] = read(cell);
    for (const { name, perEdge } of spectrumReaders) {
      env[name] = perEdge.flatMap((contribution) =>
        contribution.kind === 'reader' ? [contribution.read(cell)] : contribution.values,
      );
    }
    // In declared order, each output joining the environment as it is
    // computed: that is what lets a later expression name an earlier output
    // — total depth of field is written `D_f - D_n`, not the near and far
    // algebra restated. Forward-only, so no cycle is expressible.
    for (const output of produced) {
      if (output.appliesWhen !== undefined && !output.appliesWhen(env)) output.outside += 1;
      const value = output.evaluate(env);
      output.data[cell] = value;
      env[output.name] = value;
    }
  }

  // Using a formula outside the condition R&M states for it warns. It does
  // not block — the predecessor library never read these conditions at all, and
  // a student who does not know one exists is exactly who this is for.
  for (const output of produced) {
    if (output.outside === 0) continue;
    warnings.push({
      kind: 'appliesWhen',
      nodeId,
      message:
        `'${formula.id}'${formula.outputs.length === 1 ? '' : ` computes '${output.name}'`} ` +
        `only when ${appliesWhenOf(formula, output.name) as string}, which does not hold ` +
        (cells === 1 ? 'here' : `at ${output.outside} of ${cells} points`),
    });
  }

  return new Map(
    produced.map((output) => [output.name, { kind: 'numeric', axes, data: output.data } as NumericSeries]),
  );
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

/**
 * A selection: search the study `value` describes along the axis `along`
 * introduces, and answer with the coordinate.
 *
 * All the arithmetic is `select.ts`'s; this is the wiring around it — read
 * the two required edges, resolve `crossing`'s threshold exactly as
 * `evaluateCompare` does, and name the axis in whatever message comes back.
 */
function evaluateSelect(
  node: SelectNode,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
): SelectResult {
  const valueKey = endpointKey(node.id, VALUE_PORT);
  const valueEdge = resolution.incoming.get(valueKey)?.[0];
  if (valueEdge === undefined) {
    throw new KernelError("'value' is not connected and has no default", valueKey);
  }
  const value = valueAtEdge(valueEdge, valueKey, values);
  if (!isSeries(value)) {
    throw new KernelError(`'value' is a ${value.kind}, which cannot be searched`, valueKey);
  }

  const alongKey = endpointKey(node.id, ALONG_PORT);
  const alongEdge = resolution.incoming.get(alongKey)?.[0];
  if (alongEdge === undefined) {
    throw new KernelError(
      "'along' is not connected — wire the swept range into 'along' so there is an axis to search",
      alongKey,
    );
  }
  const along = valueAtEdge(alongEdge, alongKey, values);
  if (along.kind !== 'numeric') {
    throw new KernelError("'along' needs the swept coordinate, which is a numeric series", alongKey);
  }

  const alongLabel = along.axes[0]?.label;
  const common = {
    value,
    along,
    nodeId: node.id,
    ...(alongLabel === undefined ? {} : { alongLabel }),
  };

  if (node.mode !== 'crossing') return select({ ...common, mode: node.mode });

  // A bare, unitless default is read in `value`'s own display unit, not its
  // canonical one — `evaluateCompare`'s `thresholdUnit` reasoning verbatim,
  // and for the same reason: a typed `6` has to mean 6 of what is on screen.
  const valueDimension = resolution.targets.get(valueKey)?.dimension;
  const thresholdUnit =
    isDimensionless(node.threshold.unit.dimension) &&
    valueDimension !== undefined &&
    !isDimensionless(valueDimension)
      ? displayUnit(resolution.targets.get(valueKey))
      : node.threshold.unit;

  const thresholdKey = endpointKey(node.id, THRESHOLD_PORT);
  const thresholdEdge = resolution.incoming.get(thresholdKey)?.[0];
  const threshold =
    thresholdEdge === undefined
      ? toCanonical(node.threshold.value, thresholdUnit)
      : (() => {
          const series = valueAtEdge(thresholdEdge, thresholdKey, values);
          if (series.kind !== 'numeric') {
            throw new KernelError(
              "a crossing's threshold needs a numeric value, not a categorical one",
              thresholdKey,
            );
          }
          if (series.data.length !== 1) {
            throw new KernelError(
              "a crossing's threshold needs a single value — it is one bound, not one per point",
              thresholdKey,
            );
          }
          return series.data[0] as number;
        })();

  return select({ ...common, mode: node.mode, threshold, direction: node.direction });
}

function evaluateStatistic(
  node: StatisticNode,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
) {
  const valueKey = endpointKey(node.id, VALUE_PORT);
  const valueEdge = resolution.incoming.get(valueKey)?.[0];
  if (valueEdge === undefined) throw new KernelError("'value' is not connected", valueKey);
  const value = valueAtEdge(valueEdge, valueKey, values);
  if (!isSeries(value)) throw new KernelError(`'value' is a ${value.kind}, which has no axis to reduce`, valueKey);

  const alongKey = endpointKey(node.id, ALONG_PORT);
  const alongEdge = resolution.incoming.get(alongKey)?.[0];
  const along = alongEdge === undefined ? undefined : valueAtEdge(alongEdge, alongKey, values);
  if (along !== undefined && along.kind !== 'numeric') throw new KernelError("'along' needs a numeric swept coordinate", alongKey);

  let percentile = node.statistic === 'percentile' ? node.percentile : undefined;
  if (node.statistic === 'percentile') {
    const percentileKey = endpointKey(node.id, PERCENTILE_PORT);
    const edge = resolution.incoming.get(percentileKey)?.[0];
    if (edge !== undefined) {
      const wired = valueAtEdge(edge, percentileKey, values);
      if (wired.kind !== 'numeric' || wired.data.length !== 1) throw new KernelError("'percentile' needs one numeric value", percentileKey);
      percentile = wired.data[0] as number;
    }
    if (percentile === undefined || percentile < 0 || percentile > 100) throw new KernelError('percentile must be between 0 and 100', percentileKey);
  }
  return reduceAlong({
    statistic: node.statistic,
    value,
    ...(along === undefined ? {} : { along }),
    ...(percentile === undefined ? {} : { percentile }),
    ...(node.statistic === 'probability' ? { match: node.match } : {}),
    ...(node.running === undefined ? {} : { running: node.running }),
    nodeId: node.id,
  });
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

/**
 * Up to three slots — x, series (color), facet (small multiples) — each
 * either pinned by the student or filled automatically, in document order,
 * from `varyingAxes` — the plotted value's own axes for a plot, or the union
 * of every referenced check's axes for a Feasibility output. A pinned slot
 * is never touched, and never double-filled by autofill.
 */
function pickPlotAxes(
  pinned: {
    readonly x?: string | undefined;
    readonly series?: string | undefined;
    readonly facet?: string | undefined;
  },
  varyingAxes: readonly Axis[],
  axes: ReadonlyMap<string, Axis>,
  nodeId: string,
  warnings: Warning[],
): { readonly x: string; readonly series?: string; readonly facet?: string } {
  const pinnedIds = new Set(
    [pinned.x, pinned.series, pinned.facet].filter((id): id is string => id !== undefined),
  );
  const autofill = [...varyingAxes].filter((axis) => !pinnedIds.has(axis.id)).sort((a, b) => a.order - b.order);
  let cursor = 0;
  const nextAuto = (): string | undefined => autofill[cursor++]?.id;

  const xId = pinned.x ?? nextAuto() ?? [...axes.values()].sort((a, b) => a.order - b.order)[0]?.id;
  if (xId === undefined) {
    throw new KernelError('needs at least one range input node in the document', nodeId);
  }
  const seriesId = pinned.series ?? nextAuto();
  const facetId = pinned.facet ?? nextAuto();

  for (; cursor < autofill.length; cursor += 1) {
    const axis = autofill[cursor] as Axis;
    warnings.push({
      kind: 'plotAxisDropped',
      nodeId,
      message: `this output also varies along '${axis.label}', which it has no room to show`,
    });
  }

  return {
    x: xId,
    ...(seriesId === undefined ? {} : { series: seriesId }),
    ...(facetId === undefined ? {} : { facet: facetId }),
  };
}

/**
 * The Check results a `checks` list names, in that order.
 *
 * Both kinds that reference checks by id — Feasibility and Best Design —
 * resolve them here rather than each keeping its own copy of the two error
 * messages. `outputsSoFar` is the authority: a check is never deferred, so by
 * the time either of these runs, every one of them has been computed.
 */
function referencedChecks(
  checks: readonly string[],
  nodeId: string,
  kindLabel: string,
  outputsSoFar: readonly OutputResult[],
): readonly CheckResult[] {
  return checks.map((checkId) => {
    const result = outputsSoFar.find((entry) => entry.nodeId === checkId);
    if (result === undefined) {
      throw new KernelError(`'${checkId}' is not a Check node, or has not been computed yet`, nodeId);
    }
    if (result.kind !== 'check') {
      throw new KernelError(
        `'${checkId}' is not a Check node — a ${kindLabel} node can only reference checks`,
        nodeId,
      );
    }
    return result;
  });
}

/**
 * Each check's verdicts broadcast onto `target`, and their AND.
 *
 * No checks at all means nothing constrains the study, so every cell is
 * feasible — which is what `checks: []` means on a Best Design node (a plain
 * unconstrained min or max) and the only reading that composes.
 */
function feasibleMask(
  checkResults: readonly CheckResult[],
  target: readonly Axis[],
): { readonly perCheck: readonly (readonly boolean[])[]; readonly mask: readonly boolean[] } {
  const perCheck = checkResults.map((result) =>
    broadcastBoolean(result.results, result.series.axes, target),
  );
  const mask =
    perCheck.length === 0
      ? new Array<boolean>(gridSize(target)).fill(true)
      : perCheck.reduce((acc, next) => acc.map((value, i) => value && (next[i] as boolean)));
  return { perCheck, mask };
}

function reliabilityEstimate(
  checkId: string,
  verdicts: readonly boolean[],
  confidence: number,
): ReliabilityEstimate {
  const trials = verdicts.length;
  const failures = verdicts.filter((passed) => !passed).length;
  const probability = trials === 0 ? Number.NaN : failures / trials;
  const interval = wilsonInterval(failures, trials, confidence);
  const unresolved = failures === 0 && trials > 0;
  const resolvedProbability = unresolved ? 1 / trials : probability;
  const beta = inverseNormal(1 - resolvedProbability);
  const halfWidth = (interval[1] - interval[0]) / 2;
  return {
    checkId,
    trials,
    failures,
    probability,
    interval,
    beta,
    unresolved,
    converged: !unresolved && halfWidth <= Math.max(0.01, probability * 0.2),
  };
}

/**
 * How much room a check still has at one cell, as a fraction of its own bound
 * — what "governing" is ranked by, and why it is a *normalised* margin: a
 * safety factor 0.02 above 1.5 and a pressure 4 N/mm² below 200 are not
 * comparable as raw differences, and are as ratios.
 *
 * `undefined` where there is no margin to speak of: `==`/`!=` assert equality
 * rather than a one-sided bound, and a zero threshold makes the ratio
 * meaningless whatever the comparison.
 */
function normalisedMargin(result: CheckResult, value: number): number | undefined {
  if (result.comparison === '==' || result.comparison === '!=') return undefined;
  if (result.threshold === 0 || !Number.isFinite(value)) return undefined;
  const slack = (value - result.threshold) / Math.abs(result.threshold);
  return result.comparison === '>=' || result.comparison === '>' ? slack : -slack;
}

function outputResult(
  node: OutputNode,
  resolution: Resolution,
  values: ReadonlyMap<string, PortValue>,
  axes: ReadonlyMap<string, Axis>,
  warnings: Warning[],
  catalogues: readonly Catalogue[],
  outputsSoFar: readonly OutputResult[],
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
    // The expression for the port actually wired, not the record's first:
    // wire a merged node's far limit here and the far limit is what is
    // typeset, which is the only reading that makes sense of the value
    // beside it.
    const expression = expressionOf(formula, edge.from.port);
    if (expression === undefined) {
      throw new KernelError(`'${formula.id}' reads from a table, so there is no equation to show`, key);
    }
    return {
      ...base,
      kind: 'equation',
      expression,
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

  if (output.kind === 'feasibility') {
    const checkResults = referencedChecks(output.checks, node.id, 'Feasibility', outputsSoFar);
    const maskAxes = unionAxes(...checkResults.map((result) => result.series.axes));

    const picked = pickPlotAxes(
      { x: output.x, series: output.series, facet: output.facet },
      maskAxes,
      axes,
      node.id,
      warnings,
    );
    const axisFor = (id: string): PlotAxis => {
      const axis = axes.get(id);
      if (axis === undefined) {
        throw new KernelError(`'${id}' is not a range input node, so it introduces no axis`, node.id);
      }
      const coordinates = values.get(endpointKey(id, VALUE_PORT));
      if (coordinates === undefined || coordinates.kind === 'spectrum' || coordinates.kind === 'bundle') {
        throw new KernelError(`'${id}' produced no coordinates to plot against`, node.id);
      }
      if (!maskAxes.some((own) => own.id === axis.id)) {
        warnings.push({
          kind: 'plotAxis',
          nodeId: node.id,
          message: `the shaded region does not vary along '${axis.label}' — it will be flat`,
        });
      }
      return { axis, coordinates, unit: displayUnit(resolution.sources.get(endpointKey(id, VALUE_PORT))) };
    };

    // The mask is over the checks' own axes and nothing else — one cell when
    // no check varies at all, which is what makes "passes at 3 of 5 points"
    // count real points rather than repetitions of one verdict.
    //
    // The axis a figure draws this against is a separate question, and need
    // not be one of these: a pinned axis, or the document-order fallback
    // `pickPlotAxes` uses when nothing varies, can be an axis the verdict
    // does not depend on. `axisFor` warns that the shading will be flat, and
    // flat is a drawing rather than a failure — `FeasibilityFigure` widens
    // the grid at draw time (`PlotFigure`'s `plotGrid` does the same for a
    // flat curve) instead of this result claiming a shape it does not have.
    const { perCheck, mask } = feasibleMask(checkResults, maskAxes);

    return {
      ...base,
      kind: 'feasibility',
      checks: output.checks,
      axes: maskAxes,
      mask,
      perCheck,
      x: axisFor(picked.x),
      ...(picked.series === undefined ? {} : { series2: axisFor(picked.series) }),
      ...(picked.facet === undefined ? {} : { facet: axisFor(picked.facet) }),
    };
  }

  if (output.kind === 'bestDesign') {
    const checkResults = referencedChecks(output.checks, node.id, 'Best Design', outputsSoFar);
    const { value: objective, unit } = sourceOf(node, OBJECTIVE_PORT, resolution, values);
    if (objective.kind !== 'numeric') {
      throw new KernelError(
        'a Best Design objective needs a numeric value, not a categorical one',
        endpointKey(node.id, OBJECTIVE_PORT),
      );
    }

    // The study is the objective's own grid unioned with the checks': a check
    // varying along a second axis genuinely narrows which cells of that grid
    // are candidates, even where the objective itself does not vary along it.
    const studyAxes = unionAxes(objective.axes, ...checkResults.map((result) => result.series.axes));
    const { perCheck, mask: feasible } = feasibleMask(checkResults, studyAxes);
    const scores = broadcastSeries(objective, studyAxes);
    const feasibleCount = feasible.filter(Boolean).length;

    const card = {
      ...base,
      kind: 'bestDesign' as const,
      checks: output.checks,
      direction: output.direction,
      axes: studyAxes,
      feasible,
      objective: scores,
      unit,
      feasibleCount,
    };

    if (feasibleCount === 0) {
      // Not a failure — a partly-failing study is the ordinary state of a
      // design that has not been sized yet. Naming the check that fails at
      // the most candidates is the review's "failure card" in its cheapest
      // honest form: it says where to look next.
      const ranked = checkResults
        .map((result, i) => ({
          checkId: result.nodeId,
          failures: (perCheck[i] as readonly boolean[]).filter((entry) => !entry).length,
        }))
        .sort((a, b) => b.failures - a.failures);
      const blocking = ranked[0];
      warnings.push({
        kind: 'bestDesignInfeasible',
        nodeId: node.id,
        message:
          blocking === undefined
            ? 'nothing to choose from — the objective has no points'
            : `no candidate satisfies every check at once — '${blocking.checkId}' fails at ` +
              `${blocking.failures} of ${feasible.length} point${feasible.length === 1 ? '' : 's'}`,
      });
      return { ...card, ...(blocking === undefined ? {} : { blocking }) };
    }

    // Ties resolve to the first cell in axis order, which is what makes the
    // answer stable: re-evaluating an unchanged document never picks a
    // different one of two equally good designs.
    let cell = -1;
    for (const [i, ok] of feasible.entries()) {
      if (!ok) continue;
      const score = scores.data[i] as number;
      if (!Number.isFinite(score)) continue;
      if (cell === -1) {
        cell = i;
        continue;
      }
      const current = scores.data[cell] as number;
      if (output.direction === 'minimize' ? score < current : score > current) cell = i;
    }
    if (cell === -1) {
      throw new KernelError('the objective has no usable value at any feasible point', node.id);
    }

    const spread = feasible
      .map((ok, i) => (ok ? (scores.data[i] as number) : Number.NaN))
      .filter((entry) => Number.isFinite(entry));
    if (feasibleCount > 1 && Math.min(...spread) === Math.max(...spread)) {
      warnings.push({
        kind: 'bestDesignFlat',
        nodeId: node.id,
        message:
          `every feasible candidate scores the same — the winner is simply the first, ` +
          'so this is not yet a decision the objective makes',
      });
    }

    // The winning coordinate on *every* axis the study varies along, read from
    // each axis node's own coordinate series — no `along` wire needed, because
    // the axes are already in the result. `coordinatesAt` is the same "where is
    // this cell" question a marked candidate asks, so both use it.
    const at = coordinatesAt(studyAxes, cell, readAxisReadouts(resolution, values));

    const unrankable: string[] = [];
    const margins = checkResults
      .flatMap((result) => {
        const margin = normalisedMargin(result, broadcastSeries(result.series, studyAxes).data[cell] as number);
        if (margin === undefined) {
          unrankable.push(result.nodeId);
          return [];
        }
        return [{ checkId: result.nodeId, margin }];
      })
      .sort((a, b) => a.margin - b.margin);
    if (unrankable.length > 0) {
      warnings.push({
        kind: 'bestDesignUnrankable',
        nodeId: node.id,
        message:
          `${unrankable.map((id) => `'${id}'`).join(', ')} cannot be ranked for "governing" — ` +
          'an equality has no margin, and a zero threshold has no scale to measure one against',
      });
    }
    const governing = margins[0];

    return {
      ...card,
      winner: {
        cell,
        objective: scores.data[cell] as number,
        at,
        ...(governing === undefined ? {} : { governing }),
        margins,
      },
    };
  }

  if (output.kind === 'pareto') {
    const checkResults = referencedChecks(output.checks, node.id, 'Pareto', outputsSoFar);
    const objective = (port: string): { readonly series: NumericSeries; readonly unit: Unit } => {
      const { value, unit } = sourceOf(node, port, resolution, values);
      if (value.kind !== 'numeric') {
        throw new KernelError(
          `a Pareto objective needs a numeric value, not a categorical one`,
          endpointKey(node.id, port),
        );
      }
      return { series: value, unit };
    };
    const x = objective(X_PORT);
    const y = objective(Y_PORT);
    // A scatter with unlabelled axes says nothing about what is being traded,
    // and the wired node already carries the name the student gave it.
    const objectiveLabel = (port: string): string => {
      const edge = resolution.incoming.get(endpointKey(node.id, port))?.[0];
      if (edge === undefined) return port;
      const source = resolution.document.nodes.find((entry) => entry.id === edge.from.node);
      return source?.label ?? edge.from.port;
    };

    // The same union Best Design takes, and for the same reason: a check
    // varying along a third axis genuinely narrows which cells are candidates,
    // even where neither objective varies along it.
    const studyAxes = unionAxes(x.series.axes, y.series.axes, ...checkResults.map((r) => r.series.axes));
    const { mask: feasible } = feasibleMask(checkResults, studyAxes);
    const xs = broadcastSeries(x.series, studyAxes);
    const ys = broadcastSeries(y.series, studyAxes);

    const { onFront, undefinedPoints } = paretoFront(
      xs.data,
      ys.data,
      feasible,
      output.xDirection,
      output.yDirection,
    );

    const readouts = readAxisReadouts(resolution, values);
    const points = Array.from({ length: gridSize(studyAxes) }, (_unused, cell): ParetoPoint => ({
      cell,
      x: xs.data[cell] as number,
      y: ys.data[cell] as number,
      feasible: feasible[cell] === true,
      onFront: onFront[cell] === true,
      candidate: candidateAt(studyAxes, cell, readouts),
      at: coordinatesAt(studyAxes, cell, readouts),
    }));

    const feasibleCount = feasible.filter(Boolean).length;
    const frontCount = onFront.filter(Boolean).length;

    if (undefinedPoints > 0) {
      warnings.push({
        kind: 'paretoUndefinedPoint',
        nodeId: node.id,
        message:
          `${undefinedPoints} candidate(s) have no value on one of the objectives, ` +
          'so they cannot be compared and are left off the chart',
      });
    }
    if (feasibleCount === 0 && points.length > 0) {
      // Not a failure. A study whose checks nothing passes yet is the ordinary
      // state of a design that has not been sized — and the chart still shows
      // where the candidates sit, which is how you find out how far off they are.
      warnings.push({
        kind: 'paretoInfeasible',
        nodeId: node.id,
        message:
          'no candidate satisfies every referenced check, so nothing competes — ' +
          'every point is drawn, but the front is empty',
      });
    } else if (points.length === 1) {
      warnings.push({
        kind: 'paretoFlat',
        nodeId: node.id,
        message: 'this study has one candidate, so there is no trade-off to draw a front through',
      });
    }

    return {
      ...base,
      kind: 'pareto',
      checks: output.checks,
      axes: studyAxes,
      points,
      xUnit: x.unit,
      yUnit: y.unit,
      xDirection: output.xDirection,
      yDirection: output.yDirection,
      xLabel: objectiveLabel(X_PORT),
      yLabel: objectiveLabel(Y_PORT),
      frontCount,
      feasibleCount,
    };
  }

  if (output.kind === 'reliability') {
    const confidence = output.confidence ?? 0.95;
    const checkResults = referencedChecks(output.checks, node.id, 'Reliability', outputsSoFar);
    const generator = resolution.document.nodes.find((candidate) => candidate.kind === 'monteCarloGenerator');
    const trialAxis = generator === undefined ? undefined : axes.get(generator.id);
    const hasTrials = trialAxis !== undefined && checkResults.some((check) => check.series.axes.some((axis) => axis.id === trialAxis.id));
    if (!hasTrials) warnings.push({
      kind: 'reliabilityNoTrials',
      nodeId: node.id,
      message: 'nothing in this study is random — referenced checks do not vary along the trial axis',
    });
    const checks = checkResults.map((check) => reliabilityEstimate(check.nodeId, check.results, confidence));
    const studyAxes = unionAxes(...checkResults.map((check) => check.series.axes));
    const combinedVerdicts = checkResults.length === 0
      ? []
      : feasibleMask(checkResults, studyAxes).mask;
    const combined = checkResults.length === 0 ? undefined : reliabilityEstimate('all', combinedVerdicts, confidence);
    if ([...checks, ...(combined === undefined ? [] : [combined])].some((estimate) => estimate.unresolved)) {
      warnings.push({
        kind: 'reliabilityUnresolved',
        nodeId: node.id,
        message: `zero failures were observed — report Pf < 1/n and a lower bound on beta, not zero risk`,
      });
    }
    return {
      ...base,
      kind: 'reliability',
      confidence,
      checks,
      ...(combined === undefined ? {} : { combined }),
    };
  }

  if (output.kind === 'distribution') {
    const { value, unit } = sourceOf(node, VALUE_PORT, resolution, values);
    if (value.kind !== 'numeric') throw new KernelError('a Distribution output needs numeric samples', node.id);
    const generator = resolution.document.nodes.find((candidate) => candidate.kind === 'monteCarloGenerator');
    const overNode = output.over ?? generator?.id;
    const over = overNode === undefined ? undefined : axes.get(overNode);
    if (over === undefined || !value.axes.some((axis) => axis.id === over.id)) {
      throw new KernelError('a Distribution output needs a sampled axis; connect a Monte Carlo study or choose over', node.id);
    }
    const facet = output.facet === undefined ? undefined : axes.get(output.facet);
    if (output.facet !== undefined && facet === undefined) throw new KernelError(`'${output.facet}' is not an axis`, node.id);
    const built = buildDistribution(value, over, facet, node.id, {
      ...(output.bins === undefined ? {} : { bins: output.bins }),
      ...(output.percentiles === undefined ? {} : { percentiles: output.percentiles }),
      ...(output.fit === undefined ? {} : { fit: output.fit }),
    });
    warnings.push(...built.warnings);
    return {
      ...base,
      kind: 'distribution',
      view: output.view,
      unit,
      over,
      ...(facet === undefined ? {} : { facet }),
      panels: built.panels,
    };
  }

  if (output.kind === 'sensitivity') {
    const key = endpointKey(node.id, VALUE_PORT);
    const edge = resolution.incoming.get(key)?.[0];
    if (edge === undefined) throw new KernelError("'value' is not connected", key);
    const rankings = evaluateSensitivity(resolution.document, catalogues, edge.from.node, edge.from.port, warnings);
    return {
      ...base,
      kind: 'sensitivity',
      targetUnit: displayUnit(resolution.sources.get(endpointKey(edge.from.node, edge.from.port))),
      rankings,
    };
  }

  // Plot measure ports are stable rather than positional: deleting the first
  // measure may leave `value2` as the new lead. Do not accidentally require
  // the legacy `value` port merely to reach the multi-measure branch below.
  const primaryPort = output.kind === 'plot' ? plotMeasures(output)[0]?.id ?? VALUE_PORT : VALUE_PORT;
  const { value, unit: portUnit } = sourceOf(node, primaryPort, resolution, values);

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

  const plotAxis = (id: string, plotted: NumericSeries): PlotAxis => {
    const axis = axes.get(id);
    if (axis === undefined) {
      throw new KernelError(`'${id}' is not a range input node, so it introduces no axis`, node.id);
    }
    const coordinates = values.get(endpointKey(id, VALUE_PORT));
    if (coordinates === undefined || coordinates.kind === 'spectrum' || coordinates.kind === 'bundle') {
      throw new KernelError(`'${id}' produced no coordinates to plot against`, node.id);
    }
    // Compared against the resolved axis's own `id`, not the node id passed
    // in: for an ordinary range they are the same thing, but two Monte Carlo
    // generators combined together share one axis id that is neither node's
    // own (`graph.ts`'s `Resolution.axes` doc comment), so matching against
    // the raw `id` would misfire "flat" for a value that does vary.
    if (!plotted.axes.some((own) => own.id === axis.id)) {
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

  const axisReadout = (axis: Axis, plotted: NumericSeries): PlotAxis => {
    const introducedBy = [...axes.entries()].find(([, candidate]) => candidate.id === axis.id)?.[0];
    if (introducedBy === undefined) throw new KernelError(`no coordinates were found for '${axis.label}'`, node.id);
    return plotAxis(introducedBy, plotted);
  };

  const measures = plotMeasures(output).map((measure): PlotMeasureResult => {
    const { value: plotted, unit: sourceUnit } = sourceOf(node, measure.id, resolution, values);
    if (plotted.kind !== 'numeric') {
      throw new KernelError(
        `a plot measure needs a numeric value, not a categorical one`,
        endpointKey(node.id, measure.id),
      );
    }
    if (plotted.axes.length > 3) {
      warnings.push({
        kind: 'plotAxesUnsupported',
        nodeId: node.id,
        message: `'${measure.label ?? measure.id}' varies along ${plotted.axes.length} axes; a plot panel supports at most three`,
      });
    }

    const thresholdPort = plotThresholdPort(measure.id);
    const thresholdKey = endpointKey(node.id, thresholdPort);
    const thresholdEdge = resolution.incoming.get(thresholdKey)?.[0];
    const authoredThresholdUnit = measure.threshold === undefined
      ? undefined
      : isDimensionless(measure.threshold.unit.dimension) && !isDimensionless(sourceUnit.dimension)
        ? sourceUnit
        : measure.threshold.unit;
    const threshold = thresholdEdge === undefined
      ? measure.threshold === undefined || authoredThresholdUnit === undefined
        ? undefined
        : toCanonical(measure.threshold.value, authoredThresholdUnit)
      : (() => {
          const supplied = valueAtEdge(thresholdEdge, thresholdKey, values);
          if (supplied.kind !== 'numeric') {
            throw new KernelError("a plot's threshold needs a numeric value, not a categorical one", thresholdKey);
          }
          if (supplied.data.length !== 1) {
            throw new KernelError(
              "a plot's threshold needs a single value — it draws one reference line, not one per point",
              thresholdKey,
            );
          }
          return supplied.data[0] as number;
        })();
    const edge = resolution.incoming.get(endpointKey(node.id, measure.id))?.[0];
    const sourceNode = edge === undefined
      ? undefined
      : resolution.document.nodes.find((candidate) => candidate.id === edge.from.node);
    const label = measure.label ?? sourceNode?.label ?? edge?.from.port ?? measure.id;
    return {
      id: measure.id,
      label,
      series: plotted,
      unit: measure.unit ?? sourceUnit,
      axes: plotted.axes.map((axis) => axisReadout(axis, plotted)),
      ...(threshold === undefined ? {} : { threshold }),
      ...(measure.view === undefined ? {} : { view: measure.view }),
    };
  });

  const primary = measures[0];
  if (primary === undefined) throw new KernelError('wire at least one numeric value', node.id);
  const contour = primary.view?.type === 'contour' || (primary.view?.type === undefined && (output.contour ?? false));
  const pinned = {
    x: primary.view?.x ?? output.x,
    series: contour ? (primary.view?.y ?? output.series) : (primary.view?.series ?? output.series),
    facet: primary.view?.facet ?? output.facet,
  };
  const legacyPlot = output.measures === undefined;
  const picked = primary.series.axes.length === 0 && !legacyPlot
    ? undefined
    : pickPlotAxes(pinned, primary.series.axes, axes, node.id, warnings);
  if (contour && picked?.series === undefined) {
    warnings.push({
      kind: 'plotContourFlat',
      nodeId: node.id,
      message: 'a contour needs a second swept axis — reset its type to Auto or add another axis',
    });
  }
  if (legacyPlot && contour && picked?.facet !== undefined) {
    warnings.push({
      kind: 'plotContourFacet',
      nodeId: node.id,
      message: 'the legacy contour ignores its facet axis; reset the plot to Auto to use faceted surfaces',
    });
  }

  const scalarAxis: Axis = {
    id: `${node.id}Measure`,
    label: 'measure',
    length: measures.length,
    order: Number.MAX_SAFE_INTEGER,
  };
  const primaryX: PlotAxis = picked === undefined
    ? {
        axis: scalarAxis,
        coordinates: { kind: 'categorical', axes: [scalarAxis], data: measures.map((measure) => measure.label) },
        unit: DIMENSIONLESS_UNIT,
      }
    : plotAxis(picked.x, primary.series);

  return {
    ...base,
    kind: 'plot',
    measures,
    series: primary.series,
    unit: primary.unit,
    x: primaryX,
    ...(picked?.series === undefined ? {} : { series2: plotAxis(picked.series, primary.series) }),
    ...(picked?.facet === undefined || (legacyPlot && contour)
      ? {}
      : { facet: plotAxis(picked.facet, primary.series) }),
    contour,
    ...(primary.threshold === undefined ? {} : { threshold: primary.threshold }),
  };
}
