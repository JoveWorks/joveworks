/**
 * Canonical units for machine-design-studio: mm, N, s, rad, K (S5).
 *
 * Everything the kernel computes with is in those five. Display units exist at
 * the boundary only, and an undeclared unit is an error rather than a default.
 */

export {
  BASE_DIMENSIONS,
  BASE_UNIT_SYMBOL,
  DIMENSIONLESS,
  LENGTH,
  FORCE,
  TIME,
  ANGLE,
  TEMPERATURE,
  AREA,
  VOLUME,
  FREQUENCY,
  VELOCITY,
  ACCELERATION,
  MASS,
  DENSITY,
  STRESS,
  TORQUE,
  POWER,
  dimension,
  multiplyDimensions,
  divideDimensions,
  powerDimension,
  invertDimension,
  dimensionsEqual,
  isDimensionless,
  dimensionName,
  formatDimension,
  describeDimension,
} from './dimension.js';
export type { BaseDimension, Dimension } from './dimension.js';

export {
  DIMENSIONLESS_UNIT,
  UnitError,
  unit,
  lookupAtomicUnit,
  knownUnitSymbols,
  assertDimensionsCompatible,
} from './unit.js';
export type { Unit } from './unit.js';

export { parseUnit, parseUnitExpression, parseUnitTag } from './parse.js';
export type { UnitTag } from './parse.js';

export {
  toCanonical,
  fromCanonical,
  convert,
  toSignificantFigures,
  formatQuantity,
  parseQuantity,
} from './convert.js';
export type { ParsedQuantity } from './convert.js';
