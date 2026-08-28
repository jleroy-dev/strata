import { VARIANTS_PER_FAMILY } from './family.js';
import { adjacent, type Rect } from './shelf.js';

export interface Plate extends Rect {
  variant: number;
}

export const NO_VARIANT = -1;

/**
 * Greedy colouring on the plate-adjacency graph: highest degree first, the variant least
 * used by neighbours, lowest index on ties. A plate keeps its variant when no neighbour
 * shares it. Mutates `variant`.
 */
export function assignVariants(plates: Plate[], gap: number): void {
  const neighbours = plates.map((a) =>
    plates.flatMap((b, j) => (a !== b && adjacent(a, b, gap) ? [j] : [])),
  );
  const degree = (i: number): number => neighbours[i]?.length ?? 0;
  const order = plates.map((_, i) => i).sort((p, q) => degree(q) - degree(p) || p - q);
  for (const i of order) {
    const plate = plates[i];
    if (!plate) continue;
    const used = new Array<number>(VARIANTS_PER_FAMILY).fill(0);
    for (const j of neighbours[i] ?? []) {
      const v = plates[j]?.variant ?? NO_VARIANT;
      if (v !== NO_VARIANT) used[v] = (used[v] ?? 0) + 1;
    }
    if (plate.variant !== NO_VARIANT && used[plate.variant] === 0) continue;
    let best = 0;
    for (let v = 1; v < VARIANTS_PER_FAMILY; v++) {
      if ((used[v] ?? 0) < (used[best] ?? 0)) best = v;
    }
    plate.variant = best;
  }
}
