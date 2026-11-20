/**
 * R46: bounded, observable lifecycle of the integrity-verified synthetic GLB.
 * No implicit asset fetch and no publication authority.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function mount(target, { verifiedBytes, onContextLost = () => {} } = {}) {
  if (!(verifiedBytes instanceof Uint8Array)) throw Error('verified binary GLB required');
  if (!target || typeof target.appendChild !== 'function') throw Error('viewer target required');
  if (typeof onContextLost !== 'function') throw Error('context-loss callback required');

  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(verifiedBytes).buffer, '');
  if (!gltf.scene || !gltf.scene.children.length) throw Error('verified GLB has no scene');
  const meshes = [];
  gltf.scene.traverse(node => { if (node.isMesh) meshes.push(node); });
  if (meshes.length !== 1 || meshes[0].geometry.getAttribute('position')?.count !== 3) {
    throw Error('synthetic GLB must contain one three-vertex mesh');
  }

  const mesh = meshes[0];
  const originalMaterial = mesh.material;
  let renderer = null, material = null, observer = null, canvas = null;
  let closed = false;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
  camera.position.set(0.5, 0.5, 3);
  camera.lookAt(0.5, 0.5, 0);

  function dimensions() {
    const width = Math.max(200, Math.min(760, target.clientWidth || 480));
    return { width, height: Math.round(width * 0.56) };
  }
  function draw() {
    if (closed || !renderer) return;
    const { width, height } = dimensions();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.render(gltf.scene, camera);
  }
  const lost = (event) => {
    event.preventDefault(); // allows browser restoration, but require a fresh verified session
    if (closed) return;
    onContextLost();
  };
  function cleanup() {
    if (closed) return;
    closed = true;
    observer?.disconnect();
    canvas?.removeEventListener('webglcontextlost', lost);
    canvas?.remove();
    mesh.material = originalMaterial;
    mesh.geometry.dispose();
    material?.dispose();
    for (const old of (Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial])) old?.dispose?.();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: 'low-power',
      preserveDrawingBuffer: true // development-only framebuffer assertions
    });
    renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('tabindex', '-1');
    canvas.addEventListener('webglcontextlost', lost);
    material = new THREE.MeshBasicMaterial({ color: 0x0b4f8a, side: THREE.DoubleSide });
    mesh.material = material;
    target.appendChild(canvas);
    draw();
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => {
        if (closed) return;
        try { draw(); } catch { onContextLost(); }
      });
      observer.observe(target);
    }
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
