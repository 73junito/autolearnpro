// C3-R40: deterministic, source-only, synthetic glTF generation; no publication.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateCatalogManifest } from '../../apps/catalog/src/lib/catalog-contract.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const input = path.join(root, 'apps/catalog/fixtures/demo-triangle.json');
const out = path.join(root, 'apps/catalog/sample');
const paths = Object.freeze({
  glb: path.join(out, 'assets/demonstration/demo-triangle.glb'),
  manifest: path.join(out, 'catalog-manifest.json'),
  provenance: path.join(out, 'build-provenance.json')
});
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
const jsonBytes = (data) => Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8');
const fail = (message) => { throw Error('C3-R40: ' + message); };
const chunk = (data, type, pad) => {
  const added = (4 - data.length % 4) % 4;
  const buffer = Buffer.concat([data, Buffer.alloc(added, pad)]);
  const header = Buffer.alloc(8);
  header.writeUInt32LE(buffer.length, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, buffer]);
};
function makeGlb() {
  const vertex = Buffer.alloc(36);
  [0,0,0,1,0,0,0,1,0].forEach((n, i) => vertex.writeFloatLE(n, i * 4));
  const gltf = {
    asset: { version: '2.0', generator: 'ALP synthetic C3-R40' },
    scene: 0, scenes: [{nodes:[0]}], nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0},mode:4}]}],
    buffers:[{byteLength:36}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]
  };
  const body = Buffer.concat([
    chunk(Buffer.from(JSON.stringify(gltf)), 0x4e4f534a, 0x20),
    chunk(vertex, 0x004e4942, 0)
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(body.length + 12, 8);
  return Buffer.concat([header, body]);
}
export function generateSample(sourceBytes) {
  const source = JSON.parse(Buffer.from(sourceBytes).toString('utf8'));
  if (JSON.stringify(source) !== JSON.stringify({
    fixtureVersion:1,id:'demo-triangle',title:'Synthetic triangle demonstration',
    positions:[[0,0,0],[1,0,0],[0,1,0]]
  })) fail('fixture content is unreviewed');
  const glb = makeGlb();
  const manifest = {
    schemaVersion:1,
    records:[{id:'demo-triangle',title:source.title,assetId:'demo-triangle'}],
    assets:[{id:'demo-triangle',path:'assets/demonstration/demo-triangle.glb',
      sha256:hash(glb),byteLength:glb.length,mimeType:'model/gltf-binary'}]
  };
  validateCatalogManifest(manifest);
  const manifestBytes = jsonBytes(manifest);
  return {
    glb, manifest:manifestBytes,
    provenance:jsonBytes({
      evidenceVersion:1,
      status:'unsigned-synthetic-no-publication-authority',
      generator:'infrastructure/scripts/c3-build-sample.mjs',
      generatorSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
      source:'apps/catalog/fixtures/demo-triangle.json',
      sourceSha256:hash(sourceBytes),
      artifacts:[
        {path:'apps/catalog/sample/assets/demonstration/demo-triangle.glb',sha256:hash(glb),byteLength:glb.length},
        {path:'apps/catalog/sample/catalog-manifest.json',sha256:hash(manifestBytes),byteLength:manifestBytes.length}
      ]
    })
  };
}
export function matchOutputs(expected, reader) {
  return Object.entries(expected).every(([key,bytes]) => {
    const actual = reader(key);
    return Buffer.isBuffer(actual) && actual.equals(bytes);
  });
}
function main() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !['--write','--check'].includes(mode)) fail('expected --write or --check');
  for (const target of [out,path.dirname(paths.glb),...Object.values(paths)]) {
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) fail('symlinks prohibited');
  }
  const expected = generateSample(fs.readFileSync(input));
  if (mode === '--write') {
    fs.mkdirSync(path.dirname(paths.glb),{recursive:true});
    for(const [key,bytes] of Object.entries(expected)) fs.writeFileSync(paths[key],bytes);
  }
  const good = matchOutputs(expected, (key) => {
    try { return fs.readFileSync(paths[key]); } catch { return null; }
  });
  if(!good) fail('missing or drifted output; regenerate for review');
  process.stdout.write('C3-R40 reproducibility: PASS\n');
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
