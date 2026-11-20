/**
 * R46: bounded, observable lifecycle of the integrity-verified synthetic GLB.
 * No implicit asset fetch and no publication authority.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { initialCameraState, nextCameraState } from './lib/camera-controls.js';

export async function mount(target, { verifiedBytes, onContextLost = () => {},
  expectedVertices = 3, expectedTriangles = 1 } = {}) {
  if (!(verifiedBytes instanceof Uint8Array)) throw Error('verified binary GLB required');
  if (!target || typeof target.appendChild !== 'function') throw Error('viewer target required');
  if (typeof onContextLost !== 'function') throw Error('context-loss callback required');

  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(verifiedBytes).buffer, '');
  if (!gltf.scene || !gltf.scene.children.length) throw Error('verified GLB has no scene');
  const meshes = [];
  gltf.scene.traverse(node => { if (node.isMesh) meshes.push(node); });
  if (meshes.length !== 1 || meshes[0].geometry.getAttribute('position')?.count !== expectedVertices) {
    throw Error('synthetic GLB has unexpected mesh vertex count');
  }
  const geometry = meshes[0].geometry;
  const indexCount = geometry.index?.count ?? geometry.getAttribute('position').count;
  if (indexCount !== expectedTriangles * 3 || (expectedVertices === 8 && !geometry.index)) {
    throw Error('synthetic GLB has unexpected triangle count or missing index data');
  }

  const mesh = meshes[0];
  const originalMaterial = mesh.material;
  let renderer = null, material = null, observer = null, canvas = null;
  let closed = false;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
  const indexed = expectedVertices === 8 && expectedTriangles === 12;
  const center = indexed ? new THREE.Vector3(0,0,0) : new THREE.Vector3(0.5,0.5,0);
  let cameraState = initialCameraState(indexed);
  function placeCamera() {
    const az = cameraState.azimuth * Math.PI / 180;
    const el = cameraState.elevation * Math.PI / 180;
    const d = cameraState.distance;
    camera.position.set(center.x + d*Math.sin(az)*Math.cos(el),
      center.y + d*Math.sin(el),center.z + d*Math.cos(az)*Math.cos(el));
    camera.lookAt(center);
  }
  placeCamera();

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
    cleanup.control = (action) => {
      if (closed) throw Error('viewer is closed');
      cameraState = nextCameraState(cameraState, action, indexed);
      placeCamera();
      draw();
      return cameraState;
    };
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
