import { describe, expect, it } from 'vitest';
import {
  WORLD_RADIUS,
  bendAt,
  unbendAt,
  bendNormal,
  chordFor,
  dot,
  dropAt,
  frameAt,
  length,
  normalize,
  project,
  vec,
} from './sphere.js';

const angle = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

describe('project', () => {
  const anchor = normalize(vec(0, 1, 0));
  const frame = frameAt(anchor);

  it('keeps radial distance exact', () => {
    for (const d of [1, 10, 60]) {
      const p = project(anchor, frame, d, 0, 100);
      expect(length(p)).toBeCloseTo(1, 9);
      expect(angle(anchor, p) * 100).toBeCloseTo(d, 6);
    }
  });

  it('compresses tangential distance by sin(rho) / rho', () => {
    const R = 100;
    const rho = 0.85;
    const a = project(anchor, frame, R * rho, -0.5, R);
    const b = project(anchor, frame, R * rho, 0.5, R);
    expect(angle(a, b) * R).toBeCloseTo(Math.sin(rho) / rho, 3);
  });

  it('returns the anchor for the centre', () => {
    expect(project(anchor, frame, 0, 0, 50)).toEqual(anchor);
  });
});

describe('the world radius', () => {
  const anchor = normalize(vec(0, 1, 0));
  const frame = frameAt(anchor);

  it('leaves the lattice all but undistorted across a world of a thousand cells', () => {
    const rho = 500 / WORLD_RADIUS;
    const a = project(anchor, frame, 500, -0.5, WORLD_RADIUS);
    const b = project(anchor, frame, 500, 0.5, WORLD_RADIUS);
    expect(angle(a, b) * WORLD_RADIUS).toBeGreaterThan(0.995);
    expect(Math.sin(rho) / rho).toBeGreaterThan(0.99);
  });

  it('drops the ground a few tower heights at the rim of a world that wide', () => {
    expect(dropAt(380)).toBeGreaterThan(14);
    expect(dropAt(380)).toBeLessThan(28);
  });

  it('leaves one district flat', () => {
    expect(dropAt(10)).toBeLessThan(0.02);
  });
});

describe('bendAt', () => {
  it('puts the centre of the world at the origin', () => {
    expect(bendAt(0, 0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('lifts a height straight up the normal', () => {
    expect(bendAt(0, 0, 4).y).toBeCloseTo(4, 9);
    const p = bendAt(300, 0, 5);
    const n = bendNormal(300, 0);
    const ground = bendAt(300, 0, 0);
    expect(p.x - ground.x).toBeCloseTo(n.x * 5, 9);
    expect(p.y - ground.y).toBeCloseTo(n.y * 5, 9);
  });

  it('keeps a cell a cell along the ground, and drops it away from the centre', () => {
    const a = bendAt(0, 0);
    const b = bendAt(200, 0);
    const arc = Math.asin(Math.hypot(b.x, b.z) / (WORLD_RADIUS + 0)) * WORLD_RADIUS;
    expect(arc).toBeCloseTo(200, 6);
    expect(a.y - b.y).toBeCloseTo(dropAt(200), 9);
  });

  it('bends the same amount whichever way the offset points', () => {
    expect(bendAt(0, 250).y).toBeCloseTo(bendAt(250, 0).y, 9);
    expect(bendAt(-250, 0).y).toBeCloseTo(bendAt(250, 0).y, 9);
  });

  it('stands the normal up at the centre and tilts it a few degrees at the rim', () => {
    expect(bendNormal(0, 0)).toEqual({ x: 0, y: 1, z: 0 });
    const tilt = Math.acos(bendNormal(380, 0).y) * (180 / Math.PI);
    expect(tilt).toBeGreaterThan(5);
    expect(tilt).toBeLessThan(8);
  });
});

describe('chordFor', () => {
  it('tessellates a plate only as far as the sag demands', () => {
    const chord = chordFor(0.02);
    expect(chord).toBeGreaterThan(20);
    expect(Math.ceil(40 / chord)).toBe(2);
    expect(Math.ceil(10 / chord)).toBe(1);
  });
});

describe('unbendAt', () => {
  it('returns whatever bendAt was given', () => {
    for (const [u, v, y] of [
      [0, 0, 0],
      [12, -30, 4],
      [-200, 140, 90],
      [1, 0, 0],
      [0, 0, 55],
    ] as const) {
      const back = unbendAt(bendAt(u, v, y));
      expect(back.u).toBeCloseTo(u, 6);
      expect(back.v).toBeCloseTo(v, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
  });
});
