import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReliabilityResult } from '@joveworks/kernel';
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
});
