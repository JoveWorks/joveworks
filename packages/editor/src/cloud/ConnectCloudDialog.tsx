import { useState, type FormEvent, type ReactElement } from 'react';

import { phrase } from '../i18n';
import type { HubCloudSummary } from '../model/hub';
import { useSettings } from '../settings-context';
import { useEscapeToClose } from '../useEscapeToClose';

interface Props {
  readonly initialHubUrl: string;
  readonly onConnect: (hubUrl: string, cloudSlug: string, cloudToken: string) => Promise<void>;
  readonly onDiscover: (hubUrl: string) => Promise<readonly HubCloudSummary[]>;
  readonly onClose: () => void;
}

/** Connects a browser session to a Hub cloud. The access token deliberately
 * stays in component/session state; only the non-secret cloud source is kept
 * for the next visit. */
export function ConnectCloudDialog({ initialHubUrl, onConnect, onDiscover, onClose }: Props): ReactElement {
  const { locale } = useSettings();
  const t = (english: string): string => phrase(locale, english);
  const [hubUrl, setHubUrl] = useState(initialHubUrl);
  const [clouds, setClouds] = useState<readonly HubCloudSummary[] | undefined>();
  const [cloudSlug, setCloudSlug] = useState('');
  const [cloudToken, setCloudToken] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  useEscapeToClose(onClose);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);
    onConnect(hubUrl, cloudSlug, cloudToken)
      .then(onClose)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('Could not connect to that cloud.')))
      .finally(() => setPending(false));
  };

  const discover = (): void => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    onDiscover(hubUrl)
      .then((found) => {
        setClouds(found);
        setCloudSlug(found[0]?.slug ?? '');
        if (found.length === 0) setError(t('No clouds are available from this Hub.'));
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('Could not connect to that cloud.')))
      .finally(() => setPending(false));
  };

  return (
    <>
      <div className="dialog-backdrop" onClick={onClose} />
      <form className="dialog connect-dialog" role="dialog" aria-label={t('Connect cloud…')} onSubmit={submit}>
        <h2>{t('Connect cloud…')}</h2>
        <label className="dialog-field">
          <span>{t('Hub address')}</span>
          <input autoFocus type="url" required placeholder="https://cloud.example.edu" value={hubUrl} onChange={(event) => { setHubUrl(event.target.value); setClouds(undefined); setCloudSlug(''); }} />
        </label>
        <button type="button" onClick={discover} disabled={pending || hubUrl.trim().length === 0}>{pending ? t('Finding clouds…') : t('Find clouds')}</button>
        {clouds === undefined ? null : (
          <label className="dialog-field">
            <span>{t('Cloud')}</span>
            <select required value={cloudSlug} onChange={(event) => setCloudSlug(event.target.value)}>
              {clouds.map((cloud) => <option key={cloud.slug} value={cloud.slug}>{cloud.title}</option>)}
            </select>
          </label>
        )}
        <label className="dialog-field">
          <span>{t('Cloud access token')} <small>{t('optional')}</small></span>
          <input type="password" placeholder={t('Only for restricted cloud material')} value={cloudToken} onChange={(event) => setCloudToken(event.target.value)} />
        </label>
        <p className="dialog-note">{t('The address and cloud are remembered on this device. The access token is kept only for this visit.')}</p>
        {error === undefined ? null : <p className="dialog-message dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" disabled={pending || cloudSlug.length === 0}>{pending ? t('Connecting…') : t('Connect')}</button>
        </div>
      </form>
    </>
  );
}
