/**
 * The boundary readers: JSON in, typed records out, `SchemaError` on anything
 * else.
 *
 * These are deliberately hand-written rather than pulled from a validation
 * library. The package has no runtime dependencies, the shapes are small, and
 * the messages are the part that matters — they are read by whoever authored a
 * catalogue, not by whoever wrote this file.
 */

import { SchemaError } from './errors.js';

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

function typeName(value: JsonValue | undefined): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

export function fail(path: string, message: string): never {
  throw new SchemaError(message, path);
}

export function readObject(value: JsonValue | undefined, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, `expected an object, got ${typeName(value)}`);
  }
  return value;
}

export function readString(value: JsonValue | undefined, path: string): string {
  if (typeof value !== 'string') fail(path, `expected a string, got ${typeName(value)}`);
  return value;
}

/** A string that names something — an id, a port, a symbol. Blank is an error. */
export function readName(value: JsonValue | undefined, path: string): string {
  const text = readString(value, path);
  if (text.trim().length === 0) fail(path, 'expected a non-empty name');
  return text;
}

export function readNumber(value: JsonValue | undefined, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, `expected a finite number, got ${typeName(value)}`);
  }
  return value;
}

export function readInteger(value: JsonValue | undefined, path: string, minimum = 0): number {
  const n = readNumber(value, path);
  if (!Number.isInteger(n)) fail(path, `expected an integer, got ${n}`);
  if (n < minimum) fail(path, `expected an integer of at least ${minimum}, got ${n}`);
  return n;
}

export function readBoolean(value: JsonValue | undefined, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, `expected true or false, got ${typeName(value)}`);
  return value;
}

export function readArray(value: JsonValue | undefined, path: string): readonly JsonValue[] {
  if (!Array.isArray(value)) fail(path, `expected an array, got ${typeName(value)}`);
  return value;
}

export function readStringArray(value: JsonValue | undefined, path: string): readonly string[] {
  return readArray(value, path).map((entry, i) => readName(entry, `${path}[${i}]`));
}

export function readNumberArray(value: JsonValue | undefined, path: string): readonly number[] {
  return readArray(value, path).map((entry, i) => readNumber(entry, `${path}[${i}]`));
}

export function readEnum<T extends string>(
  value: JsonValue | undefined,
  path: string,
  allowed: readonly T[],
): T {
  const text = readString(value, path);
  if (!(allowed as readonly string[]).includes(text)) {
    fail(path, `expected one of ${allowed.map((a) => `'${a}'`).join(', ')}, got '${text}'`);
  }
  return text as T;
}

/**
 * A required field. Absent and `null` are the same thing here: an optional field
 * is written by leaving it out, so `null` never carries meaning in these
 * documents and accepting it would create a second spelling of "unset".
 */
export function required(object: JsonObject, key: string, path: string): JsonValue {
  const value = object[key];
  if (value === undefined || value === null) fail(join(path, key), 'is required');
  return value;
}

/** An optional field, read with `read` when present. */
export function optional<T>(
  object: JsonObject,
  key: string,
  path: string,
  read: (value: JsonValue, path: string) => T,
): T | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  return read(value, join(path, key));
}

export function join(path: string, key: string): string {
  return path.length === 0 ? key : `${path}.${key}`;
}

/**
 * Attach a value to a key only when it is set.
 *
 * `exactOptionalPropertyTypes` is on, so `{ description: undefined }` is not the
 * same type as `{}` — and it is not the same JSON either, since `JSON.stringify`
 * would drop the key and change the content hash. Both reasons point the same
 * way: never write the key at all.
 */
export function put<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : ({ [key]: value } as Record<string, T>);
}

/**
 * JSON with object keys in sorted order.
 *
 * This is what a content hash (S23) is taken over: two records that differ only
 * in the order their fields were written must hash the same, or a graph would
 * warn about a catalogue that had not changed.
 */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`)
    .join(',');
  return `{${body}}`;
}

/** Read a whole document from text, with parse failures reported the same way. */
export function readJsonText(text: string, path = ''): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch (error) {
    fail(path, `is not valid JSON — ${(error as Error).message}`);
  }
}
