import { describe, expect, it } from 'vitest';

import { parseUnit } from '@joveworks/units';

import { acceptOf, fieldsFrom, readFile, readerById, type ReadField } from './readers';

const mm = parseUnit('mm');

const read = (values: Readonly<Record<string, number | string | null>>): readonly ReadField[] =>
  Object.entries(values).map(([name, value]) =>
    typeof value === 'string' ? { name, value } : { name, unit: mm, value },
  );

describe('zipping several files into one field per port', () => {
  it('keeps one value per file, in the order they were read', () => {
    const fields = fieldsFrom([read({ f: 50 }), read({ f: 85 }), read({ f: 24 })]);
    expect(fields).toEqual([{ name: 'f', unit: mm, values: [50, 85, 24] }]);
  });

  it('fills in a field one of the files did not answer with', () => {
    const fields = fieldsFrom([read({ f: 50, w: 36 }), read({ f: 85 })]);
    expect(fields.find((field) => field.name === 'w')?.values).toEqual([36, null]);
  });

  it('leaves a categorical field without a unit', () => {
    const [field] = fieldsFrom([read({ camera: 'Canon EOS R6m3' })]);
    expect(field).toEqual({ name: 'camera', values: ['Canon EOS R6m3'] });
  });
});

describe('reading as little of a file as the reader needs', () => {
  const reader = {
    id: 'test',
    label: 'test file',
    extensions: ['.test'],
    prefixBytes: 8,
    read: (bytes: ArrayBuffer): readonly ReadField[] => {
      if (bytes.byteLength < 32) throw new Error('not enough of it');
      return read({ f: 50 });
    },
  };

  const file = (size: number) => {
    const reads: (number | undefined)[] = [];
    return {
      reads,
      size,
      bytes: (limit?: number): Promise<ArrayBuffer> => {
        reads.push(limit);
        return Promise.resolve(new ArrayBuffer(Math.min(limit ?? size, size)));
      },
    };
  };

  it('stops at the prefix when that is enough — the whole file is never touched', async () => {
    const long = file(64);
    await readFile({ ...reader, read: () => read({ f: 50 }) }, long);
    expect(long.reads).toEqual([8]);
  });

  it('reads a file smaller than the prefix in one go', async () => {
    const short = file(4);
    await readFile({ ...reader, read: () => read({ f: 50 }) }, short);
    expect(short.reads).toEqual([undefined]);
  });

  it('falls back to the whole file when the prefix could not answer', async () => {
    const long = file(64);
    const fields = await readFile(reader, long);
    expect(long.reads).toEqual([8, undefined]);
    expect(fields.find((field) => field.name === 'f')?.value).toBe(50);
  });
});

describe('the reader registry', () => {
  it('offers the CR3 photograph reader, and its picker filter', () => {
    const exif = readerById('exif');
    expect(exif?.extensions).toEqual(['.cr3']);
    expect(exif === undefined ? '' : acceptOf(exif)).toBe('.cr3');
  });

  it('answers nothing for a reader this build does not have', () => {
    expect(readerById('spreadsheet')).toBeUndefined();
  });
});
