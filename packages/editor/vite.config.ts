import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A static client-side app (S14/S15): no backend, no server-side rendering, and
// nothing here that a `file://` or a plain static host could not serve.
export default defineConfig({
  plugins: [react()],
  // `dist/` belongs to tsc; the bundle goes elsewhere so the two never collide.
  build: { target: 'es2022', outDir: 'build' },
});
