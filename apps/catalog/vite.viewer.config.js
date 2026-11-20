import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  build: {
    target: 'es2020',
    assetsInlineLimit: 0, // R43: GLB must remain a same-origin fetch, never an inlined data: URL
    // R42 isolated Three.js+GLTFLoader chunk: lazy loaded and never part of catalog shell.
    chunkSizeWarningLimit: 580,
    outDir: fileURLToPath(new URL('dist-viewer/', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: { input: { 'synthetic-viewer-test': fileURLToPath(new URL('viewer-demo.html', import.meta.url)) } }
  }
});
