import { CONTINENT_GAP, SHORE } from './footprint.js';
import type { RepoId } from './qualified.js';
import { shelf, type Cell, type Extent, type Rect } from './shelf.js';

export { CONTINENT_GAP };

/** The smallest ground a mounted repo reserves, whatever it holds. */
export const MIN_PLATE = 32;

export const CLAIM_STEP = 1.25;

/** A continent asking for ground: the repo and the extent its countries reach. */
export interface Claim {
  repo: RepoId;
  extent: Extent;
}

/**
 * A continent's ground: the land it shows in world cells, the ground it reserves, and the
 * world cell its own cell zero sits on.
 */
export interface Standing {
  repo: RepoId;
  land: Rect;
  claim: Extent;
  at: Cell;
}

/** The land a continent shows: the extent its countries reach, with a shore all round. */
export function landOf(extent: Extent): Extent {
  return { w: extent.w + 2 * SHORE, h: extent.h + 2 * SHORE };
}

/**
 * The ground a continent reserves for an extent, on a ladder of steps from `MIN_PLATE`. Land
 * that grows inside the claim moves nothing; only crossing a step re-shelves the world.
 */
export function claimOf(extent: Extent): Extent {
  const land = landOf(extent);
  return { w: stepOver(land.w), h: stepOver(land.h) };
}

function stepOver(n: number): number {
  let q = MIN_PLATE;
  while (q < n) q = Math.ceil(q * CLAIM_STEP);
  return q;
}

/**
 * Where every continent stands. Claims are shelved largest first with the name breaking ties,
 * so the world is a pure function of what is mounted and how big it is, in that order.
 */
export function placeContinents(claims: readonly Claim[]): {
  standings: Standing[];
  world: Extent;
} {
  const wanted = claims
    .map((c) => ({ repo: c.repo, land: landOf(c.extent), claim: claimOf(c.extent) }))
    .sort(
      (a, b) =>
        b.claim.w * b.claim.h - a.claim.w * a.claim.h ||
        (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0),
    );
  const rects: Rect[] = wanted.map((w) => ({ x: 0, z: 0, w: w.claim.w, h: w.claim.h }));
  const world = shelf(rects, CONTINENT_GAP);
  const standings = wanted.map((w, i) => {
    const rect = rects[i] ?? { x: 0, z: 0, w: w.claim.w, h: w.claim.h };
    return {
      repo: w.repo,
      land: { x: rect.x, z: rect.z, w: w.land.w, h: w.land.h },
      claim: w.claim,
      at: { x: rect.x + SHORE, z: rect.z + SHORE },
    };
  });
  standings.sort((a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0));
  return { standings, world };
}
