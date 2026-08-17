export const EXAMPLE_IDS = [
  'pad-pressure',
  'belt-lab',
  'cantilever-hollow-sections',
] as const;

export type ExampleId = (typeof EXAMPLE_IDS)[number];

export function exampleIdFromUrl(url: URL): ExampleId | undefined {
  const value = url.searchParams.get('example');
  return EXAMPLE_IDS.find((id) => id === value);
}

/** Keep the deployment path and any unrelated query parameters intact. */
export function urlForExample(url: URL, example: ExampleId): URL {
  const next = new URL(url);
  next.searchParams.set('example', example);
  return next;
}
