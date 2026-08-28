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
});
