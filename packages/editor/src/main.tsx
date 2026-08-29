import { StrictMode, Suspense, lazy, useEffect, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

// No stylesheet here. Each route imports its own, in its own order, because
// the order is load-bearing: `styles.css` sets `.react-flow__handle` to an
// 18px hit box at the same specificity React Flow's own stylesheet sets 6px,
// so whichever loads last wins. Importing `styles.css` eagerly here put it in
// this entry chunk while React Flow's stayed in the editor's lazy one — which
// loads later, and shrank every port on the canvas. Both routes now load what
// they need from the module that needs it.
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
