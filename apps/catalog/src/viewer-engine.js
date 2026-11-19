/**
 * C3-R42 renderer: lazy imported ONLY after manifest integrity verification.
 * Fixed synthetic triangle geometry, no user-provided code or remote models.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function mount(target, { verifiedBytes } = {}) {
  if (!(verifiedBytes instanceof Uint8Array)) throw Error('verified binary GLB required');
  const gltf = await new GLTFLoader().parseAsync(verifiedBytes.slice().buffer, '');
  if (!gltf.scene) throw Error('synthetic GLB has no scene');
  if (!target || typeof target.appendChild !== 'function') throw Error('viewer target required');
  const width = Math.max(200, Math.min(760, target.clientWidth || 480));
  const height = Math.round(width * 0.56);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.setAttribute('tabindex', '-1');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 20);
  camera.position.set(0.5, 0.5, 3);
  camera.lookAt(0.5, 0.5, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0], 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ color: 0x0b4f8a, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  target.appendChild(renderer.domElement);
  renderer.render(scene, camera);
  return () => {
    renderer.domElement.remove();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
