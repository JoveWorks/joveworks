import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A static client-side app, no backend — same convention as the editor and
// the docs site. tsc owns `dist/` (see tsconfig.json), so the bundle goes to
// `build/` instead, and Netlify copies that into the editor's own build
// under `/author/` (see netlify.toml).
//
// `base` is relative rather than the `/author/` path it's nested under: this
// is a single flat page with no path-based router — no directories to get
// the depth wrong, unlike the docs site below — so `./assets/...` resolves
// correctly wherever this build ends up, whether that's `/author/` at a
// domain root or `/some-subpath/author/` on a school's own host. No rebuild
// needed either way, and it's the same on-disk result the old absolute path
// produced under the domain-root deployment Netlify already uses.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', outDir: 'build' },
});
