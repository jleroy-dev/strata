import * as THREE from 'three';
import { GUN } from './weapons.js';

const BOLT = new THREE.Color().setHSL(318 / 360, 1, 0.62);
const HOOK = new THREE.Color(0.62, 0.91, 1);

const BOLT_WIDTH = 0.16;
const BOLT_LENGTH = 5;
const RING_RADIUS = 0.55;
const CORE_SHARE = 0.52;
const HALO_SHARE = 1.7;
const BOLT_SPIN = Math.PI * 6;
const RING_SPIN = Math.PI * 4;

const SKIP = 3.2;
const SKIP_SHARE = 0.15;
const MIN_FLIGHT = 0.09;
const BOLTS = 24;
const RINGS = 4;

const UP = new THREE.Vector3(0, 1, 0);
const ACROSS = new THREE.Vector3(1, 0, 0);
const turnBy = new THREE.Quaternion();
const along = new THREE.Quaternion();

export type Kind = 'bolt' | 'ring';

interface Round {
  core: THREE.Mesh;
  shell: THREE.Mesh;
  halo: THREE.Mesh;
  live: boolean;
  from: THREE.Vector3;
  dir: THREE.Vector3;
  span: number;
  gone: number;
  speed: number;
  turn: number;
  land: (() => void) | undefined;
}

function litOf(colour: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colour,
    emissive: colour,
    emissiveIntensity: 0.7,
    roughness: 0.35,
    metalness: 0,
    flatShading: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
}

function coreOf(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 3.2), toneMapped: false });
}

function softTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const ramp = ctx.createRadialGradient(half, half, 0, half, half, half);
    ramp.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    ramp.addColorStop(0.3, 'rgba(255, 255, 255, 0.26)');
    ramp.addColorStop(0.65, 'rgba(255, 255, 255, 0.07)');
    ramp.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const SOFT = softTexture();

function haloOf(colour: THREE.Color): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: SOFT,
    color: colour.clone().multiplyScalar(1.7),
    toneMapped: false,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function aim(
  mesh: THREE.Mesh,
  at: THREE.Vector3,
  dir: THREE.Vector3,
  axis: THREE.Vector3,
  turn: number,
): void {
  along.setFromUnitVectors(UP, dir);
  turnBy.setFromAxisAngle(axis, turn);
  mesh.quaternion.copy(along).multiply(turnBy);
  mesh.position.copy(at);
}

export class GunFx {
  private readonly bolts: Round[] = [];
  private readonly rings: Round[] = [];
  private readonly cable: THREE.Mesh;
  private anchor: THREE.Vector3 | undefined;

  constructor(private readonly scene: THREE.Scene) {
    const spindle = new THREE.SphereGeometry(1, 6, 3);
    const hoop = new THREE.TorusGeometry(1, 0.3, 4, 12).rotateX(Math.PI / 2);
    this.stock(this.bolts, BOLTS, spindle, BOLT);
    this.stock(this.rings, RINGS, hoop, HOOK);
    this.cable = new THREE.Mesh(
      spindle,
      new THREE.MeshBasicMaterial({
        color: HOOK.clone().multiplyScalar(1.5),
        toneMapped: false,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.cable.visible = false;
    this.cable.frustumCulled = false;
    scene.add(this.cable);
  }

  private stock(
    pool: Round[],
    count: number,
    geometry: THREE.BufferGeometry,
    colour: THREE.Color,
  ): void {
    const lit = litOf(colour);
    const hot = coreOf();
    const haze = haloOf(colour);
    const quad = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < count; i++) {
      const halo = new THREE.Mesh(quad, haze);
      const shell = new THREE.Mesh(geometry, lit);
      const core = new THREE.Mesh(geometry, hot);
      halo.renderOrder = 0;
      shell.renderOrder = 2;
      core.renderOrder = 3;
      for (const mesh of [halo, shell, core]) {
        mesh.visible = false;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
      }
      pool.push({
        core,
        shell,
        halo,
        live: false,
        from: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        span: 0,
        gone: 0,
        speed: GUN.tracerSpeed,
        turn: 0,
        land: undefined,
      });
    }
  }

  fire(from: THREE.Vector3, to: THREE.Vector3, kind: Kind, land?: () => void): void {
    const pool = kind === 'ring' ? this.rings : this.bolts;
    const slot = pool.find((r) => !r.live);
    if (!slot) return;
    const dir = to.clone().sub(from);
    const span = dir.length();
    if (span < 1e-4) return;
    dir.normalize();
    const skip = Math.min(SKIP, span * SKIP_SHARE);
    slot.live = true;
    slot.from.copy(from).addScaledVector(dir, skip);
    slot.dir.copy(dir);
    slot.span = span - skip;
    slot.gone = 0;
    slot.turn = 0;
    slot.land = land;
    const top = kind === 'ring' ? GUN.grappleSpeed : GUN.tracerSpeed;
    slot.speed = Math.min(top, slot.span / MIN_FLIGHT);
    for (const mesh of [slot.core, slot.shell, slot.halo]) mesh.visible = true;
  }

  hold(anchor: THREE.Vector3): void {
    this.anchor = anchor.clone();
  }

  release(): void {
    this.anchor = undefined;
    this.cable.visible = false;
  }

  step(dt: number, camera: THREE.Camera): void {
    const eye = camera.position;
    this.carry(this.bolts, dt, 'bolt', camera);
    this.carry(this.rings, dt, 'ring', camera);
    if (!this.anchor) return;
    const span = this.anchor.clone().sub(eye);
    const length = span.length();
    if (length < 1e-3) return;
    const line = span.clone().normalize();
    aim(this.cable, eye.clone().addScaledVector(line, length / 2), line, UP, 0);
    this.cable.scale.set(0.07, length / 2, 0.07);
    this.cable.visible = true;
  }

  private carry(pool: Round[], dt: number, kind: Kind, camera: THREE.Camera): void {
    const ring = kind === 'ring';
    const axis = ring ? ACROSS : UP;
    for (const round of pool) {
      if (!round.live) continue;
      round.gone += round.speed * dt;
      round.turn += (ring ? RING_SPIN : BOLT_SPIN) * dt;
      const done = round.gone >= round.span;
      const reach = Math.min(round.gone, round.span);
      const length = ring ? RING_RADIUS * 2 : Math.min(BOLT_LENGTH, Math.max(0.4, reach));
      const at = round.from.clone().addScaledVector(round.dir, reach - length / 2);
      const half = length / 2;
      const wide = ring ? RING_RADIUS : BOLT_WIDTH;
      aim(round.shell, at, round.dir, axis, round.turn);
      aim(round.core, at, round.dir, axis, round.turn);
      round.halo.position.copy(at);
      round.halo.quaternion.copy(camera.quaternion);
      if (ring) {
        round.shell.scale.setScalar(wide);
        round.core.scale.setScalar(wide * 0.74);
        round.halo.scale.setScalar(wide * 2.6);
      } else {
        round.shell.scale.set(wide, half, wide);
        round.core.scale.set(wide * CORE_SHARE, half * CORE_SHARE, wide * CORE_SHARE);
        round.halo.scale.setScalar(BOLT_LENGTH * HALO_SHARE * 0.32);
      }
      if (!done) continue;
      round.live = false;
      for (const mesh of [round.core, round.shell, round.halo]) mesh.visible = false;
      round.land?.();
      round.land = undefined;
    }
  }

  clear(): void {
    for (const round of [...this.bolts, ...this.rings]) {
      round.live = false;
      round.land = undefined;
      for (const mesh of [round.core, round.shell, round.halo]) mesh.visible = false;
    }
    this.release();
  }

  dispose(): void {
    for (const round of [...this.bolts, ...this.rings]) {
      for (const mesh of [round.core, round.shell, round.halo]) this.scene.remove(mesh);
    }
    this.scene.remove(this.cable);
  }
}
