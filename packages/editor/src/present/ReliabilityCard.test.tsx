import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReliabilityEstimate, ReliabilityResult } from '@joveworks/kernel';
import { parseUnit } from '@joveworks/units';
import { ReliabilityCard } from './ReliabilityCard';

describe('ReliabilityCard', () => {
  it('renders a resolution bound instead of infinite reliability at zero failures', () => {
    const result: ReliabilityResult = {
      kind: 'reliability', nodeId: 'r', confidence: 0.95, checks: [],
      combined: { checkId: 'all', trials: 100, failures: 0, probability: 0, interval: [0, 0.037], beta: 2.326, unresolved: true, converged: false },
    };
    const html = renderToStaticMarkup(<ReliabilityCard result={{ ...result, checks: [result.combined!] }} />);
    expect(html).toContain('&lt; 0.0100');
    expect(html).toContain('&gt; 2.33');
    expect(html).not.toContain('Infinity');
  });

  it('shows each design of a swept study on its own, not the pooled figure', () => {
    const estimate = (failures: number): ReliabilityEstimate => ({
      checkId: 'check', trials: 4, failures, probability: failures / 4, interval: [0, 1], beta: 0, unresolved: false, converged: false,
    });
    const axis = { id: 'd', label: 'offset', length: 2, order: 0 };
    const unit = parseUnit('mm');
    const result: ReliabilityResult = {
      kind: 'reliability', nodeId: 'r', confidence: 0.95,
      checks: [{ ...estimate(5), trials: 8, probability: 0.625 }],
      designs: [
        { at: [{ axis, value: 10, unit }], checks: [estimate(4)] },
        { at: [{ axis, value: 20, unit }], checks: [estimate(1)] },
      ],
    };
    const html = renderToStaticMarkup(<ReliabilityCard result={result} />);
    expect(html).toContain('offset 10 mm');
    expect(html).toContain('offset 20 mm');
    expect(html).toContain('4/4');
    expect(html).toContain('1/4');
    expect(html).not.toContain('5/8');
  });
});
