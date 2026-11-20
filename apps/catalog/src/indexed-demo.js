/** C3-R49 isolated, non-published indexed cube demo. */
import cubeAsset from '../../../tests/fixtures/c3-r48-synthetic-cube.glb?url';
import {createIndexedCubeSession, CUBE_PATH} from './lib/indexed-cube-session.js';
import {bindCameraControls} from './lib/bind-camera-controls.js';
const start=document.getElementById('indexed-start');
const stop=document.getElementById('indexed-stop');
const status=document.getElementById('indexed-status');
const target=document.getElementById('indexed-surface');
let session=null;
const announce=message=>{status.textContent=message;};
const cameraControls=bindCameraControls(document.getElementById('indexed-camera-controls'),()=>session,announce);
function newSession(){
  return createIndexedCubeSession({
    readAsset:async(path)=>{
      if(path!==CUBE_PATH) throw Error('not the fixed indexed test fixture');
      const url=new URL(cubeAsset,document.baseURI);
      if(url.origin!==location.origin) throw Error('cross-origin asset prohibited');
      const response=await fetch(url,{mode:'same-origin',credentials:'omit',cache:'no-store'});
      if(!response.ok) throw Error('indexed fixture unavailable');
      return new Uint8Array(await response.arrayBuffer());
    },
    loadRenderer:()=>import('./viewer-engine.js'),
    onFault:()=>{
      if(session?.status!=='error') return;
      session.dispose(); session=null;
      stop.disabled=true; cameraControls.disable(); start.disabled=false;
      announce('Indexed cube WebGL context lost. Reverify to retry.');
      start.focus();
    }
  });
}
start.addEventListener('click',async()=>{
  if(start.disabled) return;
  start.disabled=true;
  announce('Verifying development-only cube geometry and SHA-256…');
  const current=newSession();session=current;
  try {
    await current.start(target);
    if(session!==current) return;
    stop.disabled=false; cameraControls.enable();
    announce('Indexed cube rendered — synthetic development test only.');
  } catch {
    if(session!==current) return;
    current.dispose();session=null;start.disabled=false;cameraControls.disable();
    announce('Indexed cube unavailable: integrity, geometry, or WebGL validation failed.');
  }
});
stop.addEventListener('click',()=>{
  session?.dispose();session=null;
  stop.disabled=true;cameraControls.disable();start.disabled=false;
  announce('Indexed cube viewer closed. No catalog asset published.');
  start.focus();
});
window.addEventListener('pagehide',()=>session?.dispose(),{once:true});
