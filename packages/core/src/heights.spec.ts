import { describe, expect, it } from 'vitest';
import { at, REPO } from './fixtures/ids.js';
import { COUNTRY_SKIRT, DISTRICT_SKIRT } from './footprint.js';
import { terrainOf, worldCellOf, type Tiers } from './heights.js';
import type { Layout, Placement } from './layout.js';
import { repoId } from './qualified.js';

const TIERS: Tiers = { water: -1.2, land: 0, country: 0.18, district: 0.36 };

const block = (x: number, z: number, height: number, country = 'repo:pkg'): Placement => ({
  cell: { x, z },
  height,
  size: 100,
  binary: false,
  country,
  district: 'src',
});

const layoutOf = (over: Partial<Layout> = {}): Layout => ({
  blocks: new Map(),
  districts: [],
  countries: [],
  continents: [
    {
      repo: REPO,
      extent: { w: 20, h: 20 },
      land: { x: 0, z: 0, w: 20, h: 20 },
      claim: { w: 32, h: 32 },
      at: { x: 0, z: 0 },
    },
  ],
  world: { w: 20, h: 20 },
  ...over,
});

describe('where a block stands on the world', () => {
  it('offsets the continent local cell by its continent', () => {
    const layout = layoutOf({
      continents: [
        {
          repo: REPO,
          extent: { w: 8, h: 8 },
          land: { x: 40, z: 12, w: 8, h: 8 },
          claim: { w: 32, h: 32 },
          at: { x: 40, z: 12 },
        },
      ],
      blocks: new Map([[at('pkg/src/a.ts'), block(3, 5, 1)]]),
    });
    expect(worldCellOf(layout, at('pkg/src/a.ts'))).toEqual({ x: 43, z: 17 });
  });

  it('knows nothing of a block that is not placed', () => {
    expect(worldCellOf(layoutOf(), at('pkg/src/ghost.ts'))).toBeUndefined();
  });
});

describe('the ground under the towers', () => {
  it('is the platform where a tower stands, not the tower', () => {
    const terrain = terrainOf(
      layoutOf({
        districts: [{ x: 0, z: 0, w: 4, h: 4, country: 'repo:pkg', district: 'src' }],
        blocks: new Map([[at('pkg/src/a.ts'), block(2, 2, 3)]]),
      }),
      TIERS,
    );
    expect(terrain.topAt(2, 2)).toBe(TIERS.district + 3);
    expect(terrain.baseAt(2, 2)).toBe(TIERS.district);
  });

  it('agrees with the top wherever nothing stands', () => {
    const terrain = terrainOf(
      layoutOf({
        countries: [{ x: 2, z: 2, w: 6, h: 6, country: 'repo:pkg', family: 'libs', variant: 0 }],
      }),
      TIERS,
    );
    for (const [x, z] of [
      [1, 1],
      [4, 4],
      [500, 500],
    ] as const) {
      expect(terrain.baseAt(x, z)).toBe(terrain.topAt(x, z));
    }
  });
});

describe('the terrain under a cell', () => {
  it('is water beyond every continent', () => {
    expect(terrainOf(layoutOf(), TIERS).topAt(500, 500)).toBe(TIERS.water);
  });

  it('is land inside a continent that carries nothing', () => {
    expect(terrainOf(layoutOf(), TIERS).topAt(5, 5)).toBe(TIERS.land);
  });

  it('rises through the tiers that stand on one another', () => {
    const terrain = terrainOf(
      layoutOf({
        countries: [{ x: 2, z: 2, w: 8, h: 8, country: 'repo:pkg', family: 'libs', variant: 0 }],
        districts: [{ x: 3, z: 3, w: 4, h: 4, country: 'repo:pkg', district: 'src' }],
        blocks: new Map([[at('pkg/src/a.ts'), block(4, 4, 1.5)]]),
      }),
      TIERS,
    );
    expect(terrain.topAt(0, 0)).toBe(TIERS.land);
    expect(terrain.topAt(2, 8)).toBe(TIERS.country);
    expect(terrain.topAt(6, 3)).toBe(TIERS.district);
    expect(terrain.topAt(4, 4)).toBe(TIERS.district + 1.5);
  });

  it('carries each plate out to the skirt it is drawn with', () => {
    const terrain = terrainOf(
      layoutOf({
        countries: [{ x: 5, z: 5, w: 4, h: 4, country: 'repo:pkg', family: 'libs', variant: 0 }],
        districts: [{ x: 6, z: 6, w: 2, h: 2, country: 'repo:pkg', district: 'src' }],
      }),
      TIERS,
    );
    expect(COUNTRY_SKIRT).toBeGreaterThan(DISTRICT_SKIRT);
    expect(terrain.topAt(4, 6)).toBe(TIERS.country);
    expect(terrain.topAt(5, 6)).toBe(TIERS.district);
  });

  it('offsets a continent local cell by the world cell its own zero sits on', () => {
    const terrain = terrainOf(
      layoutOf({
        continents: [
          {
            repo: REPO,
            extent: { w: 8, h: 8 },
            land: { x: 40, z: 12, w: 8, h: 8 },
            claim: { w: 32, h: 32 },
            at: { x: 40, z: 12 },
          },
        ],
        blocks: new Map([[at('pkg/src/a.ts'), block(1, 1, 2)]]),
      }),
      TIERS,
    );
    expect(terrain.topAt(41, 13)).toBe(TIERS.district + 2);
    expect(terrain.topAt(1, 1)).toBe(TIERS.water);
  });

  it('keeps two continents apart', () => {
    const other = repoId('other');
    const terrain = terrainOf(
      layoutOf({
        continents: [
          {
            repo: REPO,
            extent: { w: 4, h: 4 },
            land: { x: 0, z: 0, w: 4, h: 4 },
            claim: { w: 32, h: 32 },
            at: { x: 0, z: 0 },
          },
          {
            repo: other,
            extent: { w: 4, h: 4 },
            land: { x: 20, z: 0, w: 4, h: 4 },
            claim: { w: 32, h: 32 },
            at: { x: 20, z: 0 },
          },
        ],
      }),
      TIERS,
    );
    expect(terrain.topAt(1, 1)).toBe(TIERS.land);
    expect(terrain.topAt(21, 1)).toBe(TIERS.land);
    expect(terrain.topAt(10, 1)).toBe(TIERS.water);
  });

  it('names a tower only where one stands', () => {
    const terrain = terrainOf(
      layoutOf({
        districts: [{ x: 0, z: 0, w: 4, h: 4, country: 'repo:pkg', district: 'src' }],
        blocks: new Map([[at('pkg/src/a.ts'), block(2, 2, 1.25)]]),
      }),
      TIERS,
    );
    expect(terrain.towerTopAt(2, 2)).toBe(TIERS.district + 1.25);
    expect(terrain.towerTopAt(3, 2)).toBeUndefined();
    expect(terrain.towerTopAt(500, 500)).toBeUndefined();
  });

  it('reads the same anywhere inside a cell', () => {
    const terrain = terrainOf(
      layoutOf({ blocks: new Map([[at('pkg/src/a.ts'), block(3, 3, 1)]]) }),
      TIERS,
    );
    const top = terrain.topAt(3, 3);
    expect(terrain.topAt(3.9, 3.1)).toBe(top);
    expect(terrain.topAt(4, 3)).not.toBe(top);
  });

  it('takes the taller of two towers sharing a cell', () => {
    const terrain = terrainOf(
      layoutOf({
        blocks: new Map([
          [at('pkg/src/a.ts'), block(1, 1, 1)],
          [at('pkg/src/b.ts'), block(1, 1, 3)],
        ]),
      }),
      TIERS,
    );
    expect(terrain.towerTopAt(1, 1)).toBe(TIERS.district + 3);
  });

  it('ignores anything whose repo is not mounted', () => {
    const terrain = terrainOf(
      layoutOf({
        countries: [{ x: 0, z: 0, w: 4, h: 4, country: 'ghost:pkg', family: 'libs', variant: 0 }],
      }),
      TIERS,
    );
    expect(terrain.topAt(1, 1)).toBe(TIERS.land);
  });
});
