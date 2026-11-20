import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = new URL('../apps/catalog/dist-viewer/', import.meta.url);
const assets = new URL('assets/', dist);
const kb = 1024;
const bytes = (url) => readFileSync(url);
const list = readdirSync(assets).sort();
const file = (prefix, suffix) => {
  const matches=list.filter(n=>n.startsWith(prefix)&&n.endsWith(suffix));
  assert.equal(matches.length,1, 'expected exactly one '+prefix+suffix+' artifact');
  return matches[0];
};
test('development-only browser bundle budgets limit startup code and verified asset bytes',()=>{
  const engine=file('viewer-engine-','.js');
  const bootstrap=file('synthetic-viewer-test-','.js');
  const glb=file('demo-triangle-','.glb');
  const sizes={
    renderer:statSync(join(fileURLToPath(assets),engine)).size,
    bootstrap:statSync(join(fileURLToPath(assets),bootstrap)).size,
    syntheticGlb:statSync(join(fileURLToPath(assets),glb)).size
  };
  console.log('C3-R47 BUNDLE BYTES '+JSON.stringify(sizes));
  assert.ok(sizes.renderer <= 750*kb,'lazy renderer over 750 KiB');
  assert.ok(sizes.bootstrap <= 40*kb,'startup bootstrap over 40 KiB');
  assert.ok(sizes.syntheticGlb <= 1024,'synthetic test GLB over 1 KiB');
  assert.equal(sizes.syntheticGlb,460,'fixture must remain byte-identical');
  const html=bytes(new URL('viewer-demo.html',dist)).toString('utf8');
  assert.match(html,/noindex, nofollow/);
  assert.doesNotMatch(html,/viewer-engine-[^"']+\.js/,'Three.js must not be preloaded in the page');
});
