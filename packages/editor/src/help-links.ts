/**
 * Where each node kind's "?" button links to. The docs site is served at
 * /docs/ under whatever origin the editor itself is running on (see `base`
 * in packages/docs-site/docs/.vitepress/config.ts) — localhost in dev, the
 * real domain once deployed — so this is derived at runtime rather than
 * hardcoded.
 */

export const DOCS_BASE_URL = `${window.location.origin}/docs`;

export const NODE_HELP_URLS: Readonly<
  Record<'input' | 'formula' | 'output' | 'compare' | 'closure', string>
> = {
  input: `${DOCS_BASE_URL}/guide/node-reference#input`,
  formula: `${DOCS_BASE_URL}/guide/node-reference#formula`,
  output: `${DOCS_BASE_URL}/guide/node-reference#output`,
  compare: `${DOCS_BASE_URL}/guide/node-reference#compare`,
  closure: `${DOCS_BASE_URL}/guide/node-reference#closure`,
};
