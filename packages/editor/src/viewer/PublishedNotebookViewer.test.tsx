import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CompiledOutputView } from './PublishedNotebookViewer';

const mm = { symbol: 'mm', factor: 1, dimension: { length: 1, force: 0, time: 0, angle: 0, temperature: 0 } };
const axis = { id: 'length', label: 'Length', length: 3, order: 0 };

describe('compiled report rendering', () => {
  it('draws a published value through the NodeBook\'s own result markup', () => {
    const value = renderToStaticMarkup(<CompiledOutputView output={{
      id: 'answer', kind: 'print', label: 'Answer', available: true,
      result: { kind: 'print', figures: 3, series: { kind: 'numeric', axes: [], data: [42] }, unit: mm },
    }} />);
    expect(value).toContain('class="result print"');
    expect(value).toContain('Answer');
    expect(value).toContain('42');
    expect(value).toContain('mm');
  });

  it('keeps an unavailable result readable rather than blank', () => {
    const missing = renderToStaticMarkup(<CompiledOutputView output={{ id: 'missing', kind: 'plot', label: 'Plot', available: false, unavailableReason: 'not connected' }} />);
    expect(missing).toContain('not connected');
  });

  /**
   * The published viewer used to hand plots to a renderer of its own. It
   * draws them through `present/PlotFigure` now, which builds its chart in an
   * effect — so what a server render can prove is that the compiled payload
   * decodes and reaches that figure's host rather than the old fallback text.
   */
  it('routes a compiled plot into the shared figure, not a second renderer', () => {
    const plot = renderToStaticMarkup(<CompiledOutputView output={{
      id: 'plot', kind: 'plot', label: 'Deflection', available: true,
      result: {
        kind: 'plot',
        series: { kind: 'numeric', axes: [axis], data: [2, 4, 8] },
        unit: mm,
        x: { axis, coordinates: { kind: 'numeric', axes: [axis], data: [100, 200, 300] }, unit: mm },
        contour: false,
      },
    }} />);
    expect(plot).toContain('class="result plot"');
    expect(plot).toContain('Deflection');
    expect(plot).toContain('class="figure"');
    expect(plot).not.toContain('2, 4, 8');
  });

  /**
   * The compiler never emits an equation output, so a payload carrying one
   * did not come from a NodeBook this app published — and its expression is
   * not going on screen (OVERVIEW.md, "Exporting").
   */
  it('refuses an equation result instead of typesetting its expression', () => {
    const equation = renderToStaticMarkup(<CompiledOutputView output={{
      id: 'leak', kind: 'equation', label: 'Leak', available: true,
      result: { kind: 'equation', expression: 'a*b + c' },
    }} />);
    expect(equation).not.toContain('a*b + c');
    expect(equation).toContain('result pending');
  });

  /** Non-finite values survive JSON as strings, and come back as numbers. */
  it('revives the numbers JSON destroys', () => {
    const value = renderToStaticMarkup(<CompiledOutputView output={{
      id: 'blown', kind: 'print', label: 'Blown', available: true,
      result: { kind: 'print', figures: 3, series: { kind: 'numeric', axes: [], data: ['+Infinity'] }, unit: mm },
    }} />);
    expect(value).toContain('Infinity mm');
  });
});
