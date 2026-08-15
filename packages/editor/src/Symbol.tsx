/**
 * A catalogue-declared symbol, rendered the way R&M sets it: `F_a` with `a`
 * as a true subscript, and a spelled-out Greek name (`beta`, `epsilon`) as
 * its glyph.
 *
 * Only for names a *catalogue* declares — a port, a formula's output. A
 * node's own label is free text a student typed and keeps their spelling
 * exactly (S49); running it through this would rewrite words that only
 * happen to look like a symbol.
 */

import type { ReactElement } from 'react';

const GREEK: Readonly<Record<string, string>> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Alpha: 'Α',
  Beta: 'Β',
  Gamma: 'Γ',
  Delta: 'Δ',
  Epsilon: 'Ε',
  Zeta: 'Ζ',
  Eta: 'Η',
  Theta: 'Θ',
  Iota: 'Ι',
  Kappa: 'Κ',
  Lambda: 'Λ',
  Mu: 'Μ',
  Nu: 'Ν',
  Xi: 'Ξ',
  Omicron: 'Ο',
  Pi: 'Π',
  Rho: 'Ρ',
  Sigma: 'Σ',
  Tau: 'Τ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Chi: 'Χ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

/**
 * `eprime` → `e′` — spelled out because the extraction script reads Python
 * identifiers (`tools/extract/`), and `e'` is not one. Repeats, so
 * `eprimeprime` is `e′′`, a second derivative's worth of prime marks.
 */
function stripPrimes(part: string): { readonly stem: string; readonly primes: number } {
  let stem = part;
  let primes = 0;
  while (stem.endsWith('prime')) {
    stem = stem.slice(0, -'prime'.length);
    primes += 1;
  }
  return { stem, primes };
}

function renderPart(part: string): string {
  const { stem, primes } = stripPrimes(part);
  return (GREEK[stem] ?? stem) + '′'.repeat(primes);
}

/** `F_a` → `{ base: 'F', sub: 'a' }`; `beta` → `{ base: 'β' }`; `eprime` → `{ base: "e′" }`. */
export function symbolParts(name: string): { readonly base: string; readonly sub?: string } {
  const cut = name.indexOf('_');
  if (cut === -1) return { base: renderPart(name) };
  return { base: renderPart(name.slice(0, cut)), sub: renderPart(name.slice(cut + 1)) };
}

export function Symbol({ name }: { readonly name: string }): ReactElement {
  const { base, sub } = symbolParts(name);
  return (
    <>
      {base}
      {sub === undefined ? null : <sub>{sub}</sub>}
    </>
  );
}
