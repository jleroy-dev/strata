import * as THREE from 'three';

export const ELEVATION = (38 * Math.PI) / 180;
export const YAW = (15 * Math.PI) / 180;

const UP = new THREE.Vector3(0, 1, 0);

export interface Lens {
  fov: number;
  aspect: number;
}

export interface Framing {
  /** Points that must be in frame, world units. */
  corners: THREE.Vector3[];
  target: THREE.Vector3;
  up: THREE.Vector3;
  bias?: THREE.Vector3;
}

export interface Framed {
  target: THREE.Vector3;
  distance: number;
  up: THREE.Vector3;
}

const local = (): THREE.Vector3 =>
  new THREE.Vector3(
    Math.cos(ELEVATION) * Math.sin(YAW),
    Math.sin(ELEVATION),
    Math.cos(ELEVATION) * Math.cos(YAW),
  );

/** The resting eye direction, stood on `up` instead of the world's y. */
export function direction(up: THREE.Vector3): THREE.Vector3 {
  return local().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, up));
}

/** The nearest stand that holds every corner inside the frame, with a margin on each axis. */
export function fit(framing: Framing, marginX: number, marginY: number, lens: Lens): Framed {
  const { corners, up } = framing;
  const target = framing.target.clone();
  const dir = direction(up);
  const probe = new THREE.PerspectiveCamera(lens.fov, lens.aspect, 0.5, 9000);
  probe.up.copy(up);
  probe.updateProjectionMatrix();
  const aim = (t: THREE.Vector3, d: number): void => {
    probe.position.copy(t).add(dir.clone().multiplyScalar(d));
    probe.lookAt(t);
    probe.updateMatrixWorld();
  };
  const bounds = (): { minX: number; maxX: number; minY: number; maxY: number } => {
    let minX = 1;
    let maxX = -1;
    let minY = 1;
    let maxY = -1;
    for (const c of corners) {
      const q = c.clone().project(probe);
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
    return { minX, maxX, minY, maxY };
  };
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const screenUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  let span = 0;
  for (const c of corners) span = Math.max(span, c.distanceTo(target));
  span = Math.max(span * 2, 0.5);
  let distance = span * 3;
  const tanHalf = Math.tan((lens.fov * Math.PI) / 360);
  for (let pass = 0; pass < 3; pass++) {
    aim(target, distance);
    const bb = bounds();
    target.add(
      right.clone().multiplyScalar(((bb.minX + bb.maxX) / 2) * tanHalf * lens.aspect * distance),
    );
    target.add(screenUp.clone().multiplyScalar(((bb.minY + bb.maxY) / 2) * tanHalf * distance));
    let lo = span * 0.05;
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
  return { target, distance, up: up.clone() };
}

/** The corners of a box round a patch of ground, which is what Overview frames. */
export function patchCorners(
  centre: THREE.Vector3,
  radius: number,
  height: number,
): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const x of [-radius, radius])
    for (const y of [-height, height])
      for (const z of [-radius, radius])
        out.push(new THREE.Vector3(centre.x + x, centre.y + y, centre.z + z));
  return out;
}
