import { describe, expect, it } from 'vitest';

import { hubOrigin, parseRoute, routeHref } from './router';

describe('SPA routes', () => {
  it.each([
    ['https://app.test/', { kind: 'home' }],
    ['https://app.test/p/pub', { kind: 'publication', id: 'pub', edit: false }],
    ['https://app.test/p/pub/edit', { kind: 'publication', id: 'pub', edit: true }],
    ['https://app.test/s/share', { kind: 'share', id: 'share', edit: false }],
    ['https://app.test/s/share/edit', { kind: 'share', id: 'share', edit: true }],
  ] as const)('parses refresh navigation at %s', (url, expected) => expect(parseRoute(new URL(url))).toEqual(expected));

  it('keeps a separately hosted Hub through viewer/editor navigation', () => {
    const hub = 'https://hub.test';
    expect(hubOrigin(new URL(`https://app.test/p/abc?hub=${encodeURIComponent(hub)}`))).toBe(hub);
    expect(routeHref({ kind: 'publication', id: 'abc', edit: true }, hub)).toBe('/p/abc/edit?hub=https%3A%2F%2Fhub.test');
    expect(routeHref({ kind: 'share', id: 'x y', edit: false })).toBe('/s/x%20y');
  });
});
