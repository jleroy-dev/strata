import { describe, expect, it } from 'vitest';
import { slabIndices, slabVertexCount } from './slab.js';

type P = [number, number, number];

/** A flat slab of `nx` by `nz` cells, top grid then bottom grid, as the indices expect. */
function positions(nx: number, nz: number, w = 10, h = 6, top = 0.2, bottom = -0.6): P[] {
  const out: P[] = [];
  for (const y of [top, bottom]) {
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) out.push([(w * i) / nx, y, (h * j) / nz]);
    }
  }
  return out;
}

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (u: P, v: P): P => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Every face's normal against the direction away from the slab's middle. */
function outwardness(nx: number, nz: number): number[] {
  const pts = positions(nx, nz);
  const idx = slabIndices(nx, nz);
  const centre: P = [5, -0.2, 3];
  const out: number[] = [];
  for (let k = 0; k < idx.length; k += 3) {
    const a = pts[idx[k]!]!;
    const b = pts[idx[k + 1]!]!;
    const c = pts[idx[k + 2]!]!;
    const n = cross(sub(b, a), sub(c, a));
    const mid: P = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    out.push(dot(n, sub(mid, centre)));
  }
  return out;
}

describe('slabIndices', () => {
  it('names only vertices the slab has', () => {
    for (const [nx, nz] of [
      [1, 1],
      [3, 2],
      [5, 7],
    ]) {
      const count = slabVertexCount(nx!, nz!);
      for (const i of slabIndices(nx!, nz!)) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(count);
      }
    }
  });

  it('turns every face outward, walls included', () => {
    for (const [nx, nz] of [
      [1, 1],
      [2, 3],
      [4, 4],
    ]) {
      const facing = outwardness(nx!, nz!);
      expect(facing.length).toBeGreaterThan(0);
      expect(facing.every((f) => f > 0)).toBe(true);
    }
  });

  it('closes the slab: two triangles per cell top and bottom, and four walls round the rim', () => {
    const nx = 3;
    const nz = 2;
    const faces = slabIndices(nx, nz).length / 3;
    expect(faces).toBe(2 * nx * nz * 2 + 2 * (2 * nx + 2 * nz));
  });

  it('gives every edge of the rim a wall rather than leaving the slab open', () => {
    const nx = 2;
    const nz = 2;
    const idx = slabIndices(nx, nz);
    const grid = (nx + 1) * (nz + 1);
    let walls = 0;
    for (let k = 0; k < idx.length; k += 3) {
      const ids = [idx[k]!, idx[k + 1]!, idx[k + 2]!];
      const spans = ids.some((i) => i < grid) && ids.some((i) => i >= grid);
      if (spans) walls++;
    }
    expect(walls).toBe(2 * (2 * nx + 2 * nz));
  });
});
