import { isBinary } from './binary.js';

export const SLAB_HEIGHT = 0.4;
export const MAX_HEIGHT = 7;

/** Tower height in cell units: a slab for a binary, a log of the byte count for text. */
export function heightOf(id: string, size: number): number {
  if (isBinary(id)) return SLAB_HEIGHT;
  return Math.min(MAX_HEIGHT, SLAB_HEIGHT + Math.log2(1 + Math.max(0, size) / 400) * 0.9);
}
