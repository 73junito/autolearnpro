/**
 * C3-R43: only verified GLB bytes may become visible geometry.
 * Imported lazily after the R39 SHA-256 gate, never by the main catalog.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function mount(target, { verifiedBytes } = {}) {
  if (!(verifiedBytes instanceof Uint8Array)) throw Error('verified binary GLB required');
  if (!target || typeof target.appendChild !== 'function') throw Error('viewer target required');

  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(verifiedBytes).buffer, '');
  if (!gltf.scene || !gltf.scene.children.length) throw Error('verified GLB has no scene');
  const meshes = [];
  gltf.scene.traverse(node => { if (node.isMesh) meshes.push(node); });
  if (meshes.length !== 1) throw Error('synthetic GLB requires exactly one mesh');
  const mesh = meshes[0];
  if (mesh.geometry.getAttribute('position')?.count !== 3) throw Error('synthetic GLB triangle not found');

  const width = Math.max(200, Math.min(760, target.clientWidth || 480));
  const height = Math.round(width * 0.56);
  let renderer;
  let material;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.setAttribute('tabindex', '-1');
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 20);
    camera.position.set(0.5, 0.5, 3);
    camera.lookAt(0.5, 0.5, 0);
    material = new THREE.MeshBasicMaterial({ color: 0x0b4f8a, side: THREE.DoubleSide });
    const previousMaterials = mesh.material;
    mesh.material = material;
    renderer.render(gltf.scene, camera);
    target.appendChild(renderer.domElement);
    return () => {
      renderer.domElement.remove();
      mesh.material = previousMaterials;
      mesh.geometry.dispose();
      material.dispose();
      const oldMaterials = Array.isArray(previousMaterials) ? previousMaterials : [previousMaterials];
      for (const old of oldMaterials) old?.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  } catch (error) {
    renderer?.domElement?.remove();
    material?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    mesh.geometry.dispose();
    throw error;
  }
}
