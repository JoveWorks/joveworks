/**
 * The contract: the formula record, the graph document, and the boundary that
 * turns untrusted JSON into either of them.
 *
 * It sits on top of `@mds/units` and restates none of it — a port declares a
 * display unit and its dimension comes from `units`, so there is one place to be
 * wrong about what `N/mm²` means. It knows nothing about evaluation: expressions
 * and predicates are stored as strings for the kernel to parse (S34/S39), and
 * cycles are rejected where connections are made (S18).
 */

export { SchemaError } from './errors.js';
export type { JsonObject, JsonValue } from './json.js';
export { canonicalJson } from './json.js';

export { SCHEMA_VERSION } from './version.js';

export { canonicalValue, serializeQuantity, parseUnitField } from './quantity.js';
export type { Quantity } from './quantity.js';

export {
  PORT_KINDS,
  MONOTONICITY,
  portDimension,
  withinRange,
  parsePort,
  serializePort,
} from './port.js';
export type {
  Port,
  PortKind,
  OutputPort,
  NumericPort,
  CategoricalPort,
  SpectrumPort,
  ValidRange,
  Monotonicity,
} from './port.js';

export { VALUE_KINDS, isRange, axisLength, parseValueSpec, serializeValueSpec } from './value.js';
export type {
  ValueSpec,
  ValueKind,
  ScalarValue,
  CategoricalValue,
  SpectrumValue,
  RangeSpec,
  LinearRange,
  LogarithmicRange,
  ListRange,
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
  Edge,
  Endpoint,
  Frame,
  Position,
  Size,
  Output,
  OutputKind,
  ValueOutput,
  CheckOutput,
  PlotOutput,
  TableOutput,
  Comparison,
} from './document.js';

export { loadDocument, saveDocument, loadCatalogue, saveCatalogue } from './io.js';
