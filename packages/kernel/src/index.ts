/**
 * The evaluation kernel: a graph in, numbers out.
 *
 * It is the half of this project that has to be right. The editor can be
 * rebuilt; a kernel that quietly computes a wrong number is the failure the
 * predecessor library made, and the whole shape of this package is a reply to
 * it — expressions parsed rather than `eval`ed, dimensions checked at
 * connection time rather than trusted, cycles refused rather than iterated,
 * quarantined formulas refused outright, and sweeps first-class rather than
 * bolted on.
 *
 * **Forward evaluation only — there is no solver here, and none is planned.**
 * R&M numbers its own rearranged forms as separate equations (`E17_1A/B/C`);
 * a rearrangement is migrated catalogue content, not something this kernel
 * derives. The rearranged formula is the thing being taught, and a root-finder
 * would hide it. A gap where no rearranged form exists is closed by authoring
 * the inverse formula directly, or by a range sweep — not by solving.
 *
 * It knows nothing about React, nothing about files, and nothing about Roloff &
 * Matek. Its test corpus is the base node library, which is arithmetic and
 * carries no textbook content at all.
 */

export { KernelError } from './errors.js';

export { BINARY_OPERATORS, expressionNames, predicateNames } from './ast.js';
export type {
  Expr,
  BinaryExpr,
  BinaryOperator,
  CallExpr,
  NameExpr,
  NumberExpr,
  UnaryExpr,
  Predicate,
  ComparePredicate,
  LogicalPredicate,
  NotPredicate,
} from './ast.js';

export { KEYWORDS, parseExpression, parsePredicate } from './parse.js';

export {
  CONSTANTS,
  FUNCTIONS,
  REDUCTIONS,
  isFunctionName,
} from './functions.js';
export type { FunctionSpec, ReductionSpec } from './functions.js';

export {
  EXPONENT_TOLERANCE,
  assertConnectable,
  assertSameDimension,
  connectable,
  dimensionsClose,
} from './dimensions.js';

export {
  checkPredicateDimensions,
  comparator,
  compileExpression,
  compilePredicate,
  constantValue,
  expressionDimension,
} from './compile.js';
export type { CompiledExpression, CompiledPredicate, DimensionScope, Env } from './compile.js';

export {
  LARGE_GRID,
  broadcastBoolean,
  broadcastSeries,
  categoricalScalar,
  gridSize,
  indexer,
  isSeries,
  reader,
  scalarSeries,
  unionAxes,
} from './series.js';
export type {
  Axis,
  BundleValue,
  CategoricalSeries,
  NumericSeries,
  PortValue,
  Series,
  Spectrum,
} from './series.js';

export {
  assertEvaluable,
  checkFormulaDimensions,
  compileClosureFormula,
  compileFormula,
} from './formula.js';
export type { CompiledFormula } from './formula.js';

export { closureFormula } from './closure.js';

export {
  nextPackChannel,
  packChannelIndices,
  waypointChannelIndices,
} from './bundle.js';

export {
  adaptInputUnit,
  canConnect,
  canonicalUnit,
  endpointKey,
  outputPortNames,
  resolveGraph,
  selectPortNames,
  statisticPortNames,
  topologicalOrder,
  typesConnect,
  wouldCycle,
} from './graph.js';
export type { ChannelType, ConnectionCheck, PortType, Resolution } from './graph.js';

export { percentile, reduceAlong, scanAlong } from './statistics.js';
export type { StatisticRequest, StatisticResult } from './statistics.js';
export { buildDistribution, distributionBinCount, ecdf, histogram } from './distribution.js';
export type { DistributionPanel, HistogramBin, EcdfPoint, NormalFit } from './distribution.js';
export { inverseNormal, normalCdf, wilsonInterval } from './normal.js';

export { COARSE_SWEEP_TOLERANCE, select } from './select.js';
export type { SelectRequest, SelectResult } from './select.js';

export { candidateAt, candidateMask, coordinatesAt, sameCandidate } from './candidates.js';
export type { AxisCoordinate, AxisReadout, CandidateMatch } from './candidates.js';

export { paretoFront } from './pareto.js';
export type { ParetoDirection } from './pareto.js';

export { evaluateDocument, markLetter, receiverSampleValue, valueAt } from './evaluate.js';
export type {
  BestDesignCoordinate,
  BestDesignMargin,
  BestDesignResult,
  CheckResult,
  EquationResult,
  Evaluation,
  EvaluationOptions,
  FeasibilityResult,
  DistributionResult,
  ReliabilityEstimate,
  ReliabilityResult,
  OutputResult,
  ParetoPoint,
  ParetoResult,
  PlotAxis,
  PlotResult,
  SensitivityResult,
  TableColumnResult,
  TableResult,
  PrintResult,
} from './evaluate.js';

export { evaluateSensitivity, sensitivityCandidates } from './sensitivity.js';
export type { SensitivityCandidate, SensitivityRankingResult } from './sensitivity.js';

export { monteCarloSamples } from './random.js';
export type { MonteCarloDraw, NormalDraw, UniformDraw } from './random.js';

export { toLatex } from './toLatex.js';

export { WARNING_KINDS } from './warnings.js';
export type { Warning, WarningKind } from './warnings.js';
