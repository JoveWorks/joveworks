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

/*
 * A ceiling to defend, not a target.
 *
 * It was 250 KiB when the viewer drew its own results — a hand-rolled SVG
 * line plot and some markup that resembled the NodeBook. A published NodeBook
 * now draws through the NodeBook's own components (ROADMAP item 38), so it
 * carries what drawing a real figure costs: Observable Plot and its d3
 * modules, KaTeX for typeset titles, and the kernel's indexing and
 * mark-matching helpers. That is the price of the report being the author's
 * report rather than an impression of it; what it must never carry is the
 * editor's canvas or a catalogue, and those are checked below.
 */
const VIEWER_BUDGET = 360 * 1024;

function viewerBundleGuard() {
  return {
    name: 'joveworks-viewer-bundle-guard',
    generateBundle(_options: unknown, bundle: Record<string, OutputChunk | { readonly type: 'asset' }>) {
      const chunks = Object.values(bundle).filter((entry): entry is OutputChunk => entry.type === 'chunk');
      const entry = chunks.find((chunk) => chunk.isEntry);
      // By module rather than by facade: now that the viewer shares
      // components with the editor, Rollup can drop the facade and leave
      // `facadeModuleId` null while the module itself is still in the chunk.
      const viewer = chunks.find((chunk) => chunk.moduleIds.some((id) => id.endsWith('/viewer/PublishedNotebookViewer.tsx')));
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
      // The editor's canvas library, and any catalogue at all: a reader is
      // sent a report, never the graph editor and never the formula content
      // it was computed from. The kernel is neither — it is the arithmetic
      // and the index bookkeeping the figures need to draw at all.
      const forbidden = [...reachable].flatMap((chunk) => chunk.moduleIds).find((id) => id.includes('/@xyflow/') || id.includes('/src/catalogues/'));
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
