import * as THREE from 'three';
import { repoOfName, type Layout } from '@strata/core';

export type Occupied = (x: number, z: number) => boolean;

/** Whether a cell of a country's continent holds a tower, from the layout's placements. */
export function occupiedBy(layout: Layout, country: string): Occupied {
  const key = repoOfName(country);
  const cells = new Set<string>();
  for (const p of layout.blocks.values()) {
    if (repoOfName(p.country) === key) cells.add(`${String(p.cell.x)},${String(p.cell.z)}`);
  }
  return (x, z) => cells.has(`${String(x)},${String(z)}`);
}

/** True when the straight segment stays clear of every tower's footprint. */
export function clear(
  a: THREE.Vector3,
  b: THREE.Vector3,
  occupied: Occupied,
  toCell: (p: THREE.Vector3) => { x: number; z: number },
  toWorld: (x: number, z: number) => THREE.Vector3,
): boolean {
  const n = Math.ceil(a.distanceTo(b) / 0.2) + 1;
  for (let i = 0; i <= n; i++) {
    const px = a.x + ((b.x - a.x) * i) / n;
    const pz = a.z + ((b.z - a.z) * i) / n;
    const c = toCell(new THREE.Vector3(px, 0, pz));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!occupied(c.x + dx, c.z + dz)) continue;
        const centre = toWorld(c.x + dx + 0.5, c.z + dz + 0.5);
        if (Math.abs(px - centre.x) < 0.52 && Math.abs(pz - centre.z) < 0.52) return false;
      }
    }
  }
  return true;
}

/** Pulls a lattice path into the straight runs its ground allows and rounds the corners that remain. */
export function smooth(
  points: THREE.Vector3[],
  occupied: Occupied,
  toCell: (p: THREE.Vector3) => { x: number; z: number },
  toWorld: (x: number, z: number) => THREE.Vector3,
): THREE.Vector3[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length < 3 || !first || !last) return points;
  const ok = (a: THREE.Vector3, b: THREE.Vector3): boolean =>
    clear(a, b, occupied, toCell, toWorld);
  const pulled: THREE.Vector3[] = [first];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    const from = points[i] ?? first;
    let to = points[j] ?? last;
    while (j > i + 1 && !ok(from, to)) {
      j--;
      to = points[j] ?? last;
    }
    pulled.push(to);
    i = j;
  }
  const out: THREE.Vector3[] = [first];
  for (let k = 1; k < pulled.length - 1; k++) {
    const p = pulled[k - 1];
    const c = pulled[k];
    const n = pulled[k + 1];
    if (!p || !c || !n) continue;
    const r = Math.min(0.6, p.distanceTo(c) / 2, c.distanceTo(n) / 2);
    const a = c.clone().lerp(p, r / p.distanceTo(c));
    const b = c.clone().lerp(n, r / c.distanceTo(n));
    const bend: THREE.Vector3[] = [];
    for (let m = 1; m < 6; m++) {
      const t = m / 6;
      bend.push(
        a
          .clone()
          .multiplyScalar((1 - t) * (1 - t))
          .add(c.clone().multiplyScalar(2 * (1 - t) * t))
          .add(b.clone().multiplyScalar(t * t)),
      );
    }
    const clearBend = bend.every((q, m) => ok(m === 0 ? a : (bend[m - 1] ?? a), q));
    if (clearBend) out.push(a, ...bend, b);
    else out.push(c);
  }
  out.push(last);
  return out;
}
