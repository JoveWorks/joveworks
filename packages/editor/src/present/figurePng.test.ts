// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { figureSvg } from './figurePng';

/**
 * Only the document that gets rasterised is tested here: jsdom decodes no
 * images and paints no canvas, so the PNG itself is a browser check.
 */
describe('figureSvg', () => {
  afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  function mount(): HTMLElement {
    const style = document.createElement('style');
    style.textContent = '.notebook .series-legend { font-size: 10px; }';
    document.head.append(style);
    document.body.innerHTML = `
      <main class="desktop-editor"><aside class="notebook" style="width: 480px"><div class="result plot">
        <div class="plot-figure">
          <p class="plot-auto-reason">Auto</p>
          <div class="figure"><svg><g aria-label="tip"><text>hovered</text></g><text>curve</text></svg></div>
          <aside class="series-legend">legend</aside>
        </div>
      </div></aside></main>`;
    return document.querySelector<HTMLElement>('.plot-figure') as HTMLElement;
  }

  it('carries the figure whole — the HTML legend beside the chart, not just the chart', async () => {
    const { xml } = await figureSvg(mount());
    expect(xml).toContain('series-legend');
    expect(xml).toContain('curve');
  });

  it('keeps each ancestor as a bare shell so the page\'s selectors still match', async () => {
    const { xml } = await figureSvg(mount());
    const shells = new DOMParser().parseFromString(xml, 'image/svg+xml').querySelectorAll('[data-export-shell]');
    expect([...shells].map((shell) => shell.getAttribute('class'))).toEqual(['desktop-editor', 'notebook', 'result plot']);
    // The panel's own width must not survive: only its class is wanted.
    expect([...shells].every((shell) => shell.getAttribute('style')?.startsWith('all:initial'))).toBe(true);
    expect(xml).toContain('.notebook .series-legend');
  });

  it('is the light theme whatever the editor is showing', async () => {
    document.documentElement.dataset.theme = 'dark';
    const { xml } = await figureSvg(mount());
    delete document.documentElement.dataset.theme;
    expect(new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('leaves a pinned hover tip out of the picture', async () => {
    const { xml } = await figureSvg(mount());
    expect(xml).not.toContain('hovered');
  });
});
