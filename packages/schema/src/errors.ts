/**
 * One error type for everything this package rejects.
 *
 * A catalogue or a graph arrives as a file a student loaded — from the LMS, from
 * a classmate, from their own disk — so every field is untrusted until it has
 * been through `parse*`. The message always carries the path of the offending
 * field, because "expected a number" on a 55-formula catalogue is not a usable
 * report.
 */
export class SchemaError extends Error {
  override readonly name = 'SchemaError';

  constructor(
    message: string,
    /** Dotted path of the field at fault — `formulas[3].inputs[1].unit`. */
    readonly path: string,
  ) {
    super(path.length > 0 ? `${path}: ${message}` : message);
  }
}
