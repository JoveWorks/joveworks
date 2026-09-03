import { describe, expect, it } from 'vitest';

import { documentFileName, slugifyTitle, userEquationsFileName } from './files';

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
