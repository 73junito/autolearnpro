/**
 * C3-R42 local demo entry. Only this entry touches the DOM.
 * The sample is verified by R39 before the Three.js engine is imported.
 * No R41 signing authority or production release is asserted.
 */
import manifestText from '../sample/catalog-manifest.json?raw';
import assetUrl from '../sample/assets/demonstration/demo-triangle.glb?url';
import { createSyntheticViewerSession } from './lib/synthetic-viewer-session.js';

const start = document.getElementById('viewer-start');
const close = document.getElementById('viewer-stop');
const status = document.getElementById('viewer-status');
const surface = document.getElementById('viewer-surface');

const parsed = JSON.parse(manifestText);
let session = null;
let active = false;
function announce(message) { status.textContent = message; }
function newSession() {
  return createSyntheticViewerSession({
    manifest: parsed,
    readAsset: async path => {
      if (path !== 'assets/demonstration/demo-triangle.glb') throw Error('asset outside synthetic allowlist');
      const url = new URL(assetUrl, document.baseURI);
      if (url.origin !== location.origin) throw Error('cross-origin asset refused');
      const response = await fetch(url, { mode: 'same-origin', credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw Error('local synthetic asset unavailable');
      return new Uint8Array(await response.arrayBuffer());
    },
    loadRenderer: () => import('./viewer-engine.js'),
    onFault: () => {
      if (session?.status !== 'error') return;
      session.dispose();
      session = null;
      close.disabled = true;
      start.disabled = false;
      announce('WebGL context lost. Viewer closed; verify the synthetic asset again to retry.');
      start.focus();
    }
  });
}
start.addEventListener('click', async () => {
  if (active) return;
  active = true;
  start.disabled = true;
  announce('Verifying synthetic asset integrity…');
  const current = newSession();
  session = current;
  try {
    await current.start(surface);
    if (session !== current) return;
    close.disabled = false;
    announce('Synthetic triangle rendered. Development demonstration only; no publication approval.');
  } catch {
    if (session === current) {
      current.dispose();
      session = null;
      start.disabled = false;
      announce('Viewer unavailable: integrity, loading, or WebGL verification failed. Nothing was displayed.');
    }
  } finally { active = false; }
});
close.addEventListener('click', () => {
  session?.dispose();
  session = null;
  close.disabled = true;
  start.disabled = false;
  announce('Viewer closed. No catalog data is published.');
  start.focus();
});
window.addEventListener('pagehide', () => session?.dispose(), { once: true });
