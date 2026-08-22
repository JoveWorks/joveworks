import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A static client-side app, no backend — same convention as the editor and
// the docs site. tsc owns `dist/` (see tsconfig.json), so the bundle goes to
// `build/` instead, and Netlify copies that into the editor's own build
// under `/author/` (see netlify.toml).
export default defineConfig({
  base: '/author/',
  plugins: [react()],
  build: { target: 'es2022', outDir: 'build' },
});
