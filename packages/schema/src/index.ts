/**
 * The contract: the formula record, the graph document, and the boundary that
 * turns untrusted JSON into either of them.
 *
 * It sits on top of `@mds/units` and restates none of it — a port declares a
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
export type { Formula, FormulaStatus, FormulaRef, RefMatch, Catalogue } from './formula.js';

export { fnv1a64, hashRecord } from './hash.js';

export {
  VALUE_PORT,
  THRESHOLD_PORT,
  VERDICT_PORT,
  CLOSURE_RESULT_PORT,
  COMPARISONS,
  OUTPUT_KINDS,
  axes,
  nodesInFrame,
  parseDocument,
  serializeDocument,
  emptyDocument,
} from './document.js';
export type {
  GraphDocument,
  GraphNode,
  InputNode,
  FormulaNode,
  OutputNode,
  CompareNode,
  ClosureNode,
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
  Comparison,
} from './document.js';

export { loadDocument, saveDocument, loadCatalogue, saveCatalogue } from './io.js';
