/**
 * The notebook's reading order — top-to-bottom, then left-to-right on
 * near-ties, comic-book style (ROADMAP.md).
 */

import { describe, expect, it } from 'vitest';

import { readingOrder } from './Notebook';

describe('readingOrder', () => {
  it('reads top-to-bottom for nodes clearly on different rows', () => {
    const top = { position: { x: 300, y: 0 } };
    const bottom = { position: { x: 0, y: 400 } };
    expect([bottom, top].sort(readingOrder)).toEqual([top, bottom]);
  });

  it('reads left-to-right for nodes on the same row, even with a small y offset', () => {
    const left = { position: { x: 0, y: 100 } };
    const right = { position: { x: 400, y: 108 } };
    expect([right, left].sort(readingOrder)).toEqual([left, right]);
  });
});
