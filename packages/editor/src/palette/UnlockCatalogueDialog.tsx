/**
 * File > Unlock catalogue… — the explicit, discoverable entry point for
 * password-shared catalogues (docs/password-shared-catalogues.md), next to
 * "Load catalogue…" since both add a catalogue to the palette. The palette
 * also lists each locked catalogue inline with the same form
 * (`LockedCatalogueSection`); this dialog is the other way in, for a student
 * who opens the File menu looking for it rather than scrolling the palette.
 */

import type { ReactElement } from 'react';

import { localize, type LockedCatalogue } from '@joveworks/schema';

import type { AppLocale } from '../model/editorSettings';
import { phrase, ui } from '../i18n';
import { PasswordUnlockForm } from './PasswordUnlockForm';

interface Props {
  readonly locked: readonly LockedCatalogue[];
  readonly locale: AppLocale;
  readonly onUnlock: (locked: LockedCatalogue, password: string) => Promise<void>;
  readonly onClose: () => void;
}

export function UnlockCatalogueDialog({ locked, locale, onUnlock, onClose }: Props): ReactElement {
  const t = (english: string): string => phrase(locale, english);
  const copy = ui(locale);

  return (
    <>
      <div className="dialog-backdrop" onClick={onClose} />
      <div className="dialog" role="dialog" aria-label={t('Unlock catalogue…')}>
        <h2>{t('Unlock catalogue…')}</h2>

        {locked.length === 0 ? (
          <p className="dialog-note">{t('No locked catalogues — every one that shipped with the app is already unlocked.')}</p>
        ) : (
          <ul className="unlock-catalogue-list">
            {locked.map((entry, i) => (
              <li key={entry.id}>
                <p className="dialog-field">{localize(entry.name, locale)}</p>
                <PasswordUnlockForm locked={entry} locale={locale} onUnlock={onUnlock} autoFocus={i === 0} />
              </li>
            ))}
          </ul>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {copy.close}
          </button>
        </div>
      </div>
    </>
  );
}
