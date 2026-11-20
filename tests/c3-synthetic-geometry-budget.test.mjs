import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSyntheticCube} from '../infrastructure/scripts/c3-build-complexity-fixture.mjs';
import {
  SYNTHETIC_GEOMETRY_LIMITS, validateSyntheticGeometry, GeometryBudgetError
} from '../apps/catalog/src/lib/synthetic-geometry-budget.js';

const cube=readFileSync(new URL('./fixtures/c3-r48-synthetic-cube.glb',import.meta.url));
const triangle=readFileSync(new URL('../apps/catalog/sample/assets/demonstration/demo-triangle.glb',import.meta.url));
const corrupted=(patch)=>{const b=Buffer.from(cube); patch(b); return b;};
const uint32=(b,o,v)=>b.writeUInt32LE(v,o);
const jsonLength=cube.readUInt32LE(12);
const binOffset=12+8+jsonLength+8;
const toJson=()=>JSON.parse(cube.subarray(20,20+jsonLength).toString('utf8').trimEnd());
function repack(json,raw=cube.subarray(binOffset)) {
  const text=Buffer.from(JSON.stringify(json));
  const padding=(4-text.length%4)%4;
  const padded=Buffer.concat([text,Buffer.alloc(padding,0x20)]);
  const body=Buffer.from(raw);
  const hdr=Buffer.alloc(28);
  hdr.writeUInt32LE(0x46546c67,0);
  hdr.writeUInt32LE(2,4);
  hdr.writeUInt32LE(28+padded.length+body.length,8);
  hdr.writeUInt32LE(padded.length,12);
  hdr.writeUInt32LE(0x4e4f534a,16);
  const output=Buffer.alloc(28+padded.length+body.length);
  hdr.copy(output,0,0,20);
  padded.copy(output,20);
  output.writeUInt32LE(body.length,20+padded.length);
  output.writeUInt32LE(0x004e4942,24+padded.length);
  body.copy(output,28+padded.length);
  return output;
}
function rejects(raw,label) {
  assert.throws(()=>validateSyntheticGeometry(raw), GeometryBudgetError,label);
}
test('fixture generation is byte-for-byte deterministic, educational and unapproved',()=>{
  assert.deepEqual(makeSyntheticCube(),cube);
  assert.deepEqual(validateSyntheticGeometry(cube),{
    byteLength:748,vertexCount:8,triangleCount:12,indexCount:36,primitiveCount:1
  });
  assert.ok(Object.isFrozen(validateSyntheticGeometry(cube)));
  assert.deepEqual(validateSyntheticGeometry(triangle),{
    byteLength:triangle.length,vertexCount:3,triangleCount:1,indexCount:3,primitiveCount:1
  });
});
test('limits explicitly cap assets, vertex count, triangle count and indices',()=>{
  assert.deepEqual({...SYNTHETIC_GEOMETRY_LIMITS},{
    maxAssetBytes:65536,maxVertices:128,maxTriangles:256,maxIndices:768,maxPrimitives:1
  });
  rejects(Buffer.alloc(65537),'oversized bytes');
  const v=toJson();v.accessors[0].count=129;rejects(repack(v),'too many vertices');
  const t=toJson();t.accessors[1].count=771;rejects(repack(t),'too many indices');
  const p=toJson();p.meshes[0].primitives.push(p.meshes[0].primitives[0]);rejects(repack(p),'too many primitives');
});
test('truncated, corrupted and duplicate chunk structures fail closed',()=>{
  rejects(cube.subarray(0,12),'truncated GLB');
  rejects(corrupted(b=>uint32(b,0,0)),'invalid magic');
  rejects(corrupted(b=>uint32(b,4,3)),'unknown glTF version');
  rejects(corrupted(b=>uint32(b,8,b.length+4)),'length mismatch');
  rejects(corrupted(b=>uint32(b,12,0xffffffff)),'invalid JSON chunk length');
  rejects(corrupted(b=>uint32(b,16,0)),'unexpected chunk type');
});
test('invalid float positions, index ranges and accessor representations fail closed',()=>{
  rejects(corrupted(b=>b.writeFloatLE(NaN,binOffset)),'non-finite vertex');
  rejects(corrupted(b=>b.writeFloatLE(Infinity,binOffset)),'infinite vertex');
  rejects(corrupted(b=>b.writeFloatLE(1001,binOffset)),'unbounded vertex');
  rejects(corrupted(b=>b.writeUInt16LE(100,binOffset+96)),'out of range index');
  const a=toJson();a.accessors[0].type='VEC4';rejects(repack(a),'invalid vertex type');
  const b=toJson();b.accessors[1].componentType=5125;rejects(repack(b),'unsupported indices');
  const c=toJson();c.accessors[0].min=[-2,-1,-1];rejects(repack(c),'false vertex bounds');
});
test('external URLs, extensions, materials, textures and unapproved scene nodes are rejected',()=>{
  const a=toJson();a.buffers[0].uri='https://invalid.example/mesh.bin';rejects(repack(a));
  const b=toJson();b.extensionsUsed=['KHR_draco_mesh_compression'];rejects(repack(b));
  const c=toJson();c.materials=[{}];rejects(repack(c));
  const e=toJson();e.scenes[0].nodes=[0,1];rejects(repack(e));
});
test('binary slice and byte offsets are respected; no mutation of caller buffers',()=>{
  const backing=Buffer.concat([Buffer.alloc(7,7),cube,Buffer.alloc(7,8)]);
  const exact=backing.subarray(7,7+cube.length);
  assert.equal(validateSyntheticGeometry(exact).triangleCount,12);
  assert.equal(backing[0],7);
  rejects(backing,'surrounding bytes not part of GLB');
  rejects('not a binary GLB','string');
});
