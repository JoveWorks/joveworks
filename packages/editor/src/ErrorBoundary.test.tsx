// @vitest-environment jsdom

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';
import { clearAutosaveSnapshot, saveAutosaveSnapshot } from './io/autosave';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // This jsdom has no working localStorage; the autosave only needs these two.
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  });
});

function Broken(): ReactElement {
  throw new RangeError('Maximum call stack size exceeded');
}

describe('the top-level error boundary', () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    clearAutosaveSnapshot();
    vi.restoreAllMocks();
  });

  const mount = (element: ReactElement): void => {
    host = document.createElement('div');
    document.body.append(host);
    // React reports the caught error itself; that is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      root = createRoot(host);
      root.render(<ErrorBoundary>{element}</ErrorBoundary>);
    });
  };

  it('renders its children untouched when nothing throws', () => {
    mount(<p>the editor</p>);
    expect(host.textContent).toBe('the editor');
  });

  it('replaces a render-time throw with a notice naming the error, rather than a blank page', () => {
    mount(<Broken />);
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Maximum call stack size exceeded');
    expect([...host.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Reload']);
  });

  it('offers the autosave for download, and a way out of a document that crashes on every load', () => {
    saveAutosaveSnapshot('{"schemaVersion":1}');
    mount(<Broken />);
    expect([...host.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Reload',
      'Download unsaved work',
      'Discard unsaved work and reload',
    ]);
  });
});
