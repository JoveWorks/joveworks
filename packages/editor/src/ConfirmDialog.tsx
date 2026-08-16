/**
 * A yes/no gate in front of anything that replaces the current document —
 * New, Open, a recent document, a sample, the tutorial. Same
 * backdrop-plus-centered-panel shape as `SettingsDialog`, kept generic
 * rather than duplicated per caller since every one of those call sites
 * needs exactly the same two buttons.
 */

import type { ReactElement } from 'react';

interface Props {
  readonly message: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: Props): ReactElement {
  return (
    <>
      <div className="dialog-backdrop" onClick={onCancel} />
      <div className="dialog" role="alertdialog" aria-label="Confirm">
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            Discard
          </button>
        </div>
      </div>
    </>
  );
}
