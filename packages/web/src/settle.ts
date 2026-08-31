import type { Rect, RepoId } from '@strata/core';

/** What is left of a plate's distance to its target after one second. */
export const SETTLE_DECAY = 0.02;

/** The longest step the clock takes, so a tab left in the background does not teleport. */
export const MAX_STEP = 0.1;

/** How near its target a plate has to be before it counts as standing still. */
export const SETTLE_EPSILON = 0.005;

/** How wide a plate has to be drawn before it is worth drawing at all. */
export const SETTLE_MIN = 0.05;

export function settleFactor(dt: number): number {
  return 1 - Math.pow(SETTLE_DECAY, dt);
}

export const landKey = (repo: RepoId): string => `l\0${repo}`;
export const countryKey = (country: string): string => `c\0${country}`;
export const districtKey = (country: string, district: string): string =>
  `d\0${country}\0${district}`;

/** `born`: the plate is new. `moved`: it is going somewhere else. `held`: nothing changed. */
export type Change = 'born' | 'moved' | 'held';

interface Plate {
  at: Rect;
  to: Rect;
}

const same = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.z === b.z && a.w === b.w && a.h === b.h;

const near = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) < SETTLE_EPSILON &&
  Math.abs(a.z - b.z) < SETTLE_EPSILON &&
  Math.abs(a.w - b.w) < SETTLE_EPSILON &&
  Math.abs(a.h - b.h) < SETTLE_EPSILON;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Where a plate starts: no size, at the point of `parent` nearest the middle of where it is
 * going. Both ease by the same factor from there, so a plate that is born inside the one it
 * stands on is inside it every frame after.
 */
function seed(to: Rect, parent: Rect | undefined): Rect {
  const x = to.x + to.w / 2;
  const z = to.z + to.h / 2;
  if (!parent) return { x, z, w: 0, h: 0 };
  return {
    x: clamp(x, parent.x, parent.x + parent.w),
    z: clamp(z, parent.z, parent.z + parent.h),
    w: 0,
    h: 0,
  };
}

/**
 * Where every plate of the ground is this frame: one clock, one easing law, read by everything
 * that draws the ground, so no two tiers of it are ever a frame apart.
 */
export class Settling {
  private plates = new Map<string, Plate>();
  private last = 0;
  private ease = 0;
  private restless = false;

  /** Sets where a plate is going, and where a plate seen for the first time starts from. */
  target(key: string, to: Rect, parent?: string, snap = false): Change {
    const plate = this.plates.get(key);
    if (plate) {
      if (same(plate.to, to)) {
        if (snap) plate.at = { ...to };
        return 'held';
      }
      plate.to = { ...to };
      plate.at = snap ? { ...to } : plate.at;
      this.restless = true;
      return 'moved';
    }
    const from = parent === undefined ? undefined : this.plates.get(parent)?.at;
    this.plates.set(key, { at: snap ? { ...to } : seed(to, from), to: { ...to } });
    this.restless = true;
    return 'born';
  }

  /** Drops every plate but these, for a layout that no longer holds them. */
  keep(keys: ReadonlySet<string>): void {
    for (const key of [...this.plates.keys()]) if (!keys.has(key)) this.plates.delete(key);
  }

  drop(key: string): void {
    this.plates.delete(key);
  }

  /** Carries a plate to another key, for ground that changed its name by moving. */
  rename(from: string, to: string): void {
    const plate = this.plates.get(from);
    if (!plate) return;
    this.plates.delete(from);
    this.plates.set(to, plate);
  }

  /** Puts a plate where it is going at once, for a flight that has landed. */
  arrive(key: string, to: Rect): void {
    this.plates.set(key, { at: { ...to }, to: { ...to } });
  }

  has(key: string): boolean {
    return this.plates.has(key);
  }

  rectOf(key: string): Rect | undefined {
    return this.plates.get(key)?.at;
  }

  targetOf(key: string): Rect | undefined {
    return this.plates.get(key)?.to;
  }

  tick(now: number): void {
    const dt = this.last === 0 ? 1 / 60 : Math.min(MAX_STEP, (now - this.last) / 1000);
    this.last = now;
    this.ease = settleFactor(dt);
    let moving = false;
    for (const plate of this.plates.values()) {
      const { at, to } = plate;
      if (same(at, to)) continue;
      moving = true;
      if (near(at, to)) {
        plate.at = { ...to };
        continue;
      }
      at.x += (to.x - at.x) * this.ease;
      at.z += (to.z - at.z) * this.ease;
      at.w += (to.w - at.w) * this.ease;
      at.h += (to.h - at.h) * this.ease;
    }
    this.restless = moving;
  }

  /** How far anything eased this frame, for whatever else moves on the same clock. */
  get factor(): number {
    return this.ease;
  }

  get moving(): boolean {
    return this.restless;
  }

  get count(): number {
    return this.plates.size;
  }
}
