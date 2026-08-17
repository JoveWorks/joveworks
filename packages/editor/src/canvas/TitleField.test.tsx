import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { typesetTitle } from './TitleField';

describe('typesetTitle', () => {
  it('typesets subscript and TeX command tokens without changing surrounding prose', () => {
    const rendered = typesetTitle('factor c_2 and \\sigma');
    expect(rendered).toBeDefined();
    const html = renderToStaticMarkup(<>{rendered}</>);
    expect(html).toContain('factor ');
    expect(html).toContain('and ');
    expect(html).toContain('katex');
    expect(html).toContain('σ');
  });

  it('typesets a prime on a single-letter symbol without treating prose apostrophes as math', () => {
    const rendered = typesetTitle("Design power P'");
    expect(rendered).toBeDefined();
    expect(renderToStaticMarkup(<>{rendered}</>)).toContain('katex');
    expect(typesetTitle("student's result")).toBeUndefined();
  });

  it('leaves ordinary prose to the plain-text renderer', () => {
    expect(typesetTitle('Ordinary prose stays ordinary')).toBeUndefined();
  });

  it('falls back to raw text when no marked token is valid TeX', () => {
    expect(typesetTitle('unknown \\definitelynotacommand')).toBeUndefined();
  });
});
