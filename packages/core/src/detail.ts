export type Tier = 'body' | 'towers';

/** Pixels per cell a city needs before it grows towers, and where it loses them again. */
export const TOWERS_AT = 3;
export const TOWERS_UNTIL = 2.4;
export const TOWER_BUDGET = 6000;

export function tierOf(pxPerCell: number, previous: Tier = 'body'): Tier {
  if (previous === 'towers') return pxPerCell >= TOWERS_UNTIL ? 'towers' : 'body';
  return pxPerCell >= TOWERS_AT ? 'towers' : 'body';
}

export interface Candidate<K> {
  key: K;
  pxPerCell: number;
  towers: number;
}

/** The countries that get towers: big enough on screen, largest first, under the budget. */
export function admit<K>(
  candidates: readonly Candidate<K>[],
  previous: ReadonlySet<K>,
  budget = TOWER_BUDGET,
): Set<K> {
  const ranked = candidates
    .filter((c) => tierOf(c.pxPerCell, previous.has(c.key) ? 'towers' : 'body') === 'towers')
    .sort((a, b) => b.pxPerCell - a.pxPerCell);
  const chosen = new Set<K>();
  let used = 0;
  for (const c of ranked) {
    if (used + c.towers > budget) continue;
    chosen.add(c.key);
    used += c.towers;
  }
  return chosen;
}
