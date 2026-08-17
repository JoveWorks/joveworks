import { describe, expect, it } from 'vitest';

import { noOpAnalytics, plausibleAnalytics } from './analytics';

describe('analytics adapters', () => {
  it('keeps the no-op adapter inert', () => {
    expect(noOpAnalytics.track({ name: 'graph_created' })).toBeUndefined();
  });

  it('uses only the configured site-specific script and fixed event payload', () => {
    const scripts: Array<{ async: boolean; src: string }> = [];
    const script = { async: false, src: '' };
    const target = {
      document: {
        createElement: () => script,
        head: { append: (node: typeof script) => scripts.push(node) },
      },
    } as unknown as Window;
    const tracker = plausibleAnalytics({
      scriptUrl: 'https://stats.joveworks.test/js/site.js',
    }, target);

    tracker.track({ name: 'plot_created', props: { mode: 'contour' } });

    expect(scripts).toEqual([{
      async: true,
      src: 'https://stats.joveworks.test/js/site.js',
    }]);
    expect(target.plausible?.o).toEqual({});
    expect(target.plausible?.q).toEqual([['plot_created', { props: { mode: 'contour' } }]]);
  });
});
