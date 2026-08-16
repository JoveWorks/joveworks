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
  define: { __APP_VERSION__: JSON.stringify(version) },
  // `dist/` belongs to tsc; the bundle goes elsewhere so the two never collide.
  build: { target: 'es2022', outDir: 'build' },
});
