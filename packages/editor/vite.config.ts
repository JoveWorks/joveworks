import { defineConfig } from 'vite';

// The editor is a placeholder until milestone 1 step 7. Vite is wired up now so
// the dependency direction (S22) is enforced from the first commit.
export default defineConfig({
  // `dist/` belongs to tsc; the bundle goes elsewhere so the two never collide.
  build: { target: 'es2022', outDir: 'build' },
});
