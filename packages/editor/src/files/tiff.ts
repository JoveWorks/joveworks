/**
 * A TIFF image file directory, which is what EXIF is made of.
 *
 * One IFD is a count followed by twelve-byte entries: tag, type, count, and
 * either the value itself or an offset to it, relative to the start of the
 * TIFF block rather than the file. Inside a CR3 each `CMT` box is a complete
 * such block — its own byte-order mark and all — so this reads a block at an
 * offset and never assumes it sits at the start of a file.
 *
 * Malformed input answers with fewer tags rather than an exception: a reader
 * that throws on the first odd offset turns a slightly unusual file into a
 * blank node with a stack trace, and there is nothing a student could do
 * about it.
 */

/** A tag's values, already turned into numbers or, for ASCII, one string. */
export type TiffValue = number | string;

/** Field type codes, and how many bytes one component of each takes. */
const TYPE_SIZES: Readonly<Record<number, number>> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

function component(view: DataView, at: number, type: number, little: boolean): TiffValue | undefined {
  switch (type) {
    case 1:
    case 7:
      return view.getUint8(at);
    case 6:
      return view.getInt8(at);
    case 3:
      return view.getUint16(at, little);
    case 8:
      return view.getInt16(at, little);
    case 4:
      return view.getUint32(at, little);
    case 9:
      return view.getInt32(at, little);
    case 11:
      return view.getFloat32(at, little);
    case 12:
      return view.getFloat64(at, little);
    case 5: {
      const denominator = view.getUint32(at + 4, little);
      // 1/0 is how some bodies write "unknown"; it is not a zero-division to
      // report, just a value that is not there.
      return denominator === 0 ? undefined : view.getUint32(at, little) / denominator;
    }
    case 10: {
      const denominator = view.getInt32(at + 4, little);
      return denominator === 0 ? undefined : view.getInt32(at, little) / denominator;
    }
    default:
      return undefined;
  }
}

function ascii(view: DataView, at: number, count: number): string {
  let text = '';
  for (let i = 0; i < count; i += 1) {
    const byte = view.getUint8(at + i);
    if (byte === 0) break; // NUL terminates; some writers pad past it.
    text += String.fromCharCode(byte);
  }
  return text.trim();
}

/**
 * Every tag of the first IFD in the TIFF block at `[start, end)`, or an
 * empty map when that is not a TIFF block at all.
 */
export function readTiffBlock(
  view: DataView,
  start: number,
  end: number,
): ReadonlyMap<number, readonly TiffValue[]> {
  const tags = new Map<number, readonly TiffValue[]>();
  if (start + 8 > end) return tags;
  const order = view.getUint16(start, false);
  if (order !== 0x4949 && order !== 0x4d4d) return tags;
  const little = order === 0x4949;
  if (view.getUint16(start + 2, little) !== 42) return tags;

  const ifd = start + view.getUint32(start + 4, little);
  if (ifd + 2 > end) return tags;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const components = view.getUint32(entry + 4, little);
    const size = TYPE_SIZES[type];
    if (size === undefined || components === 0) continue;
    const bytes = size * components;
    // Four bytes or fewer live in the entry itself; anything longer is an
    // offset from the block's own start.
    const at = bytes <= 4 ? entry + 8 : start + view.getUint32(entry + 8, little);
    if (at < start || at + bytes > end) continue;

    if (type === 2) {
      tags.set(tag, [ascii(view, at, components)]);
      continue;
    }
    const values: TiffValue[] = [];
    for (let j = 0; j < components; j += 1) {
      const value = component(view, at + j * size, type, little);
      if (value !== undefined) values.push(value);
    }
    if (values.length > 0) tags.set(tag, values);
  }
  return tags;
}

/** The first value of `tag`, when it is a number. */
export function numberAt(
  tags: ReadonlyMap<number, readonly TiffValue[]>,
  tag: number,
): number | undefined {
  const value = tags.get(tag)?.[0];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The first value of `tag`, when it is a non-empty string. */
export function textAt(
  tags: ReadonlyMap<number, readonly TiffValue[]>,
  tag: number,
): string | undefined {
  const value = tags.get(tag)?.[0];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
