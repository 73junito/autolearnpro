// C3-R48: deterministic synthetic indexed cube fixture (not a vehicle model).
// --check is read-only, --write updates only the one checked-in test GLB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSyntheticGeometry } from '../../apps/catalog/src/lib/synthetic-geometry-budget.js';

const dest = fileURLToPath(new URL('../../tests/fixtures/c3-r48-synthetic-cube.glb', import.meta.url));
const vertices = [
  [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
  [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
];
const indices = [
  0,2,1,0,3,2,4,5,6,4,6,7,
  0,1,5,0,5,4,1,2,6,1,6,5,
  2,3,7,2,7,6,3,0,4,3,4,7
];
const chunk = (src,type,pad) => {
  const fill=(4-src.length%4)%4;
  const bytes=Buffer.concat([src,Buffer.alloc(fill,pad)]);
  const hdr=Buffer.alloc(8);
  hdr.writeUInt32LE(bytes.length,0);
  hdr.writeUInt32LE(type,4);
  return Buffer.concat([hdr,bytes]);
};
export function makeSyntheticCube() {
  const raw=Buffer.alloc(vertices.length*12+indices.length*2);
  vertices.flat().forEach((n,i)=>raw.writeFloatLE(n,i*4));
  const indexStart=vertices.length*12;
  indices.forEach((n,i)=>raw.writeUInt16LE(n,indexStart+i*2));
  const gltf={
    asset:{version:'2.0',generator:'ALP synthetic C3-R48 development only'},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
    buffers:[{byteLength:raw.length}],
    bufferViews:[
      {buffer:0,byteOffset:0,byteLength:indexStart,target:34962},
      {buffer:0,byteOffset:indexStart,byteLength:indices.length*2,target:34963}
    ],
    accessors:[
      {bufferView:0,componentType:5126,count:vertices.length,type:'VEC3',min:[-1,-1,-1],max:[1,1,1]},
      {bufferView:1,componentType:5123,count:indices.length,type:'SCALAR'}
    ]
  };
  const body=Buffer.concat([
    chunk(Buffer.from(JSON.stringify(gltf),'utf8'),0x4e4f534a,0x20),
    chunk(raw,0x004e4942,0)
  ]);
  const header=Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67,0);
  header.writeUInt32LE(2,4);
  header.writeUInt32LE(body.length+12,8);
  const glb=Buffer.concat([header,body]);
  const report=validateSyntheticGeometry(glb);
  if(report.vertexCount!==8||report.triangleCount!==12||report.indexCount!==36) {
    throw Error('C3-R48 fixed cube mismatch');
  }
  return glb;
}
function main() {
  const mode=process.argv[2];
  if(process.argv.length!==3 || !['--check','--write'].includes(mode)) throw Error('use --check or --write');
  if(fs.existsSync(dest)&&fs.lstatSync(dest).isSymbolicLink()) throw Error('symlink destination prohibited');
  if(fs.lstatSync(path.dirname(dest)).isSymbolicLink()) throw Error('symlink directory prohibited');
  const expected=makeSyntheticCube();
  if(mode==='--write') {
    fs.writeFileSync(dest,expected);
    console.log('C3-R48 fixture generated: '+expected.length+' bytes');
  } else {
    if(!fs.existsSync(dest)||!fs.readFileSync(dest).equals(expected)) throw Error('C3-R48 committed test fixture differs');
    console.log('C3-R48 deterministic fixture: PASS ('+expected.length+' bytes)');
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main();
