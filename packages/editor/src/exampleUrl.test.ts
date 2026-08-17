import { describe, expect, it } from 'vitest';

import { exampleIdFromUrl, urlForExample } from './exampleUrl';

describe('example notebook URLs', () => {
  it('recognises a known example', () => {
    expect(exampleIdFromUrl(new URL('https://example.test/app/?example=belt-lab'))).toBe('belt-lab');
    expect(exampleIdFromUrl(new URL('https://example.test/?example=milling-power-envelope'))).toBe(
      'milling-power-envelope',
    );
  });

  it('ignores unknown example names', () => {
    expect(exampleIdFromUrl(new URL('https://example.test/?example=unknown'))).toBeUndefined();
  });

  it('retains the static deployment path and unrelated parameters', () => {
    const next = urlForExample(
      new URL('https://example.test/nodebook/?theme=dark#canvas'),
      'cantilever-hollow-sections',
    );

    expect(next.href).toBe(
      'https://example.test/nodebook/?theme=dark&example=cantilever-hollow-sections#canvas',
    );
  });
});
