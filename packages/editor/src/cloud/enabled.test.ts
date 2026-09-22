/**
 * The flag decides what a self-hosting school's build contains, and it is
 * read at module scope — so it is set once, at import, and a regression here
 * would be invisible until someone opened a deployed build and found a Cloud
 * menu that connects to nothing. Pin both directions.
 *
 * `resetModules` before each dynamic import is what makes that possible:
 * without it the first import wins and the second assertion tests a cached
 * constant rather than the environment.
 */

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

async function cloudEnabledWith(value: string | undefined): Promise<boolean> {
  vi.resetModules();
  if (value === undefined) vi.stubEnv('VITE_CLOUD', undefined as unknown as string);
  else vi.stubEnv('VITE_CLOUD', value);
  return (await import('./enabled')).CLOUD_ENABLED;
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

it('is off when the flag is unset — the self-hosting default', async () => {
  expect(await cloudEnabledWith(undefined)).toBe(false);
});

it('is on for the enablement value our own deploys set', async () => {
  expect(await cloudEnabledWith('hub')).toBe(true);
});

it('is off for any other value, rather than treating truthiness as consent', async () => {
  // A deploy that sets VITE_CLOUD=true or =1 meant to enable cloud, but the
  // contract is one exact word — the same shape as VITE_ANALYTICS=plausible.
  // Failing closed is the safe direction: a missing Cloud menu is noticed
  // immediately, an unintended one is not.
  expect(await cloudEnabledWith('true')).toBe(false);
  expect(await cloudEnabledWith('1')).toBe(false);
  expect(await cloudEnabledWith('')).toBe(false);
});
