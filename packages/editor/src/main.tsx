import { StrictMode, Suspense, lazy, useEffect, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import './viewer.css';
import { parseRoute, type AppRoute } from './router';

const Editor = lazy(() => import('./EditorEntry'));
const PublishedNotebookViewer = lazy(() => import('./viewer/PublishedNotebookViewer'));

function RoutedApp(): ReactElement {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(new URL(window.location.href)));
  useEffect(() => {
    const changed = (): void => setRoute(parseRoute(new URL(window.location.href)));
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, []);
  return (
    <Suspense fallback={<main className="viewer-status">Loading JoveWorks…</main>}>
      {route.kind === 'home' || route.edit ? <Editor /> : <PublishedNotebookViewer route={route} />}
    </Suspense>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root to mount into');

createRoot(root).render(
  <StrictMode>
    <RoutedApp />
  </StrictMode>,
);
