import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseUnit } from '@mds/units';

import { ParameterLabel } from './ParameterLabel';

describe('ParameterLabel', () => {
  it('puts a shown unit in parentheses', () => {
    const markup = renderToStaticMarkup(<ParameterLabel name="F_t" unit={parseUnit('N')} />);

    expect(markup).toContain('</span> <span class="interface-unit">(N)</span>');
    expect(markup).not.toContain('F<sub>t</sub> N');
  });

  it('omits unit punctuation when no unit is shown', () => {
    const markup = renderToStaticMarkup(<ParameterLabel name="result" />);

    expect(markup).not.toContain('(');
    expect(markup).not.toContain(')');
  });

  it('keeps the visible dimensionless marker in parentheses', () => {
    const markup = renderToStaticMarkup(<ParameterLabel name="ratio" unit={parseUnit('')} />);

    expect(markup).toContain('(—)');
  });
});
