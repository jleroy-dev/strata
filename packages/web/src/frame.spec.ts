import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ELEVATION, direction, fit, patchCorners, type Lens } from './frame.js';

const LENS: Lens = { fov: 30, aspect: 900 / 700 };
const UP = new THREE.Vector3(0, 1, 0);

/** Reprojects the corners from the stand the solver chose, the way the renderer would. */
function framedBounds(corners: THREE.Vector3[], framed: ReturnType<typeof fit>, lens: Lens) {
  const probe = new THREE.PerspectiveCamera(lens.fov, lens.aspect, 0.5, 9000);
  probe.up.copy(framed.up);
  probe.updateProjectionMatrix();
  probe.position.copy(framed.target).add(direction(framed.up).multiplyScalar(framed.distance));
  probe.lookAt(framed.target);
  probe.updateMatrixWorld();
  let x = 0;
  let y = 0;
  for (const c of corners) {
    const q = c.clone().project(probe);
    x = Math.max(x, Math.abs(q.x));
    y = Math.max(y, Math.abs(q.y));
  }
  return { x, y };
}

describe('fit', () => {
  it('holds every corner inside the margin it was given', () => {
    const corners = patchCorners(new THREE.Vector3(0, 0, 0), 380, 8);
    const framed = fit({ corners, target: new THREE.Vector3(0, 0, 0), up: UP }, 0.9, 0.86, LENS);
    const b = framedBounds(corners, framed, LENS);
    expect(b.x).toBeLessThanOrEqual(0.9 + 1e-6);
    expect(b.y).toBeLessThanOrEqual(0.86 + 1e-6);
  });

  it('does not stand further back than it needs to', () => {
    const corners = patchCorners(new THREE.Vector3(0, 0, 0), 380, 8);
    const framed = fit({ corners, target: new THREE.Vector3(0, 0, 0), up: UP }, 0.9, 0.86, LENS);
    const closer = { ...framed, distance: framed.distance * 0.85 };
    const b = framedBounds(corners, closer, LENS);
    expect(Math.max(b.x / 0.9, b.y / 0.86)).toBeGreaterThan(1);
  });

  it('stands back further for a wider patch, in proportion', () => {
    const small = fit(
      {
        corners: patchCorners(new THREE.Vector3(0, 0, 0), 100, 8),
        target: new THREE.Vector3(),
        up: UP,
      },
      0.9,
      0.86,
      LENS,
    );
    const big = fit(
      {
        corners: patchCorners(new THREE.Vector3(0, 0, 0), 400, 8),
        target: new THREE.Vector3(),
        up: UP,
      },
      0.9,
      0.86,
      LENS,
    );
    expect(big.distance / small.distance).toBeGreaterThan(3);
    expect(big.distance / small.distance).toBeLessThan(5);
  });

  it('is repeatable, so the same map frames the same way every time', () => {
    const make = () =>
      fit(
        {
          corners: patchCorners(new THREE.Vector3(12, 0, -30), 380, 8),
          target: new THREE.Vector3(12, 0, -30),
          up: UP,
        },
        0.9,
        0.86,
        LENS,
      );
    const a = make();
    const b = make();
    expect(a.distance).toBe(b.distance);
    expect(a.target.toArray()).toEqual(b.target.toArray());
  });

  it('frames a patch away from the origin without dragging it off centre', () => {
    const centre = new THREE.Vector3(240, 0, -180);
    const corners = patchCorners(centre, 120, 8);
    const framed = fit({ corners, target: centre.clone(), up: UP }, 0.9, 0.86, LENS);
    const b = framedBounds(corners, framed, LENS);
    expect(b.x).toBeLessThanOrEqual(0.9 + 1e-6);
    expect(b.y).toBeLessThanOrEqual(0.86 + 1e-6);
  });

  it('keeps the resting eye above the ground it frames', () => {
    const framed = fit(
      { corners: patchCorners(new THREE.Vector3(), 380, 8), target: new THREE.Vector3(), up: UP },
      0.9,
      0.86,
      LENS,
    );
    const eye = framed.target.clone().add(direction(UP).multiplyScalar(framed.distance));
    expect(eye.y).toBeGreaterThan(0);
    expect(Math.asin(direction(UP).y)).toBeCloseTo(ELEVATION, 9);
  });
});
