// @vitest-environment jsdom

/**
 * Regression for the same bug class as `useEscapeToClose.test.tsx`, at the
 * component level: before that hook, none of the dialogs handled Escape at
 * all, so opening one (e.g. the discard-confirmation gate this file backs)
 * and pressing Escape with nothing inside it focused did nothing.
 */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';
import { SettingsContext, type SettingsContextValue } from './settings-context';

const settings: SettingsContextValue = {
  locale: 'en',
  setLocale: () => {},
  numberFormat: { style: 'plain', notation: 'si' },
  setNumberFormat: () => {},
  minimapVisible: false,
  setMinimapVisible: () => {},
  snapToGrid: false,
  setSnapToGrid: () => {},
  titleMathRendering: true,
  setTitleMathRendering: () => {},
  themePreference: 'system',
  setThemePreference: () => {},
  contourPalette: 'viridis',
  setContourPalette: () => {},
  advancedNodesEnabled: false,
  setAdvancedNodesEnabled: () => {},
};

function withSettings(element: ReactElement): ReactElement {
  return <SettingsContext.Provider value={settings}>{element}</SettingsContext.Provider>;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('ConfirmDialog Escape handling', () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('cancels on Escape with no descendant focused — a mouse-opened dialog is left this way', () => {
    host = document.createElement('div');
    document.body.append(host);
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    act(() => {
      root = createRoot(host);
      root.render(withSettings(
        <ConfirmDialog message="Discard the current graph?" onConfirm={onConfirm} onCancel={onCancel} />,
      ));
    });

    expect(document.activeElement).toBe(document.body);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
