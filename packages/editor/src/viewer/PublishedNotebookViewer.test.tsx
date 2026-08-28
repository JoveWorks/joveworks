import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CompiledOutputView } from './PublishedNotebookViewer';

describe('compiled report rendering', () => {
  it('renders static values and preserves unavailable results', () => {
    const value = renderToStaticMarkup(<CompiledOutputView output={{ id: 'answer', kind: 'print', label: 'Answer', available: true, result: { kind: 'print', series: { axes: [], data: [42] }, unit: { symbol: 'mm' } } }} />);
    const missing = renderToStaticMarkup(<CompiledOutputView output={{ id: 'missing', kind: 'plot', label: 'Plot', available: false, unavailableReason: 'not connected' }} />);
    expect(value).toContain('Answer');
    expect(value).toContain('42');
    expect(value).toContain('mm');
    expect(missing).toContain('not connected');
  });

  it('renders compiled plot data as an actual labelled SVG figure', () => {
    const plot = renderToStaticMarkup(<CompiledOutputView output={{
      id: 'plot', kind: 'plot', label: 'Deflection', available: true,
      result: {
        kind: 'plot',
        series: { kind: 'numeric', axes: [{ id: 'length', label: 'Length', length: 3, order: 0 }], data: [2, 4, 8] },
        unit: { symbol: 'mm', factor: 1, dimension: { length: 1 } },
        x: { axis: { id: 'length', label: 'Length', length: 3, order: 0 }, coordinates: { kind: 'numeric', axes: [{ id: 'length', label: 'Length', length: 3, order: 0 }], data: [100, 200, 300] }, unit: { symbol: 'mm', factor: 1, dimension: { length: 1 } } },
        contour: false,
      },
    }} />);
    expect(plot).toContain('<svg');
    expect(plot).toContain('<path');
    expect(plot).toContain('Length (mm)');
    expect(plot).toContain('Deflection (mm)');
    expect(plot).not.toContain('2, 4, 8');
  });
});
