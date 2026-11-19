/**
 * C3-R34 — minimal catalog build definition.
 *
 * Two invariants are asserted by `tests/c3-catalog-skeleton.test.mjs` rather than trusted:
 *
 *   1. **No plugins.** The app builds with Vite alone (C3-R33 D1, D3, §4 reason 3). There is deliberately
 *      no `@vitejs/plugin-react` and no other transform plugin in this file or in `package.json`.
 *   2. **Output is confined.** `outDir` is derived from this file's own location, so the build cannot emit
 *      into the repository root even if it is invoked from a different working directory.
 *
 * `chunkSizeWarningLimit` is carried from the staging studio's reviewed build (C3-R33 §2.2) so the threshold
 * is a deliberate number rather than a Vite default that drifts between versions. The skeleton emits no
 * vendor chunk yet; the limit exists for the milestone that adds the Three.js runtime.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const entry = fileURLToPath(new URL('index.html', import.meta.url));
const outDir = fileURLToPath(new URL('dist/', import.meta.url));

export default defineConfig({
  root: appRoot,
  build: {
    target: 'es2020',
    outDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      input: { catalog: entry }
    }
  }
});
