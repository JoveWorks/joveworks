/**
 * A yes/no gate in front of anything that replaces the current document —
 * New, Open, a recent document, a sample, the tutorial. Same
 * backdrop-plus-centered-panel shape as `SettingsDialog`, kept generic
 * rather than duplicated per caller since every one of those call sites
 * needs exactly the same two buttons.
 */

import type { ReactElement } from 'react';

import { phrase } from './i18n';
import { useSettings } from './settings-context';

interface Props {
  readonly message: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: Props): ReactElement {
  const { locale } = useSettings();
  const t = (english: string): string => phrase(locale, english);
  return (
    <>
      <div className="dialog-backdrop" onClick={onCancel} />
      <div className="dialog" role="alertdialog" aria-label={t('Confirm')}>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            {t('Discard')}
          </button>
        </div>
      </div>
    </>
  );
}
