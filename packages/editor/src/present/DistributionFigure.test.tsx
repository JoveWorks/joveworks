import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DistributionResult } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';
import { DistributionFigure } from './DistributionFigure';

describe('DistributionFigure', () => {
  const result: DistributionResult = {
    kind: 'distribution', nodeId: 'd', view: 'histogram', unit: parseUnit('mm'),
    over: { id: 'trial', label: 'trial', length: 2, order: 0 },
    panels: [{ samples: [1, 2], bins: [{ x1: 1, x2: 2, count: 2, density: 2 }], cdf: [{ value: 1, probability: 0.5 }, { value: 2, probability: 1 }], percentiles: { '50': 1.5 } }],
  };
  it('draws kernel-prepared bins and percentile labels', () => {
    const html = renderToStaticMarkup(<DistributionFigure result={result} />);
    expect(html).toContain('sample histogram');
    expect(html).toContain('P50 1.500');
  });
  it('switches to the empirical CDF without recomputing samples', () => {
    expect(renderToStaticMarkup(<DistributionFigure result={{ ...result, view: 'cdf' }} />)).toContain('empirical cumulative distribution');
  });
});
