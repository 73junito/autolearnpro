import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSyntheticGeometry,GeometryBudgetError,SYNTHETIC_GEOMETRY_LIMITS } from '../apps/catalog/src/lib/synthetic-geometry-budget.js';
const cube=readFileSync(new URL('./fixtures/c3-r48-synthetic-cube.glb',import.meta.url));
const jsonLength=cube.readUInt32LE(12);
const binStart=20+jsonLength+8;
const indexStart=binStart+96;
test('indexed cube and triangle faces remain nondegenerate',()=>{
  const meta=validateSyntheticGeometry(cube);
  assert.equal(meta.vertexCount,8);
  assert.equal(meta.indexCount,36);
  assert.equal(meta.triangleCount,12);
});
test('repeated indices fail even with in-range integer indices',()=>{
  for(const repeated of [[0,0,0],[0,1,1],[0,1,0]]) {
    const b=Buffer.from(cube);
    repeated.forEach((v,i)=>b.writeUInt16LE(v,indexStart+i*2));
    assert.throws(()=>validateSyntheticGeometry(b),GeometryBudgetError);
  }
});
test('valid vertex references forming a collinear triangle fail as zero-area geometry',()=>{
  const b=Buffer.from(cube);
  // Three corners of the same straight edge: vertices 0 and 1 plus a duplicated
  // geometric coordinate in an otherwise separate vertex index.
  // Mutate vertex 2 onto the segment between 0 and 1, retaining in-bounds floats.
  b.writeFloatLE(0,binStart+2*12+0);
  b.writeFloatLE(-1,binStart+2*12+4);
  b.writeFloatLE(-1,binStart+2*12+8);
  // Actual bounds still [-1,1], but face (0,2,1) is now collinear.
  assert.throws(()=>validateSyntheticGeometry(b),GeometryBudgetError);
});
test('deterministic 256-case bit-flip corpus either rejects with typed error or stays inside strict budgets',()=>{
  const count=256;
  let rejected=0;
  for(let i=0;i<count;i++){
    const b=Buffer.from(cube);
    const at=(i*29+7)%b.length;
    const bit=(i*5)%8;
    b[at]^=(1<<bit);
    let report;
    try {report=validateSyntheticGeometry(b);}
    catch(e) {assert.ok(e instanceof GeometryBudgetError, 'unexpected parser crash at mutation '+i+': '+e);rejected++;continue;}
    assert.ok(report.byteLength<=SYNTHETIC_GEOMETRY_LIMITS.maxAssetBytes);
    assert.ok(report.vertexCount<=SYNTHETIC_GEOMETRY_LIMITS.maxVertices);
    assert.ok(report.triangleCount<=SYNTHETIC_GEOMETRY_LIMITS.maxTriangles);
    assert.ok(report.indexCount<=SYNTHETIC_GEOMETRY_LIMITS.maxIndices);
  }
  console.log('C3-R49 MUTATION CORPUS '+JSON.stringify({count,rejected,accepted:count-rejected}));
  assert.ok(rejected>180,'mutations unexpectedly accepted too often');
});
