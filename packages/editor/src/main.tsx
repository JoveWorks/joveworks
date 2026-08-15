/**
 * The entry point. Nothing but mounting: the app is a static page with no
 * backend, so there is no session to establish and nothing to fetch.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@xyflow/react/dist/style.css';
import './styles.css';

import { App } from './App';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root to mount into');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
