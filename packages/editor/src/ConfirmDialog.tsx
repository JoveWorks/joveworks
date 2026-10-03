/**
 * A yes/no gate in front of anything that replaces the current document —
 * New, Open, a recent document, a sample, the tutorial. Same
 * backdrop-plus-centered-panel shape as `SettingsDialog`, kept generic
 * rather than duplicated per caller since every one of those call sites
 * needs exactly the same two buttons.
 *
 * `confirmLabel` is for the one caller that is not discarding anything: the
 * Jupyter export, which asks before writing restricted expressions to a file.
 * Naming the button drops the destructive styling along with the word.
 */

import type { ReactElement } from 'react';

import { phrase } from './i18n';
import { useSettings } from './settings-context';
import { useEscapeToClose } from './useEscapeToClose';

interface Props {
  readonly message: string;
  readonly confirmLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: Props): ReactElement {
  const { locale } = useSettings();
  const t = (english: string): string => phrase(locale, english);
  useEscapeToClose(onCancel);
  return (
    <>
      <div className="dialog-backdrop" onClick={onCancel} />
      <div className="dialog" role="alertdialog" aria-label={t('Confirm')}>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
          <button type="button" {...(confirmLabel === undefined ? { className: 'danger' } : {})} onClick={onConfirm}>
            {confirmLabel ?? t('Discard')}
          </button>
        </div>
      </div>
    </>
  );
}
