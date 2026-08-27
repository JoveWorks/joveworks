import { useState, type FormEvent, type ReactElement } from 'react';

import { phrase } from '../i18n';
import type { HubCourseSummary } from '../model/hub';
import { useSettings } from '../settings-context';

interface Props {
  readonly initialHubUrl: string;
  readonly onConnect: (hubUrl: string, courseSlug: string, courseToken: string) => Promise<void>;
  readonly onDiscover: (hubUrl: string) => Promise<readonly HubCourseSummary[]>;
  readonly onClose: () => void;
}

/** Connects a browser session to a Hub course. The access token deliberately
 * stays in component/session state; only the non-secret course source is kept
 * for the next visit. */
export function ConnectCourseDialog({ initialHubUrl, onConnect, onDiscover, onClose }: Props): ReactElement {
  const { locale } = useSettings();
  const t = (english: string): string => phrase(locale, english);
  const [hubUrl, setHubUrl] = useState(initialHubUrl);
  const [courses, setCourses] = useState<readonly HubCourseSummary[] | undefined>();
  const [courseSlug, setCourseSlug] = useState('');
  const [courseToken, setCourseToken] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);
    onConnect(hubUrl, courseSlug, courseToken)
      .then(onClose)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('Could not connect to that course.')))
      .finally(() => setPending(false));
  };

  const discover = (): void => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    onDiscover(hubUrl)
      .then((found) => {
        setCourses(found);
        setCourseSlug(found[0]?.slug ?? '');
        if (found.length === 0) setError(t('No courses are available from this Hub.'));
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('Could not connect to that course.')))
      .finally(() => setPending(false));
  };

  return (
    <>
      <div className="dialog-backdrop" onClick={onClose} />
      <form className="dialog connect-course-dialog" role="dialog" aria-label={t('Connect course…')} onSubmit={submit}>
        <h2>{t('Connect course…')}</h2>
        <label className="dialog-field">
          <span>{t('Hub address')}</span>
          <input autoFocus type="url" required placeholder="https://course.example.edu" value={hubUrl} onChange={(event) => { setHubUrl(event.target.value); setCourses(undefined); setCourseSlug(''); }} />
        </label>
        <button type="button" onClick={discover} disabled={pending || hubUrl.trim().length === 0}>{pending ? t('Finding courses…') : t('Find courses')}</button>
        {courses === undefined ? null : (
          <label className="dialog-field">
            <span>{t('Course')}</span>
            <select required value={courseSlug} onChange={(event) => setCourseSlug(event.target.value)}>
              {courses.map((course) => <option key={course.slug} value={course.slug}>{course.title}</option>)}
            </select>
          </label>
        )}
        <label className="dialog-field">
          <span>{t('Course access token')} <small>{t('optional')}</small></span>
          <input type="password" placeholder={t('Only for restricted course material')} value={courseToken} onChange={(event) => setCourseToken(event.target.value)} />
        </label>
        <p className="dialog-note">{t('The address and course are remembered on this device. The access token is kept only for this visit.')}</p>
        {error === undefined ? null : <p className="dialog-message course-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" disabled={pending || courseSlug.length === 0}>{pending ? t('Connecting…') : t('Connect')}</button>
        </div>
      </form>
    </>
  );
}
