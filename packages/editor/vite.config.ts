import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Read directly rather than `import … with { type: 'json' }` — this file
// runs under Node/Vite, outside the tsc project (`tsconfig.json`'s
// `include` is `src/**` only), so it doesn't need to satisfy that project's
// module resolution.
const rootPackageJson = fileURLToPath(new URL('../../package.json', import.meta.url));
const { version } = JSON.parse(readFileSync(rootPackageJson, 'utf-8')) as { version: string };

// A static client-side app: no backend, no server-side rendering, and
// nothing here that a `file://` or a plain static host could not serve.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // Lets a bug report read "nightly 0.21.0" instead of an ambiguous
    // version number. Nightly (joveworks.thomasvanriel.com, built from
    // `main`) and stable (the downloadable release bundle a school deploys
    // on its own host) live on different origins with entirely separate
    // localStorage, so knowing which one a student is on matters. The
    // release workflow sets this to "stable" when it builds the bundle;
    // every other build — Netlify's nightly included — leaves it at the
    // default below.
    __APP_CHANNEL__: JSON.stringify(process.env.JOVEWORKS_CHANNEL ?? 'nightly'),
  },
  // Defaults to the domain root so the current Netlify build (nightly) is
  // unaffected. The release workflow overrides this to `./` (a relative
  // base) when it builds the stable bundle: the app only ever routes with
  // a `?example=` query parameter (see exampleUrl.ts) — there is no
  // path-based router anywhere in this app — so a relative base resolves
  // correctly whether the bundle ends up at the domain root or under a
  // school's subpath, with no rebuild needed either way. JOVEWORKS_BASE_PATH
  // still accepts an absolute path too, for anyone who genuinely wants one.
  base: process.env.JOVEWORKS_BASE_PATH ?? '/',
  // `dist/` belongs to tsc; the bundle goes elsewhere so the two never collide.
  build: { target: 'es2022', outDir: 'build' },
});
