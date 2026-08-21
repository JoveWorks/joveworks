/**
 * The password entry + submit + inline error for one locked catalogue
 * (docs/password-shared-catalogues.md). Shared by the palette's inline
 * `LockedCatalogueSection` and the File-menu `UnlockCatalogueDialog` — same
 * unlock gesture, two entry points. Quiet failure (an inline message) on a
 * wrong password, never a thrown error the student has to make sense of.
 */

import { useState, type FormEvent, type ReactElement } from 'react';

import type { LockedCatalogue } from '@joveworks/schema';

import type { AppLocale } from '../model/editorSettings';
import { phrase } from '../i18n';

interface Props {
  readonly locked: LockedCatalogue;
  readonly locale: AppLocale;
  readonly onUnlock: (locked: LockedCatalogue, password: string) => Promise<void>;
  readonly autoFocus?: boolean;
}

export function PasswordUnlockForm({ locked, locale, onUnlock, autoFocus = false }: Props): ReactElement {
  const t = (english: string): string => phrase(locale, english);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (password.length === 0 || pending) return;
    setPending(true);
    setError(false);
    onUnlock(locked, password)
      .then(() => setPassword(''))
      .catch(() => setError(true))
      .finally(() => setPending(false));
  };

  return (
    <form className="locked-catalogue-form" onSubmit={submit}>
      <input
        type="password"
        className="nodrag"
        autoFocus={autoFocus}
        value={password}
        placeholder={t('Password')}
        onChange={(event) => {
          setPassword(event.target.value);
          setError(false);
        }}
      />
      <button type="submit" disabled={pending || password.length === 0}>
        {t('Unlock')}
      </button>
      {error ? <p className="locked-catalogue-error">{t('Wrong password.')}</p> : null}
    </form>
  );
}
