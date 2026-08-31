import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { keyLightAt } from './light.js';
import { BACKGROUND, BLOOM, EXPOSURE, HAZE } from './theme.js';

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dom: HTMLCanvasElement;
  fog(distance: number, span: number): void;
  render(now: number): void;
  pixelsPerUnit(at: THREE.Vector3): number;
  size(): { width: number; height: number };
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
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
    0.5,
    9000,
  );

  scene.add(new THREE.HemisphereLight(0xb9c4d8, 0x4a3f38, 0.5));
  const key = new THREE.DirectionalLight(0xffd9b0, 1.9);
  const fill = new THREE.DirectionalLight(0x8fb0ff, 0.4);
  fill.position.set(24, 14, -20);
  scene.add(fill);
  scene.add(key);

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
    fog(distance, span) {
      fog.near = distance + span * 0.6;
      fog.far = distance + span * 3.5;
    },
    render(now) {
      const at = keyLightAt(now);
      key.position.set(at.x, at.y, at.z);
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
