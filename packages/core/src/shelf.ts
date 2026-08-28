export interface Rect {
  x: number;
  z: number;
  w: number;
  h: number;
}

export interface Extent {
  w: number;
  h: number;
}

export const ASPECT_SEARCH = { from: 0.8, to: 1.8, step: 0.05 } as const;

/** Rows left to right, top to bottom, `gap` cells between items and rows. Mutates positions. */
export function shelfAt(items: Rect[], width: number, gap: number): Extent {
  let x = 0;
  let z = 0;
  let rowH = 0;
  let w = 0;
  for (const item of items) {
    if (x > 0 && x + item.w > width) {
      x = 0;
      z += rowH + gap;
      rowH = 0;
    }
    item.x = x;
    item.z = z;
    rowH = Math.max(rowH, item.h);
    x += item.w + gap;
    w = Math.max(w, item.x + item.w);
  }
  return { w, h: z + rowH };
}

/** Shelf-packs at the width whose result is closest to square; ties go to the narrower. */
export function shelf(items: Rect[], gap: number): Extent {
  if (items.length === 0) return { w: 0, h: 0 };
  const area = items.reduce((sum, item) => sum + (item.w + gap) * (item.h + gap), 0);
  const minWidth = Math.max(...items.map((item) => item.w));
  let best: { aspect: number; width: number } | undefined;
  for (let f = ASPECT_SEARCH.from; f <= ASPECT_SEARCH.to + 1e-9; f += ASPECT_SEARCH.step) {
    const width = Math.max(minWidth, Math.ceil(Math.sqrt(area) * f));
    if (best?.width === width) continue;
    const extent = shelfAt(items, width, gap);
    const aspect = Math.max(extent.w / extent.h, extent.h / extent.w);
    if (!best || aspect < best.aspect - 1e-9) best = { aspect, width };
  }
  return shelfAt(items, best?.width ?? minWidth, gap);
}

export function gapBetween(a: Rect, b: Rect): { x: number; z: number } {
  return {
    x: Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)),
    z: Math.max(a.z - (b.z + b.h), b.z - (a.z + a.h)),
  };
}

/** True when `a` and `b` are separated by at least `gap` cells on some axis. */
export function apart(a: Rect, b: Rect, gap: number): boolean {
  const g = gapBetween(a, b);
  return g.x >= gap || g.z >= gap;
}

/** Plates touch when they are closer than `gap` on one axis and not clear on the other. */
export function adjacent(a: Rect, b: Rect, gap: number): boolean {
  const g = gapBetween(a, b);
  return g.x <= gap && g.z <= gap && !(g.x > 0 && g.z > 0);
}
