import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSyntheticViewerSession, SyntheticViewerError } from '../apps/catalog/src/lib/synthetic-viewer-session.js';

const manifest = JSON.parse(readFileSync(new URL('../apps/catalog/sample/catalog-manifest.json', import.meta.url)));
const glb = readFileSync(new URL('../apps/catalog/sample/assets/demonstration/demo-triangle.glb', import.meta.url));

test('a lost context closes one verified session exactly once and requires a new session', async () => {
  let notify;
  let cleanupCount=0, faultCount=0, reads=0;
  const viewer=createSyntheticViewerSession({
    manifest,
    readAsset:async()=>{reads++; return glb;},
    loadRenderer:async()=>({mount:async(_target,options)=>{
      notify=options.onContextLost;
      return ()=>{cleanupCount++;};
    }}),
    onFault:reason=>{faultCount++;assert.equal(reason,'WebGL context lost');}
  });
  await viewer.start({});
  assert.equal(viewer.status,'ready');
  notify();
  notify();
  assert.equal(viewer.status,'error');
  assert.equal(faultCount,1);
  assert.equal(cleanupCount,1);
  assert.equal(reads,1);
  await assert.rejects(()=>viewer.start({}),SyntheticViewerError);
  viewer.dispose();
  assert.equal(cleanupCount,1);
  assert.equal(viewer.status,'disposed');
});

test('disposed viewer ignores subsequent context-loss signals', async()=>{
  let notify, faults=0, releases=0;
  const viewer=createSyntheticViewerSession({
    manifest,
    readAsset:async()=>glb,
    loadRenderer:async()=>({mount:async(_target,options)=>{
      notify=options.onContextLost;
      return()=>{releases++;};
    }}),
    onFault:()=>{faults++;}
  });
  await viewer.start({});
  viewer.dispose();
  notify();
  assert.equal(faults,0);
  assert.equal(releases,1);
});

test('non-function fault handlers are denied',()=>{
  assert.throws(()=>createSyntheticViewerSession({
    manifest,readAsset:async()=>glb,loadRenderer:async()=>({}),onFault:'ignore-error'
  }),SyntheticViewerError);
});
