import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { OutputChunk } from 'rollup';

// Read directly rather than `import … with { type: 'json' }` — this file
// runs under Node/Vite, outside the tsc project (`tsconfig.json`'s
// `include` is `src/**` only), so it doesn't need to satisfy that project's
// module resolution.
const rootPackageJson = fileURLToPath(new URL('../../package.json', import.meta.url));
const { version } = JSON.parse(readFileSync(rootPackageJson, 'utf-8')) as { version: string };

const VIEWER_BUDGET = 250 * 1024;

function viewerBundleGuard() {
  return {
    name: 'joveworks-viewer-bundle-guard',
    generateBundle(_options: unknown, bundle: Record<string, OutputChunk | { readonly type: 'asset' }>) {
      const chunks = Object.values(bundle).filter((entry): entry is OutputChunk => entry.type === 'chunk');
      const entry = chunks.find((chunk) => chunk.isEntry);
      const viewer = chunks.find((chunk) => chunk.facadeModuleId?.endsWith('/viewer/PublishedNotebookViewer.tsx'));
      if (entry === undefined || viewer === undefined) throw new Error('could not identify viewer entry chunks');
      const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const reachable = new Set<OutputChunk>();
      const visit = (chunk: OutputChunk): void => {
        if (reachable.has(chunk)) return;
        reachable.add(chunk);
        for (const file of chunk.imports) {
          const imported = byFile.get(file);
          if (imported !== undefined) visit(imported);
        }
      };
      visit(entry);
      visit(viewer);
      const forbidden = [...reachable].flatMap((chunk) => chunk.moduleIds).find((id) => id.includes('/packages/kernel/') || id.includes('/@xyflow/'));
      if (forbidden !== undefined) throw new Error(`viewer bundle includes forbidden module ${forbidden}`);
      const compressed = [...reachable].reduce((bytes, chunk) => bytes + gzipSync(chunk.code).byteLength, 0);
      if (compressed > VIEWER_BUDGET) throw new Error(`viewer JavaScript is ${compressed} bytes gzipped; budget is ${VIEWER_BUDGET}`);
    },
  };
}

// A static client-side app: no backend, no server-side rendering, and
// nothing here that a `file://` or a plain static host could not serve.
export default defineConfig({
  plugins: [react(), viewerBundleGuard()],
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
