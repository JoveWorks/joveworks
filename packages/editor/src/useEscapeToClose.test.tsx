// @vitest-environment jsdom

/**
 * `useEscapeToClose` is what makes Escape close a popup even when nothing
 * inside it has DOM focus — the bug this replaces was a JSX `onKeyDown` on a
 * container `<div>`, which only ever fires if that div (or a focusable
 * descendant) already has focus. These tests dispatch `Escape` on `document`
 * with focus left on `document.body`, exactly the state a popup opened by a
 * mouse click (not a click on a focusable control inside it) is left in.
 *
 * Also covers stacking: two instances mounted at once (a context menu opened
 * over a dialog, say) must let only the most-recently-mounted one react.
 */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useEscapeToClose } from './useEscapeToClose';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function Popup({ onClose, active = true }: { readonly onClose: () => void; readonly active?: boolean }): ReactElement {
  useEscapeToClose(onClose, active);
  return <div />;
}

const escapeKeydown = (): boolean => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('useEscapeToClose', () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    // Focus can drift onto a removed node across tests otherwise.
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  it('closes without any focused descendant — regression for the JSX onKeyDown it replaces', () => {
    host = document.createElement('div');
    document.body.append(host);
    const onClose = vi.fn();
    act(() => {
      root = createRoot(host);
      root.render(<Popup onClose={onClose} />);
    });

    expect(document.activeElement).toBe(document.body);
    act(() => {
      escapeKeydown();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets only the most-recently-mounted active instance react, not both', () => {
    host = document.createElement('div');
    document.body.append(host);
    const bottom = vi.fn();
    const top = vi.fn();
    act(() => {
      root = createRoot(host);
      root.render(
        <>
          <Popup onClose={bottom} />
          <Popup onClose={top} />
        </>,
      );
    });

    act(() => {
      escapeKeydown();
    });
    expect(top).toHaveBeenCalledTimes(1);
    expect(bottom).not.toHaveBeenCalled();
  });

  it('falls through to the instance beneath once the top one unmounts', () => {
    host = document.createElement('div');
    document.body.append(host);
    const bottom = vi.fn();
    const top = vi.fn();
    act(() => {
      root = createRoot(host);
      root.render(
        <>
          <Popup onClose={bottom} />
          <Popup onClose={top} />
        </>,
      );
    });
    act(() => {
      root.render(<Popup onClose={bottom} />);
    });

    act(() => {
      escapeKeydown();
    });
    expect(bottom).toHaveBeenCalledTimes(1);
    expect(top).not.toHaveBeenCalled();
  });

  it('an inactive instance (mounted but closed, e.g. Tutorial between tours) neither reacts nor blocks the instance beneath it', () => {
    host = document.createElement('div');
    document.body.append(host);
    const bottom = vi.fn();
    const inactiveTop = vi.fn();
    act(() => {
      root = createRoot(host);
      root.render(
        <>
          <Popup onClose={bottom} />
          <Popup onClose={inactiveTop} active={false} />
        </>,
      );
    });

    act(() => {
      escapeKeydown();
    });
    expect(bottom).toHaveBeenCalledTimes(1);
    expect(inactiveTop).not.toHaveBeenCalled();
  });

  it('does nothing on a non-Escape key', () => {
    host = document.createElement('div');
    document.body.append(host);
    const onClose = vi.fn();
    act(() => {
      root = createRoot(host);
      root.render(<Popup onClose={onClose} />);
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
