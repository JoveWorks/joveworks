import { describe, expect, it } from 'vitest';

import { symbolParts } from './Symbol';

describe('rendering a catalogue-declared symbol (UI-FEEDBACK.md)', () => {
  it('splits a subscript off after the first underscore', () => {
    expect(symbolParts('F_a')).toEqual({ base: 'F', sub: 'a' });
    // Compound subscripts stay one block — d_dg is "d" sub "dg", not two cuts.
    expect(symbolParts('d_dg')).toEqual({ base: 'd', sub: 'dg' });
  });

  it('renders a spelled-out Greek name as its glyph', () => {
    expect(symbolParts('beta')).toEqual({ base: 'β' });
    expect(symbolParts('epsilon')).toEqual({ base: 'ε' });
    expect(symbolParts('theta')).toEqual({ base: 'θ' });
  });

  it('greekifies the subscript too, not just the base', () => {
    expect(symbolParts('c_beta')).toEqual({ base: 'c', sub: 'β' });
  });

  it('leaves a plain name — no underscore, not Greek — untouched', () => {
    expect(symbolParts('value')).toEqual({ base: 'value' });
    expect(symbolParts('quotient')).toEqual({ base: 'quotient' });
  });

  it('renders a spelled-out prime as the mark — Python identifiers cannot hold one', () => {
    expect(symbolParts('eprime')).toEqual({ base: 'e′' });
    // Repeats: a second prime is a second mark.
    expect(symbolParts('eprimeprime')).toEqual({ base: 'e′′' });
  });

  it('primes a subscript too, not just the base', () => {
    expect(symbolParts('d_dgprime')).toEqual({ base: 'd', sub: 'dg′' });
  });
});
