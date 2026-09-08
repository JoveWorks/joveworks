// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentFileName, saveTextFile, slugifyTitle, userEquationsFileName } from './files';

describe('JoveWorks file names', () => {
  it('uses the JoveWorks suffix for NodeBooks', () => {
    expect(documentFileName('belt-drive')).toBe('belt-drive.jove.json');
  });

  it('kebab-cases a title a student actually typed, not the fixed document id', () => {
    expect(documentFileName('C16 Belt Drive')).toBe('c16-belt-drive.jove.json');
    expect(documentFileName('Untitled')).toBe('untitled.jove.json');
  });

  it('uses the JoveWorks equation-library name', () => {
    expect(userEquationsFileName).toBe('joveworks-equations.json');
  });
});

describe('slugifyTitle', () => {
  it('collapses punctuation and spacing into single dashes', () => {
    expect(slugifyTitle('C16 Belt Drive!')).toBe('c16-belt-drive');
    expect(slugifyTitle('  spaced   out  ')).toBe('spaced-out');
  });

  it('falls back to "untitled" for an empty or punctuation-only title', () => {
    expect(slugifyTitle('')).toBe('untitled');
    expect(slugifyTitle('   ')).toBe('untitled');
    expect(slugifyTitle('???')).toBe('untitled');
  });

  it('truncates a long title rather than producing an unusable file name', () => {
    const long = 'a'.repeat(100);
    const slug = slugifyTitle(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toBe('a'.repeat(60));
  });

  it('never leaves a dangling dash where truncation cut mid-word-boundary', () => {
    const title = `${'a'.repeat(59)} b`;
    expect(slugifyTitle(title).endsWith('-')).toBe(false);
  });
});

describe('saveTextFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // These two are plain assignments, not spies (see below), so
    // `restoreAllMocks` does not touch them — drop them so a later test
    // never sees a stale mock from this one.
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  /**
   * Captures the MIME type `saveTextFile` hands to the blob it downloads.
   *
   * jsdom does not implement `URL.createObjectURL` at all (there is no
   * existing property for `vi.spyOn` to wrap), so it is assigned directly
   * and restored in `afterEach`; the anchor's own `.click()` is stubbed too,
   * since jsdom has no navigation and would otherwise log a "not
   * implemented" error for every test here.
   */
  function capturedBlobType(run: () => void): string {
    let type: string | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      type = blob.type;
      return 'blob:mock';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    run();
    if (type === undefined) throw new Error('URL.createObjectURL was not called');
    return type;
  }

  it('defaults the download to a JSON blob, unchanged from before this had a `type` parameter', () => {
    expect(capturedBlobType(() => saveTextFile('report.json', '{}'))).toBe('application/json');
  });

  it('takes an explicit blob type — text/csv for a table export (model/csv.ts)', () => {
    expect(capturedBlobType(() => saveTextFile('table.csv', 'a,b\n1,2', 'text/csv'))).toBe('text/csv');
  });
});
