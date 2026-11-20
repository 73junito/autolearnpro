/**
 * C3-R49 independent synthetic-indexed-cube DEVELOPMENT TEST session.
 * No production/publication authority. Never accepts dynamic manifests or URLs.
 */
import { loadVerifiedCatalog } from './catalog-contract.js';
import { validateSyntheticGeometry } from './synthetic-geometry-budget.js';

export const CUBE_SHA256 = 'e5c7080d1da823e8697df830f09593da8297924368b7db3438e8e74d7e0d825d';
export const CUBE_PATH = 'assets/complexity/c3-r48-synthetic-cube.glb';
const manifest = Object.freeze({
  schemaVersion:1,
  records:[{id:'synthetic-indexed-cube', title:'Synthetic indexed cube development test',assetId:'synthetic-indexed-cube'}],
  assets:[{id:'synthetic-indexed-cube',path:CUBE_PATH,sha256:CUBE_SHA256,byteLength:748,mimeType:'model/gltf-binary'}]
});
export function createIndexedCubeSession({ readAsset, loadRenderer, onFault=()=>{} }) {
  if (typeof readAsset !== 'function' || typeof loadRenderer !== 'function' || typeof onFault !== 'function') {
    throw Error('explicit asset reader, lazy renderer and fault handler required');
  }
  let status='idle', cleanup=null, pending=null;
  const fail=(error) => { if(status!=='disposed') status='error'; throw error; };
  const fault=()=>{
    if(status==='disposed'||status==='error') return;
    status='error';
    const stop=cleanup; cleanup=null;
    try { stop?.(); } finally { onFault('WebGL context lost'); }
  };
  async function start(target) {
    if(status!=='idle') throw Error('create a fresh indexed-cube session');
    if(pending) return pending;
    status='verifying';
    pending=(async()=>{
      let bytes=null;
      const result=await loadVerifiedCatalog(manifest, {
        readAsset:async(path)=>{
          if(path!==CUBE_PATH) throw Error('unapproved cube asset path');
          const value=await readAsset(path);
          if(!(value instanceof ArrayBuffer || value instanceof Uint8Array)) throw Error('binary cube asset required');
          bytes=Uint8Array.from(value instanceof ArrayBuffer?new Uint8Array(value):value);
          return bytes;
        }
      });
      if(status==='disposed') return;
      if(result.assets.length!==1 || result.records[0]?.id!=='synthetic-indexed-cube') throw Error('unapproved cube manifest');
      const geometry=validateSyntheticGeometry(bytes);
      if(geometry.vertexCount!==8||geometry.indexCount!==36||geometry.triangleCount!==12) {
        throw Error('wrong indexed cube shape');
      }
      status='loading';
      const renderer=await loadRenderer();
      if(status==='disposed') return;
      if(typeof renderer?.mount!=='function') throw Error('render module missing');
      const release=await renderer.mount(target,{
        verifiedBytes:bytes,
        expectedVertices:8,expectedTriangles:12,
        onContextLost:fault
      });
      if(typeof release!=='function') throw Error('cleanup missing');
      if(status==='disposed'||status==='error'){release();return;}
      cleanup=release; status='ready';
    })().catch(fail).finally(()=>{pending=null;});
    return pending;
  }
  function dispose() {
    if(status==='disposed') return;
    status='disposed';
    const stop=cleanup;cleanup=null;stop?.();
  }
  return Object.freeze({start,dispose,get status(){return status;}});
}
