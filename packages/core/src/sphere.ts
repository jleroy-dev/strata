export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Frame {
  t1: Vec3;
  t2: Vec3;
}

/**
 * The radius, in cells, of the one sphere the world's lattice is bent over. A constant, never
 * a function of what is mounted.
 */
export const WORLD_RADIUS = 3500;

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const WORLD_FRAME: Frame = { t1: { x: 1, y: 0, z: 0 }, t2: { x: 0, y: 0, z: 1 } };

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export function normalize(a: Vec3): Vec3 {
  const n = length(a);
  return n < 1e-12 ? { x: 0, y: 1, z: 0 } : scale(a, 1 / n);
}

export function frameAt(dir: Vec3): Frame {
  const seed = Math.abs(dir.y) > 0.95 ? vec(1, 0, 0) : UP;
  const t1 = normalize(cross(seed, dir));
  const t2 = normalize(cross(dir, t1));
  return { t1, t2 };
}

/**
 * Azimuthal equidistant about `anchor`: a point `(u, v)` cells out on the tangent plane lands
 * at that arc length from the anchor. Radial distances are exact, tangential ones compress by
 * sin(rho) / rho.
 */
export function project(anchor: Vec3, frame: Frame, u: number, v: number, radius: number): Vec3 {
  const d = Math.hypot(u, v);
  if (d < 1e-9) return anchor;
  const rho = d / radius;
  return normalize(
    add(
      scale(anchor, Math.cos(rho)),
      add(scale(frame.t1, (Math.sin(rho) * u) / d), scale(frame.t2, (Math.sin(rho) * v) / d)),
    ),
  );
}

/** The ground's normal `(u, v)` cells from the world's centre, where the sphere is tangent. */
export function bendNormal(u: number, v: number, radius = WORLD_RADIUS): Vec3 {
  return project(UP, WORLD_FRAME, u, v, radius);
}

/**
 * A point `(u, v)` cells from the world's centre and `y` cells above the ground. Distance from
 * the centre is arc length, so the lattice keeps its spacing and only the ground falls away.
 */
export function bendAt(u: number, v: number, y = 0, radius = WORLD_RADIUS): Vec3 {
  const dir = bendNormal(u, v, radius);
  return {
    x: dir.x * (radius + y),
    y: dir.y * (radius + y) - radius,
    z: dir.z * (radius + y),
  };
}

/** How far the ground falls away over `d` cells. */
export function dropAt(d: number, radius = WORLD_RADIUS): number {
  return radius * (1 - Math.cos(d / radius));
}

/** The longest chord that stays within `sag` cells of the ground. */
export function chordFor(sag: number, radius = WORLD_RADIUS): number {
  return Math.max(0.5, Math.sqrt(8 * sag * radius));
}
