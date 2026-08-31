import type { Rect } from './shelf.js';

/** The three steps of distance as hierarchy: streets, avenues, then water. */
export const DISTRICT_GAP = 1;
export const COUNTRY_GAP = 3;
export const CONTINENT_GAP = 12;

/** How far past its rect a plate is drawn, on every side. */
export const DISTRICT_SKIRT = 0.3;
export const COUNTRY_SKIRT = 0.8;

/** The land a continent shows past the countries standing on it, on every side. */
export const SHORE = COUNTRY_GAP - COUNTRY_SKIRT;

/** A plate's drawn footprint: its rect grown by its skirt on every side. */
export function skirted(rect: Rect, skirt: number): Rect {
  return { x: rect.x - skirt, z: rect.z - skirt, w: rect.w + 2 * skirt, h: rect.h + 2 * skirt };
}

/** True when every point of `inner` lies within `outer`. */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.z >= outer.z &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.z + inner.h <= outer.z + outer.h
  );
}
