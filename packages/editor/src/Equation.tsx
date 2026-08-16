/**
 * Typesets a LaTeX string with KaTeX — the equation output node's renderer.
 *
 * `throwOnError: false`: the LaTeX always comes from `toLatex()` over an
 * already-parsed, already-validated expression, so it should never be
 * invalid — but this is the one seam that would notice if it somehow were,
 * degrading to KaTeX's own inline error text instead of crashing the canvas.
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';

import type { ReactElement } from 'react';

export function Equation({
  latex,
  displayMode = true,
}: {
  readonly latex: string;
  readonly displayMode?: boolean;
}): ReactElement {
  const html = katex.renderToString(latex, { throwOnError: false, displayMode });
  return <span className="equation" dangerouslySetInnerHTML={{ __html: html }} />;
}
