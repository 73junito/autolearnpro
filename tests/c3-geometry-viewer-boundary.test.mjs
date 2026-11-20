import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSyntheticViewerSession } from '../apps/catalog/src/lib/synthetic-viewer-session.js';

const clean=readFileSync(new URL('../apps/catalog/sample/assets/demonstration/demo-triangle.glb',import.meta.url));
const baseline=JSON.parse(readFileSync(new URL('../apps/catalog/sample/catalog-manifest.json',import.meta.url)));
const digest=b=>createHash('sha256').update(b).digest('hex');
test('hash-matching but malformed geometry is rejected before Three.js import',async()=>{
  const invalid=Buffer.from(clean);
  // Valid GLB length and asset SHA-256, but invalid nonfinite position.
  const jsonBytes=invalid.readUInt32LE(12);
  invalid.writeFloatLE(NaN,20+jsonBytes+8);
  const manifest=structuredClone(baseline);
  manifest.assets[0].sha256=digest(invalid);
  let imports=0;
  const viewer=createSyntheticViewerSession({
    manifest,
    readAsset:async()=>invalid,
    loadRenderer:async()=>{imports++;return {mount:async()=>()=>{}};}
  });
  await assert.rejects(()=>viewer.start({}),/nonfinite or unbounded coordinates/);
  assert.equal(imports,0);
  assert.equal(viewer.status,'error');
});
test('valid cube remains excluded from the single-triangle viewer even with matching integrity evidence',async()=>{
  const cube=readFileSync(new URL('./fixtures/c3-r48-synthetic-cube.glb',import.meta.url));
  const manifest=structuredClone(baseline);
  manifest.assets[0].sha256=digest(cube);
  manifest.assets[0].byteLength=cube.length;
  let imported=false;
  const viewer=createSyntheticViewerSession({
    manifest,readAsset:async()=>cube,
    loadRenderer:async()=>{imported=true;return {mount:async()=>()=>{}};}
  });
  await assert.rejects(()=>viewer.start({}),/only permits the approved synthetic triangle shape/);
  assert.equal(imported,false);
});
