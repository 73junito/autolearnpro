import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const file = p=>readFileSync(new URL(p,root),'utf8');
const index=file('apps/catalog/index.html');
const main=file('apps/catalog/src/main.js');
const demo=file('apps/catalog/viewer-demo.html');
const entry=file('apps/catalog/src/viewer-demo.js');
const engine=file('apps/catalog/src/viewer-engine.js');
const vite=file('apps/catalog/vite.config.js');
const devVite=file('apps/catalog/vite.viewer.config.js');
test('production catalog shell remains unchanged and does not import Three or sample data', () => {
  assert.doesNotMatch(index,/viewer-demo|synthetic triangle/i);
  assert.doesNotMatch(main,/viewer-engine|viewer-demo|sample\/catalog/i);
  assert.doesNotMatch(vite,/viewer-demo|vite\.viewer/);
});
test('synthetic viewer is a separate noindex document with explicit controls and status', () => {
  assert.match(demo,/<meta name="robots" content="noindex, nofollow"/);
  assert.match(demo,/id="viewer-start" type="button"/);
  assert.match(demo,/id="viewer-stop" type="button" disabled/);
  assert.match(demo,/id="viewer-status" role="status" aria-live="polite"/);
  assert.match(demo,/prefers-reduced-motion/);
  assert.match(demo,/:focus-visible/);
  assert.match(demo,/Development-only demo/);
});
test('viewer entry imports Three lazily after integrity boundary, not at boot', () => {
  assert.match(entry,/import\('\.\/viewer-engine\.js'\)/);
  assert.match(entry,/createSyntheticViewerSession/);
  assert.match(entry,/credentials: 'omit'/);
  assert.match(entry,/url\.origin !== location\.origin/);
  assert.doesNotMatch(entry,/import \* as THREE/);
  assert.match(engine,/GLTFLoader/);
  assert.match(engine,/parseAsync\(Uint8Array\.from\(verifiedBytes\)\.buffer/);
  assert.match(engine,/renderer\.render\(gltf\.scene, camera\)/);
  assert.doesNotMatch(engine,/new THREE\.BufferGeometry|Float32BufferAttribute/);
});
test('separate build output cannot overwrite production catalog dist', () => {
  assert.match(devVite,/dist-viewer\//);
  assert.match(vite,/dist\//);
  assert.doesNotMatch(devVite,/emptyOutDir:\s*false/);
});
