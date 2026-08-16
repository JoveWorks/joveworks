/**
 * Where each node kind's "?" button links to. `packages/docs-site` is not
 * deployed yet — update DOCS_BASE_URL once it has a real URL.
 */

const DOCS_BASE_URL = 'https://docs.machine-design-studio.example';

export const NODE_HELP_URLS: Readonly<
  Record<'input' | 'formula' | 'output' | 'compare' | 'closure', string>
> = {
  input: `${DOCS_BASE_URL}/guide/node-reference#input`,
  formula: `${DOCS_BASE_URL}/guide/node-reference#formula`,
  output: `${DOCS_BASE_URL}/guide/node-reference#output`,
  compare: `${DOCS_BASE_URL}/guide/node-reference#compare`,
  closure: `${DOCS_BASE_URL}/guide/node-reference#closure`,
};
