import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { generateSample, matchOutputs } from '../infrastructure/scripts/c3-build-sample.mjs';
import { loadVerifiedCatalog } from '../apps/catalog/src/lib/catalog-contract.js';
const source = readFileSync(new URL('../apps/catalog/fixtures/demo-triangle.json',import.meta.url));
const result = generateSample(source);
const hash = (data) => createHash('sha256').update(data).digest('hex');

test('reproducible output is byte identical', () => {
  const again = generateSample(source);
  for(const k of Object.keys(result)) assert.deepEqual(result[k],again[k]);
});
test('GLB v2 declares a valid triangle mesh and binary buffer', () => {
  const b = result.glb;
  assert.equal(b.readUInt32LE(0),0x46546c67);
  assert.equal(b.readUInt32LE(4),2);
  assert.equal(b.readUInt32LE(8),b.length);
  const n = b.readUInt32LE(12);
  assert.equal(b.readUInt32LE(16),0x4e4f534a);
  const gltf = JSON.parse(b.subarray(20,20+n).toString());
  assert.equal(gltf.asset.version,'2.0');
  assert.equal(gltf.accessors[0].count,3);
  assert.equal(gltf.buffers[0].byteLength,36);
  assert.equal(b.readUInt32LE(20+n),36);
  assert.equal(b.readUInt32LE(24+n),0x004e4942);
});
test('provenance records exact unsigned source and output hashes', () => {
  const p=JSON.parse(result.provenance);
  const m=JSON.parse(result.manifest);
  assert.equal(p.sourceSha256,hash(source));
  assert.equal(p.generatorSha256,hash(readFileSync(new URL('../infrastructure/scripts/c3-build-sample.mjs',import.meta.url))));
  assert.equal(p.status,'unsigned-synthetic-no-publication-authority');
  assert.deepEqual(p.artifacts.map(x=>x.sha256),[hash(result.glb),hash(result.manifest)]);
  assert.equal(m.assets[0].sha256,hash(result.glb));
});
test('R39 loader verifies sample integrity without network',async()=>{
  const manifest=JSON.parse(result.manifest);
  const verified=await loadVerifiedCatalog(manifest,{readAsset:async p=>{
    assert.equal(p,'assets/demonstration/demo-triangle.glb');
    return result.glb;
  },cryptoProvider:webcrypto});
  assert.equal(verified.records[0].id,'demo-triangle');
});
test('missing and modified outputs fail check',()=>{
  assert.equal(matchOutputs(result,k=>result[k]),true);
  assert.equal(matchOutputs(result,()=>null),false);
  assert.equal(matchOutputs(result,k=>k==='glb'?Buffer.alloc(result.glb.length):result[k]),false);
});
test('unreviewed fixture content cannot produce outputs',()=>{
  const changed=JSON.parse(source.toString());
  changed.positions[0][0]=1;
  assert.throws(()=>generateSample(Buffer.from(JSON.stringify(changed))),/unreviewed/);
});
