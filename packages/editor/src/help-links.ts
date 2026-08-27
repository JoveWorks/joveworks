/**
 * Where each node kind's "?" button links to. At deploy, the docs site is
 * served at /docs/ under the editor's own origin (see `base` in
 * packages/docs-site/docs/.vitepress/config.ts) — but in dev the two are
 * separate Vite servers (editor on 5173, docs on 5174 — `pnpm docs:dev`),
 * so DOCS_BASE_URL can't just be the editor's own origin there.
 *
 * `window.location.origin` has no path component, so this always points at
 * /docs/ off the domain root — correct for Netlify and for a stable bundle
 * hosted at a school's domain root, but not for one hosted under a subpath
 * (the docs site's own `base` has the same domain-root assumption, and for
 * the same reason; see the comment there). The editor's own UI and the
 * catalogue-author build don't have this limitation — only these help links
 * and the docs pages themselves do.
 */

import type { NodeKind } from '@joveworks/schema';

export const DOCS_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5174/docs'
  : `${window.location.origin}/docs`;

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
