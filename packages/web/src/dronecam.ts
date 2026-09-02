import * as THREE from 'three';
import type { Drone } from './drone.js';
import type { Trim } from './weapons.js';
import type { Surface } from './surface.js';

const STEP = 0.05;

const basis = new THREE.Matrix4();
const frame = new THREE.Quaternion();
const yaw = new THREE.Quaternion();
const pitch = new THREE.Quaternion();
const roll = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

export function placeDrone(camera: THREE.Camera, surface: Surface, drone: Drone, trim: Trim): void {
  const { x, z, alt, bearing, tilt } = drone.eye;
  const here = surface.atCell(x, z, alt);
  const along = surface.atCell(x + STEP, z, alt);
  const up = surface.upAt(here);
  const origin = surface.toWorld(here);

  const ex = surface.toWorld(along).sub(origin);
  ex.addScaledVector(up, -ex.dot(up));
  if (ex.lengthSq() < 1e-12) ex.set(1, 0, 0);
  ex.normalize();
  const ez = new THREE.Vector3().crossVectors(ex, up).normalize();

  basis.makeBasis(ex, up, ez);
  frame.setFromRotationMatrix(basis);
  const jitterX = trim.shake > 1e-5 ? (Math.random() * 2 - 1) * trim.shake : 0;
  const jitterY = trim.shake > 1e-5 ? (Math.random() * 2 - 1) * trim.shake : 0;
  yaw.setFromAxisAngle(AXIS_Y, bearing + jitterX);
  pitch.setFromAxisAngle(AXIS_X, -(tilt + drone.lean.pitch + trim.recoil + jitterY));
  roll.setFromAxisAngle(AXIS_Z, -drone.lean.roll);

  camera.position.copy(origin);
  camera.quaternion.copy(frame).multiply(yaw).multiply(pitch).multiply(roll);
}
