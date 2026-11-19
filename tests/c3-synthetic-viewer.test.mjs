import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSyntheticViewerSession, SyntheticViewerError } from '../apps/catalog/src/lib/synthetic-viewer-session.js';

const manifest = JSON.parse(readFileSync(new URL('../apps/catalog/sample/catalog-manifest.json', import.meta.url)));
const glb = readFileSync(new URL('../apps/catalog/sample/assets/demonstration/demo-triangle.glb', import.meta.url));
function setup({ bytes=glb, failLoader=false, slow=false } = {}) {
  let renders=0, reads=0, cleanup=0, imported=0, resolveRenderer;
  const renderer = {
    mount: async (_target, { verifiedBytes }) => {
      renders++;
      assert.deepEqual(Buffer.from(verifiedBytes), glb);
      return () => { cleanup++; };
    }
  };
  const session = createSyntheticViewerSession({
    manifest, readAsset: async (p) => {
      reads++;
      assert.equal(p, 'assets/demonstration/demo-triangle.glb');
      return bytes;
    },
    loadRenderer: async () => {
      imported++;
      if (failLoader) throw Error('WebGL absent');
      if (slow) return new Promise(resolve => { resolveRenderer = () => resolve(renderer); });
      return renderer;
    }
  });
  return {
    session, get stats() { return {renders,reads,cleanup,imported}; },
    unblock() { resolveRenderer?.(); }
  };
}
test('no asset read and no engine import on initial page load', () => {
  const item = setup();
  assert.equal(item.session.status,'idle');
  assert.deepEqual(item.stats,{renders:0,reads:0,cleanup:0,imported:0});
});
test('verified GLB bytes are passed to renderer; shutdown disposes exactly once', async () => {
  const item=setup();
  await item.session.start({});
  assert.equal(item.session.status,'ready');
  assert.deepEqual(item.stats,{renders:1,reads:1,cleanup:0,imported:1});
  item.session.dispose();
  item.session.dispose();
  assert.equal(item.session.status,'disposed');
  assert.equal(item.stats.cleanup,1);
  await assert.rejects(()=>item.session.start({}),SyntheticViewerError);
});
test('tampered bytes reject before Three.js is imported', async () => {
  const altered=Buffer.from(glb);
  altered[altered.length-1]^=1;
  const item=setup({bytes:altered});
  await assert.rejects(()=>item.session.start({}),/integrity mismatch/);
  assert.equal(item.session.status,'error');
  assert.equal(item.stats.imported,0);
  assert.equal(item.stats.renders,0);
  await assert.rejects(()=>item.session.start({}),SyntheticViewerError);
});
test('missing bytes reject before Three.js import', async () => {
  const item=setup({bytes:new Uint8Array()});
  await assert.rejects(()=>item.session.start({}),/integrity mismatch/);
  assert.equal(item.stats.imported,0);
});
test('renderer failure is contained and returns no ready state', async () => {
  const item=setup({failLoader:true});
  await assert.rejects(()=>item.session.start({}),/WebGL absent/);
  assert.equal(item.session.status,'error');
  assert.equal(item.stats.renders,0);
});
test('disposing during delayed engine import prevents mounting', async () => {
  const item=setup({slow:true});
  const promise=item.session.start({});
  while(item.stats.imported===0) await new Promise(resolve=>setImmediate(resolve));
  item.session.dispose();
  item.unblock();
  await promise;
  assert.equal(item.session.status,'disposed');
  assert.equal(item.stats.renders,0);
});
test('unknown catalogs are refused even with valid R39 asset hashes', async () => {
  const altered=structuredClone(manifest);
  altered.records[0].id='other-catalog';
  const item=createSyntheticViewerSession({
    manifest:altered,readAsset:async()=>glb,
    loadRenderer:async()=>{throw Error('renderer must not load');}
  });
  await assert.rejects(()=>item.start({}),SyntheticViewerError);
});
test('session requires explicit loader and asset reader', () => {
  assert.throws(()=>createSyntheticViewerSession({manifest,readAsset:()=>glb}),SyntheticViewerError);
  assert.throws(()=>createSyntheticViewerSession({manifest,loadRenderer:()=>({})}),SyntheticViewerError);
});
