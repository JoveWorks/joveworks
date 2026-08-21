/**
 * A restricted catalogue that shipped with the app but hasn't been unlocked
 * yet (docs/password-shared-catalogues.md) — its own kind of palette
 * section, name-only until a password decrypts it client-side.
 */

import { useState, type ReactElement } from 'react';

import { localize, type LockedCatalogue } from '@joveworks/schema';

import type { AppLocale } from '../model/editorSettings';
import { phrase } from '../i18n';
import { PasswordUnlockForm } from './PasswordUnlockForm';

interface Props {
  readonly locked: LockedCatalogue;
  readonly locale: AppLocale;
  readonly onUnlock: (locked: LockedCatalogue, password: string) => Promise<void>;
}

export function LockedCatalogueSection({ locked, locale, onUnlock }: Props): ReactElement {
  const t = (english: string): string => phrase(locale, english);
  const [open, setOpen] = useState(false);

  return (
    <section>
      <h3>
        <button type="button" className="section-toggle" onClick={() => setOpen((current) => !current)}>
          <span className="section-toggle-title">
            {localize(locked.name, locale)}
            <span className="restricted locked" title={t('Locked — enter the password to unlock.')}>
              {t('locked')}
            </span>
          </span>
          <span className="chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
        </button>
      </h3>
      {open ? <PasswordUnlockForm locked={locked} locale={locale} onUnlock={onUnlock} autoFocus /> : null}
    </section>
  );
}
