/**
 * The readers a file node can be given, and the one place that knows any
 * file format at all.
 *
 * The kernel is deliberately on the other side of this: it sees a node
 * carrying declared, typed, constant ports and never learns what EXIF is,
 * the same way it evaluates a closure node without having written the
 * expression. Everything format-shaped — picking bytes apart, deciding what
 * a tag means, which unit it is in — stops here.
 *
 * That is also the seam a second reader arrives through. A CSV or
 * spreadsheet reader is a new entry in `FILE_READERS` whose `read` answers
 * with its own fields; nothing in the schema, the kernel, or the node view
 * has to learn about it.
 */

import type { FileField } from '@joveworks/schema';
import type { Unit } from '@joveworks/units';

import { readExif } from './exif';

/** One field, as a reader answers for a single file. */
export interface ReadField {
  readonly name: string;
  /** Absent means a categorical field — a name, not a quantity. */
  readonly unit?: Unit;
  /** `null` where this file did not record the field. */
  readonly value: number | string | null;
}

export interface FileReaderDefinition {
  readonly id: string;
  /** Shown on the node, and in the palette entry that drops one. */
  readonly label: string;
  /** The extensions this reader understands, as the open node lists them. */
  readonly extensions: readonly string[];
  /**
   * How much of the file usually holds everything this reader wants.
   *
   * A raw frame is tens of megabytes and all of its metadata sits in the
   * first fraction of it, so reading the whole file to pick up a few dozen
   * tags is most of the wait. The caller tries this much first and reads the
   * rest only if that fails, so an unusual file is slower rather than wrong.
   */
  readonly prefixBytes?: number;
  /** Throws with a message worth showing when the bytes are the wrong thing entirely. */
  readonly read: (bytes: ArrayBuffer) => readonly ReadField[];
}

export const FILE_READERS: readonly FileReaderDefinition[] = [
  {
    id: 'exif',
    label: 'photograph',
    extensions: ['.cr3'],
    // Canon writes `moov` — and so the metadata — immediately after `ftyp`,
    // well inside the first megabyte; 8 covers a wide margin.
    prefixBytes: 8 * 1024 * 1024,
    read: readExif,
  },
];

/** A file picker's `accept`, built from what the reader says it understands. */
export function acceptOf(reader: FileReaderDefinition): string {
  return reader.extensions.join(',');
}

/**
 * One file's fields, read from as little of it as the reader needs.
 *
 * The prefix is an optimisation, not a contract: anything it cannot answer
 * from is read in full before giving up, so a file that lays its metadata
 * out unusually costs a slower read rather than a failure.
 */
export async function readFile(
  reader: FileReaderDefinition,
  file: { readonly size: number; readonly bytes: (limit?: number) => Promise<ArrayBuffer> },
): Promise<readonly ReadField[]> {
  const prefix = reader.prefixBytes;
  if (prefix !== undefined && prefix < file.size) {
    try {
      return reader.read(await file.bytes(prefix));
    } catch {
      // Fall through to the whole file.
    }
  }
  return reader.read(await file.bytes());
}

export const DEFAULT_READER = FILE_READERS[0] as FileReaderDefinition;

export function readerById(id: string): FileReaderDefinition | undefined {
  return FILE_READERS.find((reader) => reader.id === id);
}

/**
 * Several files' readings, zipped into one field per port.
 *
 * Field order follows the first file read, and a file that answered with a
 * field the others did not contributes `null` there — a reader with a fixed
 * list never hits that, but nothing here depends on the list being fixed.
 */
export function fieldsFrom(reads: readonly (readonly ReadField[])[]): readonly FileField[] {
  const order: string[] = [];
  const units = new Map<string, Unit | undefined>();
  for (const read of reads) {
    for (const field of read) {
      if (units.has(field.name)) continue;
      order.push(field.name);
      units.set(field.name, field.unit);
    }
  }
  return order.map((name) => {
    const unit = units.get(name);
    const values = reads.map((read) => read.find((field) => field.name === name)?.value ?? null);
    return { name, ...(unit === undefined ? {} : { unit }), values };
  });
}
