/**
 * The contract: the formula record, the graph document, and the boundary that
 * turns untrusted JSON into either of them.
 *
 * It sits on top of `@joveworks/units` and restates none of it — a port declares a
 * display unit and its dimension comes from `units`, so there is one place to be
 * wrong about what `N/mm²` means. It knows nothing about evaluation: expressions
 * and predicates are stored as strings for the kernel to parse, and
 * cycles are rejected where connections are made.
 */

export { SchemaError } from './errors.js';
export type { JsonObject, JsonValue } from './json.js';
export { canonicalJson } from './json.js';

export { SCHEMA_VERSION } from './version.js';

export {
  canonicalValue,
  serializeQuantity,
  parseUnitField,
  parsePortUnitField,
} from './quantity.js';
export type { Quantity } from './quantity.js';

export {
  PORT_KINDS,
  MONOTONICITY,
  portDimension,
  isGenericPort,
  withinRange,
  domainMember,
  parsePort,
  serializePort,
  asInputPort,
  asOutputPort,
} from './port.js';
export type {
  Port,
  PortKind,
  PortUnit,
  OutputPort,
  NumericPort,
  CategoricalPort,
  SpectrumPort,
  BundlePort,
  ValidRange,
  Monotonicity,
} from './port.js';

export {
  VALUE_KINDS,
  RENARD_SERIES,
  DEFAULT_SLIDER_FIGURES,
  isRange,
  hasUnit,
  axisLength,
  renardValues,
  parseValueSpec,
  serializeValueSpec,
} from './value.js';
export type {
  ValueSpec,
  UnitedValueSpec,
  ValueKind,
  ScalarValue,
  SliderValue,
  CategoricalValue,
  SpectrumValue,
  RangeSpec,
  LinearRange,
  LogarithmicRange,
  ListRange,
  RenardRange,
  RenardSeries,
  TableColumnRange,
  CategoricalListRange,
} from './value.js';

export {
  FORMULA_STATUSES,
  isEvaluable,
  expressionOf,
  appliesWhenOf,
  soleExpression,
  lookupColumn,
  ports,
  findInput,
  findFormula,
  parseFormula,
  serializeFormula,
  formulaHash,
  formulaRef,
  parseFormulaRef,
  serializeFormulaRef,
  matchRef,
  parseCatalogue,
  serializeCatalogue,
} from './formula.js';
export type {
  Formula,
  FormulaStatus,
  FormulaRef,
  RefMatch,
  Catalogue,
  FormulaLookup,
  LookupAxis,
} from './formula.js';

export { fnv1a64, hashRecord } from './hash.js';

export {
  VALUE_PORT,
  THRESHOLD_PORT,
  VERDICT_PORT,
  CLOSURE_RESULT_PORT,
  ALONG_PORT,
  AT_PORT,
  BEST_PORT,
  OBJECTIVE_PORT,
  X_PORT,
  Y_PORT,
  OBJECTIVE_DIRECTIONS,
  COMPARISONS,
  SELECT_MODES,
  SELECT_DIRECTIONS,
  NODE_KINDS,
  OUTPUT_KINDS,
  MONTE_CARLO_DISTRIBUTIONS,
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
  STATISTICS,
  DISTRIBUTION_VIEWS,
  DEFAULT_MONTE_CARLO_SAMPLE_LIMIT,
  axes,
  nodesInFrame,
  parseDocument,
  serializeDocument,
  emptyDocument,
} from './document.js';
export type {
  GraphDocument,
  GraphNode,
  NodeKind,
  AxisNode,
  InputNode,
  FileNode,
  FileField,
  FileSource,
  FormulaNode,
  OutputNode,
  CompareNode,
  SelectNode,
  SelectMode,
  SelectDirection,
  CrossingSelectNode,
  PassingSelectNode,
  ExtremumSelectNode,
  Statistic,
  StatisticNode,
  PercentileStatisticNode,
  ProbabilityStatisticNode,
  PlainStatisticNode,
  ClosureNode,
  WaypointNode,
  PackNode,
  UnpackNode,
  MonteCarloDistribution,
  MonteCarloGeneratorNode,
  UniformMonteCarloGeneratorNode,
  NormalMonteCarloGeneratorNode,
  TriangularMonteCarloGeneratorNode,
  DiscreteMonteCarloGeneratorNode,
  MonteCarloReceiverNode,
  Edge,
  Endpoint,
  Frame,
  Position,
  Size,
  Output,
  OutputKind,
  PrintOutput,
  CheckOutput,
  PlotOutput,
  TableOutput,
  FeasibilityOutput,
  SensitivityOutput,
  BestDesignOutput,
  DistributionOutput,
  DistributionView,
  ReliabilityOutput,
  ParetoOutput,
  ObjectiveDirection,
  Candidate,
  Comparison,
} from './document.js';

export { loadDocument, saveDocument, loadCatalogue, saveCatalogue } from './io.js';
export { localize, parseLocalizedText, serializeLocalizedText } from './localization.js';
export type { LocalizedText } from './localization.js';

export {
  encryptCatalogue,
  decryptCatalogue,
  parseLockedCatalogue,
  serializeLockedCatalogue,
  loadLockedCatalogue,
  saveLockedCatalogue,
  CatalogueUnlockError,
  DEFAULT_KDF_ITERATIONS,
} from './lockedCatalogue.js';
export type { LockedCatalogue } from './lockedCatalogue.js';
