import * as THREE from 'three';
import { easeOutCubic } from './tween.js';

export type Effect =
  | {
      kind: 'wave';
      at: THREE.Vector3;
      color: THREE.Color;
      born: number;
      life: number;
      second: boolean;
      radius: number;
      mult: number;
    }
  | { kind: 'beam'; at: THREE.Vector3; color: THREE.Color; born: number; life: number }
  | {
      kind: 'sparks';
      at: THREE.Vector3;
      color: THREE.Color;
      born: number;
      life: number;
      count: number;
    }
  | {
      kind: 'ripple';
      at: THREE.Vector3;
      color: THREE.Color | undefined;
      born: number;
      life: number;
      size: number;
    }
  | { kind: 'ping'; at: THREE.Vector3; color: THREE.Color; born: number; life: number }
  | { kind: 'crown'; at: THREE.Vector3; color: THREE.Color; born: number; life: number };

export const EFFECT_BUDGET = 200;
export const WAVE_R = 1.4;

const waveGeometry = new THREE.PlaneGeometry(WAVE_R * 2, WAVE_R * 2);
const beamGeometry = new THREE.CylinderGeometry(0.2, 0.15, 1, 16, 1, true);
beamGeometry.translate(0, 0.5, 0);
const ringGeometry = new THREE.RingGeometry(0.8, 1, 48);
const NEUTRAL = new THREE.Color(0.8, 0.85, 1);

interface WaveUniforms extends Record<string, THREE.IUniform> {
  uColor: THREE.IUniform<THREE.Color>;
  uR1: THREE.IUniform<number>;
  uR2: THREE.IUniform<number>;
  uK: THREE.IUniform<number>;
}

export function waveMaterial(
  color: THREE.Color,
  mult: number,
): { material: THREE.ShaderMaterial; uniforms: WaveUniforms } {
  const uniforms: WaveUniforms = {
    uColor: { value: color.clone().multiplyScalar(mult) },
    uR1: { value: 0 },
    uR2: { value: -1 },
    uK: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:
      'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uR1; uniform float uR2; uniform float uK; varying vec2 vUv;
      float wave(float d, float r) {
        if (r < 0.0) return 0.0;
        float front = 1.0 - smoothstep(r - 0.03, r, d);
        float tail = smoothstep(r - 0.35, r, d);
        return front * tail * pow(max(0.0, 1.0 - r), 1.8);
      }
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a = (wave(d, uR1) + wave(d, uR2)) * (1.0 - uK);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    toneMapped: false,
  });
  return { material, uniforms };
}

interface BeamUniforms extends Record<string, THREE.IUniform> {
  uColor: THREE.IUniform<THREE.Color>;
  uOpacity: THREE.IUniform<number>;
}

export function beamMaterial(
  color: THREE.Color,
  mult: number,
): { material: THREE.ShaderMaterial; uniforms: BeamUniforms } {
  const uniforms: BeamUniforms = {
    uColor: { value: color.clone().multiplyScalar(mult) },
    uOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:
      'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 uColor; uniform float uOpacity; varying float vY; void main(){ float a = pow(1.0 - clamp(vY, 0.0, 1.0), 1.2); gl_FragColor = vec4(uColor * a * uOpacity, 1.0); }',
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return { material, uniforms };
}

export function additive(color: THREE.Color, mult: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: color.clone().multiplyScalar(mult),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
}

export { beamGeometry };

interface Live {
  effect: Effect;
  objects: THREE.Object3D[];
  tick(k: number, dt: number): void;
}

/** Short-lived light, kept as records and drawn by kind. */
export class Effects {
  private live: Live[] = [];
  private lastAt = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  get count(): number {
    return this.live.length;
  }

  add(effect: Effect): void {
    if (this.live.length >= EFFECT_BUDGET) return;
    this.live.push(this.spawn(effect));
  }

  update(now: number): void {
    const dt = this.lastAt === 0 ? 0.016 : Math.min(0.1, (now - this.lastAt) / 1000);
    this.lastAt = now;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      if (!l) continue;
      const k = (now - l.effect.born) / l.effect.life;
      if (k >= 1) {
        for (const o of l.objects) {
          this.scene.remove(o);
          if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
            (o.material as THREE.Material).dispose();
          }
        }
        this.live.splice(i, 1);
        continue;
      }
      for (const o of l.objects) o.visible = k >= 0;
      if (k >= 0) l.tick(k, dt);
    }
  }

  private spawn(effect: Effect): Live {
    switch (effect.kind) {
      case 'wave': {
        const { material, uniforms } = waveMaterial(effect.color, effect.mult);
        const mesh = new THREE.Mesh(waveGeometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(effect.at);
        this.scene.add(mesh);
        const lag = 80 / effect.life;
        const reach = effect.radius;
        return {
          effect,
          objects: [mesh],
          tick: (k) => {
            uniforms.uR1.value = easeOutCubic(Math.min(1, k / 0.83)) * reach;
            uniforms.uR2.value =
              effect.second && k > lag ? easeOutCubic(Math.min(1, (k - lag) / 0.83)) * reach : -1;
            uniforms.uK.value = k * k;
          },
        };
      }
      case 'beam': {
        const { material, uniforms } = beamMaterial(effect.color, 3);
        const mesh = new THREE.Mesh(beamGeometry, material);
        mesh.position.copy(effect.at);
        mesh.scale.set(1, 5, 1);
        this.scene.add(mesh);
        return {
          effect,
          objects: [mesh],
          tick: (k) => {
            const far = THREE.MathUtils.clamp(
              this.camera.position.distanceTo(mesh.position) / 30,
              1,
              2.2,
            );
            mesh.scale.set(1 + 0.3 * k, 5 + easeOutCubic(k), 1 + 0.3 * k);
            uniforms.uOpacity.value = Math.pow(1 - k, 2) * far;
          },
        };
      }
      case 'sparks': {
        const n = effect.count;
        const pos = new Float32Array(n * 3);
        const vel: [number, number, number][] = [];
        for (let i = 0; i < n; i++) {
          pos[i * 3] = effect.at.x;
          pos[i * 3 + 1] = effect.at.y;
          pos[i * 3 + 2] = effect.at.z;
          const a = Math.random() * Math.PI * 2;
          const r = 0.4 + Math.random() * 1.2;
          vel.push([Math.cos(a) * r, 2.5 + Math.random() * 2.5, Math.sin(a) * r]);
        }
        const geometry = new THREE.BufferGeometry();
        const attribute = new THREE.BufferAttribute(pos, 3);
        geometry.setAttribute('position', attribute);
        const material = new THREE.PointsMaterial({
          color: effect.color.clone().multiplyScalar(8),
          size: 3,
          sizeAttenuation: false,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          fog: false,
        });
        const points = new THREE.Points(geometry, material);
        this.scene.add(points);
        return {
          effect,
          objects: [points],
          tick: (k, dt) => {
            for (let i = 0; i < n; i++) {
              const v = vel[i];
              if (!v) continue;
              pos[i * 3] = (pos[i * 3] ?? 0) + v[0] * dt;
              pos[i * 3 + 1] = (pos[i * 3 + 1] ?? 0) + v[1] * dt;
              pos[i * 3 + 2] = (pos[i * 3 + 2] ?? 0) + v[2] * dt;
              v[1] -= 9 * dt;
            }
            attribute.needsUpdate = true;
            material.opacity = 1 - k * k;
          },
        };
      }
      case 'ripple': {
        const { material, uniforms } = waveMaterial(
          effect.color ?? NEUTRAL,
          effect.color ? 2 : 1.1,
        );
        const mesh = new THREE.Mesh(waveGeometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(effect.at);
        mesh.scale.setScalar(Math.max(1, effect.size / 1.4));
        this.scene.add(mesh);
        return {
          effect,
          objects: [mesh],
          tick: (k) => {
            uniforms.uR1.value = easeOutCubic(k);
            uniforms.uK.value = k * k;
          },
        };
      }
      case 'ping': {
        const material = additive(effect.color, 3, 0.8);
        const mesh = new THREE.Mesh(ringGeometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(effect.at);
        this.scene.add(mesh);
        return {
          effect,
          objects: [mesh],
          tick: (k) => {
            mesh.scale.setScalar(0.2 + 2.5 * easeOutCubic(k));
            material.opacity = 0.8 * (1 - k);
          },
        };
      }
      case 'crown': {
        const material = additive(effect.color, 4, 0.9);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), material);
        mesh.position.copy(effect.at);
        this.scene.add(mesh);
        return {
          effect,
          objects: [mesh],
          tick: (k) => {
            mesh.scale.setScalar(0.6 + k);
            material.opacity = 0.9 * (1 - k);
          },
        };
      }
    }
  }
}
