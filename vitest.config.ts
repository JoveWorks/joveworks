import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

// Tests run against source, not dist, so a test run never depends on a build
// having happened first. `tsc -b` is what enforces the dependency direction
//; these aliases deliberately do not add resolution the compiler refuses.
export default defineConfig({
  resolve: {
    alias: {
      '@joveworks/units': src('units'),
      '@joveworks/schema': src('schema'),
      '@joveworks/kernel': src('kernel'),
      '@joveworks/nodes': src('nodes'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
  },
});
