import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react';

import { clearAutosaveSnapshot, loadAutosaveSnapshot } from './io/autosave';
import { saveTextFile } from './io/files';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | undefined;
}

/**
 * The last line between a render-time throw and a blank tab. React unmounts
 * the whole tree on an uncaught error, so without this a student sees an
 * empty page and nothing to act on.
 *
 * The fallback is deliberately unstyled beyond plain markup: it renders
 * outside every route, before either route's stylesheet is guaranteed to be
 * loaded. It offers the autosave as a download because a crash that comes
 * from the document itself would come straight back on reload, once the
 * autosave is restored — so "discard and reload" has to be on offer too,
 * and the work has to be rescuable before it is.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: undefined };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('JoveWorks stopped on an unexpected error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    return error === undefined ? this.props.children : <CrashNotice error={error} />;
  }
}

function CrashNotice({ error }: { readonly error: Error }): ReactElement {
  const snapshot = loadAutosaveSnapshot();
  const download = (): void => {
    if (snapshot !== undefined) saveTextFile('unsaved-work.jove.json', snapshot.text);
  };
  const discard = (): void => {
    clearAutosaveSnapshot();
    window.location.reload();
  };
  return (
    <main className="crash-notice" role="alert">
      <h1>JoveWorks stopped on an unexpected error</h1>
      <p>
        Nothing was lost by this page itself
        {snapshot === undefined ? '.' : ': your unsaved work up to the last autosave is kept, and reloading offers it back.'}
      </p>
      <pre>{error.message}</pre>
      <p>
        <button type="button" onClick={() => window.location.reload()}>Reload</button>{' '}
        {snapshot === undefined ? null : (
          <>
            <button type="button" onClick={download}>Download unsaved work</button>{' '}
            <button type="button" onClick={discard}>Discard unsaved work and reload</button>
          </>
        )}
      </p>
    </main>
  );
}
