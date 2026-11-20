/**
 * C3-R42: framework-free orchestration. Verify R39 integrity before loading the
 * Three.js renderer. This does NOT imply R41 approval or publication authority.
 */
import { loadVerifiedCatalog } from './catalog-contract.js';
import { validateSyntheticGeometry } from './synthetic-geometry-budget.js';

export class SyntheticViewerError extends Error {
  constructor(message) { super(message); this.name = 'SyntheticViewerError'; }
}
const fail = (message) => { throw new SyntheticViewerError(message); };

export function createSyntheticViewerSession({ manifest, readAsset, loadRenderer, onFault = () => {} }) {
  if (typeof onFault !== 'function') fail('fault callback must be a function');
  if (typeof readAsset !== 'function' || typeof loadRenderer !== 'function') {
    fail('explicit reader and renderer loader required');
  }
  let state = 'idle';
  let inflight = null;
  let stop = null;
  const report = () => state;
  function fault(reason) {
    if (state === 'disposed' || state === 'error') return;
    state = 'error';
    const release = stop;
    stop = null;
    try { release?.(); } finally { onFault(reason); }
  }
  async function start(target) {
    if (state === 'disposed') fail('viewer session disposed');
    if (state === 'ready') return;
    if (inflight) return inflight;
    if (state === 'error') fail('failed viewer requires a new session');
    state = 'verifying';
    inflight = (async () => {
      let verifiedBytes = null;
      const verified = await loadVerifiedCatalog(manifest, { readAsset: async (path) => {
        const raw = await readAsset(path);
        if (!(raw instanceof Uint8Array) && !(raw instanceof ArrayBuffer)) fail('binary asset required');
        verifiedBytes = Uint8Array.from(raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw);
        return verifiedBytes;
      } });
      if (verified.records.length !== 1 || verified.assets.length !== 1 ||
          verified.records[0].id !== 'demo-triangle' ||
          verified.assets[0].id !== 'demo-triangle' ||
          verified.assets[0].path !== 'assets/demonstration/demo-triangle.glb') {
        fail('only the fixed synthetic triangle is supported');
      }
      if (state === 'disposed') return;
      // R48: SHA-256/size are necessary but insufficient: verify GLB structure,
      // vertex/index bounds and geometry budget before importing Three.js.
      const geometry = validateSyntheticGeometry(verifiedBytes);
      if (geometry.vertexCount !== 3 || geometry.triangleCount !== 1) {
        fail('viewer demo only permits the approved synthetic triangle shape');
      }
      state = 'loading';
      const renderer = await loadRenderer();
      if (state === 'disposed') return;
      if (typeof renderer?.mount !== 'function') fail('renderer module missing mount');
      const teardown = await renderer.mount(target, {
        record: verified.records[0], verifiedBytes,
        onContextLost: () => fault('WebGL context lost')
      });
      if (typeof teardown !== 'function') fail('renderer requires cleanup function');
      if (state === 'disposed') { teardown(); return; }
      if (state === 'error') { teardown(); return; }
      stop = teardown;
      state = 'ready';
    })().catch((error) => {
      if (state !== 'disposed') state = 'error';
      throw error;
    }).finally(() => { inflight = null; });
    return inflight;
  }
  function dispose() {
    if (state === 'disposed') return;
    state = 'disposed';
    const release = stop;
    stop = null;
    if (release) release();
  }
  return Object.freeze({ start, dispose, get status() { return report(); } });
}
