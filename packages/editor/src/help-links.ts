/**
 * Where each node kind's "?" button links to. At deploy, the docs site is
 * served at /docs/ under the editor's own origin (see `base` in
 * packages/docs-site/docs/.vitepress/config.ts) — but in dev the two are
 * separate Vite servers (editor on 5173, docs on 5174 — `pnpm docs:dev`),
 * so DOCS_BASE_URL can't just be the editor's own origin there.
 */

export const DOCS_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5174/docs'
  : `${window.location.origin}/docs`;

export const NODE_HELP_URLS: Readonly<
  Record<
    'input' | 'formula' | 'output' | 'compare' | 'closure' | 'waypoint' | 'pack' | 'unpack',
    string
  >
> = {
  input: `${DOCS_BASE_URL}/guide/node-reference#input`,
  formula: `${DOCS_BASE_URL}/guide/node-reference#formula`,
  output: `${DOCS_BASE_URL}/guide/node-reference#output`,
  compare: `${DOCS_BASE_URL}/guide/node-reference#compare`,
  closure: `${DOCS_BASE_URL}/guide/node-reference#closure`,
  waypoint: `${DOCS_BASE_URL}/guide/node-reference#waypoint`,
  pack: `${DOCS_BASE_URL}/guide/node-reference#pack`,
  unpack: `${DOCS_BASE_URL}/guide/node-reference#unpack`,
};
