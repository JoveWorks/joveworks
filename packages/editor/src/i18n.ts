import { localize, type LocalizedText } from '@joveworks/schema';

export const APP_LOCALES = ['en', 'nl'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export function browserLocale(): AppLocale {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('nl') ? 'nl' : 'en';
}

export function text(value: LocalizedText, locale: AppLocale): string {
  return localize(value, locale);
}

/** Small, typed vocabulary for copy shared by locale-aware editor surfaces. */
export const UI = {
  en: { language: 'Language', english: 'English', dutch: 'Nederlands', nodeBookSettings: 'NodeBook settings', notebookLanguage: 'Notebook language', appLanguage: 'App language', exportPdf: 'Export PDF…', close: 'Close' },
  nl: { language: 'Taal', english: 'English', dutch: 'Nederlands', nodeBookSettings: 'NodeBook-instellingen', notebookLanguage: 'NodeBook-taal', appLanguage: 'App-taal', exportPdf: 'Exporteer pdf…', close: 'Sluiten' },
} as const;

export function ui(locale: AppLocale): typeof UI.en {
  return UI[locale] as typeof UI.en;
}
