import { describe, expect, it } from 'vitest';

import { fuzzyScore, fuzzySearch } from './fuzzy';

describe('fuzzyScore', () => {
  it('matches a subsequence, not just a substring', () => {
    expect(fuzzyScore('pdwd', 'Pad width d')).not.toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('WIDTH', 'pad width')).not.toBeUndefined();
  });

  it('fails when a character is missing entirely', () => {
    expect(fuzzyScore('pdwz', 'Pad width d')).toBeUndefined();
  });

  it('fails when the order is wrong', () => {
    expect(fuzzyScore('wp', 'pad width')).toBeUndefined();
  });

  it('scores a tighter, more contiguous match higher', () => {
    const tight = fuzzyScore('width', 'Pad width') as number;
    const scattered = fuzzyScore('width', 'w i d t h, spread out') as number;
    expect(tight).toBeGreaterThan(scattered);
  });

  it('matches everything with an empty query', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});

describe('fuzzySearch', () => {
  const items = ['Pad width w', 'Pad height h', 'Load F', 'compare'];

  it('ranks the tightest matches first', () => {
    expect(fuzzySearch('pad', items, (item) => item)).toEqual(['Pad width w', 'Pad height h']);
  });

  it('finds a node by a scattered subsequence of its name', () => {
    expect(fuzzySearch('cmpr', items, (item) => item)).toEqual(['compare']);
  });

  it('returns everything, unranked, for a blank query', () => {
    expect(fuzzySearch('  ', items, (item) => item)).toEqual(items);
  });

  it('excludes anything that does not match at all', () => {
    expect(fuzzySearch('xyz', items, (item) => item)).toEqual([]);
  });

  it('matches across a combined label-id-port search string', () => {
    const combined = ['Pressure against pad width p_plot value threshold'];
    expect(fuzzySearch('pthr', combined, (item) => item)).toEqual(combined);
  });
});
