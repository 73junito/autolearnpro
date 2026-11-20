import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createIndexedCubeSession,CUBE_SHA256,CUBE_PATH} from '../apps/catalog/src/lib/indexed-cube-session.js';
const cube=readFileSync(new URL('./fixtures/c3-r48-synthetic-cube.glb',import.meta.url));
const sha=v=>createHash('sha256').update(v).digest('hex');
const make=({raw=cube,loadRenderer,onFault=()=>{}}={})=>{
  let imported=0,cleaned=0,read=0,options=null;
  const session=createIndexedCubeSession({
    readAsset:async path=>{assert.equal(path,CUBE_PATH);read++;return raw;},
    loadRenderer:async()=>{imported++;return loadRenderer?.() ?? {mount:async(_t,o)=>{
      options=o;
      return ()=>{cleaned++;};
    }};},
    onFault
  });
  return {session,get stats(){return {imported,cleaned,read,options};}};
};
test('fixed cube fingerprint is independent of manifest and reproducible',()=>{
  assert.equal(CUBE_SHA256,sha(cube));
  assert.equal(cube.length,748);
});
test('no asset fetch or Three.js import until explicit start',async()=>{
  const m=make();
  assert.deepEqual({...m.stats,options:null},{imported:0,cleaned:0,read:0,options:null});
  await m.session.start({});
  assert.equal(m.session.status,'ready');
  assert.equal(m.stats.imported,1);
  assert.equal(m.stats.read,1);
  assert.equal(m.stats.options.expectedVertices,8);
  assert.equal(m.stats.options.expectedTriangles,12);
  assert.deepEqual(Buffer.from(m.stats.options.verifiedBytes),cube);
  m.session.dispose();
  m.session.dispose();
  assert.equal(m.stats.cleaned,1);
});
test('changed cube fails SHA-256 and never loads renderer',async()=>{
  const corrupt=Buffer.from(cube);corrupt[corrupt.length-1]^=1;
  const m=make({raw:corrupt});
  await assert.rejects(()=>m.session.start({}),/integrity mismatch/);
  assert.equal(m.stats.imported,0);
  assert.equal(m.session.status,'error');
});
test('malformed coordinates with no matching SHA-256 fail before renderer',async()=>{
  const corrupt=Buffer.from(cube);corrupt.writeFloatLE(NaN,20+cube.readUInt32LE(12)+8);
  const m=make({raw:corrupt});
  await assert.rejects(()=>m.session.start({}));
  assert.equal(m.stats.imported,0);
});
test('context loss notifies once and requires re-verification',async()=>{
  let faults=0;
  const m=make({onFault:reason=>{assert.equal(reason,'WebGL context lost');faults++;}});
  await m.session.start({});
  m.stats.options.onContextLost();
  m.stats.options.onContextLost();
  assert.equal(faults,1);
  assert.equal(m.stats.cleaned,1);
  await assert.rejects(()=>m.session.start({}));
  m.session.dispose();
  assert.equal(m.stats.cleaned,1);
});
test('missing reader or loader is refused',()=>{
  assert.throws(()=>createIndexedCubeSession({readAsset:async()=>cube}),/explicit/);
  assert.throws(()=>createIndexedCubeSession({loadRenderer:async()=>({})}),/explicit/);
});
