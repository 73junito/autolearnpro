/**
 * C3-R48 pure, fail-closed GLB 2.0 geometry admission for synthetic test assets.
 * Validate a bounded single-triangle-mesh payload BEFORE giving bytes to Three.js.
 * This does not grant publication, model authenticity, or production approval.
 */
export class GeometryBudgetError extends Error {
  constructor(message) { super(message); this.name = 'GeometryBudgetError'; }
}
const fail = (message) => { throw new GeometryBudgetError(message); };
export const SYNTHETIC_GEOMETRY_LIMITS = Object.freeze({
  maxAssetBytes: 64 * 1024, maxVertices: 128, maxTriangles: 256,
  maxIndices: 768, maxPrimitives: 1
});
function assertInteger(n, lower, upper, label) {
  if (!Number.isSafeInteger(n) || n < lower || n > upper) fail(label + ': outside budget');
  return n;
}
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function fields(obj, allowed, label) {
  if (!isObject(obj) || Object.keys(obj).some(k => !allowed.includes(k))) fail(label + ': invalid or unsupported properties');
}
function range(view, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      offset < 0 || length < 0 || offset > view.length || length > view.length - offset) fail(label + ': out-of-bounds');
  return view.subarray(offset, offset + length);
}
function sliceBytes(raw) {
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (raw instanceof Uint8Array) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  fail('binary GLB required');
}
export function validateSyntheticGeometry(raw) {
  const bytes = sliceBytes(raw);
  if (bytes.length > SYNTHETIC_GEOMETRY_LIMITS.maxAssetBytes || bytes.length < 28) fail('GLB byte budget exceeded or truncated');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2 ||
      dv.getUint32(8, true) !== bytes.length) fail('invalid GLB header/declared length');
  let offset = 12;
  const chunks = [];
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) fail('truncated GLB chunk header');
    const n = dv.getUint32(offset,true), type = dv.getUint32(offset+4,true);
    offset += 8;
    if (n % 4 !== 0 || n > bytes.length - offset) fail('invalid GLB chunk length');
    chunks.push({type, content:range(bytes,offset,n,'chunk')});
    offset += n;
    if (chunks.length > 2) fail('too many GLB chunks');
  }
  if (chunks.length !== 2 || chunks[0].type !== 0x4e4f534a || chunks[1].type !== 0x004e4942) {
    fail('exact JSON and BIN chunks required');
  }
  const decoder = new TextDecoder('utf-8',{fatal:true});
  let gltf;
  try { gltf = JSON.parse(decoder.decode(chunks[0].content).replace(/[ ]+$/,'')); }
  catch { fail('invalid glTF JSON'); }
  fields(gltf,['asset','scene','scenes','nodes','meshes','buffers','bufferViews','accessors'], 'root');
  fields(gltf.asset,['version','generator'], 'asset');
  if (gltf.asset.version !== '2.0' || gltf.scene !== 0 ||
      !Array.isArray(gltf.scenes) || gltf.scenes.length !== 1 ||
      !Array.isArray(gltf.nodes) || gltf.nodes.length !== 1 ||
      !Array.isArray(gltf.meshes) || gltf.meshes.length !== 1 ||
      !Array.isArray(gltf.buffers) || gltf.buffers.length !== 1 ||
      !Array.isArray(gltf.bufferViews) || gltf.bufferViews.length < 1 || gltf.bufferViews.length > 2 ||
      !Array.isArray(gltf.accessors) || gltf.accessors.length < 1 || gltf.accessors.length > 2) {
    fail('unsupported synthetic GLB structure');
  }
  fields(gltf.scenes[0],['nodes'],'scene');
  if (JSON.stringify(gltf.scenes[0].nodes) !== '[0]') fail('unexpected scene node graph');
  fields(gltf.nodes[0],['mesh'],'node');
  if (gltf.nodes[0].mesh !== 0) fail('unexpected mesh reference');
  fields(gltf.buffers[0],['byteLength'],'buffer');
  const bin = chunks[1].content;
  const declared = assertInteger(gltf.buffers[0].byteLength,1,bytes.length,'binary buffer length');
  if (declared > bin.length || bin.length - declared > 3) fail('binary padding discrepancy');
  fields(gltf.meshes[0],['primitives'],'mesh');
  const prims = gltf.meshes[0].primitives;
  if (!Array.isArray(prims) || prims.length !== 1) fail('primitive budget exceeded');
  const primitive=prims[0];
  fields(primitive,['attributes','indices','mode'],'primitive');
  fields(primitive.attributes,['POSITION'],'primitive.attributes');
  if (primitive.mode !== 4 || primitive.attributes.POSITION !== 0) fail('only triangle POSITION primitive supported');
  const views=gltf.bufferViews.map((v) => {
    fields(v,['buffer','byteOffset','byteLength','target'],'bufferView');
    if (v.buffer !== 0 || ![34962,34963].includes(v.target)) fail('unsupported bufferView');
    const off=assertInteger(v.byteOffset ?? 0,0,declared,'bufferView offset');
    const len=assertInteger(v.byteLength,1,declared,'bufferView length');
    if (off + len > declared) fail('bufferView exceeds declared binary');
    return {offset:off,length:len,target:v.target};
  });
  const pos=gltf.accessors[0];
  fields(pos,['bufferView','componentType','count','type','min','max'],'position accessor');
  const vertices=assertInteger(pos.count,3,SYNTHETIC_GEOMETRY_LIMITS.maxVertices,'vertex count');
  if (pos.bufferView !== 0 || pos.componentType !== 5126 || pos.type !== 'VEC3' ||
      !Array.isArray(pos.min) || !Array.isArray(pos.max) ||
      pos.min.length !== 3 || pos.max.length !== 3 ||
      views[0].target !== 34962 || views[0].length !== vertices*12) fail('unsupported position encoding');
  for (const bound of [...pos.min,...pos.max]) if (!Number.isFinite(bound)) fail('nonfinite bounds');
  for(let k=0;k<3;k++) if(pos.min[k]>pos.max[k]) fail('inverted position bounds');
  if (views[0].offset % 4) fail('misaligned positions');
  if (views.length === 2 && views[0].offset < views[1].offset + views[1].length &&
      views[1].offset < views[0].offset + views[0].length) fail('overlapping vertex and index regions');
  const positions=[];
  for (let i=0;i<vertices*3;i++) {
    const v=dv.getFloat32(20 + chunks[0].content.length + 8 + views[0].offset + i*4,true);
    if (!Number.isFinite(v) || Math.abs(v)>1000) fail('nonfinite or unbounded coordinates');
    positions.push(v);
  }
  for(let axis=0;axis<3;axis++) {
    const coords=[];
    for(let i=axis;i<positions.length;i+=3) coords.push(positions[i]);
    if(Math.min(...coords)!==pos.min[axis] || Math.max(...coords)!==pos.max[axis]) {
      fail('declared position bounds mismatch actual geometry');
    }
  }
  let triangles, indices;
  const triangleIndices=[];
  if (primitive.indices === undefined) {
    if (gltf.accessors.length !== 1 || views.length !== 1 || vertices%3) fail('invalid non-indexed geometry');
    triangles=vertices/3; indices=vertices;
    for(let i=0;i<vertices;i++) triangleIndices.push(i);
  } else {
    if (primitive.indices !== 1 || gltf.accessors.length !== 2 || views.length !== 2) fail('invalid index accessor');
    const idx=gltf.accessors[1];
    fields(idx,['bufferView','componentType','count','type'],'index accessor');
    indices=assertInteger(idx.count,3,SYNTHETIC_GEOMETRY_LIMITS.maxIndices,'index count');
    if (idx.bufferView!==1 || idx.componentType!==5123 || idx.type!=='SCALAR' ||
        views[1].target!==34963 || indices%3 || views[1].length !== indices*2 ||
        views[1].offset%2) fail('unsupported index buffer');
    const binOffset=20 + chunks[0].content.length + 8 + views[1].offset;
    for(let i=0;i<indices;i++) {
      const index=dv.getUint16(binOffset + i*2,true);
      if(index>=vertices) fail('index out of vertex range');
      triangleIndices.push(index);
    }
    triangles=indices/3;
  }
  assertInteger(triangles,1,SYNTHETIC_GEOMETRY_LIMITS.maxTriangles,'triangle count');
  // R49: a face with repeated vertices or near-zero surface area cannot
  // masquerade as a valid indexed triangle in the synthetic test profile.
  for(let i=0;i<triangleIndices.length;i+=3) {
    const a=triangleIndices[i],b=triangleIndices[i+1],c=triangleIndices[i+2];
    if(a===b||a===c||b===c) fail('degenerate repeated triangle index');
    const ab=[0,1,2].map(k=>positions[b*3+k]-positions[a*3+k]);
    const ac=[0,1,2].map(k=>positions[c*3+k]-positions[a*3+k]);
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    if(cross.reduce((sum,n)=>sum+n*n,0)<=1e-12) fail('zero-area or degenerate triangle');
  }
  return Object.freeze({byteLength:bytes.length,vertexCount:vertices,triangleCount:triangles,indexCount:indices,primitiveCount:1});
}
