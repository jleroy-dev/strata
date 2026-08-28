import type { BlockId } from './events.js';
import type { Cell, Layout } from './layout.js';

export const STREET_COST = 1;
export const KERB_COST = 1.5;
export const ALLEY_COST = 4;

/**
 * A Manhattan path on lattice corners from one block to another, never through a tower.
 * An edge along open ground costs 1, beside one tower 1.5, between two towers 4.
 */
export function route(layout: Layout, from: BlockId, to: BlockId): Cell[] {
  const start = layout.blocks.get(from)?.cell;
  const goal = layout.blocks.get(to)?.cell;
  if (!start || !goal) return [];
  const W = layout.extent.w + 1;
  const H = layout.extent.h + 1;
  const occupied = new Set<number>();
  for (const p of layout.blocks.values()) occupied.add(p.cell.x + p.cell.z * W);
  const has = (x: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < W && z < H && occupied.has(x + z * W);
  const cost = (x: number, z: number, nx: number, nz: number): number => {
    let a: boolean;
    let b: boolean;
    if (x === nx) {
      const zz = Math.min(z, nz);
      a = has(x - 1, zz);
      b = has(x, zz);
    } else {
      const xx = Math.min(x, nx);
      a = has(xx, z - 1);
      b = has(xx, z);
    }
    return a && b ? ALLEY_COST : a || b ? KERB_COST : STREET_COST;
  };

  const key = (x: number, z: number): number => x + z * W;
  const g = new Float64Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const heap = new Heap();
  g[key(start.x, start.z)] = 0;
  heap.push(0, key(start.x, start.z));
  const goalKey = key(goal.x, goal.z);
  const steps: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (heap.size > 0) {
    const current = heap.pop();
    if (current === goalKey) break;
    const x = current % W;
    const z = (current - x) / W;
    for (const [dx, dz] of steps) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const next = key(nx, nz);
      const ng = (g[current] ?? Infinity) + cost(x, z, nx, nz);
      if (ng < (g[next] ?? Infinity)) {
        g[next] = ng;
        came[next] = current;
        heap.push(ng + Math.abs(nx - goal.x) + Math.abs(nz - goal.z), next);
      }
    }
  }
  if (came[goalKey] === -1 && goalKey !== key(start.x, start.z)) return [];
  const path: Cell[] = [];
  for (let k = goalKey; k !== -1; k = came[k] ?? -1) {
    const x = k % W;
    path.push({ x, z: (k - x) / W });
  }
  return path.reverse();
}

class Heap {
  private scores: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(score: number, key: number): void {
    this.scores.push(score);
    this.keys.push(key);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score(parent) <= this.score(i)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.keys[0] ?? -1;
    const lastScore = this.scores.pop() ?? 0;
    const lastKey = this.keys.pop() ?? -1;
    if (this.keys.length > 0) {
      this.scores[0] = lastScore;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.score(l) < this.score(m)) m = l;
        if (r < this.keys.length && this.score(r) < this.score(m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private score(i: number): number {
    return this.scores[i] ?? Infinity;
  }

  private swap(i: number, j: number): void {
    const s = this.score(i);
    const k = this.keys[i] ?? -1;
    this.scores[i] = this.score(j);
    this.keys[i] = this.keys[j] ?? -1;
    this.scores[j] = s;
    this.keys[j] = k;
  }
}
