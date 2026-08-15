/**
 * Numbers as they are *written*: a magnitude and the unit it was written in.
 *
 * This package deliberately does not store canonical values. `units` already
 * owns the conversion, and a document that stored `0.25` where the author
 * typed `250 kW` would be unreadable, undiffable, and would not survive a
 * round-trip bit-for-bit — `value * factor / factor` is not the identity in
 * binary floating point.
 *
 * So the rule is: documents carry authored numbers, and **conversion happens
 * when a document is loaded into the kernel**. That is the boundary S5 means.
 * `canonicalValue` is the one function that crosses it.
 */

import {
  UnitError,
  isGenericSignature,
  parseGenericDimension,
  parseUnit,
  toCanonical,
  type GenericDimension,
  type Unit,
} from '@mds/units';

import { fail, readNumber, readString, type JsonObject, type JsonValue } from './json.js';

export interface Quantity {
  /** The magnitude as authored, in `unit`. */
  readonly value: number;
  readonly unit: Unit;
}

/** Parse a unit string, reporting a bad unit at the field that carried it. */
export function parseUnitField(value: JsonValue | undefined, path: string): Unit {
  const text = readString(value, path);
  try {
    return parseUnit(text);
  } catch (error) {
    if (error instanceof UnitError) fail(path, error.message);
    throw error;
  }
}

/**
 * A port's unit field, which may also carry a generic signature. Only
 * ports accept one: a `Quantity` is a number someone typed, and `5 $A` is not a
 * number anyone can type.
 */
export function parsePortUnitField(
  value: JsonValue | undefined,
  path: string,
): Unit | GenericDimension {
  const text = readString(value, path);
  try {
    return isGenericSignature(text) ? parseGenericDimension(text) : parseUnit(text);
  } catch (error) {
    if (error instanceof UnitError) fail(path, error.message);
    throw error;
  }
}

export function parseQuantity(value: JsonValue | undefined, path: string): Quantity {
  const object = value as JsonObject | undefined;
  if (typeof object !== 'object' || object === null || Array.isArray(object)) {
    fail(path, 'expected an object with a value and a unit');
  }
  return {
    value: readNumber(object['value'], `${path}.value`),
    unit: parseUnitField(object['unit'], `${path}.unit`),
  };
}

export function serializeQuantity(quantity: Quantity): JsonObject {
  return { value: quantity.value, unit: quantity.unit.symbol };
}

/** The one crossing of the S5 boundary: authored magnitude → mm-N-s-rad-K. */
export function canonicalValue(quantity: Quantity): number {
  return toCanonical(quantity.value, quantity.unit);
}
