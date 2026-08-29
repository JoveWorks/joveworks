import { useState, type FormEvent, type ReactElement } from 'react';

import { phrase } from '../i18n';
import { useSettings } from '../settings-context';
import { useEscapeToClose } from '../useEscapeToClose';

interface SaveProps {
  readonly kind: 'save';
  readonly initialHubUrl: string;
  readonly onSubmit: (hubUrl: string) => Promise<void>;
  readonly onClose: () => void;
}

interface OpenProps {
  readonly kind: 'open';
  readonly initialHubUrl: string;
  readonly onSubmit: (hubUrl: string, workspaceId: string) => Promise<void>;
  readonly onClose: () => void;
}

type Props = SaveProps | OpenProps;

/** The Hub id is shareable and read-only. Editing remains tied to the browser
 * that created the workspace through its separately stored capability. */
export function WorkspaceDialog(props: Props): ReactElement {
  const { locale } = useSettings();
  const t = (english: string): string => phrase(locale, english);
  const [hubUrl, setHubUrl] = useState(props.initialHubUrl);
  const [workspaceId, setWorkspaceId] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const opening = props.kind === 'open';
  useEscapeToClose(props.onClose);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);
    const action = props.kind === 'save'
      ? props.onSubmit(hubUrl)
      : props.onSubmit(hubUrl, workspaceId);
    action
      .then(props.onClose)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('Could not reach that workspace.')))
      .finally(() => setPending(false));
  };

  const label = opening ? t('Open Hub workspace…') : t('Save to Hub…');
  return (
    <>
      <div className="dialog-backdrop" onClick={props.onClose} />
      <form className="dialog connect-course-dialog" role="dialog" aria-label={label} onSubmit={submit}>
        <h2>{label}</h2>
        <label className="dialog-field">
          <span>{t('Hub address')}</span>
          <input autoFocus type="url" required placeholder="https://course.example.edu" value={hubUrl} onChange={(event) => setHubUrl(event.target.value)} />
        </label>
        {!opening ? null : (
          <label className="dialog-field">
            <span>{t('Workspace ID')}</span>
            <input required placeholder="Ab12Cd34Ef56" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
          </label>
        )}
        <p className="dialog-note">
          {opening
            ? t('Anyone with the Hub address and workspace ID can load a copy. Only this browser can update workspaces it created.')
            : t('This creates a saved copy on the Hub. Its short workspace ID can be shared for read-only loading.')}
        </p>
        {error === undefined ? null : <p className="dialog-message course-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={props.onClose}>{t('Cancel')}</button>
          <button type="submit" disabled={pending}>{pending ? (opening ? t('Opening…') : t('Saving…')) : (opening ? t('Open') : t('Save'))}</button>
        </div>
      </form>
    </>
  );
}
