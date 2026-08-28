import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Extent, Rect } from '@strata/core';
import { U } from './theme.js';

export const ELEVATION = (38 * Math.PI) / 180;
export const YAW = (15 * Math.PI) / 180;

export interface Pose {
  target: THREE.Vector3;
  distance: number;
}

export interface Framing {
  rect: Rect;
  top: number;
  bias?: THREE.Vector3;
}

const direction = (): THREE.Vector3 =>
  new THREE.Vector3(
    Math.cos(ELEVATION) * Math.sin(YAW),
    Math.sin(ELEVATION),
    Math.cos(ELEVATION) * Math.cos(YAW),
  );

/** Owns the camera: a desired pose eased into, or OrbitControls when the user has it. */
export class CameraRig {
  readonly controls: OrbitControls;
  private readonly probe: THREE.PerspectiveCamera;
  private desired: Pose;
  private free = false;
  private lastAt = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    private readonly world: (x: number, z: number) => THREE.Vector3,
  ) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 4000;
    this.probe = camera.clone();
    this.desired = { target: new THREE.Vector3(0, 0.5, 0), distance: 60 };
  }

  overview(extent: Extent): Pose {
    return this.fit({ rect: { x: 0, z: 0, w: extent.w, h: extent.h }, top: 5 }, 0.94, 0.9);
  }

  district(framing: Framing): Pose {
    const pose = this.fit(framing, 0.82, 0.82);
    if (framing.bias) pose.target.lerp(framing.bias, 0.2);
    return pose;
  }

  /** Eases towards `pose`; with no pose the user has the controls. */
  update(pose: Pose | undefined, now: number): void {
    const dt = this.lastAt === 0 ? 16 : Math.min(100, now - this.lastAt);
    this.lastAt = now;
    if (!pose) {
      if (!this.free) {
        this.free = true;
        this.controls.target.copy(this.desired.target);
      }
      this.controls.update();
      return;
    }
    this.free = false;
    this.desired = pose;
    const k = 1 - Math.pow(0.03, dt / 1000);
    this.controls.target.lerp(pose.target, k);
    const position = pose.target.clone().add(direction().multiplyScalar(pose.distance));
    this.camera.position.lerp(position, k);
    this.camera.lookAt(this.controls.target);
  }

  snap(pose: Pose): void {
    this.desired = pose;
    this.controls.target.copy(pose.target);
    this.camera.position.copy(pose.target).add(direction().multiplyScalar(pose.distance));
    this.camera.lookAt(pose.target);
  }

  distance(): number {
    return this.camera.position.distanceTo(this.controls.target);
  }

  private fit(framing: Framing, marginX: number, marginY: number): Pose {
    const { rect, top } = framing;
    const a = this.world(rect.x - 0.8, rect.z - 0.8);
    const b = this.world(rect.x + rect.w + 0.8, rect.z + rect.h + 0.8);
    const corners: THREE.Vector3[] = [];
    for (const x of [a.x, b.x])
      for (const z of [a.z, b.z])
        for (const y of [0, top]) corners.push(new THREE.Vector3(x, y, z));
    const target = this.world(rect.x + rect.w / 2, rect.z + rect.h / 2).setY(0.5);
    this.probe.aspect = this.camera.aspect;
    this.probe.fov = this.camera.fov;
    this.probe.updateProjectionMatrix();
    const aim = (t: THREE.Vector3, d: number): void => {
      this.probe.position.copy(t).add(direction().multiplyScalar(d));
      this.probe.lookAt(t);
      this.probe.updateMatrixWorld();
    };
    const bounds = (): { minX: number; maxX: number; minY: number; maxY: number } => {
      let minX = 1;
      let maxX = -1;
      let minY = 1;
      let maxY = -1;
      for (const c of corners) {
        const q = c.clone().project(this.probe);
        minX = Math.min(minX, q.x);
        maxX = Math.max(maxX, q.x);
        minY = Math.min(minY, q.y);
        maxY = Math.max(maxY, q.y);
      }
      return { minX, maxX, minY, maxY };
    };
    const forward = direction().negate();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const span = Math.max(rect.w, rect.h, 4) * U;
    let distance = span * 3;
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);
    for (let pass = 0; pass < 3; pass++) {
      aim(target, distance);
      const bb = bounds();
      target.add(
        right
          .clone()
          .multiplyScalar(((bb.minX + bb.maxX) / 2) * tanHalf * this.camera.aspect * distance),
      );
      target.add(up.clone().multiplyScalar(((bb.minY + bb.maxY) / 2) * tanHalf * distance));
      let lo = 2;
      let hi = span * 12;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        aim(target, mid);
        const q = bounds();
        if (Math.max(-q.minX, q.maxX) < marginX && Math.max(-q.minY, q.maxY) < marginY) hi = mid;
        else lo = mid;
      }
      distance = hi;
    }
    return { target, distance };
  }
}
