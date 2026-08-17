/**
 * App-wide preferences: how a number is written and read back
 * (`model/numberFormat.ts`) and whether the canvas minimap is drawn
 * (`model/editorSettings.ts`). Mirrors `graph-context.ts` — a small context
 * rather than prop-drilling into every node view that formats a value, or
 * into `Canvas.tsx` alone for the minimap.
 */

import { createContext, useContext } from 'react';

import type { ContourPalette, ThemePreference } from './model/editorSettings';
import type { AppLocale } from './model/editorSettings';
import type { NumberFormatSettings } from './model/numberFormat';

export interface SettingsContextValue {
  readonly locale: AppLocale;
  readonly setLocale: (locale: AppLocale) => void;
  readonly numberFormat: NumberFormatSettings;
  readonly setNumberFormat: (settings: NumberFormatSettings) => void;
  readonly minimapVisible: boolean;
  readonly setMinimapVisible: (visible: boolean) => void;
  readonly titleMathRendering: boolean;
  readonly setTitleMathRendering: (enabled: boolean) => void;
  readonly themePreference: ThemePreference;
  readonly setThemePreference: (preference: ThemePreference) => void;
  readonly contourPalette: ContourPalette;
  readonly setContourPalette: (palette: ContourPalette) => void;
}

export const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === undefined) throw new Error('outside its SettingsContext');
  return value;
}
