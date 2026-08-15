/**
 * The one app-wide preference so far: how a number is written and read back
 * (`model/numberFormat.ts`). Mirrors `graph-context.ts` — a small context
 * rather than prop-drilling into every node view that formats a value.
 */

import { createContext, useContext } from 'react';

import type { NumberFormatSettings } from './model/numberFormat';

export interface SettingsContextValue {
  readonly numberFormat: NumberFormatSettings;
  readonly setNumberFormat: (settings: NumberFormatSettings) => void;
}

export const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === undefined) throw new Error('outside its SettingsContext');
  return value;
}
