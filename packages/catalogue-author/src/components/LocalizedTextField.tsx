import { useState } from 'react';

import type { DraftLocalizedText } from '../model/draft';

interface Props {
  readonly label: string;
  readonly value: DraftLocalizedText;
  readonly onChange: (next: DraftLocalizedText) => void;
}

/** A small widget over `LocalizedText`: `en` always shown, other BCP-47 tags addable/removable. */
export function LocalizedTextField({ label, value, onChange }: Props) {
  const [newLocale, setNewLocale] = useState('');
  const locales = Array.from(new Set(['en', ...Object.keys(value)]));

  function setLocale(locale: string, text: string) {
    onChange({ ...value, [locale]: text });
  }

  function removeLocale(locale: string) {
    const rest = { ...value };
    delete (rest as Record<string, string>)[locale];
    onChange(rest);
  }

  function addLocale() {
    const tag = newLocale.trim().toLowerCase();
    if (tag.length === 0 || locales.includes(tag)) return;
    onChange({ ...value, [tag]: '' });
    setNewLocale('');
  }

  return (
    <div className="localized-field">
      <div className="localized-field-label">{label}</div>
      {locales.map((locale) => (
        <div className="localized-field-row" key={locale}>
          <span className="localized-field-tag">{locale}</span>
          <input type="text" value={value[locale] ?? ''} onChange={(e) => setLocale(locale, e.target.value)} />
          {locale !== 'en' && (
            <button type="button" onClick={() => removeLocale(locale)}>
              Remove
            </button>
          )}
        </div>
      ))}
      <div className="localized-field-add">
        <input
          type="text"
          placeholder="add language (e.g. nl)"
          value={newLocale}
          onChange={(e) => setNewLocale(e.target.value)}
        />
        <button type="button" onClick={addLocale}>
          + language
        </button>
      </div>
    </div>
  );
}
