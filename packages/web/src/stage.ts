import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Extent } from '@strata/core';
import { BACKGROUND, BLOOM, EXPOSURE, GRID, GROUND, HAZE, U } from './theme.js';

const LIGHT_DRIFT_MS = 10 * 60_000;

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dom: HTMLCanvasElement;
  world(x: number, z: number): THREE.Vector3;
  cell(p: THREE.Vector3): { x: number; z: number };
  setExtent(extent: Extent): void;
  fog(distance: number, span: number): void;
  render(now: number): void;
  pixelsPerUnit(at: THREE.Vector3): number;
  size(): { width: number; height: number };
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const camera = new THREE.PerspectiveCamera(
    30,
    container.clientWidth / container.clientHeight,
    0.1,
    4000,
  );

  scene.add(new THREE.HemisphereLight(0xb9c4d8, 0x4a3f38, 0.8));
  const key = new THREE.DirectionalLight(0xffd9b0, 1.7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  const fill = new THREE.DirectionalLight(0x8fb0ff, 0.5);
  fill.position.set(24, 14, -20);
  scene.add(fill);
  scene.add(key);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ color: GROUND, roughness: 0.85, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(400, 400, GRID, GRID);
  grid.position.y = -0.29;
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.35;
  scene.add(grid);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      BLOOM.strength,
      BLOOM.radius,
      BLOOM.threshold,
    ),
  );
  composer.addPass(new OutputPass());
  composer.addPass(new SMAAPass());

  let extent: Extent = { w: 0, h: 0 };
  const fog = new THREE.Fog(HAZE, 100, 400);
  scene.fog = fog;

  const resize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  };
  window.addEventListener('resize', resize);

  return {
    scene,
    camera,
    dom: renderer.domElement,
    world: (x, z) => new THREE.Vector3((x - extent.w / 2) * U, 0, (z - extent.h / 2) * U),
    cell: (p) => ({ x: Math.floor(p.x / U + extent.w / 2), z: Math.floor(p.z / U + extent.h / 2) }),
    setExtent(next) {
      extent = next;
      const reach = Math.max(extent.w, extent.h, 8) * U * 0.6;
      const c = key.shadow.camera;
      c.left = c.bottom = -reach;
      c.right = c.top = reach;
      c.far = 4 * reach;
      c.updateProjectionMatrix();
    },
    fog(distance, span) {
      fog.near = distance + span * 0.6;
      fog.far = distance + span * 3.5;
    },
    render(now) {
      const drift = ((now % LIGHT_DRIFT_MS) / LIGHT_DRIFT_MS) * Math.PI * 2;
      const reach = Math.max(extent.w, extent.h, 8) * U * 0.6;
      const a = 0.25 * Math.sin(drift);
      key.position.set((-0.6 + a) * reach, 0.8 * reach, (0.4 + a * 0.5) * reach);
      composer.render();
    },
    size: () => ({ width: container.clientWidth, height: container.clientHeight }),
    pixelsPerUnit(at) {
      const distance = camera.position.distanceTo(at);
      const vfov = (camera.fov * Math.PI) / 180;
      return container.clientHeight / (2 * Math.tan(vfov / 2) * distance);
    },
  };
}
