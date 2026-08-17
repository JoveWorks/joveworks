/**
 * Human-facing catalogue text. Formula symbols and expressions deliberately
 * stay outside this type: translating prose must never change a calculation.
 */
import { fail, join, readObject, readString, type JsonObject, type JsonValue } from './json.js';

export type LocalizedText = Readonly<Record<string, string>>;

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;

export function parseLocalizedText(value: JsonValue, path: string): LocalizedText {
  // Catalogue schema v1 used a bare English string. Reading it here keeps old
  // course files useful while every serializer writes the unambiguous map form.
  if (typeof value === 'string') {
    if (value.trim().length === 0) fail(path, 'is empty');
    return { en: value };
  }
  const object = readObject(value, path);
  const text: Record<string, string> = {};
  for (const [locale, entry] of Object.entries(object)) {
    if (!LANGUAGE_TAG.test(locale)) fail(join(path, locale), 'is not a valid BCP-47 language tag');
    const valueAtLocale = readString(entry, join(path, locale));
    if (valueAtLocale.trim().length === 0) fail(join(path, locale), 'is empty');
    text[locale.toLowerCase()] = valueAtLocale;
  }
  if (text.en === undefined) fail(path, "must include the English ('en') fallback");
  return text;
}

export function serializeLocalizedText(text: LocalizedText): JsonObject {
  return { ...text };
}

/** Resolve an exact language, then its base language, then English. */
export function localize(text: LocalizedText, locale: string): string {
  const normalized = locale.toLowerCase();
  const get = (tag: string): string | undefined =>
    text[tag] ?? Object.entries(text).find(([key]) => key.toLowerCase() === tag)?.[1];
  return get(normalized) ?? get(normalized.split('-')[0] ?? normalized) ?? get('en') ?? '';
}
