/**
 * Where each node kind's "?" button links to. At deploy, the docs site is
 * served at /docs/ under the editor's own origin (see `base` in
 * packages/docs-site/docs/.vitepress/config.ts) — but in dev the two are
 * separate Vite servers (editor on 5173, docs on 5174 — `pnpm docs:dev`),
 * so DOCS_BASE_URL can't just be the editor's own origin there.
 *
 * In production the docs sit in docs/ next to the editor's index.html, so
 * this resolves the editor's base (JOVEWORKS_BASE_PATH) against the current
 * page, not the bare origin: an absolute base like `/joveworks/` resolves the
 * same either way, and the stable bundle's relative `./` base then follows
 * wherever the bundle is hosted. The app never routes by path (only
 * `?example=`), so the current page is always the editor's own index. The
 * docs pages themselves still need their absolute `base` to match; see
 * JOVEWORKS_DOCS_BASE_PATH in packages/docs-site/docs/.vitepress/config.ts.
 *
 * No trailing slash: every use below appends `/guide/...`, and a bare link
 * to the docs home must add its own `/` (DOCS_HOME_URL).
 */

import type { NodeKind } from '@joveworks/schema';

export const DOCS_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5174/docs'
  : new URL('docs', new URL(import.meta.env.BASE_URL, window.location.href)).toString();

/** The docs home page. The trailing slash matters on static hosts that
 *  don't redirect `/docs` to `/docs/`. */
export const DOCS_HOME_URL = `${DOCS_BASE_URL}/`;

export const NODE_HELP_URLS: Readonly<Record<NodeKind, string>> = {
  input: `${DOCS_BASE_URL}/guide/node-reference#input`,
  range: `${DOCS_BASE_URL}/guide/node-reference#range`,
  file: `${DOCS_BASE_URL}/guide/node-reference#file`,
  formula: `${DOCS_BASE_URL}/guide/node-reference#formula`,
  output: `${DOCS_BASE_URL}/guide/node-reference#output`,
  compare: `${DOCS_BASE_URL}/guide/node-reference#compare`,
  select: `${DOCS_BASE_URL}/guide/node-reference#select`,
  statistic: `${DOCS_BASE_URL}/guide/node-reference#statistic`,
  closure: `${DOCS_BASE_URL}/guide/node-reference#closure`,
  waypoint: `${DOCS_BASE_URL}/guide/node-reference#waypoint`,
  pack: `${DOCS_BASE_URL}/guide/node-reference#pack`,
  unpack: `${DOCS_BASE_URL}/guide/node-reference#unpack`,
  monteCarloGenerator: `${DOCS_BASE_URL}/guide/node-reference#monte-carlo-generator`,
  monteCarloReceiver: `${DOCS_BASE_URL}/guide/node-reference#monte-carlo-receiver`,
};

/**
 * An output node's `kind` picks which paragraph under `#output` actually
 * describes it — eight very different things share one node shell (see
 * `OutputNodeView`), so the generic `output` entry above (which lands at the
 * top of that section) is too coarse for the "?" button. Keyed by
 * `Output['kind']` from `@joveworks/schema`, kept as plain strings here to
 * avoid this file depending on the schema package for a type it otherwise
 * doesn't need.
 */
export const OUTPUT_HELP_URLS: Readonly<
  Record<
    | 'print'
    | 'check'
    | 'plot'
    | 'table'
    | 'equation'
    | 'feasibility'
    | 'sensitivity'
    | 'stress'
    | 'bestDesign'
    | 'pareto'
    | 'distribution'
    | 'reliability',
    string
  >
> = {
  print: `${DOCS_BASE_URL}/guide/node-reference#print`,
  check: `${DOCS_BASE_URL}/guide/node-reference#check`,
  plot: `${DOCS_BASE_URL}/guide/node-reference#plot`,
  table: `${DOCS_BASE_URL}/guide/node-reference#table`,
  equation: `${DOCS_BASE_URL}/guide/node-reference#equation`,
  feasibility: `${DOCS_BASE_URL}/guide/node-reference#feasibility`,
  sensitivity: `${DOCS_BASE_URL}/guide/node-reference#sensitivity`,
  stress: `${DOCS_BASE_URL}/guide/node-reference#assumption-stress`,
  bestDesign: `${DOCS_BASE_URL}/guide/node-reference#best-design`,
  pareto: `${DOCS_BASE_URL}/guide/node-reference#pareto`,
  distribution: `${DOCS_BASE_URL}/guide/node-reference#distribution`,
  reliability: `${DOCS_BASE_URL}/guide/node-reference#reliability`,
};
