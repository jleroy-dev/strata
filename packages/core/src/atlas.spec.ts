import { describe, expect, it } from 'vitest';
import { MIN_PLATE, claimOf, landOf, placeContinents, type Claim } from './atlas.js';
import { CONTINENT_GAP, SHORE, contains } from './footprint.js';
import { repoId } from './qualified.js';
import { apart } from './shelf.js';

const claim = (name: string, w: number, h: number): Claim => ({
  repo: repoId(name),
  extent: { w, h },
});

const rects = (claims: readonly Claim[]) =>
  placeContinents(claims).standings.map((s) => ({
    repo: s.repo,
    x: s.land.x,
    z: s.land.z,
    w: s.claim.w,
    h: s.claim.h,
  }));

const at = (claims: readonly Claim[], name: string) => rects(claims).find((r) => r.repo === name);

describe('landOf', () => {
  it('shows the extent its countries reach with a shore all round', () => {
    expect(landOf({ w: 24, h: 29 })).toEqual({ w: 24 + 2 * SHORE, h: 29 + 2 * SHORE });
  });

  it('hugs a repo of seven files rather than standing it on a floor', () => {
    expect(landOf({ w: 5, h: 4 })).toEqual({ w: 5 + 2 * SHORE, h: 4 + 2 * SHORE });
  });
});

describe('claimOf', () => {
  it('never claims less than the minimum plate', () => {
    expect(claimOf({ w: 1, h: 1 })).toEqual({ w: MIN_PLATE, h: MIN_PLATE });
    expect(claimOf({ w: 0, h: 5 })).toEqual({ w: MIN_PLATE, h: MIN_PLATE });
  });

  it('holds its step while an extent grows inside it', () => {
    const first = claimOf({ w: 100, h: 100 });
    expect(claimOf({ w: 101, h: 100 })).toEqual(first);
    expect(claimOf({ w: first.w - 2 * SHORE, h: first.h - 2 * SHORE })).toEqual(first);
  });

  it('steps up once the land passes the claim', () => {
    const first = claimOf({ w: 100, h: 40 });
    const next = claimOf({ w: first.w + 1, h: 40 });
    expect(next.w).toBeGreaterThan(first.w);
    expect(next.h).toBe(first.h);
  });

  it('keeps every claim within a quarter of the land it holds', () => {
    for (const n of [40, 97, 231, 359, 1200]) {
      const land = landOf({ w: n, h: n });
      const c = claimOf({ w: n, h: n });
      expect(c.w).toBeGreaterThanOrEqual(land.w);
      expect(c.w / land.w).toBeLessThanOrEqual(1.25);
    }
  });
});

describe('placeContinents', () => {
  const three = [claim('web2', 356, 359), claim('credx', 87, 90), claim('lookups', 19, 20)];

  it('keeps every continent a full gap of water from every other', () => {
    const placed = rects(three);
    for (const a of placed) {
      for (const b of placed) {
        if (a === b) continue;
        expect(apart(a, b, CONTINENT_GAP)).toBe(true);
      }
    }
  });

  it('is a pure function of what is mounted, whatever order it arrives in', () => {
    expect(rects([...three].reverse())).toEqual(rects(three));
  });

  it('moves nothing already standing when a continent grows inside its claim', () => {
    const grown = [claim('web2', 360, 359), three[1]!, three[2]!];
    expect(rects(grown)).toEqual(rects(three));
  });

  it('leaves the world only as wide as the plates need', () => {
    const { world } = placeContinents(three);
    expect(world.w).toBeGreaterThanOrEqual(claimOf({ w: 356, h: 359 }).w);
    expect(Math.max(world.w, world.h)).toBeLessThan(600);
  });

  it("keeps every continent's land inside the ground it claimed", () => {
    for (const s of placeContinents(three).standings) {
      expect(contains({ x: s.land.x, z: s.land.z, ...s.claim }, s.land)).toBe(true);
    }
  });

  it("stands a repo's own cell zero a shore in from the corner of its land", () => {
    for (const s of placeContinents(three).standings) {
      expect(s.at).toEqual({ x: s.land.x + SHORE, z: s.land.z + SHORE });
    }
  });

  it('reserves the minimum plate for a repo of seven files, however small its land', () => {
    const tiny = at([claim('tiny', 5, 4), claim('web2', 356, 359)], 'tiny');
    expect(tiny?.w).toBe(MIN_PLATE);
    expect(tiny?.h).toBe(MIN_PLATE);
  });

  it('shows a large continent as its land, never as the ground it reserved', () => {
    expect(landOf({ w: 309, h: 302 })).toEqual({ w: 309 + 2 * SHORE, h: 302 + 2 * SHORE });
    expect(claimOf({ w: 309, h: 302 }).w).toBeGreaterThan(309 + 2 * SHORE);
  });

  it('places one continent at the origin', () => {
    expect(rects([claim('only', 40, 40)])).toEqual([{ repo: 'only', x: 0, z: 0, w: 50, h: 50 }]);
  });

  it('returns nothing for nothing mounted', () => {
    expect(placeContinents([])).toEqual({ standings: [], world: { w: 0, h: 0 } });
  });
});
