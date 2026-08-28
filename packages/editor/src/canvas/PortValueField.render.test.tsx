/**
 * The rendered half of `PortValueField`'s wired-tooltip fix.
 *
 * `portFieldTitle` being correct (PortValueField.test.ts) is not enough: a
 * `title` placed on a `disabled` form control is unreachable by hover in
 * every real browser, so the value has to land on an element that is not
 * itself disabled. This renders the actual component and inspects the
 * markup for exactly that — the disabled input carries no title, and an
 * ancestor that is not disabled carries the full value.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PLAIN_NUMBER_FORMAT, parseUnit } from '@joveworks/units';
import type { Series } from '@joveworks/kernel';
import type { NumericPort } from '@joveworks/schema';

import { PortValueField } from './PortValueField';

const format = PLAIN_NUMBER_FORMAT;
const millimetres: NumericPort = { kind: 'numeric', name: 'd', unit: parseUnit('mm'), default: 45 };

describe('a wired PortValueField, as actually rendered', () => {
  const supplied = {
    series: {
      kind: 'numeric',
      data: [20, 30, 40],
      axes: [{ id: 'd', label: 'diameter', length: 3, order: 0 }],
    } as Series,
    unit: parseUnit('mm'),
  };

  const html = renderToStaticMarkup(
    <PortValueField
      port={millimetres}
      authored={undefined}
      unit={parseUnit('mm')}
      format={format}
      title="Typed here — unless a wire supplies it."
      supplied={supplied}
      wired
      onCommit={() => {}}
    />,
  );
  // Isolates the <input> tag's own attributes from the rest of the markup,
  // so a title elsewhere in the tree can't be mistaken for one on the
  // disabled control itself.
  const [inputTag] = html.match(/<input[^>]*>/) ?? [];

  it('never puts the value on the disabled input — a browser would never show it there', () => {
    expect(inputTag).toBeDefined();
    expect(inputTag).toContain('disabled=');
    expect(inputTag).not.toMatch(/title=/);
  });

  it('puts the full swept extent on an element that is not disabled', () => {
    expect(html).toContain('20 mm … 40 mm — Set by the wire — unplug it to type a default again.');
    // The wrapping <span class="field"> is what carries it — confirms the
    // tooltip is reachable by hover, not merely present somewhere in the tree.
    expect(html).toMatch(/<span class="field" title="20 mm … 40 mm — Set by the wire[^"]*">/);
  });
});
